from __future__ import annotations

import asyncio
import shutil

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from starlette.background import BackgroundTask

from backend.app.models import (
    HealthInfo,
    Quality,
    TranscriptCreateRequest,
    TranscriptTaskInfo,
    VideoInfo,
    VideoParseRequest,
)
from backend.app.deepseek_client import deepseek_configured
from backend.app.stepaudio_client import stepaudio_configured
from backend.app.summary_models import QaQuestionRequest, SummaryStreamRequest
from backend.app.summary_service import stream_qa_events, stream_summary_events
from backend.app.transcript_service import (
    create_transcript_task,
    get_transcript_task,
    run_transcript_task,
    should_start_task,
)
from backend.app.video_service import (
    MissingFfmpegError,
    VideoServiceError,
    download_video,
    extract_video_info,
    ffmpeg_available,
)


app = FastAPI(title="AI 视频摘要助手 - 下载 MVP")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthInfo)
async def health() -> HealthInfo:
    return HealthInfo(
        status="ok",
        ffmpegAvailable=ffmpeg_available(),
        sttAvailable=stepaudio_configured(),
        deepseekAvailable=deepseek_configured(),
    )


@app.post("/api/videos/parse", response_model=VideoInfo)
async def parse_video(payload: VideoParseRequest, background_tasks: BackgroundTasks) -> VideoInfo:
    try:
        video = await asyncio.to_thread(extract_video_info, payload.url)
        _attach_auto_transcript_task(video, payload.url, background_tasks)
        return video
    except MissingFfmpegError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except VideoServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@app.get("/api/videos/download")
async def download(
    url: str = Query(..., min_length=8, max_length=2048),
    quality: Quality = Query(...),
) -> FileResponse:
    try:
        result = await asyncio.to_thread(download_video, url, quality)
    except MissingFfmpegError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except VideoServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return FileResponse(
        path=result.path,
        media_type=result.media_type,
        filename=result.filename,
        background=BackgroundTask(shutil.rmtree, result.directory, ignore_errors=True),
    )


@app.post("/api/transcripts", response_model=TranscriptTaskInfo)
async def create_transcript(
    payload: TranscriptCreateRequest,
    background_tasks: BackgroundTasks,
) -> TranscriptTaskInfo:
    task = create_transcript_task(payload.url)
    if should_start_task(task):
        background_tasks.add_task(run_transcript_task, task.taskId)
    return task


@app.get("/api/transcripts/{task_id}", response_model=TranscriptTaskInfo)
async def get_transcript(task_id: str) -> TranscriptTaskInfo:
    task = get_transcript_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="转写任务不存在或已过期。")
    return task


@app.post("/api/summaries/stream")
async def stream_summary(payload: SummaryStreamRequest) -> StreamingResponse:
    return StreamingResponse(
        stream_summary_events(payload),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/summaries/{session_id}/questions/stream")
async def stream_question(session_id: str, payload: QaQuestionRequest) -> StreamingResponse:
    return StreamingResponse(
        stream_qa_events(session_id, payload),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _attach_auto_transcript_task(
    video: VideoInfo,
    fallback_url: str,
    background_tasks: BackgroundTasks,
) -> None:
    if video.subtitleStatus == "available" and video.subtitles:
        return

    task = create_transcript_task(video.webpageUrl or fallback_url, video.duration)
    video.transcriptTask = task
    if should_start_task(task):
        background_tasks.add_task(run_transcript_task, task.taskId)

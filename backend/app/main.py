from __future__ import annotations

import asyncio
import shutil

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from backend.app.models import HealthInfo, Quality, VideoInfo, VideoParseRequest
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
    return HealthInfo(status="ok", ffmpegAvailable=ffmpeg_available())


@app.post("/api/videos/parse", response_model=VideoInfo)
async def parse_video(payload: VideoParseRequest) -> VideoInfo:
    try:
        return await asyncio.to_thread(extract_video_info, payload.url)
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

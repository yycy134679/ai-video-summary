from __future__ import annotations

from dataclasses import dataclass

from backend.app.models import VideoInfo
from backend.app.summary_events import stage_event
from backend.app.summary_models import SummaryTranscript
from backend.app.transcript_service import create_transcript_task, get_transcript_task, run_transcript_task, should_start_task


@dataclass(frozen=True)
class TranscriptResult:
    value: SummaryTranscript | None
    events: list[str]
    error: str | None = None


def load_or_create_transcript(video: VideoInfo, fallback_url: str) -> TranscriptResult:
    events: list[str] = [stage_event("loading_transcript", "running", "正在获取公开字幕或文稿。")]
    if video.subtitleStatus == "available" and video.subtitles:
        subtitle = video.subtitles[0]
        transcript = SummaryTranscript(
            source="subtitle",
            text="\n\n".join(item.text for item in video.subtitles if item.text.strip()).strip(),
            language=subtitle.language,
            cues=subtitle.cues,
        )
        events.append(stage_event("loading_transcript", "completed", "已获取公开字幕。"))
        return TranscriptResult(value=transcript, events=events)

    events.append(stage_event("loading_transcript", "completed", "公开字幕不可用，准备自动转写。"))
    events.append(stage_event("transcribing", "running", "正在使用 StepAudio ASR 生成文稿。"))
    task = create_transcript_task(video.webpageUrl or fallback_url, video.duration)
    video.transcriptTask = task
    if should_start_task(task):
        run_transcript_task(task.taskId)
    task = get_transcript_task(task.taskId) or task
    if task.status != "completed" or not task.text:
        message = task.message or "自动转写失败，无法获得可总结文稿。"
        events.append(stage_event("transcribing", "failed", message))
        return TranscriptResult(value=None, events=events, error=message)

    events.append(stage_event("transcribing", "completed", "文稿生成完成。"))
    return TranscriptResult(
        value=SummaryTranscript(source="asr", text=task.text.strip(), language=None, cues=[]),
        events=events,
    )

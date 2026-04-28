from __future__ import annotations

import math
import shutil
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from backend.app.env_config import get_config_value_int
from backend.app.models import TranscriptTaskInfo
from backend.app.providers._provider_utils import run_ffmpeg_subprocess
from backend.app.providers.base import DownloadResult, MissingFfmpegError, VideoServiceError
from backend.app.stepaudio_client import StepAudioError, stepaudio_configured, transcribe_audio_file
from backend.app.video_service import download_video


DEFAULT_MAX_DURATION_SECONDS = 30 * 60
DEFAULT_MAX_STEP_AUDIO_REQUEST_BYTES = 39 * 1024 * 1024
DEFAULT_TASK_TTL_SECONDS = 24 * 60 * 60


_tasks: dict[str, dict[str, Any]] = {}
_tasks_lock = threading.Lock()
_transcribe_semaphore = threading.Semaphore(get_config_value_int("STEP_ASR_MAX_CONCURRENT_TASKS", 1))


def create_transcript_task(url: str, duration: int | None = None) -> TranscriptTaskInfo:
    _prune_expired_tasks()
    task_id = uuid.uuid4().hex
    now = time.time()
    row: dict[str, Any] = {
        "taskId": task_id,
        "url": url,
        "duration": duration,
        "status": "queued",
        "source": "asr",
        "message": "等待开始自动转写。",
        "text": None,
        "createdAt": now,
        "updatedAt": now,
    }

    if not stepaudio_configured():
        row["status"] = "failed"
        row["message"] = "未配置 StepFun API Key，无法自动生成视频文稿。请设置 STEP_API_KEY 后重试。"
    elif duration is not None and duration > _max_duration_seconds():
        row["status"] = "failed"
        row["message"] = f"视频时长超过自动转写上限（{_max_duration_seconds() // 60} 分钟），已跳过 STT。"

    with _tasks_lock:
        _tasks[task_id] = row
    return _snapshot(row)


def should_start_task(task: TranscriptTaskInfo) -> bool:
    return task.status == "queued"


def get_transcript_task(task_id: str) -> TranscriptTaskInfo | None:
    with _tasks_lock:
        row = _tasks.get(task_id)
        if row is None:
            return None
        return _snapshot(row)


def run_transcript_task(task_id: str) -> None:
    row = _get_task_row(task_id)
    if row is None or row.get("status") != "queued":
        return

    result: DownloadResult | None = None
    _transcribe_semaphore.acquire()
    try:
        row = _get_task_row(task_id)
        if row is None or row.get("status") != "queued":
            return

        _update_task(task_id, status="extracting_audio", message="正在提取视频音频。")
        result = download_video(str(row["url"]), "audio")
        audio_size = _validate_audio_file(result.path)

        if audio_size > _max_stepaudio_request_bytes():
            _update_task(task_id, status="transcribing", message="音频较大，正在分段调用 StepAudio 2.5 ASR 生成文稿。")
        else:
            _update_task(task_id, status="transcribing", message="正在调用 StepAudio 2.5 ASR 生成文稿。")
        text = _transcribe_audio_with_segments(result.path)
        _update_task(task_id, status="completed", message="文稿生成完成。", text=text)
    except MissingFfmpegError as exc:
        _update_task(task_id, status="failed", message=str(exc))
    except (VideoServiceError, StepAudioError) as exc:
        _update_task(task_id, status="failed", message=str(exc))
    except Exception as exc:
        _update_task(task_id, status="failed", message=f"自动转写失败：{exc}")
    finally:
        _transcribe_semaphore.release()
        if result is not None:
            shutil.rmtree(result.directory, ignore_errors=True)


def _validate_audio_file(path: Path) -> int:
    try:
        size = path.stat().st_size
    except OSError as exc:
        raise VideoServiceError(f"音频抽取失败：无法读取音频文件大小。{exc}") from exc

    if size <= 0:
        raise VideoServiceError("音频抽取失败：生成的音频文件为空。")
    return size


def _transcribe_audio_with_segments(path: Path) -> str:
    size = _validate_audio_file(path)
    max_request_bytes = _max_stepaudio_request_bytes()
    if size <= max_request_bytes:
        return transcribe_audio_file(path)

    chunks = _split_audio_file(path, max_request_bytes)
    texts = [transcribe_audio_file(chunk).strip() for chunk in chunks]
    return "\n\n".join(text for text in texts if text).strip()


def _split_audio_file(path: Path, max_request_bytes: int) -> list[Path]:
    duration = _probe_audio_duration_seconds(path)
    size = path.stat().st_size
    segment_time = _initial_segment_time_seconds(size, duration, max_request_bytes)

    for _ in range(8):
        output_dir = path.parent / f"asr-segments-{uuid.uuid4().hex}"
        output_dir.mkdir(parents=True, exist_ok=False)
        output_pattern = output_dir / "segment-%03d.mp3"
        run_ffmpeg_subprocess(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(path),
                "-map",
                "0:a:0",
                "-vn",
                "-f",
                "segment",
                "-segment_time",
                str(segment_time),
                "-reset_timestamps",
                "1",
                "-codec:a",
                "libmp3lame",
                "-b:a",
                "128k",
                str(output_pattern),
            ],
            "音频分段失败",
        )
        chunks = sorted(output_dir.glob("segment-*.mp3"))
        if chunks and all(0 < chunk.stat().st_size <= max_request_bytes for chunk in chunks):
            return chunks

        shutil.rmtree(output_dir, ignore_errors=True)
        segment_time = max(10, segment_time // 2)

    raise VideoServiceError("音频分段后仍超过 StepAudio 单次识别上限，请降低音频码率或缩短视频后重试。")


def _probe_audio_duration_seconds(path: Path) -> float:
    try:
        completed = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            check=False,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except OSError as exc:
        raise VideoServiceError(f"音频分段失败：无法启动 ffprobe。{exc}") from exc
    except subprocess.TimeoutExpired as exc:
        raise VideoServiceError("音频分段失败：ffprobe 读取音频时长超时。") from exc

    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "").strip().splitlines()[-1:]
        suffix = f"：{detail[0]}" if detail else "。"
        raise VideoServiceError(f"音频分段失败：无法读取音频时长{suffix}")

    try:
        duration = float(completed.stdout.strip())
    except ValueError as exc:
        raise VideoServiceError("音频分段失败：ffprobe 返回了无效音频时长。") from exc
    if duration <= 0:
        raise VideoServiceError("音频分段失败：音频时长无效。")
    return duration


def _initial_segment_time_seconds(size: int, duration: float, max_request_bytes: int) -> int:
    estimated_segments = max(2, math.ceil(size / max_request_bytes))
    safe_duration = duration / estimated_segments * 0.85
    return max(10, int(safe_duration))


def _get_task_row(task_id: str) -> dict[str, Any] | None:
    with _tasks_lock:
        row = _tasks.get(task_id)
        return dict(row) if row is not None else None


def _update_task(task_id: str, **values: Any) -> None:
    with _tasks_lock:
        row = _tasks.get(task_id)
        if row is None:
            return
        row.update(values)
        row["updatedAt"] = time.time()


def _snapshot(row: dict[str, Any]) -> TranscriptTaskInfo:
    return TranscriptTaskInfo(
        taskId=str(row["taskId"]),
        status=row["status"],
        source="asr",
        message=row.get("message"),
        text=row.get("text"),
    )


def _prune_expired_tasks() -> None:
    cutoff = time.time() - _task_ttl_seconds()
    with _tasks_lock:
        expired_ids = [
            task_id
            for task_id, row in _tasks.items()
            if float(row.get("updatedAt") or row.get("createdAt") or 0) < cutoff
        ]
        for task_id in expired_ids:
            del _tasks[task_id]


def _max_duration_seconds() -> int:
    minutes = get_config_value_int("STEP_ASR_MAX_DURATION_MINUTES", 0)
    if minutes > 0:
        return minutes * 60
    return get_config_value_int("STEP_ASR_MAX_DURATION_SECONDS", DEFAULT_MAX_DURATION_SECONDS)


def _max_stepaudio_request_bytes() -> int:
    megabytes = get_config_value_int("STEP_ASR_MAX_REQUEST_FILE_MB", 0)
    if megabytes > 0:
        return min(megabytes * 1024 * 1024, DEFAULT_MAX_STEP_AUDIO_REQUEST_BYTES)
    configured_bytes = get_config_value_int("STEP_ASR_MAX_REQUEST_FILE_BYTES", DEFAULT_MAX_STEP_AUDIO_REQUEST_BYTES)
    return min(configured_bytes, DEFAULT_MAX_STEP_AUDIO_REQUEST_BYTES)


def _task_ttl_seconds() -> int:
    return get_config_value_int("STEP_ASR_TASK_TTL_SECONDS", DEFAULT_TASK_TTL_SECONDS)


def _clear_tasks_for_tests() -> None:
    with _tasks_lock:
        _tasks.clear()

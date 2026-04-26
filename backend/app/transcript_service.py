from __future__ import annotations

import shutil
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from backend.app.env_config import get_config_value
from backend.app.models import TranscriptTaskInfo
from backend.app.providers.base import DownloadResult, MissingFfmpegError, VideoServiceError
from backend.app.stepaudio_client import StepAudioError, stepaudio_configured, transcribe_audio_file
from backend.app.video_service import download_video


DEFAULT_MAX_DURATION_SECONDS = 30 * 60
DEFAULT_MAX_AUDIO_FILE_BYTES = 64 * 1024 * 1024
DEFAULT_TASK_TTL_SECONDS = 24 * 60 * 60


def _int_env(name: str, default: int) -> int:
    raw_value = get_config_value(name)
    if not raw_value:
        return default
    try:
        value = int(raw_value)
    except ValueError:
        return default
    return value if value > 0 else default


_tasks: dict[str, dict[str, Any]] = {}
_tasks_lock = threading.Lock()
_transcribe_semaphore = threading.Semaphore(_int_env("STEP_ASR_MAX_CONCURRENT_TASKS", 1))


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
        _validate_audio_file(result.path)

        _update_task(task_id, status="transcribing", message="正在调用 StepAudio 2.5 ASR 生成文稿。")
        text = transcribe_audio_file(result.path)
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


def _validate_audio_file(path: Path) -> None:
    try:
        size = path.stat().st_size
    except OSError as exc:
        raise VideoServiceError(f"音频抽取失败：无法读取音频文件大小。{exc}") from exc

    max_size = _max_audio_file_bytes()
    if size <= 0:
        raise VideoServiceError("音频抽取失败：生成的音频文件为空。")
    if size > max_size:
        raise VideoServiceError(f"音频文件超过自动转写上限（{max_size // 1024 // 1024} MB），已跳过 STT。")


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
    minutes = _int_env("STEP_ASR_MAX_DURATION_MINUTES", 0)
    if minutes > 0:
        return minutes * 60
    return _int_env("STEP_ASR_MAX_DURATION_SECONDS", DEFAULT_MAX_DURATION_SECONDS)


def _max_audio_file_bytes() -> int:
    megabytes = _int_env("STEP_ASR_MAX_AUDIO_FILE_MB", 0)
    if megabytes > 0:
        return megabytes * 1024 * 1024
    return _int_env("STEP_ASR_MAX_AUDIO_FILE_BYTES", DEFAULT_MAX_AUDIO_FILE_BYTES)


def _task_ttl_seconds() -> int:
    return _int_env("STEP_ASR_TASK_TTL_SECONDS", DEFAULT_TASK_TTL_SECONDS)


def _clear_tasks_for_tests() -> None:
    with _tasks_lock:
        _tasks.clear()

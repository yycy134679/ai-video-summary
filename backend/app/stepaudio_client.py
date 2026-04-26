from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any, Iterable

import httpx

from backend.app.env_config import get_config_value
from backend.app.providers.base import VideoServiceError


STEP_AUDIO_ASR_MODEL = "stepaudio-2.5-asr"
DEFAULT_STEP_AUDIO_ASR_URL = "https://api.stepfun.com/v1/audio/asr/sse"
DEFAULT_TIMEOUT = httpx.Timeout(connect=8.0, read=180.0, write=30.0, pool=8.0)


class StepAudioConfigError(VideoServiceError):
    status_code = 500


class StepAudioError(VideoServiceError):
    status_code = 502


def stepaudio_configured() -> bool:
    return bool(_api_key())


def transcribe_audio_file(
    path: Path,
    *,
    api_key: str | None = None,
    endpoint: str | None = None,
    language: str = "zh",
    audio_format: str = "mp3",
    transport: httpx.BaseTransport | None = None,
) -> str:
    token = api_key or _api_key()
    if not token:
        raise StepAudioConfigError("未配置 StepFun API Key，无法自动生成视频文稿。请设置 STEP_API_KEY 后重试。")

    try:
        audio_data = base64.b64encode(path.read_bytes()).decode("ascii")
    except OSError as exc:
        raise StepAudioError(f"读取待转写音频失败：{exc}") from exc

    payload = {
        "audio": {
            "data": audio_data,
            "input": {
                "transcription": {
                    "model": STEP_AUDIO_ASR_MODEL,
                    "language": language,
                    "enable_itn": True,
                },
                "format": {
                    "type": audio_format,
                },
            },
        }
    }
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }

    try:
        with httpx.Client(timeout=DEFAULT_TIMEOUT, transport=transport) as client:
            with client.stream(
                "POST",
                endpoint or _endpoint(),
                headers=headers,
                json=payload,
            ) as response:
                if response.status_code >= 400:
                    raise StepAudioError(_http_error_message(response))
                return parse_stepaudio_sse(response.iter_lines())
    except httpx.TimeoutException as exc:
        raise StepAudioError("StepAudio ASR 请求超时，请稍后重试或缩短视频时长。") from exc
    except httpx.HTTPError as exc:
        raise StepAudioError(f"StepAudio ASR 网络请求失败：{exc}") from exc


def parse_stepaudio_sse(lines: Iterable[str]) -> str:
    deltas: list[str] = []
    final_text: str | None = None

    for event in iter_stepaudio_sse_events(lines):
        event_type = event.get("type")
        if event_type == "transcript.text.delta":
            delta = event.get("delta")
            if isinstance(delta, str):
                deltas.append(delta)
        elif event_type == "transcript.text.done":
            text = event.get("text")
            if isinstance(text, str):
                final_text = text
        elif event_type == "error":
            message = str(event.get("message") or "未知错误")
            raise StepAudioError(f"StepAudio ASR 识别失败：{message}")

    text = final_text if final_text is not None else "".join(deltas)
    text = text.strip()
    if not text:
        raise StepAudioError("StepAudio ASR 未返回有效文稿。")
    return text


def iter_stepaudio_sse_events(lines: Iterable[str]) -> Iterable[dict[str, Any]]:
    data_lines: list[str] = []

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            event = _parse_data_lines(data_lines)
            data_lines = []
            if event is not None:
                yield event
            continue
        if line.startswith(":"):
            continue
        if line.startswith("data:"):
            data_lines.append(line[5:].strip())

    event = _parse_data_lines(data_lines)
    if event is not None:
        yield event


def _parse_data_lines(data_lines: list[str]) -> dict[str, Any] | None:
    if not data_lines:
        return None
    data = "\n".join(data_lines).strip()
    if not data or data == "[DONE]":
        return None
    try:
        payload = json.loads(data)
    except ValueError as exc:
        raise StepAudioError("StepAudio ASR 返回了无法解析的 SSE 数据。") from exc
    if not isinstance(payload, dict):
        raise StepAudioError("StepAudio ASR 返回了异常的 SSE 数据。")
    return payload


def _api_key() -> str:
    return get_config_value("STEP_API_KEY")


def _endpoint() -> str:
    return get_config_value("STEP_AUDIO_ASR_URL", DEFAULT_STEP_AUDIO_ASR_URL) or DEFAULT_STEP_AUDIO_ASR_URL


def _http_error_message(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        payload = None

    message = None
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            message = error.get("message")
        message = message or payload.get("message") or payload.get("detail")

    suffix = f"：{message}" if message else ""
    return f"StepAudio ASR 请求失败（HTTP {response.status_code}）{suffix}。"

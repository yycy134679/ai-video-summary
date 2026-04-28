from __future__ import annotations

import json
from collections.abc import Iterable, Iterator
from typing import Any

import httpx

from backend.app._sse_utils import iter_sse_events
from backend.app.env_config import get_config_value, get_config_value_bool
from backend.app.providers.base import AiServiceError


DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash"
DEFAULT_REQUEST_TIMEOUT_SECONDS = 900
DEFAULT_THINKING_ENABLED = False


class DeepSeekError(AiServiceError):
    status_code = 502


class DeepSeekConfigError(DeepSeekError):
    status_code = 500


def deepseek_configured() -> bool:
    return bool(_api_key())


def stream_chat_completion(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    max_tokens: int = 4096,
    transport: httpx.BaseTransport | None = None,
) -> Iterator[str]:
    payload = _chat_payload(
        messages,
        model=model,
        stream=True,
        max_tokens=max_tokens,
    )

    try:
        with httpx.Client(timeout=_timeout(), transport=transport) as client:
            with client.stream(
                "POST",
                _chat_completions_url(),
                headers=_headers(),
                json=payload,
            ) as response:
                if response.status_code >= 400:
                    raise DeepSeekError(_http_error_message(response))
                yield from parse_deepseek_stream(response.iter_lines())
    except httpx.TimeoutException as exc:
        raise DeepSeekError("DeepSeek 请求超时，请稍后重试或缩短视频内容。") from exc
    except httpx.HTTPError as exc:
        raise DeepSeekError(f"DeepSeek 网络请求失败：{exc}") from exc


def complete_json(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    max_tokens: int = 4096,
    transport: httpx.BaseTransport | None = None,
) -> dict[str, Any]:
    payload = _chat_payload(
        messages,
        model=model,
        stream=False,
        max_tokens=max_tokens,
        response_format={"type": "json_object"},
    )

    try:
        with httpx.Client(timeout=_timeout(), transport=transport) as client:
            response = client.post(
                _chat_completions_url(),
                headers=_headers(),
                json=payload,
            )
        if response.status_code >= 400:
            raise DeepSeekError(_http_error_message(response))
        content = _extract_message_content(response.json())
    except httpx.TimeoutException as exc:
        raise DeepSeekError("DeepSeek 请求超时，请稍后重试。") from exc
    except httpx.HTTPError as exc:
        raise DeepSeekError(f"DeepSeek 网络请求失败：{exc}") from exc
    except ValueError as exc:
        raise DeepSeekError("DeepSeek 返回了无法解析的响应。") from exc

    if not content:
        raise DeepSeekError("DeepSeek JSON 输出为空，请稍后重试。")
    try:
        payload_json = json.loads(content)
    except ValueError as exc:
        raise DeepSeekError("DeepSeek 返回的 JSON 结构无法解析。") from exc
    if not isinstance(payload_json, dict):
        raise DeepSeekError("DeepSeek 返回的 JSON 顶层结构不是对象。")
    return payload_json


def parse_deepseek_stream(lines: Iterable[str]) -> Iterator[str]:
    for event_type, data_str in iter_sse_events(lines):
        try:
            payload = json.loads(data_str)
        except ValueError as exc:
            raise DeepSeekError("DeepSeek 流式响应包含无法解析的数据。") from exc

        if isinstance(payload, dict) and "error" in payload:
            raise DeepSeekError(_payload_error_message(payload))
        if not isinstance(payload, dict):
            raise DeepSeekError("DeepSeek 流式响应结构异常。")

        choices = payload.get("choices")
        if not isinstance(choices, list):
            continue

        for choice in choices:
            if not isinstance(choice, dict):
                continue
            delta = choice.get("delta")
            if not isinstance(delta, dict):
                continue
            content = delta.get("content")
            if isinstance(content, str) and content:
                yield content


def _chat_payload(
    messages: list[dict[str, str]],
    *,
    model: str | None,
    stream: bool,
    max_tokens: int,
    response_format: dict[str, str] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": model or _model(),
        "messages": messages,
        "stream": stream,
        "thinking": {"type": "enabled" if _thinking_enabled() else "disabled"},
        "max_tokens": max_tokens,
    }
    if response_format:
        payload["response_format"] = response_format
    return payload


def _extract_message_content(payload: dict[str, Any]) -> str:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        raise DeepSeekError("DeepSeek 响应缺少 choices。")
    choice = choices[0]
    if not isinstance(choice, dict):
        raise DeepSeekError("DeepSeek 响应 choices 结构异常。")
    message = choice.get("message")
    if not isinstance(message, dict):
        raise DeepSeekError("DeepSeek 响应缺少 message。")
    content = message.get("content")
    return content if isinstance(content, str) else ""


def _headers() -> dict[str, str]:
    token = _api_key()
    if not token:
        raise DeepSeekConfigError("未配置 DeepSeek API Key，无法生成视频总结。请设置 DEEPSEEK_API_KEY 后重试。")
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _api_key() -> str:
    return get_config_value("DEEPSEEK_API_KEY")


def _base_url() -> str:
    return get_config_value("DEEPSEEK_BASE_URL", DEFAULT_DEEPSEEK_BASE_URL).rstrip("/") or DEFAULT_DEEPSEEK_BASE_URL


def _model() -> str:
    return get_config_value("DEEPSEEK_MODEL", DEFAULT_DEEPSEEK_MODEL) or DEFAULT_DEEPSEEK_MODEL


def _thinking_enabled() -> bool:
    return get_config_value_bool("DEEPSEEK_THINKING_ENABLED", DEFAULT_THINKING_ENABLED)


def _chat_completions_url() -> str:
    return f"{_base_url()}/chat/completions"


def _timeout() -> httpx.Timeout:
    raw_value = get_config_value("DEEPSEEK_REQUEST_TIMEOUT_SECONDS", str(DEFAULT_REQUEST_TIMEOUT_SECONDS))
    try:
        seconds = int(raw_value)
    except ValueError:
        seconds = DEFAULT_REQUEST_TIMEOUT_SECONDS
    seconds = max(30, seconds)
    return httpx.Timeout(connect=10.0, read=float(seconds), write=60.0, pool=10.0)


def _http_error_message(response: httpx.Response) -> str:
    message = None
    try:
        payload = response.json()
    except ValueError:
        payload = None

    if isinstance(payload, dict):
        message = _payload_error_message(payload)

    fallback = _status_message(response.status_code)
    detail = message or fallback
    return f"DeepSeek 请求失败（HTTP {response.status_code}）：{detail}"


def _payload_error_message(payload: dict[str, Any]) -> str:
    error = payload.get("error")
    if isinstance(error, dict):
        message = error.get("message") or error.get("code")
        if message:
            return str(message)
    message = payload.get("message") or payload.get("detail")
    return str(message) if message else "未知错误"


def _status_message(status_code: int) -> str:
    messages = {
        400: "请求格式错误，请检查总结参数。",
        401: "DeepSeek API Key 错误或已失效。",
        402: "DeepSeek 账户余额不足。",
        422: "DeepSeek 请求参数错误。",
        429: "DeepSeek 当前限速，请稍后重试。",
        500: "DeepSeek 服务端异常，请稍后重试。",
        503: "DeepSeek 服务繁忙，请稍后重试。",
    }
    return messages.get(status_code, "DeepSeek 服务暂时不可用。")

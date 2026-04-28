"""Provider 通用工具函数，消除各 Provider 间重复代码。"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

from backend.app.providers.base import VideoServiceError


URL_PATTERN = re.compile(r"https?://[^\s]+", re.IGNORECASE)


def safe_to_int(value: Any) -> int | None:
    """安全地将任意值转为 int，失败返回 None。"""
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def safe_to_float(value: Any) -> float | None:
    """安全地将任意值转为 float，失败返回 None。"""
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def as_list(value: Any) -> list[Any]:
    """非 list 值时返回空列表。"""
    return value if isinstance(value, list) else []


def normalize_url(value: Any) -> str | None:
    """补全 / 升级为 https 协议，无效输入返回 None。"""
    if not isinstance(value, str) or not value:
        return None
    if value.startswith("//"):
        return f"https:{value}"
    if value.startswith("http://"):
        return f"https://{value[7:]}"
    return value


def safe_filename_stem(title: str, fallback_id: str) -> str:
    """从视频标题生成安全文件名主干。"""
    cleaned = re.sub(r'[\\/:*?"<>|\r\n]+', " ", title).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)[:120].strip()
    return cleaned or fallback_id


def is_platform_url(value: str, host_suffixes: tuple[str, ...]) -> bool:
    """判断 URL hostname 是否匹配给定平台后缀。"""
    parsed = urlparse(value)
    host = (parsed.hostname or "").lower()
    return any(host == suffix or host.endswith(f".{suffix}") for suffix in host_suffixes)


def extract_first_url(
    value: str,
    error_cls: type[VideoServiceError] = VideoServiceError,
    error_message: str = "请输入有效的公开视频链接。",
) -> str:
    """从输入文本中提取第一个 URL，失败时抛出 error_cls。"""
    match = URL_PATTERN.search(value.strip())
    if not match:
        raise error_cls(error_message)
    return match.group(0).strip().strip('"').strip("'").rstrip(").,;!?")


def validate_content_type(
    content_type: str,
    expected_types: tuple[str, ...],
    error_cls: type[VideoServiceError] = VideoServiceError,
) -> None:
    """校验响应 Content-Type，不符预期时抛出 error_cls。"""
    if not content_type:
        raise error_cls("媒体响应缺少 Content-Type。")
    if any(content_type.startswith(expected_type) for expected_type in expected_types):
        return
    raise error_cls(f"媒体响应类型异常（{content_type}）。")


def build_friendly_http_error(
    exc: httpx.HTTPStatusError,
    platform_label: str,
) -> str:
    """将 HTTP 状态码转为用户友好的中文错误信息。"""
    status_code = exc.response.status_code
    if status_code in {403, 412, 429}:
        return f"{platform_label}解析失败：平台限制当前服务器请求，可能触发风控、频率限制或地区/IP 限制。"
    if status_code == 404:
        return f"{platform_label}解析失败：未找到页面，链接可能失效或已被删除。"
    return f"{platform_label}解析失败：平台返回 HTTP {status_code}。"


def run_ffmpeg_subprocess(
    args: list[str],
    message: str,
    error_cls: type[VideoServiceError] = VideoServiceError,
    timeout: int = 300,
) -> None:
    """运行 ffmpeg 子进程，失败时抛出 error_cls。"""
    try:
        completed = subprocess.run(
            args,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except OSError as exc:
        raise error_cls(f"{message}：无法启动 ffmpeg。{exc}") from exc
    except subprocess.TimeoutExpired as exc:
        raise error_cls(f"{message}：ffmpeg 处理超时。") from exc

    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "").strip().splitlines()[-1:]
        suffix = f"：{detail[0]}" if detail else "。"
        raise error_cls(f"{message}{suffix}")


def codec_rank(value: str | None) -> int:
    """编码器优先级：AVC > HEVC > 其他。"""
    if not value:
        return 0
    lowered = value.lower()
    if "avc" in lowered:
        return 3
    if "hev" in lowered or "hvc" in lowered:
        return 2
    return 1


def height_from_quality_id(value: int | None) -> int | None:
    """将 B 站 quality_id 映射为视频高度。"""
    mapping = {120: 2160, 112: 1080, 80: 1080, 64: 720, 32: 480, 16: 360}
    return mapping.get(value or 0)

from __future__ import annotations

from types import ModuleType as _ModuleType
from urllib.parse import urlparse

from backend.app.models import Quality, QualityOption, VideoInfo
from backend.app.providers import bilibili_provider, douyin_provider, yt_dlp_provider
from backend.app.providers.base import DownloadResult, MissingFfmpegError, VideoServiceError


def ffmpeg_available() -> bool:
    return yt_dlp_provider.ffmpeg_available()


def validate_video_url(url: str) -> str:
    normalized = url.strip()
    parsed = urlparse(normalized)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise VideoServiceError("请输入有效的公开视频链接，仅支持 http 或 https 地址。")
    return normalized


def extract_video_info(url: str) -> VideoInfo:
    provider, resolved_url = _resolve_provider(url)
    return provider.extract_video_info(resolved_url)


def download_video(url: str, quality: Quality) -> DownloadResult:
    provider, resolved_url = _resolve_provider(url)
    return provider.download_video(resolved_url, quality)


def build_quality_options(formats: list[dict]) -> list[QualityOption]:
    return yt_dlp_provider.build_quality_options(formats)


def _resolve_provider(url: str) -> tuple[_ModuleType, str]:
    """根据 URL 匹配返回对应的 Provider 模块和标准化 URL。"""

    if douyin_provider.is_douyin_input(url):
        return douyin_provider, url

    normalized_url = validate_video_url(url)

    if bilibili_provider.is_bilibili_input(normalized_url):
        return bilibili_provider, normalized_url

    return yt_dlp_provider, normalized_url

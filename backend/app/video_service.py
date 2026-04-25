from __future__ import annotations

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
    if douyin_provider.is_douyin_input(url):
        return douyin_provider.extract_video_info(url)
    normalized_url = validate_video_url(url)
    if bilibili_provider.is_bilibili_input(normalized_url):
        return bilibili_provider.extract_video_info(normalized_url)
    return yt_dlp_provider.extract_video_info(normalized_url)


def download_video(url: str, quality: Quality) -> DownloadResult:
    if douyin_provider.is_douyin_input(url):
        return douyin_provider.download_video(url, quality)
    normalized_url = validate_video_url(url)
    if bilibili_provider.is_bilibili_input(normalized_url):
        return bilibili_provider.download_video(normalized_url, quality)
    return yt_dlp_provider.download_video(normalized_url, quality)


def build_quality_options(formats: list[dict]) -> list[QualityOption]:
    return yt_dlp_provider.build_quality_options(formats)

from __future__ import annotations

import mimetypes
import re
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError, ExtractorError

from backend.app.models import Quality, QualityOption, VideoInfo
from backend.app.providers.base import DownloadResult, MissingFfmpegError, VideoServiceError


@dataclass(frozen=True)
class QualitySpec:
    quality: Quality
    label: str
    selector: str
    min_height: int | None = None
    max_height: int | None = None
    audio_only: bool = False


QUALITY_SPECS: dict[Quality, QualitySpec] = {
    "4k": QualitySpec(
        quality="4k",
        label="4K 原画",
        selector="bestvideo[height>=2160]+bestaudio/best[height>=2160]",
        min_height=2160,
    ),
    "1080p": QualitySpec(
        quality="1080p",
        label="1080P 高清",
        selector="bestvideo[height>=1080][height<=1080]+bestaudio/best[height>=1080][height<=1080]",
        min_height=1080,
        max_height=1080,
    ),
    "720p": QualitySpec(
        quality="720p",
        label="720P 标清",
        selector="bestvideo[height>=720][height<=720]+bestaudio/best[height>=720][height<=720]",
        min_height=720,
        max_height=720,
    ),
    "audio": QualitySpec(
        quality="audio",
        label="纯音频 MP3",
        selector="bestaudio/best",
        audio_only=True,
    ),
}


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def ensure_ffmpeg() -> None:
    if not ffmpeg_available():
        raise MissingFfmpegError("未检测到 ffmpeg。请先安装 ffmpeg 后再解析或下载视频。")


def extract_video_info(url: str) -> VideoInfo:
    ensure_ffmpeg()
    ydl_opts: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "skip_download": True,
    }

    try:
        with YoutubeDL(ydl_opts) as ydl:
            raw_info = ydl.extract_info(url, download=False)
            info = ydl.sanitize_info(raw_info)
    except (DownloadError, ExtractorError) as exc:
        raise VideoServiceError(_friendly_yt_dlp_error(exc)) from exc
    except Exception as exc:
        raise VideoServiceError(f"视频解析失败：{exc}") from exc

    if not isinstance(info, dict):
        raise VideoServiceError("视频解析失败：未获取到有效的视频信息。")

    formats = info.get("formats") or []
    if not formats:
        raise VideoServiceError("未找到可下载的视频格式。该链接可能不公开或暂不受支持。")

    return VideoInfo(
        title=str(info.get("title") or "未命名视频"),
        uploader=info.get("uploader") or info.get("channel"),
        duration=_to_int(info.get("duration")),
        thumbnail=info.get("thumbnail"),
        webpageUrl=str(info.get("webpage_url") or url),
        options=build_quality_options(formats),
    )


def build_quality_options(formats: list[dict[str, Any]]) -> list[QualityOption]:
    return [_build_quality_option(spec, formats) for spec in QUALITY_SPECS.values()]


def download_video(url: str, quality: Quality) -> DownloadResult:
    ensure_ffmpeg()
    spec = QUALITY_SPECS.get(quality)
    if spec is None:
        raise VideoServiceError("不支持的下载清晰度。")

    temp_dir = Path(tempfile.mkdtemp(prefix="ai-video-summary-"))
    outtmpl = str(temp_dir / "%(title).180B [%(id)s].%(ext)s")
    ydl_opts: dict[str, Any] = {
        "format": spec.selector,
        "outtmpl": outtmpl,
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "retries": 2,
        "fragment_retries": 2,
    }

    if spec.audio_only:
        ydl_opts["postprocessors"] = [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }
        ]
    else:
        ydl_opts["merge_output_format"] = "mp4"

    try:
        with YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        output_file = _find_downloaded_file(temp_dir)
    except (DownloadError, ExtractorError) as exc:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise VideoServiceError(_friendly_yt_dlp_error(exc)) from exc
    except Exception as exc:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise VideoServiceError(f"下载失败：{exc}") from exc

    media_type = mimetypes.guess_type(output_file.name)[0] or "application/octet-stream"
    return DownloadResult(
        path=output_file,
        directory=temp_dir,
        filename=_safe_filename(output_file.name, quality),
        media_type=media_type,
    )


def _build_quality_option(spec: QualitySpec, formats: list[dict[str, Any]]) -> QualityOption:
    if spec.audio_only:
        best_audio = _best_audio_format(formats)
        return QualityOption(
            quality=spec.quality,
            label=spec.label,
            available=best_audio is not None,
            estimatedSize=_format_size(best_audio) if best_audio else None,
        )

    best_video = _best_video_format(formats, spec)
    best_audio = _best_audio_format(formats)
    estimated_size = _combined_estimated_size(best_video, best_audio)

    return QualityOption(
        quality=spec.quality,
        label=spec.label,
        available=best_video is not None,
        estimatedSize=estimated_size,
    )


def _best_video_format(formats: list[dict[str, Any]], spec: QualitySpec) -> dict[str, Any] | None:
    candidates = [
        item
        for item in formats
        if _has_video(item) and _height_matches(_to_int(item.get("height")), spec)
    ]
    if not candidates:
        return None
    return max(
        candidates,
        key=lambda item: (
            _to_int(item.get("height")) or 0,
            _to_number(item.get("tbr")) or 0,
            _format_size(item) or 0,
        ),
    )


def _best_audio_format(formats: list[dict[str, Any]]) -> dict[str, Any] | None:
    candidates = [item for item in formats if _has_audio(item)]
    if not candidates:
        return None
    return max(
        candidates,
        key=lambda item: (
            _to_number(item.get("abr")) or 0,
            _to_number(item.get("tbr")) or 0,
            _format_size(item) or 0,
        ),
    )


def _combined_estimated_size(
    video_format: dict[str, Any] | None,
    audio_format: dict[str, Any] | None,
) -> int | None:
    if video_format is None:
        return None

    video_size = _format_size(video_format)
    if _has_audio(video_format):
        return video_size

    audio_size = _format_size(audio_format) if audio_format else None
    if video_size is not None and audio_size is not None:
        return video_size + audio_size
    return None


def _format_size(item: dict[str, Any] | None) -> int | None:
    if item is None:
        return None
    size = item.get("filesize") or item.get("filesize_approx")
    return _to_int(size)


def _height_matches(height: int | None, spec: QualitySpec) -> bool:
    if height is None:
        return False
    if spec.min_height is not None and height < spec.min_height:
        return False
    if spec.max_height is not None and height > spec.max_height:
        return False
    return True


def _has_video(item: dict[str, Any]) -> bool:
    return bool(item.get("url")) and item.get("vcodec") not in {None, "none"}


def _has_audio(item: dict[str, Any]) -> bool:
    return bool(item.get("url")) and item.get("acodec") not in {None, "none"}


def _find_downloaded_file(directory: Path) -> Path:
    files = [
        item
        for item in directory.iterdir()
        if item.is_file() and not item.name.endswith((".part", ".ytdl", ".temp"))
    ]
    if not files:
        raise VideoServiceError("下载失败：未找到已生成的文件。")
    return max(files, key=lambda item: (item.stat().st_mtime, item.stat().st_size))


def _safe_filename(filename: str, quality: Quality) -> str:
    cleaned = re.sub(r"[\r\n\"]+", "", filename).strip()
    return cleaned or f"video-{quality}"


def _friendly_yt_dlp_error(exc: Exception) -> str:
    message = str(exc)
    lower_message = message.lower()
    if "unsupported url" in lower_message:
        return "该链接暂不受 yt-dlp 支持，请更换公开可访问的视频链接。"
    if "private" in lower_message or "login" in lower_message or "sign in" in lower_message:
        return "该视频可能需要登录、会员或 Cookie，本期仅支持公开可访问的视频。"
    if "http error 412" in lower_message or "precondition failed" in lower_message:
        return "视频平台返回 412 访问限制。该链接可能需要登录 Cookie、浏览器指纹或稍后重试，本期默认不读取用户 Cookie。"
    if "unavailable" in lower_message:
        return "该视频当前不可用，请更换其它公开视频链接后重试。"
    if "unable to download" in lower_message or "nodename nor servname" in lower_message:
        return "无法访问视频平台，请检查网络连接或稍后重试。"
    if "ffmpeg" in lower_message:
        return "ffmpeg 处理失败，请确认本机已正确安装 ffmpeg。"
    return f"视频处理失败：{message}"


def _to_int(value: Any) -> int | None:
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _to_number(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None

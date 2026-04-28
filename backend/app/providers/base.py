from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


class VideoServiceError(Exception):
    """视频解析、下载等视频服务相关错误。"""
    status_code = 400


class MissingFfmpegError(VideoServiceError):
    """ffmpeg 未安装。"""
    status_code = 500


class AiServiceError(Exception):
    """AI 服务（ASR、LLM 总结等）相关错误。"""
    status_code = 502


@dataclass(frozen=True)
class DownloadResult:
    path: Path
    directory: Path
    filename: str
    media_type: str

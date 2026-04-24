from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


class VideoServiceError(Exception):
    status_code = 400


class MissingFfmpegError(VideoServiceError):
    status_code = 500


@dataclass(frozen=True)
class DownloadResult:
    path: Path
    directory: Path
    filename: str
    media_type: str

from typing import Literal

from pydantic import BaseModel, Field


Quality = Literal["source", "4k", "1080p", "720p", "audio"]


class VideoParseRequest(BaseModel):
    url: str = Field(min_length=8, max_length=2048)


class QualityOption(BaseModel):
    quality: Quality
    label: str
    available: bool
    estimatedSize: int | None = None


class VideoInfo(BaseModel):
    title: str
    uploader: str | None = None
    duration: int | None = None
    thumbnail: str | None = None
    webpageUrl: str
    options: list[QualityOption]


class HealthInfo(BaseModel):
    status: str
    ffmpegAvailable: bool

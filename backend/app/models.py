from typing import Literal

from pydantic import BaseModel, Field


Quality = Literal["source", "4k", "1080p", "720p", "audio"]
SubtitleStatus = Literal["available", "unavailable"]
TranscriptStatus = Literal["queued", "extracting_audio", "transcribing", "completed", "failed"]
TranscriptSource = Literal["asr"]


class VideoParseRequest(BaseModel):
    url: str = Field(min_length=8, max_length=2048)


class TranscriptCreateRequest(BaseModel):
    url: str = Field(min_length=8, max_length=2048)


class QualityOption(BaseModel):
    quality: Quality
    label: str
    available: bool
    estimatedSize: int | None = None


class SubtitleCue(BaseModel):
    start: float
    end: float
    text: str


class SubtitleInfo(BaseModel):
    language: str
    languageLabel: str
    text: str
    cues: list[SubtitleCue] = Field(default_factory=list)


class TranscriptTaskInfo(BaseModel):
    taskId: str
    status: TranscriptStatus
    source: TranscriptSource = "asr"
    message: str | None = None
    text: str | None = None


class VideoInfo(BaseModel):
    title: str
    uploader: str | None = None
    duration: int | None = None
    thumbnail: str | None = None
    webpageUrl: str
    options: list[QualityOption]
    subtitles: list[SubtitleInfo] = Field(default_factory=list)
    subtitleStatus: SubtitleStatus = "unavailable"
    subtitleMessage: str | None = "当前视频没有可匿名访问字幕。"
    transcriptTask: TranscriptTaskInfo | None = None


class HealthInfo(BaseModel):
    status: str
    ffmpegAvailable: bool
    sttAvailable: bool = False
    deepseekAvailable: bool = False

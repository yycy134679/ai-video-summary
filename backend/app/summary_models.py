from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from backend.app.env_config import get_config_value_int
from backend.app.models import SubtitleCue


SummaryStyle = Literal["study_notes", "quick_read", "deep_analysis", "business_insight", "custom"]
SummaryStage = Literal[
    "validating_url",
    "parsing",
    "loading_transcript",
    "transcribing",
    "summarizing",
    "building_mindmap",
    "preparing_qa",
    "completed",
]
StageStatus = Literal["pending", "running", "completed", "failed"]
TranscriptSummarySource = Literal["subtitle", "asr"]
PartialErrorScope = Literal["transcript", "summary", "mindmap", "qa", "download_options"]


def custom_prompt_max_chars() -> int:
    return get_config_value_int("AI_SUMMARY_CUSTOM_PROMPT_MAX_CHARS", 2000)


class SummaryStreamRequest(BaseModel):
    url: str = Field(min_length=8, max_length=2048)
    style: SummaryStyle = "study_notes"
    customPrompt: str | None = Field(default=None)

    @field_validator("customPrompt")
    @classmethod
    def validate_custom_prompt(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if len(normalized) > custom_prompt_max_chars():
            raise ValueError(f"自定义总结提示词不能超过 {custom_prompt_max_chars()} 个字符。")
        return normalized or None


class SummaryChapter(BaseModel):
    title: str
    start: float | None = None
    end: float | None = None
    bullets: list[str] = Field(default_factory=list)


class StructuredSummary(BaseModel):
    oneSentence: str
    keyPoints: list[str] = Field(default_factory=list)
    chapters: list[SummaryChapter] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    actions: list[str] = Field(default_factory=list)
    cautions: list[str] = Field(default_factory=list)


class MindMapNode(BaseModel):
    id: str
    title: str
    summary: str | None = None
    children: list["MindMapNode"] = Field(default_factory=list)


class SummaryTranscript(BaseModel):
    source: TranscriptSummarySource
    text: str
    language: str | None = None
    cues: list[SubtitleCue] = Field(default_factory=list)


class QaQuestionRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)

    @field_validator("question")
    @classmethod
    def validate_question(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("问题不能为空。")
        return normalized


class QaMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class SummarySession(BaseModel):
    sessionId: str
    createdAt: float
    expiresAt: float
    videoTitle: str
    videoUrl: str
    transcript: str
    summaryMarkdown: str
    messages: list[QaMessage] = Field(default_factory=list)


MindMapNode.model_rebuild()

from __future__ import annotations

import json
import re
import threading
import time
import uuid
from collections.abc import Iterator
from typing import Any

from pydantic import ValidationError

from backend.app.deepseek_client import DeepSeekError, complete_json, deepseek_configured, stream_chat_completion
from backend.app.env_config import get_config_value
from backend.app.models import TranscriptTaskInfo, VideoInfo
from backend.app.prompt_templates import build_mindmap_messages, build_qa_messages, build_summary_messages
from backend.app.providers.base import MissingFfmpegError, VideoServiceError
from backend.app.summary_models import (
    MindMapNode,
    QaMessage,
    QaQuestionRequest,
    StructuredSummary,
    SummaryChapter,
    SummarySession,
    SummaryStage,
    SummaryStreamRequest,
    SummaryTranscript,
)
from backend.app.transcript_service import create_transcript_task, get_transcript_task, run_transcript_task, should_start_task
from backend.app.video_service import extract_video_info, validate_video_url


DEFAULT_SESSION_TTL_SECONDS = 24 * 60 * 60

_sessions: dict[str, SummarySession] = {}
_sessions_lock = threading.Lock()


def stream_summary_events(payload: SummaryStreamRequest) -> Iterator[str]:
    yield _stage("validating_url", "running", "正在校验视频链接。")
    try:
        _validate_summary_url(payload.url)
    except VideoServiceError as exc:
        yield _stage("validating_url", "failed", str(exc))
        yield _event("fatal_error", {"message": str(exc)})
        return

    if not deepseek_configured():
        message = "未配置 DeepSeek API Key，无法生成视频总结。请设置 DEEPSEEK_API_KEY 后重试。"
        yield _stage("validating_url", "failed", message)
        yield _event("fatal_error", {"message": message})
        return

    yield _stage("validating_url", "completed", "视频链接校验完成。")
    yield _stage("parsing", "running", "正在解析视频信息。")
    try:
        video = extract_video_info(payload.url)
    except (MissingFfmpegError, VideoServiceError) as exc:
        yield _stage("parsing", "failed", str(exc))
        yield _event("fatal_error", {"message": f"视频解析失败：{exc}"})
        return

    yield _event("video", _dump_model(video))
    yield _stage("parsing", "completed", "视频信息解析完成。")

    transcript = _load_or_create_transcript(video, payload.url)
    for event in transcript.events:
        yield event
    if transcript.value is None:
        yield _event("fatal_error", {"message": transcript.error or "无法获取视频文稿，暂不能生成总结。"})
        return

    yield _event("transcript", _dump_model(transcript.value))

    summary_markdown = ""
    yield _stage("summarizing", "running", "正在生成结构化摘要。")
    try:
        for delta in stream_chat_completion(
            build_summary_messages(video, transcript.value, payload.style, payload.customPrompt),
            max_tokens=8192,
        ):
            summary_markdown += delta
            yield _event("summary_delta", {"text": delta})
    except DeepSeekError as exc:
        if not summary_markdown.strip():
            yield _stage("summarizing", "failed", str(exc))
            yield _event("fatal_error", {"message": str(exc)})
            return
        yield _event("partial_error", {"scope": "summary", "message": f"摘要生成中断，已保留已收到内容：{exc}"})

    summary_markdown = summary_markdown.strip()
    summary = build_structured_summary_from_markdown(summary_markdown)
    yield _event(
        "summary_done",
        {
            "markdown": summary_markdown,
            "summary": _dump_model(summary),
        },
    )
    yield _stage("summarizing", "completed", "结构化摘要生成完成。")

    yield _stage("building_mindmap", "running", "正在生成思维导图。")
    try:
        mindmap_payload = complete_json(
            build_mindmap_messages(video, transcript.value, summary_markdown),
            max_tokens=4096,
        )
        mindmap = MindMapNode.model_validate(mindmap_payload)
        mindmap = normalize_mindmap(mindmap)
        yield _event("mindmap_done", {"mindmap": _dump_model(mindmap)})
        yield _stage("building_mindmap", "completed", "思维导图生成完成。")
    except (DeepSeekError, ValidationError, ValueError) as exc:
        yield _stage("building_mindmap", "failed", "思维导图生成失败，摘要和原文稿仍可使用。")
        yield _event("partial_error", {"scope": "mindmap", "message": f"思维导图生成失败：{exc}"})

    yield _stage("preparing_qa", "running", "正在准备临时问答上下文。")
    try:
        session_id = create_summary_session(video, transcript.value.text, summary_markdown)
        yield _event("qa_ready", {"sessionId": session_id, "expiresInSeconds": _session_ttl_seconds()})
        yield _stage("preparing_qa", "completed", "问答上下文已准备。")
    except Exception as exc:
        yield _stage("preparing_qa", "failed", "问答上下文准备失败，其他结果仍可使用。")
        yield _event("partial_error", {"scope": "qa", "message": f"问答准备失败：{exc}"})

    yield _stage("completed", "completed", "视频总结已完成。")
    yield _event("done", {"ok": True})


def stream_qa_events(session_id: str, payload: QaQuestionRequest) -> Iterator[str]:
    session = get_summary_session(session_id)
    if session is None:
        yield _event("fatal_error", {"message": "当前总结会话已过期，请重新生成总结。"})
        return

    answer = ""
    try:
        for delta in stream_chat_completion(
            build_qa_messages(
                video_title=session.videoTitle,
                video_url=session.videoUrl,
                transcript=session.transcript,
                summary_markdown=session.summaryMarkdown,
                history=session.messages,
                question=payload.question,
            ),
            max_tokens=4096,
        ):
            answer += delta
            yield _event("answer_delta", {"text": delta})
    except DeepSeekError as exc:
        yield _event("fatal_error", {"message": str(exc)})
        return

    message_id = f"qa_{uuid.uuid4().hex}"
    append_qa_messages(session_id, payload.question, answer.strip())
    yield _event("answer_done", {"messageId": message_id})


def create_summary_session(video: VideoInfo, transcript: str, summary_markdown: str) -> str:
    _prune_expired_sessions()
    now = time.time()
    session_id = f"summary_{uuid.uuid4().hex}"
    session = SummarySession(
        sessionId=session_id,
        createdAt=now,
        expiresAt=now + _session_ttl_seconds(),
        videoTitle=video.title,
        videoUrl=video.webpageUrl,
        transcript=transcript,
        summaryMarkdown=summary_markdown,
    )
    with _sessions_lock:
        _sessions[session_id] = session
    return session_id


def get_summary_session(session_id: str) -> SummarySession | None:
    _prune_expired_sessions()
    with _sessions_lock:
        session = _sessions.get(session_id)
        if session is None:
            return None
        return session.model_copy(deep=True)


def append_qa_messages(session_id: str, question: str, answer: str) -> None:
    with _sessions_lock:
        session = _sessions.get(session_id)
        if session is None:
            return
        session.messages.append(QaMessage(role="user", content=question))
        session.messages.append(QaMessage(role="assistant", content=answer))


def build_structured_summary_from_markdown(markdown: str) -> StructuredSummary:
    one_sentence_lines = _section_lines(markdown, "一句话总结")
    key_points = _list_items(_section_lines(markdown, "核心观点"))
    keyword_lines = _section_lines(markdown, "关键词")
    action_lines = _section_lines(markdown, "行动建议")
    caution_lines = _section_lines(markdown, "注意事项")
    chapter_lines = _section_lines(markdown, "章节概览")

    one_sentence = _first_text(one_sentence_lines) or _first_text(markdown.splitlines()) or "摘要生成完成。"
    keywords = _keywords(keyword_lines)
    actions = _list_items(action_lines)
    cautions = _list_items(caution_lines)
    chapters = _chapters(chapter_lines)

    return StructuredSummary(
        oneSentence=one_sentence,
        keyPoints=key_points,
        chapters=chapters,
        keywords=keywords,
        actions=actions,
        cautions=cautions,
    )


def normalize_mindmap(root: MindMapNode) -> MindMapNode:
    counter = 0

    def visit(node: MindMapNode, depth: int) -> MindMapNode:
        nonlocal counter
        counter += 1
        node_id = _safe_node_id(node.id) or f"node-{counter}"
        children = [visit(child, depth + 1) for child in node.children[:12] if depth < 3]
        return MindMapNode(
            id=node_id,
            title=node.title.strip()[:80] or "未命名节点",
            summary=(node.summary or "").strip()[:160] or None,
            children=children,
        )

    normalized = visit(root, 0)
    return normalized.model_copy(update={"id": "root"})


class _TranscriptResult:
    def __init__(self, *, value: SummaryTranscript | None, events: list[str], error: str | None = None) -> None:
        self.value = value
        self.events = events
        self.error = error


def _load_or_create_transcript(video: VideoInfo, fallback_url: str) -> _TranscriptResult:
    events: list[str] = [_stage("loading_transcript", "running", "正在获取公开字幕或文稿。")]
    if video.subtitleStatus == "available" and video.subtitles:
        subtitle = video.subtitles[0]
        transcript = SummaryTranscript(
            source="subtitle",
            text="\n\n".join(item.text for item in video.subtitles if item.text.strip()).strip(),
            language=subtitle.language,
            cues=subtitle.cues,
        )
        events.append(_stage("loading_transcript", "completed", "已获取公开字幕。"))
        return _TranscriptResult(value=transcript, events=events)

    events.append(_stage("loading_transcript", "completed", "公开字幕不可用，准备自动转写。"))
    events.append(_stage("transcribing", "running", "正在使用 StepAudio ASR 生成文稿。"))
    task = create_transcript_task(video.webpageUrl or fallback_url, video.duration)
    video.transcriptTask = task
    if should_start_task(task):
        run_transcript_task(task.taskId)
    task = get_transcript_task(task.taskId) or task
    if task.status != "completed" or not task.text:
        message = task.message or "自动转写失败，无法获得可总结文稿。"
        events.append(_stage("transcribing", "failed", message))
        return _TranscriptResult(value=None, events=events, error=message)

    events.append(_stage("transcribing", "completed", "文稿生成完成。"))
    return _TranscriptResult(
        value=SummaryTranscript(source="asr", text=task.text.strip(), language=None, cues=[]),
        events=events,
    )


def _validate_summary_url(value: str) -> None:
    url_match = re.search(r"https?://\S+", value)
    validate_video_url(url_match.group(0) if url_match else value)


def _stage(stage: SummaryStage, status: str, message: str) -> str:
    return _event("stage", {"stage": stage, "status": status, "message": message})


def _event(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _dump_model(model: Any) -> dict[str, Any]:
    return model.model_dump(mode="json")


def _section_lines(markdown: str, title: str) -> list[str]:
    lines = markdown.splitlines()
    start_index: int | None = None
    for index, line in enumerate(lines):
        if re.match(rf"^#+\s*{re.escape(title)}\s*$", line.strip()):
            start_index = index + 1
            break
    if start_index is None:
        return []

    collected: list[str] = []
    for line in lines[start_index:]:
        if re.match(r"^#{1,3}\s+\S", line.strip()):
            break
        collected.append(line)
    return collected


def _first_text(lines: list[str]) -> str:
    for line in lines:
        normalized = _clean_list_marker(line)
        if normalized:
            return normalized
    return ""


def _list_items(lines: list[str]) -> list[str]:
    items = [_clean_list_marker(line) for line in lines]
    return [item for item in items if item]


def _keywords(lines: list[str]) -> list[str]:
    items: list[str] = []
    for line in lines:
        cleaned = _clean_list_marker(line)
        if not cleaned:
            continue
        parts = re.split(r"[、,，;；]", cleaned)
        items.extend(part.strip() for part in parts if part.strip())
    return items[:20]


def _chapters(lines: list[str]) -> list[SummaryChapter]:
    chapters: list[SummaryChapter] = []
    current: SummaryChapter | None = None
    for line in lines:
        cleaned = _clean_list_marker(line)
        if not cleaned:
            continue
        if re.match(r"^(\d+\.|第.+章|章节|###)", cleaned):
            if current is not None:
                chapters.append(current)
            current = SummaryChapter(title=cleaned, bullets=[])
            continue
        if current is None:
            current = SummaryChapter(title=cleaned, bullets=[])
        else:
            current.bullets.append(cleaned)
    if current is not None:
        chapters.append(current)
    return chapters[:12]


def _clean_list_marker(line: str) -> str:
    normalized = line.strip()
    normalized = re.sub(r"^[-*+]\s+", "", normalized)
    normalized = re.sub(r"^\d+[.)、]\s*", "", normalized)
    normalized = normalized.strip()
    return normalized


def _safe_node_id(value: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_-]+", "-", value.strip())[:48].strip("-")
    return safe


def _session_ttl_seconds() -> int:
    raw_value = get_config_value("AI_SUMMARY_SESSION_TTL_SECONDS", str(DEFAULT_SESSION_TTL_SECONDS))
    try:
        value = int(raw_value)
    except ValueError:
        return DEFAULT_SESSION_TTL_SECONDS
    return value if value > 0 else DEFAULT_SESSION_TTL_SECONDS


def _prune_expired_sessions() -> None:
    now = time.time()
    with _sessions_lock:
        expired_ids = [session_id for session_id, session in _sessions.items() if session.expiresAt <= now]
        for session_id in expired_ids:
            del _sessions[session_id]


def _clear_sessions_for_tests() -> None:
    with _sessions_lock:
        _sessions.clear()

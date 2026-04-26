from __future__ import annotations

import re
import uuid
from collections.abc import Iterator

from pydantic import ValidationError

from backend.app.deepseek_client import DeepSeekError, complete_json, deepseek_configured, stream_chat_completion
from backend.app.prompt_templates import build_mindmap_messages, build_qa_messages, build_summary_messages
from backend.app.providers.base import MissingFfmpegError, VideoServiceError
from backend.app.summary_events import dump_model as _dump_model
from backend.app.summary_events import sse_event as _event
from backend.app.summary_events import stage_event as _stage
from backend.app.summary_markdown_parser import build_structured_summary_from_markdown
from backend.app.summary_models import (
    MindMapNode,
    QaQuestionRequest,
    SummaryStreamRequest,
)
from backend.app.summary_session_store import append_qa_messages, create_summary_session, get_summary_session
from backend.app.summary_session_store import clear_summary_sessions_for_tests as _clear_sessions_for_tests
from backend.app.summary_session_store import session_ttl_seconds as _session_ttl_seconds
from backend.app.summary_transcript_resolver import load_or_create_transcript
from backend.app.video_service import extract_video_info, validate_video_url


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

    transcript = load_or_create_transcript(video, payload.url)
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


def _validate_summary_url(value: str) -> None:
    url_match = re.search(r"https?://\S+", value)
    validate_video_url(url_match.group(0) if url_match else value)


def _safe_node_id(value: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_-]+", "-", value.strip())[:48].strip("-")
    return safe

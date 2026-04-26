from __future__ import annotations

import threading
import time
import uuid

from backend.app.env_config import get_config_value
from backend.app.models import VideoInfo
from backend.app.summary_models import QaMessage, SummarySession


DEFAULT_SESSION_TTL_SECONDS = 24 * 60 * 60

_sessions: dict[str, SummarySession] = {}
_sessions_lock = threading.Lock()


def create_summary_session(video: VideoInfo, transcript: str, summary_markdown: str) -> str:
    _prune_expired_sessions()
    now = time.time()
    session_id = f"summary_{uuid.uuid4().hex}"
    session = SummarySession(
        sessionId=session_id,
        createdAt=now,
        expiresAt=now + session_ttl_seconds(),
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


def session_ttl_seconds() -> int:
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


def clear_summary_sessions_for_tests() -> None:
    with _sessions_lock:
        _sessions.clear()

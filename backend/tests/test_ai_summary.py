import httpx
from fastapi.testclient import TestClient

from backend.app import deepseek_client, summary_service
from backend.app.models import QualityOption, SubtitleInfo, VideoInfo
from backend.app.summary_models import SummaryStreamRequest, SummaryTranscript


def parse_sse_events(text: str) -> list[tuple[str, dict]]:
    events: list[tuple[str, dict]] = []
    for chunk in text.strip().split("\n\n"):
        event_name = "message"
        data = None
        for line in chunk.splitlines():
            if line.startswith("event:"):
                event_name = line.removeprefix("event:").strip()
            elif line.startswith("data:"):
                import json

                data = json.loads(line.removeprefix("data:").strip())
        if data is not None:
            events.append((event_name, data))
    return events


def test_deepseek_stream_parser_ignores_keepalive_and_reads_delta():
    lines = [
        ": keep-alive",
        "",
        'data: {"choices":[{"delta":{"content":"第一"}}]}',
        "",
        'data: {"choices":[{"delta":{"content":"段"}}]}',
        "",
        "data: [DONE]",
        "",
    ]

    assert list(deepseek_client.parse_deepseek_stream(lines)) == ["第一", "段"]


def test_deepseek_stream_parser_skips_reasoning_content():
    lines = [
        'data: {"choices":[{"delta":{"reasoning_content":"先思考"}}]}',
        "",
        'data: {"choices":[{"delta":{"content":"最终答案"}}]}',
        "",
    ]

    assert list(deepseek_client.parse_deepseek_stream(lines)) == ["最终答案"]


def test_deepseek_complete_json_sends_json_mode_and_disables_thinking(monkeypatch):
    monkeypatch.setattr(deepseek_client, "_api_key", lambda: "sk-test")
    monkeypatch.setattr(deepseek_client, "_thinking_enabled", lambda: False)

    def handler(request: httpx.Request) -> httpx.Response:
        payload = request.read().decode("utf-8")
        assert '"response_format":{"type":"json_object"}' in payload.replace(" ", "")
        assert '"thinking":{"type":"disabled"}' in payload.replace(" ", "")
        assert '"model":"deepseek-v4-flash"' in payload.replace(" ", "")
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": '{"id":"root","title":"主题","summary":null,"children":[]}'
                        }
                    }
                ]
            },
        )

    result = deepseek_client.complete_json(
        [{"role": "user", "content": "请输出 json"}],
        transport=httpx.MockTransport(handler),
    )

    assert result["id"] == "root"


def test_deepseek_chat_payload_can_enable_thinking(monkeypatch):
    monkeypatch.setattr(deepseek_client, "_api_key", lambda: "sk-test")
    monkeypatch.setattr(
        deepseek_client,
        "get_config_value",
        lambda name, default="": "true" if name == "DEEPSEEK_THINKING_ENABLED" else default,
    )

    def handler(request: httpx.Request) -> httpx.Response:
        payload = request.read().decode("utf-8")
        assert '"thinking":{"type":"enabled"}' in payload.replace(" ", "")
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": '{"ok":true}'}}]},
        )

    result = deepseek_client.complete_json(
        [{"role": "user", "content": "请输出 json"}],
        transport=httpx.MockTransport(handler),
    )

    assert result["ok"] is True


def test_summary_stream_uses_public_subtitle_and_creates_qa_session(monkeypatch):
    summary_service._clear_sessions_for_tests()
    monkeypatch.setattr(summary_service, "deepseek_configured", lambda: True)
    monkeypatch.setattr(
        summary_service,
        "extract_video_info",
        lambda value: VideoInfo(
            title="测试视频",
            uploader="作者",
            duration=90,
            thumbnail=None,
            webpageUrl="https://example.com/video",
            subtitleStatus="available",
            subtitleMessage=None,
            subtitles=[
                SubtitleInfo(
                    language="zh-CN",
                    languageLabel="中文",
                    text="第一句字幕\n第二句字幕",
                    cues=[],
                )
            ],
            options=[QualityOption(quality="720p", label="720P 标清", available=True)],
        ),
    )
    monkeypatch.setattr(
        summary_service,
        "stream_chat_completion",
        lambda *args, **kwargs: iter(["## 一句话总结\n", "这是测试摘要。\n\n## 核心观点\n- 观点一"]),
    )
    monkeypatch.setattr(
        summary_service,
        "complete_json",
        lambda *args, **kwargs: {"id": "root", "title": "测试视频", "summary": "说明", "children": []},
    )

    events = parse_sse_events(
        "".join(
            summary_service.stream_summary_events(
                SummaryStreamRequest(url="https://example.com/video", style="study_notes")
            )
        )
    )
    event_names = [name for name, _ in events]

    assert "video" in event_names
    assert "transcript" in event_names
    assert "summary_delta" in event_names
    assert "summary_done" in event_names
    assert "mindmap_done" in event_names
    assert "qa_ready" in event_names
    assert events[-1] == ("done", {"ok": True})


def test_qa_stream_returns_clear_error_for_missing_session():
    events = parse_sse_events(
        "".join(summary_service.stream_qa_events("summary_missing", summary_service.QaQuestionRequest(question="讲了什么？")))
    )

    assert events == [("fatal_error", {"message": "当前总结会话已过期，请重新生成总结。"})]


def test_summary_session_appends_qa_messages(monkeypatch):
    summary_service._clear_sessions_for_tests()
    video = VideoInfo(title="测试视频", webpageUrl="https://example.com/video", options=[])
    transcript = SummaryTranscript(source="subtitle", text="完整文稿", language="zh-CN", cues=[])
    session_id = summary_service.create_summary_session(video, transcript.text, "摘要")
    monkeypatch.setattr(summary_service, "stream_chat_completion", lambda *args, **kwargs: iter(["依据当前视频文稿，答案是 A。"]))

    events = parse_sse_events(
        "".join(summary_service.stream_qa_events(session_id, summary_service.QaQuestionRequest(question="答案是什么？")))
    )
    session = summary_service.get_summary_session(session_id)

    assert events[0] == ("answer_delta", {"text": "依据当前视频文稿，答案是 A。"})
    assert events[-1][0] == "answer_done"
    assert session is not None
    assert [message.role for message in session.messages] == ["user", "assistant"]


def test_health_includes_deepseek_availability(monkeypatch):
    import backend.app.main as main

    monkeypatch.setattr(main, "deepseek_configured", lambda: True)

    response = TestClient(main.app).get("/api/health")

    assert response.status_code == 200
    assert response.json()["deepseekAvailable"] is True

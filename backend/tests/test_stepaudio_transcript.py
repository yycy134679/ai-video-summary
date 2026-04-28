from pathlib import Path

import httpx
import pytest

from backend.app import env_config
from backend.app import transcript_service
from backend.app.stepaudio_client import (
    StepAudioConfigError,
    StepAudioError,
    parse_stepaudio_sse,
    transcribe_audio_file,
)


def test_parse_stepaudio_sse_uses_final_text():
    lines = [
        'data: {"type":"transcript.text.delta","delta":"第一"}',
        "",
        'data: {"type":"transcript.text.delta","delta":"句"}',
        "",
        'data: {"type":"transcript.text.done","text":"第一句。"}',
        "",
    ]

    assert parse_stepaudio_sse(lines) == "第一句。"


def test_parse_stepaudio_sse_raises_on_error_event():
    lines = ['data: {"type":"error","message":"音频格式错误"}', ""]

    with pytest.raises(StepAudioError, match="音频格式错误"):
        parse_stepaudio_sse(lines)


def test_transcribe_audio_file_posts_base64_audio(tmp_path: Path):
    audio_file = tmp_path / "sample.mp3"
    audio_file.write_bytes(b"fake mp3 bytes")

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert request.headers["Authorization"] == "Bearer sk-test"
        payload = request.read().decode("utf-8")
        assert "stepaudio-2.5-asr" in payload
        assert "ZmFrZSBtcDMgYnl0ZXM=" in payload
        return httpx.Response(
            200,
            headers={"Content-Type": "text/event-stream"},
            text='data: {"type":"transcript.text.done","text":"测试文稿"}\n\n',
        )

    result = transcribe_audio_file(
        audio_file,
        api_key="sk-test",
        endpoint="https://api.stepfun.test/v1/audio/asr/sse",
        transport=httpx.MockTransport(handler),
    )

    assert result == "测试文稿"


def test_transcribe_audio_file_requires_api_key(tmp_path: Path, monkeypatch):
    monkeypatch.delenv("STEP_API_KEY", raising=False)
    monkeypatch.setattr(env_config, "PROJECT_ENV_FILE", tmp_path / ".env.missing")
    audio_file = tmp_path / "sample.mp3"
    audio_file.write_bytes(b"fake mp3 bytes")

    with pytest.raises(StepAudioConfigError, match="STEP_API_KEY"):
        transcribe_audio_file(audio_file)


def test_transcribe_audio_with_segments_uses_single_request_for_small_audio(tmp_path: Path, monkeypatch):
    audio_file = tmp_path / "sample.mp3"
    audio_file.write_bytes(b"small audio")
    calls: list[Path] = []

    monkeypatch.setattr(transcript_service, "_max_stepaudio_request_bytes", lambda: 1024)
    monkeypatch.setattr(transcript_service, "transcribe_audio_file", lambda path: calls.append(path) or "完整文稿")

    result = transcript_service._transcribe_audio_with_segments(audio_file)

    assert result == "完整文稿"
    assert calls == [audio_file]


def test_transcribe_audio_with_segments_splits_large_audio_and_merges_text(tmp_path: Path, monkeypatch):
    audio_file = tmp_path / "large.mp3"
    first_chunk = tmp_path / "segment-000.mp3"
    second_chunk = tmp_path / "segment-001.mp3"
    audio_file.write_bytes(b"x" * 30)
    first_chunk.write_bytes(b"a" * 10)
    second_chunk.write_bytes(b"b" * 10)
    calls: list[Path] = []

    monkeypatch.setattr(transcript_service, "_max_stepaudio_request_bytes", lambda: 20)
    monkeypatch.setattr(transcript_service, "_split_audio_file", lambda path, max_bytes: [first_chunk, second_chunk])

    def fake_transcribe(path: Path) -> str:
        calls.append(path)
        return "第一段" if path == first_chunk else "第二段"

    monkeypatch.setattr(transcript_service, "transcribe_audio_file", fake_transcribe)

    result = transcript_service._transcribe_audio_with_segments(audio_file)

    assert result == "第一段\n\n第二段"
    assert calls == [first_chunk, second_chunk]


def test_validate_audio_file_does_not_reject_large_audio(tmp_path: Path):
    audio_file = tmp_path / "large.mp3"
    audio_file.write_bytes(b"x" * 50)

    assert transcript_service._validate_audio_file(audio_file) == 50


def test_stepaudio_request_limit_cannot_exceed_safe_default(monkeypatch):
    monkeypatch.setattr(
        transcript_service,
        "get_config_value_int",
        lambda name, default: 64 if name == "STEP_ASR_MAX_REQUEST_FILE_MB" else default,
    )

    assert transcript_service._max_stepaudio_request_bytes() == transcript_service.DEFAULT_MAX_STEP_AUDIO_REQUEST_BYTES


def test_stepaudio_api_key_can_be_loaded_from_dotenv(tmp_path: Path, monkeypatch):
    dotenv_path = tmp_path / ".env"
    dotenv_path.write_text('STEP_API_KEY="sk-from-dotenv"\n', encoding="utf-8")
    audio_file = tmp_path / "sample.mp3"
    audio_file.write_bytes(b"fake mp3 bytes")
    monkeypatch.delenv("STEP_API_KEY", raising=False)
    monkeypatch.setattr(env_config, "PROJECT_ENV_FILE", dotenv_path)

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == "Bearer sk-from-dotenv"
        return httpx.Response(
            200,
            headers={"Content-Type": "text/event-stream"},
            text='data: {"type":"transcript.text.done","text":"来自 env 文件"}\n\n',
        )

    result = transcribe_audio_file(
        audio_file,
        endpoint="https://api.stepfun.test/v1/audio/asr/sse",
        transport=httpx.MockTransport(handler),
    )

    assert result == "来自 env 文件"


def test_load_dotenv_values_parses_quotes_export_and_comments(tmp_path: Path):
    dotenv_path = tmp_path / ".env"
    dotenv_path.write_text(
        "\n".join(
            [
                "# comment",
                "STEP_API_KEY='sk-test'",
                "export STEP_ASR_MAX_CONCURRENT_TASKS=2",
                "STEP_ASR_MAX_DURATION_MINUTES=30",
                "STEP_ASR_MAX_REQUEST_FILE_MB=39",
                "STEP_AUDIO_ASR_URL=https://example.com/sse # inline comment",
            ]
        ),
        encoding="utf-8",
    )

    values = env_config.load_dotenv_values(dotenv_path)

    assert values["STEP_API_KEY"] == "sk-test"
    assert values["STEP_ASR_MAX_CONCURRENT_TASKS"] == "2"
    assert values["STEP_ASR_MAX_DURATION_MINUTES"] == "30"
    assert values["STEP_ASR_MAX_REQUEST_FILE_MB"] == "39"
    assert values["STEP_AUDIO_ASR_URL"] == "https://example.com/sse"


def test_create_transcript_task_marks_missing_key_failed(monkeypatch):
    transcript_service._clear_tasks_for_tests()
    monkeypatch.delenv("STEP_API_KEY", raising=False)
    monkeypatch.setattr(env_config, "PROJECT_ENV_FILE", Path("/tmp/ai-video-summary-missing-test.env"))

    task = transcript_service.create_transcript_task("https://example.com/video", duration=30)

    assert task.status == "failed"
    assert "STEP_API_KEY" in (task.message or "")

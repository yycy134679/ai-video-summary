import pytest

from backend.app.models import VideoInfo
from backend.app.providers import douyin_provider
from backend.app.video_service import build_quality_options, validate_video_url


def option_map(formats):
    return {item.quality: item for item in build_quality_options(formats)}


def test_build_quality_options_marks_expected_formats_available():
    formats = [
        {
            "format_id": "v2160",
            "url": "https://cdn.example.com/video-2160.mp4",
            "vcodec": "avc1",
            "acodec": "none",
            "height": 2160,
            "tbr": 12000,
            "filesize": 200_000_000,
        },
        {
            "format_id": "v1080",
            "url": "https://cdn.example.com/video-1080.mp4",
            "vcodec": "avc1",
            "acodec": "mp4a",
            "height": 1080,
            "tbr": 5000,
            "filesize": 90_000_000,
        },
        {
            "format_id": "v720",
            "url": "https://cdn.example.com/video-720.mp4",
            "vcodec": "avc1",
            "acodec": "mp4a",
            "height": 720,
            "tbr": 2600,
        },
        {
            "format_id": "a",
            "url": "https://cdn.example.com/audio.m4a",
            "vcodec": "none",
            "acodec": "mp4a",
            "abr": 128,
            "filesize": 10_000_000,
        },
    ]

    options = option_map(formats)

    assert options["4k"].available is True
    assert options["4k"].estimatedSize == 210_000_000
    assert options["1080p"].available is True
    assert options["1080p"].estimatedSize == 90_000_000
    assert options["720p"].available is True
    assert options["720p"].estimatedSize is None
    assert options["audio"].available is True
    assert options["audio"].estimatedSize == 10_000_000


def test_build_quality_options_disables_missing_heights():
    formats = [
        {
            "format_id": "v1080",
            "url": "https://cdn.example.com/video-1080.mp4",
            "vcodec": "avc1",
            "acodec": "mp4a",
            "height": 1080,
        }
    ]

    options = option_map(formats)

    assert options["4k"].available is False
    assert options["1080p"].available is True
    assert options["720p"].available is False
    assert options["audio"].available is True


def test_validate_video_url_rejects_non_http_urls():
    with pytest.raises(Exception, match="公开视频链接"):
        validate_video_url("file:///tmp/video.mp4")


def test_douyin_extract_first_url_from_share_text():
    share_text = "复制这条消息打开抖音 https://v.douyin.com/iAbCdEf/ 看看这个视频"

    assert douyin_provider.extract_first_url(share_text) == "https://v.douyin.com/iAbCdEf/"


def test_douyin_extract_video_id_from_common_urls():
    expected_id = "7343214345843830035"

    assert douyin_provider.extract_video_id(
        f"https://www.douyin.com/video/{expected_id}"
    ) == expected_id
    assert douyin_provider.extract_video_id(
        f"https://www.douyin.com/?modal_id={expected_id}"
    ) == expected_id
    assert douyin_provider.extract_video_id(
        f"https://www.iesdouyin.com/share/video/{expected_id}/?aweme_id={expected_id}"
    ) == expected_id


def test_douyin_build_without_watermark_candidates_keeps_fallback():
    urls = ["https://example.com/playwm/?video_id=1"]

    assert douyin_provider.build_without_watermark_candidates(urls) == [
        "https://example.com/play/?video_id=1",
        "https://example.com/playwm/?video_id=1",
    ]


def test_douyin_build_media_from_item_maps_video_info():
    item = {
        "desc": "测试抖音视频",
        "author": {"nickname": "作者"},
        "video": {
            "duration": 18_000,
            "play_addr": {"url_list": ["https://cdn.example.com/playwm/video.mp4"]},
            "cover": {"url_list": ["https://cdn.example.com/cover.jpg"]},
        },
        "music": {
            "play_url": {"url_list": ["https://cdn.example.com/audio.mp3"]},
        },
    }

    media = douyin_provider.build_media_from_item(
        item,
        "https://www.douyin.com/video/7343214345843830035",
        "7343214345843830035",
    )

    assert media.title == "测试抖音视频"
    assert media.uploader == "作者"
    assert media.duration == 18
    assert media.thumbnail == "https://cdn.example.com/cover.jpg"
    assert media.video_url == "https://cdn.example.com/play/video.mp4"
    assert media.audio_url == "https://cdn.example.com/audio.mp3"


def test_douyin_build_media_from_render_data_video_detail():
    item = {
        "desc": "网页详情视频",
        "authorInfo": {"nickname": "网页作者"},
        "video": {
            "duration": 148_584,
            "playAddr": [{"src": "https://cdn.example.com/playwm/render.mp4"}],
        },
        "music": {
            "playUrl": {"urlList": ["https://cdn.example.com/render-audio.mp3"]},
        },
    }

    media = douyin_provider.build_media_from_item(
        item,
        "https://www.douyin.com/jingxuan?modal_id=7631953834730005425",
        "7631953834730005425",
    )

    assert media.title == "网页详情视频"
    assert media.uploader == "网页作者"
    assert media.duration == 148
    assert media.video_url == "https://cdn.example.com/play/render.mp4"
    assert media.audio_url == "https://cdn.example.com/render-audio.mp3"


def test_douyin_extract_video_info_uses_douyin_provider(monkeypatch):
    def fake_extract_video_info(value: str) -> VideoInfo:
        assert "v.douyin.com" in value
        return VideoInfo(
            title="抖音视频",
            webpageUrl="https://www.douyin.com/video/7343214345843830035",
            options=[],
        )

    monkeypatch.setattr(douyin_provider, "extract_video_info", fake_extract_video_info)

    from backend.app.video_service import extract_video_info

    result = extract_video_info("分享链接 https://v.douyin.com/iAbCdEf/")

    assert result.title == "抖音视频"

import pytest
import httpx
from fastapi.testclient import TestClient

from backend.app.models import TranscriptTaskInfo, VideoInfo
from backend.app.providers import bilibili_provider, douyin_provider
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


def test_bilibili_extract_first_url_from_share_text():
    share_text = "看看这个 B 站视频 https://www.bilibili.com/video/BV1TaqYBcEJc/?spm_id_from=333"

    assert (
        bilibili_provider.extract_first_url(share_text)
        == "https://www.bilibili.com/video/BV1TaqYBcEJc/?spm_id_from=333"
    )


def test_bilibili_build_media_from_page_maps_playinfo_and_initial_state():
    html = """
    <html>
      <head><title>兜底标题_哔哩哔哩_bilibili</title></head>
      <body>
        <script>
          window.__playinfo__ = {
            "data": {
              "timelength": 120000,
              "dash": {
                "video": [
                  {
                    "id": 80,
                    "baseUrl": "https://upos.example.com/video-1080.m4s",
                    "height": 1080,
                    "width": 1920,
                    "bandwidth": 5000000,
                    "codecs": "avc1.640032",
                    "mimeType": "video/mp4"
                  },
                  {
                    "id": 64,
                    "baseUrl": "https://upos.example.com/video-720.m4s",
                    "height": 720,
                    "width": 1280,
                    "bandwidth": 2500000,
                    "codecs": "avc1.640028",
                    "mimeType": "video/mp4"
                  }
                ],
                "audio": [
                  {
                    "id": 30280,
                    "baseUrl": "https://upos.example.com/audio.m4s",
                    "bandwidth": 192000,
                    "codecs": "mp4a.40.2",
                    "mimeType": "audio/mp4"
                  }
                ]
              }
            }
          };
        </script>
        <script>
          window.__INITIAL_STATE__ = {
            "videoData": {
              "bvid": "BV1TaqYBcEJc",
              "title": "测试 B 站视频",
              "duration": 118,
              "pic": "//i0.hdslb.com/cover.jpg",
              "owner": {"name": "UP 主"}
            }
          };
        </script>
      </body>
    </html>
    """

    media = bilibili_provider.build_media_from_page(
        html,
        "https://www.bilibili.com/video/BV1TaqYBcEJc/",
    )
    options = {item.quality: item for item in bilibili_provider.build_quality_options(media)}

    assert media.video_id == "BV1TaqYBcEJc"
    assert media.title == "测试 B 站视频"
    assert media.uploader == "UP 主"
    assert media.duration == 118
    assert media.thumbnail == "https://i0.hdslb.com/cover.jpg"
    assert media.subtitles == []
    assert media.subtitle_status == "unavailable"
    assert options["source"].available is True
    assert options["1080p"].available is True
    assert options["720p"].available is True
    assert options["4k"].available is False
    assert options["audio"].available is True


def test_bilibili_build_media_from_page_ignores_non_assignment_playinfo_reference():
    html = """
    <html>
      <script>
        if (window.__playinfo__) {
          primarySetting.prefetch = { playUrl: window.__playinfo__ }
        }
      </script>
      <script>
        window.__INITIAL_STATE__ = {
          "videoData": {
            "bvid": "BV1mAAmzqEfP",
            "title": "只有初始状态的视频",
            "cid": 36319134306
          }
        };
      </script>
    </html>
    """

    with pytest.raises(Exception, match="未找到播放信息"):
        bilibili_provider.build_media_from_page(
            html,
            "https://www.bilibili.com/video/BV1mAAmzqEfP/",
        )


def test_bilibili_fetch_subtitle_result_maps_public_subtitles():
    from backend.app.providers.bilibili_wbi import _clear_wbi_cache_for_tests

    _clear_wbi_cache_for_tests()

    initial_state = {
        "videoData": {
            "bvid": "BV1TaqYBcEJc",
            "cid": 123456,
        }
    }

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/x/web-interface/nav":
            return httpx.Response(
                200,
                json={
                    "code": 0,
                    "data": {
                        "wbi_img": {
                            "img_url": "https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png",
                            "sub_url": "https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png",
                        }
                    },
                },
            )
        if request.url.path == "/x/player/wbi/v2":
            return httpx.Response(
                200,
                json={
                    "code": 0,
                    "data": {
                        "need_login_subtitle": False,
                        "subtitle": {
                            "subtitles": [
                                {
                                    "lan": "zh-CN",
                                    "lan_doc": "中文",
                                    "subtitle_url": "//subtitle.example.com/zh.json",
                                }
                            ]
                        },
                    },
                },
            )
        if request.url.host == "subtitle.example.com":
            assert str(request.url) == "https://subtitle.example.com/zh.json"
            return httpx.Response(
                200,
                json={
                    "body": [
                        {"from": 0.0, "to": 1.5, "content": "第一句"},
                        {"from": 1.5, "to": 3.0, "content": "第二句"},
                    ]
                },
            )
        return httpx.Response(404)

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        result = bilibili_provider._fetch_subtitle_result(
            client,
            initial_state,
            "https://www.bilibili.com/video/BV1TaqYBcEJc/",
        )

    assert result.status == "available"
    assert result.message is None
    assert len(result.subtitles) == 1
    subtitle = result.subtitles[0]
    assert subtitle.language == "zh-CN"
    assert subtitle.languageLabel == "中文"
    assert subtitle.text == "第一句\n第二句"
    assert subtitle.cues[0].start == 0
    assert subtitle.cues[0].end == 1.5
    assert subtitle.cues[0].text == "第一句"

    _clear_wbi_cache_for_tests()


def test_bilibili_fetch_subtitle_result_handles_login_required_empty_list():
    from backend.app.providers.bilibili_wbi import _clear_wbi_cache_for_tests

    _clear_wbi_cache_for_tests()

    initial_state = {
        "videoData": {
            "bvid": "BV1TaqYBcEJc",
            "cid": 123456,
        }
    }

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/x/web-interface/nav":
            return httpx.Response(
                200,
                json={
                    "code": 0,
                    "data": {
                        "wbi_img": {
                            "img_url": "https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png",
                            "sub_url": "https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png",
                        }
                    },
                },
            )
        return httpx.Response(
            200,
            json={
                "code": 0,
                "data": {
                    "need_login_subtitle": True,
                    "subtitle": {"subtitles": []},
                },
            },
        )

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        result = bilibili_provider._fetch_subtitle_result(
            client,
            initial_state,
            "https://www.bilibili.com/video/BV1TaqYBcEJc/",
        )

    assert result.status == "unavailable"
    assert result.subtitles == []
    assert result.message == "当前视频字幕需要登录后访问。"

    _clear_wbi_cache_for_tests()


def test_bilibili_fetch_subtitle_result_handles_invalid_subtitle_file():
    from backend.app.providers.bilibili_wbi import _clear_wbi_cache_for_tests

    _clear_wbi_cache_for_tests()

    initial_state = {
        "videoData": {
            "bvid": "BV1TaqYBcEJc",
            "cid": 123456,
        }
    }

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/x/web-interface/nav":
            return httpx.Response(
                200,
                json={
                    "code": 0,
                    "data": {
                        "wbi_img": {
                            "img_url": "https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png",
                            "sub_url": "https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png",
                        }
                    },
                },
            )
        if request.url.path == "/x/player/wbi/v2":
            return httpx.Response(
                200,
                json={
                    "code": 0,
                    "data": {
                        "need_login_subtitle": False,
                        "subtitle": {
                            "subtitles": [
                                {
                                    "lan": "zh-CN",
                                    "lan_doc": "中文",
                                    "subtitle_url": "https://subtitle.example.com/broken.json",
                                }
                            ]
                        },
                    },
                },
            )
        return httpx.Response(200, text="not json")

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        result = bilibili_provider._fetch_subtitle_result(
            client,
            initial_state,
            "https://www.bilibili.com/video/BV1TaqYBcEJc/",
        )

    assert result.status == "unavailable"
    assert result.subtitles == []
    assert result.message == "当前视频字幕文件不可访问或格式异常。"

    _clear_wbi_cache_for_tests()


def test_bilibili_extract_video_info_uses_bilibili_provider(monkeypatch):
    def fake_extract_video_info(value: str) -> VideoInfo:
        assert "bilibili.com" in value
        return VideoInfo(
            title="B 站视频",
            webpageUrl="https://www.bilibili.com/video/BV1TaqYBcEJc/",
            options=[],
        )

    monkeypatch.setattr(bilibili_provider, "extract_video_info", fake_extract_video_info)

    from backend.app.video_service import extract_video_info

    result = extract_video_info("https://www.bilibili.com/video/BV1TaqYBcEJc/")

    assert result.title == "B 站视频"
    assert result.subtitles == []
    assert result.subtitleStatus == "unavailable"


def test_parse_endpoint_starts_transcript_task_when_subtitles_unavailable(monkeypatch):
    import backend.app.main as main

    def fake_extract_video_info(value: str) -> VideoInfo:
        return VideoInfo(
            title="无字幕视频",
            duration=120,
            webpageUrl="https://example.com/video",
            options=[],
            subtitleStatus="unavailable",
            subtitleMessage="当前视频没有可匿名访问字幕。",
        )

    def fake_create_transcript_task(value: str, duration: int | None = None) -> TranscriptTaskInfo:
        assert value == "https://example.com/video"
        assert duration == 120
        return TranscriptTaskInfo(taskId="task-auto", status="queued", message="等待开始自动转写。")

    started_tasks: list[str] = []

    monkeypatch.setattr(main, "extract_video_info", fake_extract_video_info)
    monkeypatch.setattr(main, "create_transcript_task", fake_create_transcript_task)
    monkeypatch.setattr(main, "run_transcript_task", lambda task_id: started_tasks.append(task_id))

    response = TestClient(main.app).post("/api/videos/parse", json={"url": "https://example.com/video"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["transcriptTask"]["taskId"] == "task-auto"
    assert payload["transcriptTask"]["status"] == "queued"
    assert started_tasks == ["task-auto"]


def test_parse_endpoint_skips_transcript_task_when_subtitles_available(monkeypatch):
    import backend.app.main as main

    def fake_extract_video_info(value: str) -> VideoInfo:
        return VideoInfo(
            title="有字幕视频",
            webpageUrl="https://example.com/video",
            options=[],
            subtitleStatus="available",
            subtitleMessage=None,
            subtitles=[
                {
                    "language": "zh-CN",
                    "languageLabel": "中文",
                    "text": "已有字幕",
                    "cues": [],
                }
            ],
        )

    monkeypatch.setattr(main, "extract_video_info", fake_extract_video_info)

    response = TestClient(main.app).post("/api/videos/parse", json={"url": "https://example.com/video"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["subtitleStatus"] == "available"
    assert payload["transcriptTask"] is None

from __future__ import annotations

import json
import mimetypes
import re
import shutil
import tempfile
import urllib.parse
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx

from backend.app.models import Quality, QualityOption, VideoInfo
from backend.app.providers.base import DownloadResult, VideoServiceError


class DouyinProviderError(VideoServiceError):
    pass


@dataclass(frozen=True)
class DouyinMedia:
    video_id: str
    title: str
    uploader: str | None
    duration: int | None
    thumbnail: str | None
    webpage_url: str
    video_url: str | None
    audio_url: str | None


DOUYIN_HOST_SUFFIXES = ("douyin.com", "iesdouyin.com")
ITEM_INFO_API = "https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/"
URL_PATTERN = re.compile(r"https?://[^\s]+", re.IGNORECASE)
DEFAULT_TIMEOUT = httpx.Timeout(connect=8.0, read=25.0, write=8.0, pool=8.0)
DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/json,*/*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Referer": "https://www.douyin.com/",
}
MOBILE_HEADERS = {
    **DEFAULT_HEADERS,
    "User-Agent": (
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) "
        "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 "
        "Mobile/15E148 Safari/604.1"
    ),
}


def is_douyin_input(value: str) -> bool:
    try:
        candidate = extract_first_url(value)
    except DouyinProviderError:
        return False
    return _is_douyin_url(candidate)


def extract_video_info(value: str) -> VideoInfo:
    media = _resolve_media(value)
    return VideoInfo(
        title=media.title,
        uploader=media.uploader,
        duration=media.duration,
        thumbnail=media.thumbnail,
        webpageUrl=media.webpage_url,
        options=_build_douyin_options(media),
    )


def download_video(value: str, quality: Quality) -> DownloadResult:
    if quality not in {"source", "audio"}:
        raise DouyinProviderError("抖音当前仅支持原视频或音频下载。")

    media = _resolve_media(value)
    if quality == "source":
        media_url = media.video_url
        default_extension = ".mp4"
        expected_types = ("video/", "application/octet-stream")
        label = "原视频"
    else:
        media_url = media.audio_url
        default_extension = ".mp3"
        expected_types = ("audio/", "video/", "application/octet-stream")
        label = "音频"

    if not media_url:
        raise DouyinProviderError(f"未找到可下载的抖音{label}地址。")

    temp_dir = Path(tempfile.mkdtemp(prefix="ai-video-summary-douyin-"))
    try:
        return _download_media(
            media_url=media_url,
            temp_dir=temp_dir,
            filename_stem=_safe_filename_stem(media.title, media.video_id),
            default_extension=default_extension,
            expected_types=expected_types,
        )
    except Exception:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise


def extract_first_url(value: str) -> str:
    match = URL_PATTERN.search(value.strip())
    if not match:
        raise DouyinProviderError("请输入有效的抖音公开视频链接。")
    return match.group(0).strip().strip('"').strip("'").rstrip(").,;!?")


def extract_video_id(value: str) -> str:
    parsed = urlparse(value)
    query = parse_qs(parsed.query)

    for key in ("modal_id", "item_ids", "group_id", "aweme_id"):
        for item in query.get(key, []):
            match = re.search(r"(\d{8,24})", item)
            if match:
                return match.group(1)

    for pattern in (r"/video/(\d{8,24})", r"/note/(\d{8,24})", r"/(\d{8,24})(?:/|$)"):
        match = re.search(pattern, parsed.path)
        if match:
            return match.group(1)

    fallback = re.search(r"(?<!\d)(\d{8,24})(?!\d)", value)
    if fallback:
        return fallback.group(1)

    raise DouyinProviderError("无法从抖音链接中提取视频 ID。")


def build_without_watermark_candidates(urls: list[str]) -> list[str]:
    candidates: list[str] = []
    for url in urls:
        if not url:
            continue
        clean_url = url.replace("playwm", "play")
        for candidate in (clean_url, url):
            if candidate not in candidates:
                candidates.append(candidate)
    return candidates


def build_media_from_item(item: dict[str, Any], resolved_url: str, video_id: str) -> DouyinMedia:
    video = item.get("video") if isinstance(item.get("video"), dict) else {}
    author = _first_dict(item.get("author"), item.get("authorInfo"))
    music = item.get("music") if isinstance(item.get("music"), dict) else {}

    play_urls = _extract_media_urls(video.get("play_addr")) + _extract_media_urls(video.get("playAddr"))
    video_url = _first_usable_url(build_without_watermark_candidates(play_urls))

    cover_url = None
    for key in ("cover", "origin_cover", "dynamic_cover", "originCover", "dynamicCover"):
        cover_url = _first_usable_url(_extract_media_urls(video.get(key)))
        if cover_url:
            break

    audio_urls = _extract_media_urls(music.get("play_url")) + _extract_media_urls(music.get("playUrl"))
    audio_url = _first_usable_url(audio_urls)

    return DouyinMedia(
        video_id=video_id,
        title=str(item.get("desc") or item.get("title") or item.get("itemTitle") or f"抖音视频 {video_id}"),
        uploader=author.get("nickname") if isinstance(author.get("nickname"), str) else None,
        duration=_duration_seconds(video),
        thumbnail=cover_url,
        webpage_url=_canonical_webpage_url(resolved_url, video_id),
        video_url=video_url,
        audio_url=audio_url,
    )


def _resolve_media(value: str) -> DouyinMedia:
    share_url = extract_first_url(value)
    if not _is_douyin_url(share_url):
        raise DouyinProviderError("该链接不是支持的抖音地址。")

    try:
        with httpx.Client(
            headers=DEFAULT_HEADERS,
            timeout=DEFAULT_TIMEOUT,
            follow_redirects=True,
            max_redirects=8,
        ) as client:
            resolved_url = _resolve_redirect_url(client, share_url)
            video_id = extract_video_id(resolved_url)
            item = _fetch_item_info(client, video_id)
            if not item:
                item = _fetch_item_info_from_douyin_page(client, resolved_url)
            if not item:
                item = _fetch_item_info_from_share_page(client, resolved_url, video_id)
    except httpx.HTTPStatusError as exc:
        raise DouyinProviderError(_friendly_http_error(exc)) from exc
    except httpx.HTTPError as exc:
        raise DouyinProviderError(f"抖音解析失败：网络请求异常，请稍后重试。{exc}") from exc

    if not item:
        raise DouyinProviderError("抖音解析失败：未获取到有效视频信息，可能触发平台风控或接口已变更。")

    media = build_media_from_item(item, resolved_url, video_id)
    if not media.video_url and not media.audio_url:
        raise DouyinProviderError("抖音解析失败：未找到可下载媒体地址，可能触发平台风控或接口已变更。")
    return media


def _resolve_redirect_url(client: httpx.Client, share_url: str) -> str:
    response = client.get(share_url)
    response.raise_for_status()
    return str(response.url)


def _fetch_item_info(client: httpx.Client, video_id: str) -> dict[str, Any]:
    response = client.get(ITEM_INFO_API, params={"item_ids": video_id})
    if response.status_code == 404:
        return {}
    response.raise_for_status()

    try:
        data = response.json()
    except ValueError as exc:
        raise DouyinProviderError("抖音接口返回异常：不是有效 JSON。") from exc

    status_code = data.get("status_code")
    if status_code not in (0, None):
        status_msg = str(data.get("status_msg") or "未知错误")
        if status_msg == "encrypt_data_miss" or status_code == 11110:
            return {}
        raise DouyinProviderError(f"抖音接口返回错误：{status_msg}。")

    item_list = data.get("item_list")
    if isinstance(item_list, list) and item_list and isinstance(item_list[0], dict):
        return item_list[0]
    return {}


def _fetch_item_info_from_douyin_page(client: httpx.Client, resolved_url: str) -> dict[str, Any]:
    if "douyin.com" not in (urlparse(resolved_url).hostname or ""):
        return {}

    response = client.get(resolved_url)
    response.raise_for_status()
    data = _extract_render_data_json(response.text or "")
    app_data = data.get("app") if isinstance(data.get("app"), dict) else {}
    video_detail = app_data.get("videoDetail") if isinstance(app_data.get("videoDetail"), dict) else {}
    return video_detail


def _fetch_item_info_from_share_page(
    client: httpx.Client,
    resolved_url: str,
    video_id: str,
) -> dict[str, Any]:
    share_url = resolved_url if "iesdouyin.com" in urlparse(resolved_url).netloc else (
        f"https://www.iesdouyin.com/share/video/{video_id}/"
    )
    response = client.get(share_url, headers=MOBILE_HEADERS)
    response.raise_for_status()
    html = response.text or ""

    if "Please wait..." in html or "captcha" in html.lower():
        raise DouyinProviderError("抖音解析失败：平台返回风控校验页面，当前暂不支持自动处理。")

    router_data = _extract_router_data_json(html)
    if not router_data:
        return {}
    return _extract_item_info_from_router_data(router_data)


def _extract_render_data_json(html: str) -> dict[str, Any]:
    match = re.search(
        r'<script\s+id="RENDER_DATA"\s+type="application/json">(.*?)</script>',
        html,
        flags=re.DOTALL,
    )
    if not match:
        return {}

    try:
        data = json.loads(urllib.parse.unquote(match.group(1)))
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def _extract_router_data_json(html: str) -> dict[str, Any]:
    marker = "window._ROUTER_DATA = "
    start = html.find(marker)
    if start < 0:
        return {}

    index = start + len(marker)
    while index < len(html) and html[index].isspace():
        index += 1
    if index >= len(html) or html[index] != "{":
        return {}

    depth = 0
    in_string = False
    escaped = False

    for cursor in range(index, len(html)):
        char = html[cursor]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                try:
                    data = json.loads(html[index : cursor + 1])
                except ValueError:
                    return {}
                return data if isinstance(data, dict) else {}

    return {}


def _extract_item_info_from_router_data(router_data: dict[str, Any]) -> dict[str, Any]:
    loader_data = router_data.get("loaderData", {})
    if not isinstance(loader_data, dict):
        return {}

    for node in loader_data.values():
        if not isinstance(node, dict):
            continue
        video_info = node.get("videoInfoRes", {})
        if not isinstance(video_info, dict):
            continue
        item_list = video_info.get("item_list", [])
        if isinstance(item_list, list) and item_list and isinstance(item_list[0], dict):
            return item_list[0]

    return {}


def _build_douyin_options(media: DouyinMedia) -> list[QualityOption]:
    return [
        QualityOption(
            quality="source",
            label="原视频 MP4",
            available=bool(media.video_url),
            estimatedSize=None,
        ),
        QualityOption(quality="4k", label="4K 原画", available=False, estimatedSize=None),
        QualityOption(quality="1080p", label="1080P 高清", available=False, estimatedSize=None),
        QualityOption(quality="720p", label="720P 标清", available=False, estimatedSize=None),
        QualityOption(
            quality="audio",
            label="原声 / 音频",
            available=bool(media.audio_url),
            estimatedSize=None,
        ),
    ]


def _download_media(
    media_url: str,
    temp_dir: Path,
    filename_stem: str,
    default_extension: str,
    expected_types: tuple[str, ...],
) -> DownloadResult:
    with httpx.Client(
        headers=DEFAULT_HEADERS,
        timeout=httpx.Timeout(connect=8.0, read=60.0, write=8.0, pool=8.0),
        follow_redirects=True,
        max_redirects=8,
    ) as client:
        with client.stream("GET", media_url) as response:
            response.raise_for_status()
            content_type = response.headers.get("Content-Type", "").split(";", maxsplit=1)[0].strip()
            _validate_content_type(content_type, expected_types)
            extension = (
                mimetypes.guess_extension(content_type)
                if content_type != "application/octet-stream"
                else None
            ) or default_extension
            output_file = temp_dir / f"{filename_stem}{extension}"
            temp_file = output_file.with_suffix(f"{extension}.part")

            try:
                with temp_file.open("wb") as file_obj:
                    for chunk in response.iter_bytes(chunk_size=64 * 1024):
                        if chunk:
                            file_obj.write(chunk)
                temp_file.replace(output_file)
            except OSError as exc:
                raise DouyinProviderError(f"抖音下载失败：写入临时文件失败。{exc}") from exc

    return DownloadResult(
        path=output_file,
        directory=temp_dir,
        filename=output_file.name,
        media_type=content_type or "application/octet-stream",
    )


def _validate_content_type(content_type: str, expected_types: tuple[str, ...]) -> None:
    if not content_type:
        raise DouyinProviderError("抖音下载失败：媒体响应缺少 Content-Type。")
    if any(content_type.startswith(expected_type) for expected_type in expected_types):
        return
    raise DouyinProviderError(f"抖音下载失败：媒体响应类型异常（{content_type}）。")


def _first_usable_url(urls: list[str]) -> str | None:
    for url in urls:
        if url.startswith("http://") or url.startswith("https://"):
            return url
    return None


def _first_dict(*values: Any) -> dict[str, Any]:
    for value in values:
        if isinstance(value, dict):
            return value
    return {}


def _extract_media_urls(value: Any) -> list[str]:
    if isinstance(value, dict):
        for key in ("url_list", "urlList"):
            urls = value.get(key)
            if isinstance(urls, list):
                return [str(item) for item in urls if item]
        uri = value.get("uri")
        return [str(uri)] if uri else []

    if isinstance(value, list):
        urls: list[str] = []
        for item in value:
            if isinstance(item, str):
                urls.append(item)
            elif isinstance(item, dict):
                src = item.get("src") or item.get("url")
                if src:
                    urls.append(str(src))
        return urls

    if isinstance(value, str):
        return [value]
    return []


def _is_douyin_url(value: str) -> bool:
    parsed = urlparse(value)
    host = (parsed.hostname or "").lower()
    return any(host == suffix or host.endswith(f".{suffix}") for suffix in DOUYIN_HOST_SUFFIXES)


def _canonical_webpage_url(resolved_url: str, video_id: str) -> str:
    parsed = urlparse(resolved_url)
    if parsed.hostname and parsed.hostname.endswith("douyin.com"):
        return resolved_url
    return f"https://www.douyin.com/video/{video_id}"


def _duration_seconds(video: dict[str, Any]) -> int | None:
    duration = video.get("duration")
    try:
        if duration is None:
            return None
        value = int(duration)
    except (TypeError, ValueError):
        return None
    return value // 1000 if value > 1000 else value


def _safe_filename_stem(title: str, video_id: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|\r\n]+', " ", title).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)[:120].strip()
    return cleaned or f"douyin-{video_id}"


def _friendly_http_error(exc: httpx.HTTPStatusError) -> str:
    status_code = exc.response.status_code
    if status_code in {403, 412, 429}:
        return "抖音解析失败：平台限制当前服务器请求，可能触发风控、频率限制或地区/IP 限制。"
    if status_code == 404:
        return "抖音解析失败：未找到视频信息，链接可能失效或接口已变更。"
    return f"抖音解析失败：平台接口返回 HTTP {status_code}。"

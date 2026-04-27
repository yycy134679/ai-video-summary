from __future__ import annotations

import json
import mimetypes
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

from backend.app.models import Quality, QualityOption, SubtitleCue, SubtitleInfo, SubtitleStatus, VideoInfo
from backend.app.providers.base import DownloadResult, MissingFfmpegError, VideoServiceError
from backend.app.providers.bilibili_wbi import get_wbi_keys, sign_params


class BilibiliProviderError(VideoServiceError):
    pass


@dataclass(frozen=True)
class BilibiliStream:
    url: str
    height: int | None
    width: int | None
    bandwidth: int | None
    codecs: str | None
    mime_type: str | None
    quality_id: int | None
    audio_included: bool = False


@dataclass(frozen=True)
class BilibiliMedia:
    video_id: str
    title: str
    uploader: str | None
    duration: int | None
    thumbnail: str | None
    webpage_url: str
    videos: list[BilibiliStream]
    audios: list[BilibiliStream]
    subtitles: list[SubtitleInfo]
    subtitle_status: SubtitleStatus
    subtitle_message: str | None


@dataclass(frozen=True)
class BilibiliSubtitleResult:
    subtitles: list[SubtitleInfo]
    status: SubtitleStatus
    message: str | None


BILIBILI_HOST_SUFFIXES = ("bilibili.com", "b23.tv")
URL_PATTERN = re.compile(r"https?://[^\s]+", re.IGNORECASE)
DEFAULT_TIMEOUT = httpx.Timeout(connect=8.0, read=30.0, write=8.0, pool=8.0)
DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}
VIDEO_QUALITIES: tuple[Quality, ...] = ("source", "4k", "1080p", "720p")

_DEVICE_FINGERPRINT_PARAMS = {
    "dm_img_list": "[]",
    "dm_img_str": "V2ViR0wgMS4wIChPcGVuR0wgRVMgMi4wIENocm9taXVtKQ",
    "dm_cover_img_str": "QU5HTEUgKE5WSURJQSwgTlZJRElBIEdlRm9yY2UgUlRYIDQwNjAgTGFwdG9wIEdQVSAoMHgwMDAwMjhFMCkgRGlyZWN0M0QxMSB2c181XzAgcHNfNV8wLCBEM0QxMSlHb29nbGUgSW5jLiAoTlZJRElBKQ",
    "dm_img_inter": '{"ds":[],"wh":[5231,6067,75],"of":[475,950,475]}',
}


def is_bilibili_input(value: str) -> bool:
    try:
        candidate = extract_first_url(value)
    except BilibiliProviderError:
        return False
    return _is_bilibili_url(candidate)


def extract_video_info(value: str) -> VideoInfo:
    media = _resolve_media(value)
    return VideoInfo(
        title=media.title,
        uploader=media.uploader,
        duration=media.duration,
        thumbnail=media.thumbnail,
        webpageUrl=media.webpage_url,
        options=build_quality_options(media),
        subtitles=media.subtitles,
        subtitleStatus=media.subtitle_status,
        subtitleMessage=media.subtitle_message,
    )


def download_video(value: str, quality: Quality) -> DownloadResult:
    ensure_ffmpeg()
    media = _resolve_media(value)

    temp_dir = Path(tempfile.mkdtemp(prefix="ai-video-summary-bilibili-"))
    try:
        if quality == "audio":
            audio = _select_best_audio(media)
            if audio is None:
                raise BilibiliProviderError("B 站解析成功，但未找到可下载的音频流。")
            return _download_audio(media, audio, temp_dir)

        video = _select_video(media, quality)
        if video is None:
            raise BilibiliProviderError("B 站解析成功，但未找到该清晰度的视频流。")

        if video.audio_included:
            return _download_single_video(media, video, quality, temp_dir)

        audio = _select_best_audio(media)
        if audio is None:
            raise BilibiliProviderError("B 站解析成功，但未找到可合并的音频流。")

        return _download_and_merge_video(media, video, audio, quality, temp_dir)
    except Exception:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise


def extract_first_url(value: str) -> str:
    match = URL_PATTERN.search(value.strip())
    if not match:
        raise BilibiliProviderError("请输入有效的 B 站公开视频链接。")
    return match.group(0).strip().strip('"').strip("'").rstrip(").,;!?")


def build_media_from_page(
    html: str,
    webpage_url: str,
    playinfo: dict[str, Any] | None = None,
    initial_state: dict[str, Any] | None = None,
) -> BilibiliMedia:
    playinfo = playinfo or _extract_json_assignment(html, "window.__playinfo__")
    initial_state = initial_state or _extract_json_assignment(html, "window.__INITIAL_STATE__")

    if not playinfo:
        raise BilibiliProviderError("B 站解析失败：页面中未找到播放信息，可能需要登录、Cookie 或已触发风控。")

    data = playinfo.get("data") if isinstance(playinfo.get("data"), dict) else {}
    dash = data.get("dash") if isinstance(data.get("dash"), dict) else {}
    videos = [_build_stream(item) for item in _as_list(dash.get("video"))]
    videos += _build_progressive_streams(data)
    audios = [_build_stream(item) for item in _as_list(dash.get("audio"))]
    videos = [item for item in videos if item.url]
    audios = [item for item in audios if item.url]

    if not videos:
        raise BilibiliProviderError("B 站解析失败：未找到可下载的视频流。")

    video_data = initial_state.get("videoData") if isinstance(initial_state.get("videoData"), dict) else {}
    owner = video_data.get("owner") if isinstance(video_data.get("owner"), dict) else {}
    video_id = _extract_video_id(video_data, webpage_url)

    duration = _to_int(video_data.get("duration"))
    if duration is None:
        duration_ms = _to_int(data.get("timelength"))
        duration = duration_ms // 1000 if duration_ms else None

    return BilibiliMedia(
        video_id=video_id,
        title=str(video_data.get("title") or _extract_title_from_html(html) or f"B 站视频 {video_id}"),
        uploader=owner.get("name") if isinstance(owner.get("name"), str) else None,
        duration=duration,
        thumbnail=_normalize_url(video_data.get("pic")),
        webpage_url=webpage_url,
        videos=videos,
        audios=audios,
        subtitles=[],
        subtitle_status="unavailable",
        subtitle_message="当前视频没有可匿名访问字幕。",
    )


def build_quality_options(media: BilibiliMedia) -> list[QualityOption]:
    return [
        QualityOption(
            quality="source",
            label="最高可用 MP4",
            available=_is_video_quality_available(media, "source"),
            estimatedSize=None,
        ),
        QualityOption(
            quality="4k",
            label="4K 原画",
            available=_is_video_quality_available(media, "4k"),
            estimatedSize=None,
        ),
        QualityOption(
            quality="1080p",
            label="1080P 高清",
            available=_is_video_quality_available(media, "1080p"),
            estimatedSize=None,
        ),
        QualityOption(
            quality="720p",
            label="720P 标清",
            available=_is_video_quality_available(media, "720p"),
            estimatedSize=None,
        ),
        QualityOption(
            quality="audio",
            label="纯音频 MP3",
            available=_select_best_audio(media) is not None,
            estimatedSize=None,
        ),
    ]


def _is_video_quality_available(media: BilibiliMedia, quality: Quality) -> bool:
    video = _select_video(media, quality)
    return video is not None and (video.audio_included or _select_best_audio(media) is not None)


def ensure_ffmpeg() -> None:
    if shutil.which("ffmpeg") is None:
        raise MissingFfmpegError("未检测到 ffmpeg。请先安装 ffmpeg 后再解析或下载视频。")


def _resolve_media(value: str) -> BilibiliMedia:
    page_url = extract_first_url(value)
    if not _is_bilibili_url(page_url):
        raise BilibiliProviderError("该链接不是支持的 B 站地址。")

    try:
        with httpx.Client(
            headers=DEFAULT_HEADERS,
            timeout=DEFAULT_TIMEOUT,
            follow_redirects=True,
            max_redirects=8,
        ) as client:
            response = client.get(page_url)
            response.raise_for_status()
            resolved_url = str(response.url)
            if not _is_bilibili_url(resolved_url):
                raise BilibiliProviderError("B 站短链跳转后的地址不是支持的视频页面。")

            html = response.text or ""
            initial_state = _extract_json_assignment(html, "window.__INITIAL_STATE__")
            playinfo = _extract_json_assignment(html, "window.__playinfo__")
            if not playinfo:
                playinfo = _fetch_playinfo_from_api(client, initial_state, resolved_url)
            else:
                playinfo = _enrich_playinfo_with_progressive(client, playinfo, initial_state, resolved_url)
            media = build_media_from_page(html, resolved_url, playinfo, initial_state)
            subtitle_result = _fetch_subtitle_result(client, initial_state, resolved_url)
            return replace(
                media,
                subtitles=subtitle_result.subtitles,
                subtitle_status=subtitle_result.status,
                subtitle_message=subtitle_result.message,
            )
    except httpx.HTTPStatusError as exc:
        raise BilibiliProviderError(_friendly_http_error(exc)) from exc
    except httpx.HTTPError as exc:
        raise BilibiliProviderError(f"B 站解析失败：网络请求异常，请稍后重试。{exc}") from exc


def _build_stream(item: Any) -> BilibiliStream:
    if not isinstance(item, dict):
        return BilibiliStream("", None, None, None, None, None, None)

    return BilibiliStream(
        url=str(item.get("baseUrl") or item.get("base_url") or ""),
        height=_to_int(item.get("height")),
        width=_to_int(item.get("width")),
        bandwidth=_to_int(item.get("bandwidth")),
        codecs=str(item.get("codecs")) if item.get("codecs") else None,
        mime_type=str(item.get("mimeType") or item.get("mime_type")) if item.get("mimeType") or item.get("mime_type") else None,
        quality_id=_to_int(item.get("id")),
    )


def _fetch_playinfo_from_api(
    client: httpx.Client,
    initial_state: dict[str, Any],
    webpage_url: str,
) -> dict[str, Any]:
    bvid, cid = _extract_bvid_cid(initial_state, webpage_url)

    if not bvid or not cid:
        raise BilibiliProviderError("B 站解析失败：页面中缺少获取播放地址所需的 bvid 或 cid。")

    dash_data = _fetch_playurl_data(
        client,
        webpage_url,
        {
            "bvid": bvid,
            "cid": cid,
            "qn": 120,
            "fnval": 16,
            "fourk": 1,
        },
    )
    progressive_data = _fetch_playurl_data(
        client,
        webpage_url,
        {
            "bvid": bvid,
            "cid": cid,
            "qn": 64,
            "fnval": 0,
            "fourk": 1,
        },
    )
    _merge_progressive_data(dash_data, progressive_data)
    return {"data": dash_data}


def _enrich_playinfo_with_progressive(
    client: httpx.Client,
    playinfo: dict[str, Any],
    initial_state: dict[str, Any],
    webpage_url: str,
) -> dict[str, Any]:
    bvid, cid = _extract_bvid_cid(initial_state, webpage_url)
    data = playinfo.get("data") if isinstance(playinfo.get("data"), dict) else {}
    if not bvid or not cid or data.get("durl"):
        return playinfo

    try:
        progressive_data = _fetch_playurl_data(
            client,
            webpage_url,
            {
                "bvid": bvid,
                "cid": cid,
                "qn": 64,
                "fnval": 0,
                "fourk": 1,
            },
        )
    except BilibiliProviderError:
        return playinfo

    _merge_progressive_data(data, progressive_data)
    return playinfo


def _fetch_subtitle_result(
    client: httpx.Client,
    initial_state: dict[str, Any],
    webpage_url: str,
) -> BilibiliSubtitleResult:
    bvid, cid = _extract_bvid_cid(initial_state, webpage_url)
    if not bvid or not cid:
        return BilibiliSubtitleResult([], "unavailable", "页面中缺少获取字幕所需的 bvid 或 cid。")

    try:
        player_data = _fetch_player_wbi_v2_data(client, webpage_url, bvid, cid)
        subtitle_data = player_data.get("subtitle") if isinstance(player_data.get("subtitle"), dict) else {}
        subtitle_items = _as_list(subtitle_data.get("subtitles"))
        if not subtitle_items:
            if player_data.get("need_login_subtitle") is True:
                return BilibiliSubtitleResult([], "unavailable", "当前视频字幕需要登录后访问。")
            return BilibiliSubtitleResult([], "unavailable", "当前视频没有可匿名访问字幕。")

        subtitles: list[SubtitleInfo] = []
        for item in subtitle_items:
            if not isinstance(item, dict):
                continue
            subtitle_url = _normalize_url(item.get("subtitle_url"))
            language = str(item.get("lan") or "").strip()
            language_label = str(item.get("lan_doc") or language or "未知字幕").strip()
            if not subtitle_url or not language:
                continue
            try:
                cues = _fetch_subtitle_cues(client, webpage_url, subtitle_url)
            except (BilibiliProviderError, httpx.HTTPError):
                continue
            if not cues:
                continue
            subtitles.append(
                SubtitleInfo(
                    language=language,
                    languageLabel=language_label,
                    text="\n".join(cue.text for cue in cues),
                    cues=cues,
                )
            )
    except (BilibiliProviderError, httpx.HTTPError):
        return BilibiliSubtitleResult([], "unavailable", "B 站字幕接口暂时不可访问。")

    if not subtitles:
        return BilibiliSubtitleResult([], "unavailable", "当前视频字幕文件不可访问或格式异常。")
    return BilibiliSubtitleResult(subtitles, "available", None)


def _fetch_player_wbi_v2_data(
    client: httpx.Client,
    webpage_url: str,
    bvid: str,
    cid: int,
) -> dict[str, Any]:
    try:
        img_key, sub_key = get_wbi_keys(client)
    except VideoServiceError:
        return {}

    params: dict[str, Any] = {
        "bvid": bvid,
        "cid": cid,
        **_DEVICE_FINGERPRINT_PARAMS,
    }
    signed_query = sign_params(params, img_key, sub_key)
    url = f"https://api.bilibili.com/x/player/wbi/v2?{signed_query}"

    response = client.get(
        url,
        headers={
            **DEFAULT_HEADERS,
            "Accept": "application/json,*/*",
            "Referer": webpage_url,
        },
    )
    response.raise_for_status()

    try:
        payload = response.json()
    except ValueError as exc:
        raise BilibiliProviderError("B 站字幕接口返回的不是有效 JSON。") from exc

    if payload.get("code") != 0:
        message = str(payload.get("message") or "未知错误")
        raise BilibiliProviderError(f"B 站字幕接口返回错误：{message}。")

    data = payload.get("data")
    if not isinstance(data, dict):
        raise BilibiliProviderError("B 站字幕接口缺少有效数据。")
    return data


def _fetch_subtitle_cues(
    client: httpx.Client,
    webpage_url: str,
    subtitle_url: str,
) -> list[SubtitleCue]:
    response = client.get(
        subtitle_url,
        headers={
            **DEFAULT_HEADERS,
            "Accept": "application/json,*/*",
            "Referer": webpage_url,
        },
    )
    response.raise_for_status()

    try:
        payload = response.json()
    except ValueError as exc:
        raise BilibiliProviderError("B 站字幕文件不是有效 JSON。") from exc

    body = _as_list(payload.get("body")) if isinstance(payload, dict) else []
    cues: list[SubtitleCue] = []
    for item in body:
        if not isinstance(item, dict):
            continue
        start = _to_float(item.get("from"))
        end = _to_float(item.get("to"))
        text = str(item.get("content") or "").strip()
        if start is None or end is None or not text:
            continue
        cues.append(SubtitleCue(start=start, end=max(start, end), text=text))
    return cues


def _fetch_playurl_data(
    client: httpx.Client,
    webpage_url: str,
    params: dict[str, Any],
) -> dict[str, Any]:
    response = client.get(
        "https://api.bilibili.com/x/player/playurl",
        params=params,
        headers={
            **DEFAULT_HEADERS,
            "Accept": "application/json,*/*",
            "Referer": webpage_url,
        },
    )
    response.raise_for_status()

    try:
        payload = response.json()
    except ValueError as exc:
        raise BilibiliProviderError("B 站解析失败：播放地址接口返回的不是有效 JSON。") from exc

    if payload.get("code") != 0:
        message = str(payload.get("message") or "未知错误")
        raise BilibiliProviderError(f"B 站解析失败：播放地址接口返回错误：{message}。")

    data = payload.get("data")
    if not isinstance(data, dict):
        raise BilibiliProviderError("B 站解析失败：播放地址接口缺少有效数据。")
    return data


def _merge_progressive_data(target: dict[str, Any], progressive_data: dict[str, Any]) -> None:
    if not progressive_data.get("durl"):
        return
    target["durl"] = progressive_data.get("durl")
    target["progressive_quality"] = progressive_data.get("quality")
    target["progressive_format"] = progressive_data.get("format")


def _build_progressive_streams(data: dict[str, Any]) -> list[BilibiliStream]:
    quality_id = _to_int(data.get("progressive_quality") or data.get("quality"))
    streams: list[BilibiliStream] = []
    for item in _as_list(data.get("durl")):
        if not isinstance(item, dict):
            continue
        url = str(item.get("url") or "")
        if not url:
            continue
        streams.append(
            BilibiliStream(
                url=url,
                height=_height_from_quality_id(quality_id),
                width=None,
                bandwidth=_to_int(item.get("size")),
                codecs=None,
                mime_type="video/mp4",
                quality_id=quality_id,
                audio_included=True,
            )
        )
    return streams


def _select_video(media: BilibiliMedia, quality: Quality) -> BilibiliStream | None:
    if quality not in VIDEO_QUALITIES:
        return None

    candidates = media.videos
    if quality == "4k":
        candidates = [item for item in candidates if (item.height or 0) >= 2160]
    elif quality == "1080p":
        candidates = [item for item in candidates if (item.height or 0) == 1080]
    elif quality == "720p":
        candidates = [item for item in candidates if (item.height or 0) == 720]

    if not candidates:
        return None
    return max(
        candidates,
        key=lambda item: (
            item.height or 0,
            item.bandwidth or 0,
            _codec_rank(item.codecs),
        ),
    )


def _select_best_audio(media: BilibiliMedia) -> BilibiliStream | None:
    if not media.audios:
        return None
    return max(media.audios, key=lambda item: item.bandwidth or 0)


def _download_and_merge_video(
    media: BilibiliMedia,
    video: BilibiliStream,
    audio: BilibiliStream,
    quality: Quality,
    temp_dir: Path,
) -> DownloadResult:
    filename_stem = _safe_filename_stem(media.title, media.video_id)
    video_file = _download_stream(media, video.url, temp_dir / "video.m4s", ("video/", "application/octet-stream"))
    audio_file = _download_stream(media, audio.url, temp_dir / "audio.m4s", ("audio/", "video/", "application/octet-stream"))
    output_file = temp_dir / f"{filename_stem}-{quality}.mp4"

    _run_ffmpeg(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(video_file),
            "-i",
            str(audio_file),
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            str(output_file),
        ],
        "B 站视频合并失败",
    )

    return DownloadResult(
        path=output_file,
        directory=temp_dir,
        filename=output_file.name,
        media_type="video/mp4",
    )


def _download_single_video(
    media: BilibiliMedia,
    video: BilibiliStream,
    quality: Quality,
    temp_dir: Path,
) -> DownloadResult:
    filename_stem = _safe_filename_stem(media.title, media.video_id)
    output_file = temp_dir / f"{filename_stem}-{quality}.mp4"
    downloaded_file = _download_stream(
        media,
        video.url,
        output_file,
        ("video/", "application/octet-stream"),
    )
    return DownloadResult(
        path=downloaded_file,
        directory=temp_dir,
        filename=downloaded_file.name,
        media_type="video/mp4",
    )


def _download_audio(media: BilibiliMedia, audio: BilibiliStream, temp_dir: Path) -> DownloadResult:
    filename_stem = _safe_filename_stem(media.title, media.video_id)
    audio_file = _download_stream(media, audio.url, temp_dir / "audio.m4s", ("audio/", "video/", "application/octet-stream"))
    output_file = temp_dir / f"{filename_stem}-audio.mp3"

    _run_ffmpeg(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(audio_file),
            "-vn",
            "-codec:a",
            "libmp3lame",
            "-b:a",
            "192k",
            str(output_file),
        ],
        "B 站音频导出失败",
    )

    return DownloadResult(
        path=output_file,
        directory=temp_dir,
        filename=output_file.name,
        media_type="audio/mpeg",
    )


def _download_stream(
    media: BilibiliMedia,
    url: str,
    output_file: Path,
    expected_types: tuple[str, ...],
) -> Path:
    headers = {
        **DEFAULT_HEADERS,
        "Accept": "*/*",
        "Referer": media.webpage_url,
        "Origin": "https://www.bilibili.com",
    }
    with httpx.Client(
        headers=headers,
        timeout=httpx.Timeout(connect=8.0, read=90.0, write=8.0, pool=8.0),
        follow_redirects=True,
        max_redirects=8,
    ) as client:
        try:
            with client.stream("GET", url) as response:
                response.raise_for_status()
                content_type = response.headers.get("Content-Type", "").split(";", maxsplit=1)[0].strip()
                _validate_content_type(content_type, expected_types)
                temp_file = output_file.with_suffix(f"{output_file.suffix}.part")
                try:
                    with temp_file.open("wb") as file_obj:
                        for chunk in response.iter_bytes(chunk_size=128 * 1024):
                            if chunk:
                                file_obj.write(chunk)
                    temp_file.replace(output_file)
                except OSError as exc:
                    raise BilibiliProviderError(f"B 站下载失败：写入临时文件失败。{exc}") from exc
        except httpx.HTTPStatusError as exc:
            raise BilibiliProviderError(_friendly_http_error(exc)) from exc
        except httpx.HTTPError as exc:
            raise BilibiliProviderError(f"B 站下载失败：网络请求异常，请稍后重试。{exc}") from exc
    return output_file


def _run_ffmpeg(args: list[str], message: str) -> None:
    try:
        completed = subprocess.run(
            args,
            check=False,
            capture_output=True,
            text=True,
            timeout=300,
        )
    except OSError as exc:
        raise BilibiliProviderError(f"{message}：无法启动 ffmpeg。{exc}") from exc
    except subprocess.TimeoutExpired as exc:
        raise BilibiliProviderError(f"{message}：ffmpeg 处理超时。") from exc

    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "").strip().splitlines()[-1:]
        suffix = f"：{detail[0]}" if detail else "。"
        raise BilibiliProviderError(f"{message}{suffix}")


def _extract_json_assignment(html: str, marker: str) -> dict[str, Any]:
    match = re.search(rf"{re.escape(marker)}\s*=", html)
    if not match:
        return {}

    start = html.find("{", match.end())
    if start < 0:
        return {}

    depth = 0
    in_string = False
    escaped = False

    for cursor in range(start, len(html)):
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
                    data = json.loads(html[start : cursor + 1])
                except ValueError as exc:
                    raise BilibiliProviderError("B 站解析失败：页面播放信息不是有效 JSON。") from exc
                return data if isinstance(data, dict) else {}

    return {}


def _extract_video_id(video_data: dict[str, Any], webpage_url: str) -> str:
    for key in ("bvid", "aid"):
        value = video_data.get(key)
        if value:
            return str(value)

    path_segments = [item for item in urlparse(webpage_url).path.split("/") if item]
    if path_segments:
        return path_segments[-1]
    return "bilibili-video"


def _extract_bvid_cid(initial_state: dict[str, Any], webpage_url: str) -> tuple[str, int | None]:
    video_data = initial_state.get("videoData") if isinstance(initial_state.get("videoData"), dict) else {}
    bvid = str(video_data.get("bvid") or initial_state.get("bvid") or _extract_video_id(video_data, webpage_url))
    cid = _to_int(video_data.get("cid") or initial_state.get("cid") or _first_page_cid(video_data))
    return bvid, cid


def _first_page_cid(video_data: dict[str, Any]) -> int | None:
    pages = video_data.get("pages")
    if not isinstance(pages, list) or not pages or not isinstance(pages[0], dict):
        return None
    return _to_int(pages[0].get("cid"))


def _extract_title_from_html(html: str) -> str | None:
    match = re.search(r"<title>(.*?)</title>", html, flags=re.DOTALL | re.IGNORECASE)
    if not match:
        return None
    title = re.sub(r"\s+", " ", match.group(1)).strip()
    return title.removesuffix("_哔哩哔哩_bilibili").strip() or None


def _validate_content_type(content_type: str, expected_types: tuple[str, ...]) -> None:
    if not content_type:
        raise BilibiliProviderError("B 站下载失败：媒体响应缺少 Content-Type。")
    if any(content_type.startswith(expected_type) for expected_type in expected_types):
        return
    extension = mimetypes.guess_extension(content_type) or ""
    raise BilibiliProviderError(f"B 站下载失败：媒体响应类型异常（{content_type}{extension}）。")


def _is_bilibili_url(value: str) -> bool:
    parsed = urlparse(value)
    host = (parsed.hostname or "").lower()
    return any(host == suffix or host.endswith(f".{suffix}") for suffix in BILIBILI_HOST_SUFFIXES)


def _normalize_url(value: Any) -> str | None:
    if not isinstance(value, str) or not value:
        return None
    if value.startswith("//"):
        return f"https:{value}"
    if value.startswith("http://"):
        return f"https://{value[7:]}"
    return value


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _to_int(value: Any) -> int | None:
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _to_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _codec_rank(value: str | None) -> int:
    if not value:
        return 0
    lowered = value.lower()
    if "avc" in lowered:
        return 3
    if "hev" in lowered or "hvc" in lowered:
        return 2
    return 1


def _height_from_quality_id(value: int | None) -> int | None:
    return {
        120: 2160,
        112: 1080,
        80: 1080,
        64: 720,
        32: 480,
        16: 360,
    }.get(value or 0)


def _safe_filename_stem(title: str, video_id: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|\r\n]+', " ", title).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)[:120].strip()
    return cleaned or f"bilibili-{video_id}"


def _friendly_http_error(exc: httpx.HTTPStatusError) -> str:
    status_code = exc.response.status_code
    if status_code in {403, 412, 429}:
        return "B 站解析失败：平台限制当前服务器请求，可能触发风控、频率限制或地区/IP 限制。"
    if status_code == 404:
        return "B 站解析失败：未找到视频页面，链接可能失效或已被删除。"
    return f"B 站解析失败：平台返回 HTTP {status_code}。"

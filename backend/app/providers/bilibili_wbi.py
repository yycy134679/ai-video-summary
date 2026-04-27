from __future__ import annotations

import time
import urllib.parse
from functools import reduce
from hashlib import md5
from typing import Any

import httpx

from backend.app.providers.base import VideoServiceError

_MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52,
]

_WBI_NAV_URL = "https://api.bilibili.com/x/web-interface/nav"

_cached_img_key: str | None = None
_cached_sub_key: str | None = None
_cache_timestamp: float = 0.0
_CACHE_TTL_SECONDS = 600


def refresh_wbi_keys(client: httpx.Client) -> None:
    global _cached_img_key, _cached_sub_key, _cache_timestamp
    _cached_img_key, _cached_sub_key = _fetch_wbi_keys(client)
    _cache_timestamp = time.time()


def get_wbi_keys(client: httpx.Client) -> tuple[str, str]:
    global _cached_img_key, _cached_sub_key, _cache_timestamp
    now = time.time()
    if _cached_img_key and _cached_sub_key and (now - _cache_timestamp) < _CACHE_TTL_SECONDS:
        return _cached_img_key, _cached_sub_key

    refresh_wbi_keys(client)
    return _cached_img_key, _cached_sub_key  # type: ignore[return-value]


def sign_params(params: dict[str, Any], img_key: str, sub_key: str, timestamp: int | None = None) -> str:
    mixin_key = _get_mixin_key(img_key + sub_key)
    curr_time = timestamp if timestamp is not None else round(time.time())

    signed: dict[str, Any] = dict(params)
    signed["wts"] = curr_time
    signed = dict(sorted(signed.items()))
    signed = {
        k: "".join(ch for ch in str(v) if ch not in "!'()*")
        for k, v in signed.items()
    }

    query = urllib.parse.urlencode(signed)
    wbi_sign = md5((query + mixin_key).encode()).hexdigest()
    signed["w_rid"] = wbi_sign

    return urllib.parse.urlencode(signed)


def _get_mixin_key(orig: str) -> str:
    return reduce(lambda s, i: s + orig[i], _MIXIN_KEY_ENC_TAB, "")[:32]


def _fetch_wbi_keys(client: httpx.Client) -> tuple[str, str]:
    try:
        response = client.get(_WBI_NAV_URL)
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise VideoServiceError("获取 B 站 WBI 密钥失败，无法对 API 请求签名。") from exc

    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, dict):
        raise VideoServiceError("B 站 WBI 密钥接口返回数据异常。")

    wbi_img = data.get("wbi_img")
    if not isinstance(wbi_img, dict):
        raise VideoServiceError("B 站 WBI 密钥接口缺少 wbi_img 字段。")

    img_key = _extract_key_from_url(wbi_img.get("img_url"))
    sub_key = _extract_key_from_url(wbi_img.get("sub_url"))

    if not img_key or not sub_key:
        raise VideoServiceError("B 站 WBI 密钥解析失败：无法从 URL 提取密钥。")

    return img_key, sub_key


def _extract_key_from_url(url: str | None) -> str | None:
    if not isinstance(url, str) or not url:
        return None
    path = urllib.parse.urlparse(url).path
    filename = path.rsplit("/", maxsplit=1)[-1]
    return filename.rsplit(".", maxsplit=1)[0] if "." in filename else None


def _clear_wbi_cache_for_tests() -> None:
    global _cached_img_key, _cached_sub_key, _cache_timestamp
    _cached_img_key = None
    _cached_sub_key = None
    _cache_timestamp = 0.0




import json
from unittest.mock import MagicMock

import httpx
import pytest

from backend.app.providers.bilibili_wbi import (
    _clear_wbi_cache_for_tests,
    _extract_key_from_url,
    _get_mixin_key,
    get_wbi_keys,
    refresh_wbi_keys,
    sign_params,
)


@pytest.fixture(autouse=True)
def _clear_cache():
    _clear_wbi_cache_for_tests()
    yield
    _clear_wbi_cache_for_tests()


def test_extract_key_from_url_valid():
    url = "https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png"
    assert _extract_key_from_url(url) == "7cd084941338484aae1ad9425b84077c"


def test_extract_key_from_url_no_extension():
    url = "https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c"
    assert _extract_key_from_url(url) is None


def test_extract_key_from_url_none():
    assert _extract_key_from_url(None) is None
    assert _extract_key_from_url("") is None


def test_get_mixin_key_deterministic():
    combined = "7cd084941338484aae1ad9425b84077c4932caff0ff746eab6f01bf08b70ac45"
    key = _get_mixin_key(combined)
    assert len(key) == 32
    assert isinstance(key, str)
    assert all(c in "abcdef0123456789" for c in key)


def test_get_mixin_key_consistent():
    combined = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
    key1 = _get_mixin_key(combined)
    key2 = _get_mixin_key(combined)
    assert key1 == key2


def test_sign_params_produces_expected_format():
    img_key = "7cd084941338484aae1ad9425b84077c"
    sub_key = "4932caff0ff746eab6f01bf08b70ac45"
    timestamp = 1700000000

    params = {"bvid": "BV1mAAmzqEfP", "cid": 123456}
    result = sign_params(params, img_key, sub_key, timestamp)

    assert "bvid=BV1mAAmzqEfP" in result
    assert "cid=123456" in result
    assert "wts=1700000000" in result
    assert "w_rid=" in result

    extracted_fields = dict(
        pair.split("=", maxsplit=1) for pair in result.split("&") if "=" in pair
    )
    assert len(extracted_fields["w_rid"]) == 32
    assert all(c in "abcdef0123456789" for c in extracted_fields["w_rid"])


def test_sign_params_deterministic():
    img_key = "7cd084941338484aae1ad9425b84077c"
    sub_key = "4932caff0ff746eab6f01bf08b70ac45"
    timestamp = 1700000000

    params = {"bvid": "BV1mAAmzqEfP", "cid": 123456}
    assert sign_params(params, img_key, sub_key, timestamp) == sign_params(
        params, img_key, sub_key, timestamp
    )


def test_sign_params_sorts_params_alphabetically():
    img_key = "7cd084941338484aae1ad9425b84077c"
    sub_key = "4932caff0ff746eab6f01bf08b70ac45"
    timestamp = 1700000000

    params = {"cid": 1, "bvid": "BVtest"}
    result = sign_params(params, img_key, sub_key, timestamp)

    bvid_pos = result.index("bvid=")
    cid_pos = result.index("cid=")
    assert bvid_pos < cid_pos


def test_sign_params_filters_special_chars():
    img_key = "7cd084941338484aae1ad9425b84077c"
    sub_key = "4932caff0ff746eab6f01bf08b70ac45"
    timestamp = 1700000000

    params = {"bvid": "BV!te'st(val)", "cid": 1}
    result = sign_params(params, img_key, sub_key, timestamp)

    assert "BVtestval" in result
    assert "BV!" not in result

    start = result.index("bvid=") + len("bvid=")
    end = result.index("&", start)
    assert result[start:end] == "BVtestval"


def test_sign_params_with_device_fingerprint():
    img_key = "7cd084941338484aae1ad9425b84077c"
    sub_key = "4932caff0ff746eab6f01bf08b70ac45"
    timestamp = 1700000000

    params = {
        "bvid": "BV1mAAmzqEfP",
        "cid": 1,
        "dm_img_list": "[]",
        "dm_img_str": "V2ViR0wgMS4wIChPcGVuR0wgRVMgMi4wIENocm9taXVtKQ",
        "dm_cover_img_str": "QU5HTEUgKE5WSURJQSwgTlZJRElBIEdlRm9yY2UgUlRYIDQwNjAgTGFwdG9wIEdQVSAoMHgwMDAwMjhFMCkgRGlyZWN0M0QxMSB2c181XzAgcHNfNV8wLCBEM0QxMSlHb29nbGUgSW5jLiAoTlZJRElBKQ",
        "dm_img_inter": '{"ds":[],"wh":[5231,6067,75],"of":[475,950,475]}',
    }
    result = sign_params(params, img_key, sub_key, timestamp)

    assert "dm_img_list=" in result
    assert "dm_img_str=" in result
    assert "dm_cover_img_str=" in result
    assert "dm_img_inter=" in result
    assert "wts=" in result
    assert "w_rid=" in result


def _mock_client_with_wbi_response(img_key: str, sub_key: str) -> httpx.Client:
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "code": 0,
        "data": {
            "wbi_img": {
                "img_url": f"https://i0.hdslb.com/bfs/wbi/{img_key}.png",
                "sub_url": f"https://i0.hdslb.com/bfs/wbi/{sub_key}.png",
            }
        },
    }
    mock_response.raise_for_status = MagicMock()

    mock_client = MagicMock(spec=httpx.Client)
    mock_client.get.return_value = mock_response

    return mock_client


def test_get_wbi_keys_caches_within_ttl():
    _clear_wbi_cache_for_tests()
    client = _mock_client_with_wbi_response("img_a", "sub_a")

    keys1 = get_wbi_keys(client)
    keys2 = get_wbi_keys(client)

    assert keys1 == ("img_a", "sub_a")
    assert keys2 == keys1
    assert client.get.call_count == 1


def test_refresh_wbi_keys_bypasses_cache():
    _clear_wbi_cache_for_tests()
    client = _mock_client_with_wbi_response("key_x", "key_y")

    refresh_wbi_keys(client)
    keys = get_wbi_keys(client)

    assert keys == ("key_x", "key_y")
    assert client.get.call_count == 1


def test_wbi_keys_api_error_returns_empty_dict():
    from backend.app.providers.bilibili_provider import _fetch_player_wbi_v2_data

    _clear_wbi_cache_for_tests()

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock(side_effect=httpx.HTTPStatusError(
        "error", request=MagicMock(), response=MagicMock(status_code=503)
    ))

    mock_client = MagicMock(spec=httpx.Client)
    mock_client.get.return_value = mock_response

    result = _fetch_player_wbi_v2_data(
        mock_client, "https://www.bilibili.com/video/BVtest", "BVtest", 1
    )

    assert result == {}

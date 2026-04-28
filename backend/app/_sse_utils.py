"""SSE (Server-Sent Events) 通用解析工具。"""

from __future__ import annotations

import json
from collections.abc import Iterable
from typing import Any


def iter_sse_events(lines: Iterable[str]) -> Iterable[tuple[str, str]]:
    """解析 SSE 文本流，逐事件返回 (event_type, data_str) 元组。

    event_type 默认为 "message"。
    """
    current_event = "message"
    data_lines: list[str] = []

    for raw_line in lines:
        line = raw_line.strip()

        if not line:
            # 空行表示一个事件结束
            data = "\n".join(data_lines).strip()
            data_lines = []
            if data and data != "[DONE]":
                yield current_event, data
            current_event = "message"
            continue

        if line.startswith(":"):
            continue

        if line.startswith("event:"):
            current_event = line[len("event:"):].strip()
        elif line.startswith("data:"):
            data_lines.append(line[len("data:"):].strip())

    # 流结束时可能还有一个未完成的事件
    data = "\n".join(data_lines).strip()
    if data and data != "[DONE]":
        yield current_event, data


def parse_sse_json_events(lines: Iterable[str]) -> Iterable[dict[str, Any]]:
    """解析 SSE 文本流，逐事件返回已解析 JSON 的 dict。"""
    for _event_type, data_str in iter_sse_events(lines):
        try:
            payload = json.loads(data_str)
        except ValueError as exc:
            raise ValueError(f"SSE 数据无法解析为 JSON：{exc}") from exc
        if not isinstance(payload, dict):
            raise ValueError("SSE 数据顶层结构不是 JSON 对象。")
        yield payload

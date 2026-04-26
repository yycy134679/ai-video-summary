from __future__ import annotations

import re

from backend.app.summary_models import StructuredSummary, SummaryChapter


def build_structured_summary_from_markdown(markdown: str) -> StructuredSummary:
    one_sentence_lines = _section_lines(markdown, "一句话总结")
    key_points = _list_items(_section_lines(markdown, "核心观点"))
    keyword_lines = _section_lines(markdown, "关键词")
    action_lines = _section_lines(markdown, "行动建议")
    caution_lines = _section_lines(markdown, "注意事项")
    chapter_lines = _section_lines(markdown, "章节概览")

    one_sentence = _first_text(one_sentence_lines) or _first_text(markdown.splitlines()) or "摘要生成完成。"
    keywords = _keywords(keyword_lines)
    actions = _list_items(action_lines)
    cautions = _list_items(caution_lines)
    chapters = _chapters(chapter_lines)

    return StructuredSummary(
        oneSentence=one_sentence,
        keyPoints=key_points,
        chapters=chapters,
        keywords=keywords,
        actions=actions,
        cautions=cautions,
    )


def _section_lines(markdown: str, title: str) -> list[str]:
    lines = markdown.splitlines()
    start_index: int | None = None
    for index, line in enumerate(lines):
        if re.match(rf"^#+\s*{re.escape(title)}\s*$", line.strip()):
            start_index = index + 1
            break
    if start_index is None:
        return []

    collected: list[str] = []
    for line in lines[start_index:]:
        if re.match(r"^#{1,3}\s+\S", line.strip()):
            break
        collected.append(line)
    return collected


def _first_text(lines: list[str]) -> str:
    for line in lines:
        normalized = _clean_list_marker(line)
        if normalized:
            return normalized
    return ""


def _list_items(lines: list[str]) -> list[str]:
    items = [_clean_list_marker(line) for line in lines]
    return [item for item in items if item]


def _keywords(lines: list[str]) -> list[str]:
    items: list[str] = []
    for line in lines:
        cleaned = _clean_list_marker(line)
        if not cleaned:
            continue
        parts = re.split(r"[、,，;；]", cleaned)
        items.extend(part.strip() for part in parts if part.strip())
    return items[:20]


def _chapters(lines: list[str]) -> list[SummaryChapter]:
    chapters: list[SummaryChapter] = []
    current: SummaryChapter | None = None
    for line in lines:
        cleaned = _clean_list_marker(line)
        if not cleaned:
            continue
        if re.match(r"^(\d+\.|第.+章|章节|###)", cleaned):
            if current is not None:
                chapters.append(current)
            current = SummaryChapter(title=cleaned, bullets=[])
            continue
        if current is None:
            current = SummaryChapter(title=cleaned, bullets=[])
        else:
            current.bullets.append(cleaned)
    if current is not None:
        chapters.append(current)
    return chapters[:12]


def _clean_list_marker(line: str) -> str:
    normalized = line.strip()
    normalized = re.sub(r"^[-*+]\s+", "", normalized)
    normalized = re.sub(r"^\d+[.)、]\s*", "", normalized)
    normalized = normalized.strip()
    return normalized

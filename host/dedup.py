"""Deduplication helpers for changelog entries."""

from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from typing import Any

_SOURCE_PRIORITY = {
    "steam_event": 3,
    "steam_news": 2,
    "steam_news_patch": 2,
    "unknown": 1,
}


def normalize_title(title: str) -> str:
    text = (title or "").strip().lower()
    text = re.sub(r"[^\w\s]", " ", text, flags=re.UNICODE)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def day_key(epoch: int | float | None) -> str:
    if not epoch:
        return "unknown"
    try:
        dt = datetime.fromtimestamp(int(epoch), tz=timezone.utc)
        return dt.strftime("%Y-%m-%d")
    except (OSError, OverflowError, ValueError):
        return "unknown"


def entry_fingerprint(entry: dict[str, Any]) -> str:
    appid = int(entry.get("appid") or 0)
    title = normalize_title(str(entry.get("title") or ""))
    date_part = day_key(entry.get("published_at"))
    raw = f"{appid}|{title}|{date_part}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _content_score(entry: dict[str, Any]) -> int:
    source = str(entry.get("source") or "unknown")
    priority = _SOURCE_PRIORITY.get(source, 0)
    content = str(entry.get("content_html") or entry.get("content_raw") or "")
    is_patch = 1 if entry.get("is_patch") else 0
    return priority * 1_000_000 + is_patch * 10_000 + len(content)


def merge_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge duplicate changelog entries, keeping the richest version."""
    merged: dict[str, dict[str, Any]] = {}
    for entry in entries:
        fp = entry_fingerprint(entry)
        current = merged.get(fp)
        if current is None or _content_score(entry) > _content_score(current):
            merged[fp] = dict(entry)
            merged[fp]["fingerprint"] = fp
    result = list(merged.values())
    result.sort(key=lambda e: int(e.get("published_at") or 0), reverse=True)
    return result

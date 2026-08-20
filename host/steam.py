# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

"""Steam API helpers for game search and changelog retrieval."""

from __future__ import annotations

import html
import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from html.parser import HTMLParser
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 GameChangelog/1.0"
)
HTTP_TIMEOUT = 20


def _request_json(url: str) -> Any:
    req = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
        },
    )
    with urlopen(req, timeout=HTTP_TIMEOUT) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    return json.loads(raw)


def _steam_store_url(appid: int) -> str:
    return f"https://store.steampowered.com/app/{appid}/"


def _steam_icon_url(appid: int) -> str:
    return f"https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/capsule_sm_120.jpg"


def lookup_steam_app(appid: int, *, language: str = "french") -> dict[str, Any] | None:
    """Resolve Steam Store metadata for any AppID (no library ownership required)."""
    try:
        appid = int(appid)
    except (TypeError, ValueError):
        return None
    if appid <= 0:
        return None
    url = (
        "https://store.steampowered.com/api/appdetails"
        f"?appids={appid}&l={quote(language)}"
    )
    try:
        data = _request_json(url)
    except (HTTPError, URLError, json.JSONDecodeError, TimeoutError, OSError):
        return None
    block = data.get(str(appid)) or {}
    if not block.get("success"):
        return None
    info = block.get("data") or {}
    name = str(info.get("name") or "").strip()
    if not name:
        return None
    return {
        "appid": appid,
        "name": name,
        "icon_url": str(info.get("header_image") or _steam_icon_url(appid)),
        "store_url": _steam_store_url(appid),
    }


def lookup_steam_app_or_placeholder(appid: int, *, language: str = "french") -> dict[str, Any]:
    """Store lookup with minimal fallback when appdetails is unavailable."""
    found = lookup_steam_app(appid, language=language)
    if found:
        return found
    try:
        appid = int(appid)
    except (TypeError, ValueError):
        appid = 0
    if appid <= 0:
        return {
            "appid": 0,
            "name": "AppID invalide",
            "icon_url": "",
            "store_url": "",
        }
    return {
        "appid": appid,
        "name": f"Jeu {appid}",
        "icon_url": _steam_icon_url(appid),
        "store_url": _steam_store_url(appid),
    }


def _event_url(appid: int, event_gid: str | int) -> str:
    return f"https://store.steampowered.com/news/app/{appid}/view/{event_gid}"


_SAFE_URL_SCHEMES = ("http://", "https://")
_ALLOWED_TAGS = frozenset(
    {
        "p",
        "br",
        "strong",
        "b",
        "em",
        "i",
        "u",
        "h1",
        "h2",
        "h3",
        "ul",
        "ol",
        "li",
        "a",
        "img",
        "span",
        "div",
    }
)
_VOID_TAGS = frozenset({"br", "img"})


def safe_http_url(url: str | None) -> str:
    """Return url if http(s) only; else empty. Blocks javascript:, data:, etc."""
    raw = (url or "").strip()
    if not raw:
        return ""
    lower = raw.lower()
    if not lower.startswith(_SAFE_URL_SCHEMES):
        return ""
    try:
        parsed = urlparse(raw)
    except Exception:
        return ""
    if parsed.scheme not in ("http", "https"):
        return ""
    if not parsed.netloc:
        return ""
    return raw


def _attr_escape(value: str) -> str:
    return html.escape(value, quote=True)


class _AllowlistSanitizer(HTMLParser):
    """Strip scripts/events; keep a small allowlist of tags/attrs."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        name = (tag or "").lower()
        if name not in _ALLOWED_TAGS:
            return
        if name == "a":
            href = ""
            for k, v in attrs:
                if (k or "").lower() == "href":
                    href = safe_http_url(v or "")
                    break
            if href:
                self._parts.append(
                    f'<a href="{_attr_escape(href)}" target="_blank" rel="noopener noreferrer">'
                )
            else:
                self._parts.append("<a>")
            return
        if name == "img":
            src = ""
            for k, v in attrs:
                if (k or "").lower() == "src":
                    src = safe_http_url(v or "")
                    break
            if src:
                self._parts.append(f'<img src="{_attr_escape(src)}" alt="" />')
            return
        if name in _VOID_TAGS:
            self._parts.append(f"<{name}>")
            return
        self._parts.append(f"<{name}>")

    def handle_endtag(self, tag: str) -> None:
        name = (tag or "").lower()
        if name in _ALLOWED_TAGS and name not in _VOID_TAGS:
            self._parts.append(f"</{name}>")

    def handle_data(self, data: str) -> None:
        if data:
            self._parts.append(html.escape(data))

    def handle_entityref(self, name: str) -> None:
        self._parts.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        self._parts.append(f"&#{name};")

    def result(self) -> str:
        return "".join(self._parts)


def sanitize_html_fragment(fragment: str) -> str:
    """Allowlist-sanitize an HTML fragment for WebView display."""
    if not fragment:
        return ""
    parser = _AllowlistSanitizer()
    try:
        parser.feed(fragment)
        parser.close()
    except Exception:
        return html.escape(fragment)
    out = parser.result().strip()
    return out or ""


def clean_steam_markup(text: str) -> str:
    """Convert Steam BBCode-ish markup to safe HTML for display."""
    if not text:
        return ""
    out = html.unescape(text)
    out = out.replace("\r\n", "\n").replace("\r", "\n")

    # BBCode → HTML (URLs filtered); raw HTML feeds also go through sanitize.
    def _url_repl(m: re.Match[str]) -> str:
        href = safe_http_url(m.group(1))
        label = html.escape(m.group(2) or href or "")
        if not href:
            return label
        return f'<a href="{_attr_escape(href)}" target="_blank" rel="noopener noreferrer">{label}</a>'

    def _url_bare_repl(m: re.Match[str]) -> str:
        href = safe_http_url(m.group(1))
        label = html.escape(m.group(1) or "")
        if not href:
            return label
        return f'<a href="{_attr_escape(href)}" target="_blank" rel="noopener noreferrer">{label}</a>'

    def _img_repl(m: re.Match[str]) -> str:
        src = safe_http_url(m.group(1))
        if not src:
            return ""
        return f'<img src="{_attr_escape(src)}" alt="" />'

    out = re.sub(r"\[/?p\]", lambda m: "</p>" if "/" in m.group(0) else "<p>", out, flags=re.I)
    out = re.sub(r"\[/?b\]", lambda m: "</strong>" if "/" in m.group(0) else "<strong>", out, flags=re.I)
    out = re.sub(r"\[/?i\]", lambda m: "</em>" if "/" in m.group(0) else "<em>", out, flags=re.I)
    out = re.sub(r"\[/?u\]", lambda m: "</u>" if "/" in m.group(0) else "<u>", out, flags=re.I)
    out = re.sub(r"\[/?h1\]", lambda m: "</h1>" if "/" in m.group(0) else "<h1>", out, flags=re.I)
    out = re.sub(r"\[/?h2\]", lambda m: "</h2>" if "/" in m.group(0) else "<h2>", out, flags=re.I)
    out = re.sub(r"\[/?h3\]", lambda m: "</h3>" if "/" in m.group(0) else "<h3>", out, flags=re.I)
    out = re.sub(r"\[/?list\]", lambda m: "</ul>" if "/" in m.group(0) else "<ul>", out, flags=re.I)
    out = re.sub(r"\[\*\]", "<li>", out, flags=re.I)
    out = re.sub(r"\[url=([^\]]+)\]([^\[]*)\[/url\]", _url_repl, out, flags=re.I)
    out = re.sub(r"\[url\]([^\[]*)\[/url\]", _url_bare_repl, out, flags=re.I)
    out = re.sub(r"\[img\]([^\[]*)\[/img\]", _img_repl, out, flags=re.I)
    out = re.sub(r"\n{2,}", "</p><p>", out)
    if not out.startswith("<"):
        out = f"<p>{out}</p>"
    return sanitize_html_fragment(out)


def _is_patch_tags(tags: Any) -> bool:
    if not tags:
        return False
    if isinstance(tags, str):
        return "patchnotes" in tags.lower()
    if isinstance(tags, list):
        return any("patchnotes" in str(t).lower() for t in tags)
    return False


def search_games(query: str, *, language: str = "french", country: str = "FR") -> list[dict[str, Any]]:
    term = (query or "").strip()
    if len(term) < 2:
        return []
    url = (
        "https://store.steampowered.com/api/storesearch/"
        f"?term={quote(term)}&l={quote(language)}&cc={quote(country)}"
    )
    try:
        data = _request_json(url)
    except (HTTPError, URLError, json.JSONDecodeError, TimeoutError, OSError):
        return []

    results: list[dict[str, Any]] = []
    for item in data.get("items") or []:
        if str(item.get("type") or "").lower() != "app":
            continue
        appid = int(item.get("id") or 0)
        if appid <= 0:
            continue
        results.append(
            {
                "appid": appid,
                "name": str(item.get("name") or f"App {appid}"),
                "icon_url": str(item.get("tiny_image") or ""),
                "store_url": _steam_store_url(appid),
            }
        )
    return results[:20]


def fetch_news_entries(appid: int, *, count: int = 50, patch_only: bool = False) -> list[dict[str, Any]]:
    tags = "&tags=patchnotes" if patch_only else ""
    url = (
        "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/"
        f"?appid={appid}&count={count}&maxlength=0{tags}"
    )
    try:
        data = _request_json(url)
    except (HTTPError, URLError, json.JSONDecodeError, TimeoutError, OSError):
        return []

    items = (data.get("appnews") or {}).get("newsitems") or []
    entries: list[dict[str, Any]] = []
    for item in items:
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        tags_value = item.get("tags")
        feedname = str(item.get("feedname") or "").lower()
        is_patch = (
            _is_patch_tags(tags_value)
            or patch_only
            or "patch" in title.lower()
            or "hotfix" in title.lower()
            or "release note" in title.lower()
            or "update" in title.lower()
            or feedname in {"steam_community_announcements", "steam_updates"}
        )
        raw = str(item.get("contents") or "")
        gid = str(item.get("gid") or "")
        entries.append(
            {
                "entry_id": f"news:{appid}:{gid}",
                "appid": appid,
                "title": title,
                "published_at": int(item.get("date") or 0),
                "url": safe_http_url(str(item.get("url") or "")) or _steam_store_url(appid),
                "source": "steam_news_patch" if is_patch else "steam_news",
                "source_label": "Steam News",
                "is_patch": bool(is_patch),
                "content_raw": raw,
                "content_html": clean_steam_markup(raw),
                "external_id": gid,
            }
        )
    return entries


# 12 = small update, 13 = major update, 28 = news, 10 = broadcast? keep updates+news
PATCH_EVENT_TYPES = {10, 12, 13, 14, 22, 23, 28}


def fetch_event_entries(appid: int, *, count: int = 100) -> list[dict[str, Any]]:
    # Prefer update types, then fall back to a broader set if empty.
    filters = ("12,13", "12,13,28,14,22,23")
    events: list[dict[str, Any]] = []
    for filt in filters:
        url = (
            "https://store.steampowered.com/events/ajaxgetadjacentpartnerevents/"
            f"?appid={appid}&count_before=0&count_after={count}&event_type_filter={filt}"
        )
        try:
            data = _request_json(url)
        except (HTTPError, URLError, json.JSONDecodeError, TimeoutError, OSError):
            continue
        events = data.get("events") or []
        if events:
            break

    entries: list[dict[str, Any]] = []
    for event in events:
        event_type = int(event.get("event_type") or 0)
        if event_type and event_type not in PATCH_EVENT_TYPES:
            # Keep unknown types that look like updates via name.
            name_l = str(event.get("event_name") or "").lower()
            if not any(k in name_l for k in ("update", "patch", "hotfix", "release note", "notes")):
                continue
        body = event.get("announcement_body") or {}
        title = str(event.get("event_name") or body.get("headline") or "").strip()
        if not title:
            continue
        raw = str(body.get("body") or "")
        gid = str(event.get("gid") or body.get("gid") or "")
        published = int(body.get("posttime") or event.get("rtime32_start_time") or 0)
        is_patch = event_type in {12, 13} or any(
            k in title.lower() for k in ("update", "patch", "hotfix", "release note")
        )
        entries.append(
            {
                "entry_id": f"event:{appid}:{gid}",
                "appid": appid,
                "title": title,
                "published_at": published,
                "url": _event_url(appid, gid) if gid else _steam_store_url(appid),
                "source": "steam_event",
                "source_label": "Steam Event",
                "is_patch": bool(is_patch),
                "content_raw": raw,
                "content_html": clean_steam_markup(raw),
                "external_id": gid,
                "event_type": event_type,
            }
        )
    return entries


def fetch_game_changelogs(appid: int) -> list[dict[str, Any]]:
    """Fetch patch notes + news + events for one game (always merge all sources)."""
    # Fetch patch-tagged news AND general news — exclusive patch_only misses many updates.
    patch_news = fetch_news_entries(appid, patch_only=True, count=40)
    general_news = fetch_news_entries(appid, patch_only=False, count=40)
    events = fetch_event_entries(appid, count=80)
    return patch_news + general_news + events


def fetch_games_changelogs(appids: list[int], *, max_workers: int = 4) -> dict[int, list[dict[str, Any]]]:
    results: dict[int, list[dict[str, Any]]] = {}
    if not appids:
        return results
    workers = max(1, min(max_workers, len(appids)))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(fetch_game_changelogs, appid): appid for appid in appids}
        for future in as_completed(futures):
            appid = futures[future]
            try:
                results[appid] = future.result()
            except Exception:
                results[appid] = []
    return results

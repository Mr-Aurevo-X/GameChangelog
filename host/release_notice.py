"""Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.

SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

Read-only GitHub Latest check. Opens a browser link. Never downloads a zip.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

BINARY_RELEASE_REPO = "Mr-Aurevo-X/PCCommand-Releases"
_LEGACY_BINARY_RELEASE_REPO = "Mr-Aurevo-X/MrAurevoX-Launcher"
_ALLOWED_API_HOSTS = frozenset({"api.github.com"})
_ALLOWED_RELEASE_HOSTS = frozenset({"github.com", "www.github.com"})
_ALLOWED_RELEASE_ORGS = frozenset({"mr-aurevo-x"})


def normalize_version(raw: str | None) -> str:
    s = (raw or "").strip()
    if not s:
        return ""
    if s.lower().startswith("v") and len(s) > 1 and s[1].isdigit():
        return s
    if s and s[0].isdigit():
        return f"v{s}"
    return s


def _version_tuple(raw: str | None) -> tuple[int, ...]:
    s = normalize_version(raw)
    if s.lower().startswith("v"):
        s = s[1:]
    parts: list[int] = []
    for piece in s.replace("-", ".").split("."):
        if not piece:
            continue
        digits = ""
        for ch in piece:
            if ch.isdigit():
                digits += ch
            else:
                break
        if not digits:
            break
        parts.append(int(digits))
    return tuple(parts) if parts else (0,)


def is_remote_newer(remote: str | None, local: str | None) -> bool:
    return _version_tuple(remote) > _version_tuple(local)


def read_local_version(app_dir: Path) -> str | None:
    roots = [Path(app_dir)]
    if getattr(sys, "frozen", False):
        meipass = Path(getattr(sys, "_MEIPASS", ""))
        if meipass.is_dir() and meipass not in roots:
            roots.append(meipass)
    for root in roots:
        path = root / "version.json"
        if not path.is_file():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        tag = str(
            data.get("suiteVersion") or data.get("tag") or data.get("version") or ""
        ).strip()
        if tag:
            return normalize_version(tag) or tag
    return None


def _assert_api_url(url: str) -> None:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https":
        raise ValueError(f"non-HTTPS URL rejected: {url!r}")
    host = (parsed.hostname or "").lower()
    if host not in _ALLOWED_API_HOSTS:
        raise ValueError(f"host not allowlisted: {host!r}")


def _api_latest_release(repo: str) -> dict[str, Any]:
    url = f"https://api.github.com/repos/{repo}/releases/latest"
    _assert_api_url(url)
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "MrAurevoX-ReleaseNotice",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(req, timeout=8) as resp:  # nosec B310
        return json.loads(resp.read().decode("utf-8"))


def check_latest(
    app_dir: Path,
    *,
    source_repo: str,
    zip_name: str | None = None,
    binary_repo: str = BINARY_RELEASE_REPO,
) -> dict[str, Any]:
    """Compare local version.json to GitHub Latest. Never downloads."""
    local = read_local_version(app_dir)
    allowed = {source_repo, binary_repo, _LEGACY_BINARY_RELEASE_REPO}
    chosen: dict[str, Any] | None = None
    last_err = None
    for repo in (binary_repo, _LEGACY_BINARY_RELEASE_REPO, source_repo):
        if repo not in allowed:
            continue
        try:
            raw = _api_latest_release(repo)
            tag = str(raw.get("tag_name") or "").strip()
            html = str(raw.get("html_url") or "").strip() or (
                f"https://github.com/{repo}/releases/latest"
            )
            names = [str(a.get("name") or "") for a in (raw.get("assets") or [])]
            has_zip = bool(zip_name and zip_name in names)
            payload = {
                "repo": repo,
                "tag": tag,
                "remote": normalize_version(tag) or tag,
                "releaseUrl": html,
                "hasZip": has_zip,
                "asset": zip_name,
            }
            if not payload["remote"]:
                continue
            if repo in (binary_repo, _LEGACY_BINARY_RELEASE_REPO):
                if has_zip or chosen is None:
                    chosen = payload
                    if has_zip:
                        break
            elif chosen is None:
                chosen = payload
        except urllib.error.HTTPError as exc:
            last_err = f"HTTP {exc.code}"
            if exc.code in (401, 403, 404):
                continue
            break
        except Exception as exc:  # noqa: BLE001
            last_err = str(exc)
            continue

    if not chosen:
        return {
            "ok": False,
            "updateAvailable": False,
            "error": last_err or "no release",
            "local": local,
        }

    remote = str(chosen.get("remote") or "")
    available = bool(remote) and is_remote_newer(remote, local)
    return {
        "ok": True,
        "error": None,
        "updateAvailable": available,
        "local": local,
        "remote": remote,
        "repo": chosen.get("repo"),
        "asset": chosen.get("asset"),
        "hasZip": chosen.get("hasZip"),
        "releaseUrl": chosen.get("releaseUrl"),
        "message": (
            f"Nouvelle version {remote} (installée : {local or '?'})"
            if available
            else None
        ),
    }


def open_release_url(url: str) -> dict[str, Any]:
    raw = (url or "").strip()
    parsed = urllib.parse.urlparse(raw)
    host = (parsed.hostname or "").lower()
    parts = [p for p in (parsed.path or "").split("/") if p]
    org = (parts[0].lower() if parts else "")
    if (
        parsed.scheme != "https"
        or host not in _ALLOWED_RELEASE_HOSTS
        or org not in _ALLOWED_RELEASE_ORGS
        or "/releases" not in (parsed.path or "").lower()
    ):
        return {"ok": False, "error": "release URL rejected"}
    try:
        os.startfile(raw)  # type: ignore[attr-defined]
        return {"ok": True, "url": raw}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc), "url": raw}

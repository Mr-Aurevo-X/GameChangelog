# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

"""GameChangelog About helpers — support URLs, update opt-out, labeled local paths."""
from __future__ import annotations

import json
import os
import sys
import urllib.parse
from pathlib import Path
from typing import Any

SUPPORT_URLS: dict[str, str] = {
    "discord": "https://discord.com/users/406891052516114442",
    "paypal": "https://www.paypal.com/paypalme/aurevo1",
    "revolut": "https://revolut.me/mr_aurevo_x",
}
_ALLOWED_SUPPORT_HOSTS = frozenset(
    {
        "discord.com",
        "www.paypal.com",
        "paypal.com",
        "revolut.me",
    }
)

GAMECHANGELOG_REPO = "https://github.com/Mr-Aurevo-X/GameChangelog"
DATA_DIR_NAME = "ChangeLog-Central"
SETTINGS_DIR_NAME = "Mr-Aurevo-X"
_CLONE_MARKERS = (
    "dev central tree",
    "01_hubs",
    "02_shared_infrastructure",
    "03_standalones",
    "l'atelier windows",
    "sources / sot",
)


def localappdata_root() -> Path:
    return Path(os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local"))


def user_settings_path() -> Path:
    return localappdata_root() / SETTINGS_DIR_NAME / "user-settings.json"


def data_dir_path() -> Path:
    return localappdata_root() / DATA_DIR_NAME


def programs_install_dir() -> Path:
    return localappdata_root() / "Programs" / "GameChangelog"


def _looks_like_clone(path: Path) -> bool:
    text = str(path).replace("/", "\\").lower()
    return any(marker in text for marker in _CLONE_MARKERS)


def read_user_settings() -> dict[str, Any]:
    path = user_settings_path()
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def write_user_settings_merge(patch: dict[str, Any]) -> dict[str, Any]:
    current = read_user_settings()
    current.update(patch or {})
    path = user_settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(current, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return current


def is_github_update_check_enabled() -> bool:
    val = read_user_settings().get("checkGithubUpdates")
    if val is None:
        return True
    return bool(val)


def set_github_update_check(enabled: bool) -> dict[str, Any]:
    write_user_settings_merge({"checkGithubUpdates": bool(enabled)})
    return {
        "ok": True,
        "checkGithubUpdates": bool(enabled),
        "path": str(user_settings_path()),
    }


def set_suite_language(language: str) -> dict[str, Any]:
    lang = str(language or "").strip().lower()
    if lang not in ("fr", "en"):
        return {"ok": False, "error": "language must be fr or en"}
    write_user_settings_merge({"language": lang})
    return {
        "ok": True,
        "language": lang,
        "path": str(user_settings_path()),
    }


def get_update_check_pref() -> dict[str, Any]:
    return {
        "ok": True,
        "checkGithubUpdates": is_github_update_check_enabled(),
        "path": str(user_settings_path()),
        "repoUrl": GAMECHANGELOG_REPO,
    }


def open_support_url(kind: str) -> dict[str, Any]:
    key = (kind or "").strip().lower()
    url = SUPPORT_URLS.get(key)
    if not url:
        return {"ok": False, "error": f"unknown support kind: {kind!r}"}
    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or host not in _ALLOWED_SUPPORT_HOSTS:
        return {"ok": False, "error": "support URL rejected"}
    try:
        os.startfile(url)  # type: ignore[attr-defined]
        return {"ok": True, "kind": key, "url": url}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc), "url": url}


def _resolve_install_dir() -> Path | None:
    """Frozen exe parent, or Programs install — never a monorepo / clone path."""
    if getattr(sys, "frozen", False):
        try:
            parent = Path(sys.executable).resolve().parent
        except OSError:
            parent = None
        if parent is not None and not _looks_like_clone(parent):
            return parent

    programs = programs_install_dir()
    try:
        exe = programs / "GameChangelog.exe"
        if exe.is_file() and not _looks_like_clone(programs):
            return programs.resolve()
    except OSError:
        return None
    return None


def about_local_paths(app_dir: Path | None = None) -> dict[str, Any]:
    """Labeled absolute paths for About — never expose monorepo / clone."""
    _ = app_dir
    entries: list[dict[str, Any]] = []

    install_dir = _resolve_install_dir()
    if install_dir is not None:
        entries.append(
            {
                "id": "app",
                "label": "Install GameChangelog (dossier de l’exe)",
                "path": str(install_dir),
                "hint": "Dossier de GameChangelog.exe — à supprimer pour désinstaller.",
            }
        )

    entries.append(
        {
            "id": "data",
            "label": "Données GameChangelog",
            "path": str(data_dir_path()),
            "hint": r"%LOCALAPPDATA%\ChangeLog-Central — watchlist, cache changelogs, bugs.",
        }
    )
    entries.append(
        {
            "id": "settings",
            "label": "Préférences (accent, langue, vérif. maj)",
            "path": str(user_settings_path()),
            "hint": "Fichier partagé Mr-Aurevo-X — à garder si d’autres apps l’utilisent.",
        }
    )
    return {"ok": True, "paths": entries, "repoUrl": GAMECHANGELOG_REPO}

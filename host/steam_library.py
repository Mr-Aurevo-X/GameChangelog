# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

"""Detect Steam games: installed libraries + owned (local cache), no API key."""

from __future__ import annotations

import json
import os
import re
import threading
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

_ROOT_TIMEOUT = 1.5
_DETECT_TIMEOUT = float(os.environ.get("GC_STEAM_DETECT_TIMEOUT", "12"))
_NAME_TIMEOUT = 8.0
_NAME_WORKERS = 4
_APPLIST_URL = "https://api.steampowered.com/ISteamApps/GetAppList/v2/"
_APPLIST_TTL_SEC = 7 * 24 * 3600

_SKIP_APPIDS = {
    228980,
    250820,
    1070560,
    1391110,
    1493710,
    1628350,
}

_SKIP_NAME_PARTS = (
    "dedicated server",
    "soundtrack",
    "ost -",
    " - soundtrack",
    "toolkit",
    " sdk",
    "sdk ",
    "playtest",
    "beta access",
    "steamworks",
    "proton ",
    "redistributable",
)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 GameChangelog/1.0"
)


def _run_with_timeout(fn, timeout: float, default):
    box: list[Any] = [default]

    def _target() -> None:
        try:
            box[0] = fn()
        except Exception:
            box[0] = default

    thread = threading.Thread(target=_target, daemon=True)
    thread.start()
    thread.join(timeout)
    return box[0]


def _parse_vdf(text: str) -> Any:
    tokens = re.findall(r'"([^"]*)"|(\{)|(\})', text)
    flat: list[str] = []
    for quoted, open_b, close_b in tokens:
        if quoted:
            flat.append(quoted)
        elif open_b:
            flat.append("{")
        elif close_b:
            flat.append("}")

    def parse_at(index: int = 0) -> tuple[Any, int]:
        result: dict[str, Any] = {}
        while index < len(flat):
            token = flat[index]
            if token == "}":
                return result, index + 1
            key = token
            index += 1
            if index >= len(flat):
                break
            value = flat[index]
            if value == "{":
                nested, index = parse_at(index + 1)
                result[key] = nested
            else:
                result[key] = value
                index += 1
        return result, index

    parsed, _ = parse_at(0)
    return parsed


def _find_steam_path() -> Path | None:
    try:
        import winreg

        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam") as key:
            steam_path, _ = winreg.QueryValueEx(key, "SteamPath")
            path = Path(str(steam_path).replace("/", os.sep))
            if _run_with_timeout(lambda: path.is_dir(), 1.0, False):
                return path
    except OSError:
        pass

    for candidate in (
        Path(r"C:\Program Files (x86)\Steam"),
        Path(r"C:\Program Files\Steam"),
        Path(os.environ.get("ProgramFiles(x86)", "") or r"C:\Program Files (x86)") / "Steam",
        Path(os.environ.get("ProgramFiles", "") or r"C:\Program Files") / "Steam",
    ):
        if _run_with_timeout(lambda p=candidate: p.is_dir() and (p / "steam.exe").is_file(), 1.0, False):
            return candidate
    return None


def _list_library_paths_from_vdf(steam_path: Path) -> list[Path]:
    roots = [steam_path]
    vdf_paths = [
        steam_path / "steamapps" / "libraryfolders.vdf",
        steam_path / "config" / "libraryfolders.vdf",
    ]
    for vdf_path in vdf_paths:
        try:
            if not vdf_path.is_file():
                continue
            data = _parse_vdf(vdf_path.read_text(encoding="utf-8", errors="replace"))
        except OSError:
            continue
        folders = data.get("libraryfolders") or data
        if not isinstance(folders, dict):
            continue
        for entry in folders.values():
            if isinstance(entry, dict):
                path_value = entry.get("path") or ""
                if path_value:
                    roots.append(Path(str(path_value).replace("/", os.sep)))
    seen: set[str] = set()
    unique: list[Path] = []
    for root in roots:
        key = str(root).lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(root)
    return unique


def _parse_acf(acf_path: Path) -> dict[str, Any] | None:
    try:
        data = _parse_vdf(acf_path.read_text(encoding="utf-8", errors="replace"))
    except OSError:
        return None
    state = data.get("AppState")
    if not isinstance(state, dict):
        return None
    appid_raw = state.get("appid")
    name = str(state.get("name") or "").strip()
    if not appid_raw or not name:
        return None
    try:
        appid = int(appid_raw)
    except (TypeError, ValueError):
        return None
    flags_raw = state.get("StateFlags") or "0"
    try:
        flags = int(flags_raw)
    except (TypeError, ValueError):
        flags = 0
    if flags & 4 == 0:
        return None
    return {"appid": appid, "name": name}


def _is_trackable_game(appid: int, name: str = "") -> bool:
    if appid in _SKIP_APPIDS:
        return False
    if appid < 100:
        return False
    lower = (name or "").lower()
    if lower and any(part in lower for part in _SKIP_NAME_PARTS):
        return False
    return True


def _icon_url(appid: int) -> str:
    return f"https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/capsule_sm_120.jpg"


def _store_url(appid: int) -> str:
    return f"https://store.steampowered.com/app/{appid}/"


def _scan_root(root: Path) -> list[dict[str, Any]]:
    steamapps = root / "steamapps"
    if not steamapps.is_dir():
        return []
    found: list[dict[str, Any]] = []
    try:
        names = os.listdir(steamapps)
    except OSError:
        return []
    for name in names:
        if not (name.startswith("appmanifest_") and name.endswith(".acf")):
            continue
        parsed = _parse_acf(steamapps / name)
        if not parsed:
            continue
        appid = int(parsed["appid"])
        game_name = str(parsed["name"])
        if not _is_trackable_game(appid, game_name):
            continue
        found.append(
            {
                "appid": appid,
                "name": game_name,
                "icon_url": _icon_url(appid),
                "store_url": _store_url(appid),
                "installed": True,
            }
        )
    return found


def _account_id_from_steamid64(steamid64: str) -> int | None:
    try:
        return int(steamid64) - 76561197960265728
    except ValueError:
        return None


def _list_steam_users(steam_path: Path) -> list[dict[str, Any]]:
    """All Steam accounts from loginusers.vdf (most recent first)."""
    login = steam_path / "config" / "loginusers.vdf"
    if not login.is_file():
        return []
    try:
        data = _parse_vdf(login.read_text(encoding="utf-8", errors="replace"))
    except OSError:
        return []
    users = data.get("users") or {}
    if not isinstance(users, dict):
        return []
    rows: list[dict[str, Any]] = []
    for sid, info in users.items():
        if not isinstance(info, dict):
            continue
        account_id = _account_id_from_steamid64(str(sid))
        if account_id is None:
            continue
        rows.append(
            {
                "steamid64": str(sid),
                "account_id": account_id,
                "most_recent": str(info.get("MostRecent") or "") == "1",
                "persona": str(info.get("PersonaName") or "").strip(),
            }
        )
    rows.sort(key=lambda row: (not row["most_recent"], row["steamid64"]))
    return rows


def _most_recent_steamid64(steam_path: Path) -> str | None:
    users = _list_steam_users(steam_path)
    return users[0]["steamid64"] if users else None


def _owned_appids_from_account_cache(steam_path: Path, account_id: int) -> list[int]:
    cache_dir = steam_path / "userdata" / str(account_id) / "config" / "librarycache"
    if not cache_dir.is_dir():
        return []
    appids: list[int] = []
    try:
        for name in os.listdir(cache_dir):
            if not name.endswith(".json"):
                continue
            stem = name[:-5]
            if not stem.isdigit():
                continue
            appid = int(stem)
            if _is_trackable_game(appid):
                appids.append(appid)
    except OSError:
        return []
    return sorted(set(appids))


def _owned_appids_from_librarycache(steam_path: Path) -> tuple[list[int], dict[str, Any]]:
    """Merge librarycache across all local Steam accounts."""
    users = _list_steam_users(steam_path)
    meta: dict[str, Any] = {
        "accounts": [],
        "librarycache_empty": True,
        "hint": None,
    }
    if not users:
        meta["hint"] = "Aucun compte Steam local — connectez-vous dans Steam une fois."
        return [], meta

    merged: set[int] = set()
    for user in users:
        ids = _owned_appids_from_account_cache(steam_path, int(user["account_id"]))
        meta["accounts"].append(
            {
                **user,
                "owned_count": len(ids),
            }
        )
        merged.update(ids)

    if merged:
        meta["librarycache_empty"] = False
    else:
        meta["hint"] = (
            "Cache bibliothèque Steam vide — ouvrez Steam une fois, "
            "puis « Sync bibliothèque »."
        )
    return sorted(merged), meta


def _applist_cache_path(name_cache_path: Path | None) -> Path | None:
    if name_cache_path is None:
        return None
    return name_cache_path.parent / "steam_applist.json"


def _load_app_list_map(cache_path: Path | None) -> dict[int, str]:
    """One Steam GetAppList dump (cached) — avoids 399 rate-limited appdetails calls."""
    path = _applist_cache_path(cache_path)
    now = datetime.now(timezone.utc).timestamp()
    if path is not None and path.is_file():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            fetched = float((raw or {}).get("fetched_at") or 0)
            apps = (raw or {}).get("apps") or {}
            if isinstance(apps, dict) and apps and (now - fetched) < _APPLIST_TTL_SEC:
                return {int(k): str(v) for k, v in apps.items() if str(v).strip()}
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            pass

    req = Request(
        _APPLIST_URL,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    try:
        with urlopen(req, timeout=25) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace"))
        rows = ((payload.get("applist") or {}).get("apps") or [])
        mapping: dict[int, str] = {}
        for row in rows:
            if not isinstance(row, dict):
                continue
            try:
                appid = int(row.get("appid") or 0)
            except (TypeError, ValueError):
                continue
            name = str(row.get("name") or "").strip()
            if appid > 0 and name:
                mapping[appid] = name
        if path is not None and mapping:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(
                json.dumps({"fetched_at": now, "apps": {str(k): v for k, v in mapping.items()}}, ensure_ascii=False),
                encoding="utf-8",
            )
        return mapping
    except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError, TypeError):
        return {}


def _load_name_cache(cache_path: Path) -> dict[str, str]:
    if not cache_path.is_file():
        return {}
    try:
        data = json.loads(cache_path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return {str(k): str(v) for k, v in data.items()}
    except (OSError, json.JSONDecodeError, TypeError):
        pass
    return {}


def _save_name_cache(cache_path: Path, cache: dict[str, str]) -> None:
    try:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=0), encoding="utf-8")
    except OSError:
        pass


def _steam_store_lang(locale: str | None) -> str:
    if locale and locale.lower().startswith("en"):
        return "english"
    if locale and locale.lower().startswith("fr"):
        return "french"
    return "english"


def _fetch_app_name(appid: int, locale: str | None = None) -> str | None:
    lang = _steam_store_lang(locale)
    url = f"https://store.steampowered.com/api/appdetails?appids={appid}&l={lang}"
    req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    try:
        with urlopen(req, timeout=6) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
        data = json.loads(raw)
        block = data.get(str(appid)) or {}
        if not block.get("success"):
            return None
        name = str((block.get("data") or {}).get("name") or "").strip()
        return name or None
    except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError, TypeError):
        return None


def resolve_game_names(
    appids: list[int],
    cache_path: Path | None = None,
    locale: str | None = None,
) -> dict[int, str]:
    """Resolve Steam app names: local cache, GetAppList dump, then appdetails leftovers."""
    cache = _load_name_cache(cache_path) if cache_path else {}
    catalog = _load_app_list_map(cache_path)
    result: dict[int, str] = {}
    missing: list[int] = []
    for appid in appids:
        key = str(appid)
        if key in cache and cache[key] and not str(cache[key]).startswith("Jeu "):
            result[appid] = cache[key]
            continue
        catalog_name = catalog.get(int(appid))
        if catalog_name:
            result[appid] = catalog_name
            cache[key] = catalog_name
            continue
        missing.append(appid)

    if missing:
        with ThreadPoolExecutor(max_workers=min(_NAME_WORKERS, len(missing))) as pool:
            futures = {pool.submit(_fetch_app_name, appid, locale): appid for appid in missing}
            for future in as_completed(futures):
                appid = futures[future]
                try:
                    name = future.result()
                except Exception:
                    name = None
                if name:
                    result[appid] = name
                    cache[str(appid)] = name

    if cache_path and (missing or result):
        _save_name_cache(cache_path, cache)
    return result


def _detect_owned_games_inner(
    name_cache_path: Path | None = None,
    locale: str | None = None,
) -> dict[str, Any]:
    steam_path = _find_steam_path()
    if steam_path is None:
        return {"ok": False, "error": "Installation Steam introuvable", "games": [], "steam_path": None}

    games_by_id: dict[int, dict[str, Any]] = {}
    skipped_roots: list[str] = []

    # 1) Installed games (all library folders)
    for root in _list_library_paths_from_vdf(steam_path):
        scanned = _run_with_timeout(lambda r=root: _scan_root(r), _ROOT_TIMEOUT, None)
        if scanned is None:
            skipped_roots.append(str(root))
            continue
        for game in scanned:
            games_by_id[int(game["appid"])] = game

    installed_ids = set(games_by_id.keys())

    # 2) Owned games from Steam local librarycache (includes non-installed)
    # Do NOT resolve names here (network) — keep detection fast.
    owned_ids, cache_meta = _run_with_timeout(
        lambda: _owned_appids_from_librarycache(steam_path),
        3.0,
        ([], {"librarycache_empty": True, "accounts": [], "hint": None}),
    ) or ([], {"librarycache_empty": True, "accounts": [], "hint": None})
    if not isinstance(owned_ids, list):
        owned_ids = []
    name_cache = _load_name_cache(name_cache_path) if name_cache_path else {}
    for appid in owned_ids:
        if appid in games_by_id:
            continue
        if not _is_trackable_game(appid):
            continue
        cached = str(name_cache.get(str(appid)) or "").strip()
        games_by_id[appid] = {
            "appid": appid,
            "name": cached if cached and not cached.startswith("Jeu ") else f"Jeu {appid}",
            "icon_url": _icon_url(appid),
            "store_url": _store_url(appid),
            "installed": False,
        }

    games = sorted(games_by_id.values(), key=lambda g: g["name"].lower())
    hint = cache_meta.get("hint")
    if hint and not installed_ids and not owned_ids:
        return {
            "ok": True,
            "steam_path": str(steam_path),
            "games": games,
            "count": len(games),
            "installed_count": len(installed_ids),
            "owned_count": len(owned_ids),
            "skipped_roots": skipped_roots,
            "needs_name_resolve": [g["appid"] for g in games if str(g.get("name") or "").startswith("Jeu ")],
            "steam_accounts": cache_meta.get("accounts") or [],
            "librarycache_empty": bool(cache_meta.get("librarycache_empty")),
            "hint": hint,
        }
    return {
        "ok": True,
        "steam_path": str(steam_path),
        "games": games,
        "count": len(games),
        "installed_count": len(installed_ids),
        "owned_count": len(owned_ids),
        "skipped_roots": skipped_roots,
        "needs_name_resolve": [g["appid"] for g in games if str(g.get("name") or "").startswith("Jeu ")],
        "steam_accounts": cache_meta.get("accounts") or [],
        "librarycache_empty": bool(cache_meta.get("librarycache_empty")),
        "hint": hint,
    }


def detect_owned_games(
    name_cache_path: Path | None = None,
    locale: str | None = None,
    timeout: float | None = None,
) -> dict[str, Any]:
    """Return installed + owned Steam games (hard timeout, one retry)."""
    limit = float(timeout if timeout is not None else _DETECT_TIMEOUT)
    result: dict[str, Any] | None = None
    for _ in range(2):
        result = _run_with_timeout(
            lambda: _detect_owned_games_inner(name_cache_path, locale),
            limit,
            None,
        )
        if result is not None:
            break
    if result is None:
        return {
            "ok": False,
            "error": "Détection Steam trop lente. Réessayez via Sync bibliothèque.",
            "games": [],
            "steam_path": None,
        }
    return result

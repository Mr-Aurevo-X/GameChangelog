"""Game Changelog — desktop host (pywebview)."""

from __future__ import annotations

import json
import os
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import webview

from dedup import merge_entries
from steam import fetch_game_changelogs, search_games
from steam_library import detect_owned_games, resolve_game_names
from status import check_steam_services, game_status_links, steam_bug_forum_url
from steamdb import patchnotes_url
from store import GameStore
from window_chrome import WindowChromeMixin, create_tool_window

APP_TITLE = "Game Changelog"
DEFAULT_ACCENT = "#e03545"
INSTALL_DIR_NAME = "ChangeLog-Central"
HUB_SETTINGS_DIR = "PCCommand"
ENV_ACCENT = "MRAUREVOX_ACCENT"
ENV_LANG = "MRAUREVOX_LANG"
REFRESH_WORKERS = 4


def app_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


def ui_dir() -> Path:
    external = app_dir() / "ui"
    if (external / "index.html").is_file():
        return external
    if getattr(sys, "frozen", False):
        base = Path(getattr(sys, "_MEIPASS", app_dir()))
        nested = base / "ui"
        return nested if nested.is_dir() else base
    return app_dir() / "ui"


def data_dir() -> Path:
    path = localappdata_root() / INSTALL_DIR_NAME
    path.mkdir(parents=True, exist_ok=True)
    return path


def localappdata_root() -> Path:
    local = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    return Path(local)


def _settings_paths() -> list[Path]:
    root = localappdata_root()
    return [
        root / HUB_SETTINGS_DIR / "user-settings.json",
        root / "MrAurevoX" / "user-settings.json",
        root / "Mr-Aurevo-X" / "user-settings.json",
    ]


def resolve_suite_accent(default: str = DEFAULT_ACCENT) -> str:
    env = (os.environ.get(ENV_ACCENT) or "").strip()
    if env.startswith("#") and len(env) in (4, 7):
        return env
    for path in _settings_paths():
        if not path.is_file():
            continue
        try:
            loaded = json.loads(path.read_text(encoding="utf-8-sig"))
            accent = str((loaded or {}).get("accent") or "").strip()
            if accent.startswith("#") and len(accent) in (4, 7):
                return accent
        except (OSError, json.JSONDecodeError, TypeError):
            continue
    return default


def resolve_suite_language(default: str = "fr") -> str:
    env = (os.environ.get(ENV_LANG) or "").strip().lower()
    if env in ("fr", "en"):
        return env
    for path in _settings_paths():
        if not path.is_file():
            continue
        try:
            loaded = json.loads(path.read_text(encoding="utf-8-sig"))
            lang = str((loaded or {}).get("language") or "").strip().lower()
            if lang in ("fr", "en"):
                return lang
        except (OSError, json.JSONDecodeError, TypeError):
            continue
    return default if default in ("fr", "en") else "fr"


class Api(WindowChromeMixin):
    def __init__(self) -> None:
        self._window: Any = None
        self._maximized = False
        self._min_size = (960, 620)
        self._store = GameStore(data_dir() / "gamechangelog.db")
        self._refresh_lock = threading.Lock()
        self._refresh_thread: threading.Thread | None = None
        self._import_lock = threading.Lock()
        self._import_thread: threading.Thread | None = None
        self._import_state: dict[str, Any] = {
            "ok": True,
            "running": False,
            "done": True,
            "phase": "",
            "imported": 0,
            "error": None,
        }
        self._refresh_state: dict[str, Any] = {
            "ok": True,
            "running": False,
            "done": True,
            "current": 0,
            "total": 0,
            "game_name": "",
            "error": None,
            "finished_at": None,
        }

    def set_window(self, window: Any) -> None:
        WindowChromeMixin.set_window(self, window)

    def get_suite_settings(self) -> dict[str, Any]:
        return {
            "ok": True,
            "accent": resolve_suite_accent(),
            "language": resolve_suite_language(),
            "app_title": APP_TITLE,
        }

    def search_games(self, query: str) -> dict[str, Any]:
        try:
            lang = "french" if resolve_suite_language() == "fr" else "english"
            results = search_games(query, language=lang, country="FR")
            return {"ok": True, "results": results}
        except Exception as exc:
            return {"ok": False, "error": str(exc), "results": []}

    def get_watchlist(self) -> dict[str, Any]:
        try:
            return {"ok": True, "games": self._store.get_watchlist()}
        except Exception as exc:
            return {"ok": False, "error": str(exc), "games": []}

    def add_game(self, appid: int, name: str, icon_url: str = "", store_url: str = "") -> dict[str, Any]:
        try:
            self._store.add_game(int(appid), str(name), str(icon_url or ""), str(store_url or ""))
            return {"ok": True}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def remove_game(self, appid: int) -> dict[str, Any]:
        try:
            self._store.remove_game(int(appid))
            return {"ok": True}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def get_feed(self, filters: dict[str, Any] | None = None) -> dict[str, Any]:
        try:
            filters = filters or {}
            appid = filters.get("appid")
            patch_only = bool(filters.get("patch_only"))
            favorites_only = bool(filters.get("favorites_only"))
            limit = int(filters.get("limit") or 200)
            feed = self._store.get_feed(
                appid=int(appid) if appid not in (None, "", 0, "0") else None,
                patch_only=patch_only,
                favorites_only=favorites_only,
                limit=limit,
            )
            return {"ok": True, "entries": feed}
        except Exception as exc:
            return {"ok": False, "error": str(exc), "entries": []}

    def set_favorite(self, appid: int, favorite: bool = True) -> dict[str, Any]:
        try:
            return self._store.set_favorite(int(appid), bool(favorite))
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def get_bugs(self, appid: int | None = None) -> dict[str, Any]:
        try:
            aid = None if appid in (None, "", 0, "0") else int(appid)
            bugs = self._store.get_bugs(aid)
            return {"ok": True, "bugs": bugs}
        except Exception as exc:
            return {"ok": False, "error": str(exc), "bugs": []}

    def add_bug(self, appid: int, title: str, body: str = "") -> dict[str, Any]:
        try:
            return self._store.add_bug(int(appid), str(title or ""), str(body or ""))
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def update_bug_status(self, bug_id: int, status: str) -> dict[str, Any]:
        try:
            return self._store.update_bug_status(int(bug_id), str(status or ""))
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def delete_bug(self, bug_id: int) -> dict[str, Any]:
        try:
            return self._store.delete_bug(int(bug_id))
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def get_bug_links(self, appid: int) -> dict[str, Any]:
        try:
            appid = int(appid)
            return {
                "ok": True,
                "discussions_url": steam_bug_forum_url(appid),
                "steamdb_url": patchnotes_url(appid),
            }
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def get_status_dashboard(self) -> dict[str, Any]:
        try:
            steam = check_steam_services()
            games = self._store.get_watchlist()
            # Prefer favorites + installed for the status list.
            preferred = [g for g in games if int(g.get("favorite") or 0) == 1 or int(g.get("installed") or 0) == 1]
            if not preferred:
                preferred = games[:40]
            links = game_status_links(preferred[:60])
            return {"ok": True, "steam": steam, "games": links}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def get_steamdb_url(self, appid: int) -> dict[str, Any]:
        try:
            appid = int(appid)
            return {"ok": True, "url": patchnotes_url(appid)}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def get_changelog(self, entry_id: str) -> dict[str, Any]:
        try:
            entry = self._store.get_changelog(str(entry_id))
            if not entry:
                return {"ok": False, "error": "Entrée introuvable"}
            entry = dict(entry)
            entry["steamdb_url"] = patchnotes_url(int(entry.get("appid") or 0))
            return {"ok": True, "entry": entry}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def mark_read(self, entry_id: str) -> dict[str, Any]:
        try:
            self._store.mark_read(str(entry_id))
            return {"ok": True}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def mark_all_read(self, appid: int | None = None, filters: dict[str, Any] | None = None) -> dict[str, Any]:
        try:
            flt = filters if isinstance(filters, dict) else {}
            # Prefer explicit filters from UI; keep legacy appid arg as fallback.
            raw_appid = flt.get("appid", appid)
            aid = int(raw_appid) if raw_appid not in (None, "", 0, "0") else None
            patch_only = bool(flt.get("patch_only"))
            favorites_only = bool(flt.get("favorites_only"))
            return self._store.mark_all_read(
                aid,
                patch_only=patch_only,
                favorites_only=favorites_only,
            )
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def _set_refresh_state(self, **kwargs: Any) -> None:
        with self._refresh_lock:
            self._refresh_state.update(kwargs)

    def get_refresh_progress(self) -> dict[str, Any]:
        with self._refresh_lock:
            return dict(self._refresh_state)

    def _set_import_state(self, **kwargs: Any) -> None:
        with self._import_lock:
            self._import_state.update(kwargs)

    def get_import_progress(self) -> dict[str, Any]:
        with self._import_lock:
            return dict(self._import_state)

    def _run_refresh(self, appids: list[int], game_names: dict[int, str]) -> None:
        total = len(appids)
        self._set_refresh_state(
            running=True,
            done=False,
            current=0,
            total=total,
            game_name="",
            error=None,
            finished_at=None,
        )
        try:
            completed = 0
            with ThreadPoolExecutor(max_workers=REFRESH_WORKERS) as pool:
                futures = {pool.submit(fetch_game_changelogs, appid): appid for appid in appids}
                for future in as_completed(futures):
                    appid = futures[future]
                    completed += 1
                    name = game_names.get(appid, f"App {appid}")
                    self._set_refresh_state(current=completed, game_name=name)
                    try:
                        entries = future.result()
                    except Exception:
                        entries = []
                    merged = merge_entries(entries)
                    self._store.upsert_entries(appid, merged)
            self._set_refresh_state(
                running=False,
                done=True,
                current=total,
                game_name="",
                error=None,
                finished_at="now",
            )
        except Exception as exc:
            self._set_refresh_state(running=False, done=True, error=str(exc))

    def _run_import(self, *, force: bool) -> None:
        self._set_import_state(running=True, done=False, phase="detect", imported=0, error=None)
        try:
            already = self._store.get_setting("steam_library_imported") == "1"
            if already and not force and not self._store.is_watchlist_empty():
                self._set_import_state(
                    running=False,
                    done=True,
                    phase="done",
                    imported=0,
                    error=None,
                )
                return

            name_cache = data_dir() / "steam_names.json"
            detected = detect_owned_games(name_cache_path=name_cache)
            if not detected.get("ok"):
                self._set_import_state(
                    running=False,
                    done=True,
                    phase="error",
                    error=str(detected.get("error") or "Steam introuvable"),
                )
                return

            self._set_import_state(phase="import")
            games = detected.get("games") or []
            count = self._store.add_games_bulk(games)
            if count > 0:
                self._store.set_setting("steam_library_imported", "1")
            if detected.get("steam_path"):
                self._store.set_setting("steam_path", str(detected["steam_path"]))

            self._set_import_state(
                running=False,
                done=True,
                phase="done",
                imported=count,
                error=None,
            )

            # Resolve placeholder names after import completes (non-blocking for UI).
            need_names = [
                int(g["appid"])
                for g in games
                if str(g.get("name") or "").startswith("Jeu ")
            ]
            if need_names:
                threading.Thread(
                    target=self._resolve_names_job,
                    args=(need_names, name_cache),
                    daemon=True,
                ).start()
        except Exception as exc:
            self._set_import_state(running=False, done=True, phase="error", error=str(exc))

    def _resolve_names_job(self, appids: list[int], cache_path: Path) -> None:
        try:
            names = resolve_game_names(appids, cache_path)
            if names:
                self._store.update_game_names(names)
        except Exception:
            pass

    def refresh_all(self, installed_only: bool = False) -> dict[str, Any]:
        try:
            installed_only = bool(installed_only)
            games = self._store.get_watchlist()
            if installed_only:
                games = [g for g in games if int(g.get("installed") or 0) == 1]
                # Fallback if installed flags are missing (old DB)
                if not games:
                    games = self._store.get_watchlist()
            appids = [int(g["appid"]) for g in games]
            if not appids:
                self._set_refresh_state(
                    running=False,
                    done=True,
                    current=0,
                    total=0,
                    game_name="",
                    error=None,
                    finished_at="now",
                )
                return {"ok": True, "started": False, "message": "Aucun jeu suivi"}

            with self._refresh_lock:
                if self._refresh_thread and self._refresh_thread.is_alive():
                    return {"ok": True, "started": False, "message": "Actualisation déjà en cours"}

            game_names = {int(g["appid"]): str(g["name"]) for g in games}
            self._refresh_thread = threading.Thread(
                target=self._run_refresh,
                args=(appids, game_names),
                daemon=True,
            )
            self._refresh_thread.start()
            return {"ok": True, "started": True, "total": len(appids)}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def refresh_game(self, appid: int) -> dict[str, Any]:
        try:
            appid = int(appid)
            name_row = next((g for g in self._store.get_watchlist() if int(g["appid"]) == appid), None)
            game_name = str(name_row["name"]) if name_row else f"App {appid}"
            self._set_refresh_state(
                running=True,
                done=False,
                current=0,
                total=1,
                game_name=game_name,
                error=None,
                finished_at=None,
            )
            entries = fetch_game_changelogs(appid)
            merged = merge_entries(entries)
            count = self._store.upsert_entries(appid, merged)
            self._set_refresh_state(
                running=False,
                done=True,
                current=1,
                total=1,
                game_name=game_name,
                error=None,
                finished_at="now",
            )
            return {"ok": True, "count": count, "appid": appid}
        except Exception as exc:
            self._set_refresh_state(running=False, done=True, error=str(exc))
            return {"ok": False, "error": str(exc)}

    def get_last_refresh_info(self) -> dict[str, Any]:
        try:
            info = self._store.get_last_fetched()
            return {"ok": True, **info}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def get_stats(self) -> dict[str, Any]:
        try:
            meta = self._store.export_meta()
            return {"ok": True, **meta}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def detect_steam_library(self) -> dict[str, Any]:
        try:
            result = detect_owned_games()
            return result
        except Exception as exc:
            return {"ok": False, "error": str(exc), "games": []}

    def import_steam_library(self, force: bool = False) -> dict[str, Any]:
        """Start background import of the local Steam library."""
        try:
            force = bool(force)
            with self._import_lock:
                if self._import_thread and self._import_thread.is_alive():
                    return {"ok": True, "started": False, "message": "Import déjà en cours"}
                # Mark running BEFORE starting the thread to avoid a UI race.
                self._import_state.update(
                    {
                        "running": True,
                        "done": False,
                        "phase": "detect",
                        "imported": 0,
                        "error": None,
                    }
                )

            self._import_thread = threading.Thread(
                target=self._run_import,
                kwargs={"force": force},
                daemon=True,
            )
            self._import_thread.start()
            return {"ok": True, "started": True}
        except Exception as exc:
            self._set_import_state(running=False, done=True, phase="error", error=str(exc))
            return {"ok": False, "error": str(exc), "started": False}

    def should_import_steam_library(self) -> dict[str, Any]:
        try:
            empty = self._store.is_watchlist_empty()
            imported = self._store.get_setting("steam_library_imported") == "1"
            return {"ok": True, "should_import": empty and not imported}
        except Exception as exc:
            return {"ok": False, "error": str(exc), "should_import": False}


def main() -> None:
    index = ui_dir() / "index.html"
    if not index.is_file():
        raise SystemExit(f"UI introuvable: {index}")

    api = Api()
    create_tool_window(
        title=f"{APP_TITLE}",
        url=index.as_uri(),
        js_api=api,
        width=1280,
        height=820,
        min_size=(960, 620),
        background_color="#06070c",
    )
    webview.start()


if __name__ == "__main__":
    main()

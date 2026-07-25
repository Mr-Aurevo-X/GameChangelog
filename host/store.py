"""SQLite persistence for watchlist and changelog cache."""

from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dedup import merge_entries


class GameStore:
    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path
        self._lock = threading.RLock()
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _init_db(self) -> None:
        with self._lock:
            with self._connect() as conn:
                conn.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS games (
                        appid INTEGER PRIMARY KEY,
                        name TEXT NOT NULL,
                        icon_url TEXT NOT NULL DEFAULT '',
                        store_url TEXT NOT NULL DEFAULT '',
                        added_at TEXT NOT NULL,
                        installed INTEGER NOT NULL DEFAULT 0
                    );

                    CREATE TABLE IF NOT EXISTS changelogs (
                        entry_id TEXT PRIMARY KEY,
                        fingerprint TEXT NOT NULL,
                        appid INTEGER NOT NULL,
                        title TEXT NOT NULL,
                        published_at INTEGER NOT NULL DEFAULT 0,
                        url TEXT NOT NULL DEFAULT '',
                        source TEXT NOT NULL DEFAULT '',
                        source_label TEXT NOT NULL DEFAULT '',
                        is_patch INTEGER NOT NULL DEFAULT 0,
                        content_raw TEXT NOT NULL DEFAULT '',
                        content_html TEXT NOT NULL DEFAULT '',
                        is_read INTEGER NOT NULL DEFAULT 0,
                        fetched_at TEXT NOT NULL,
                        FOREIGN KEY(appid) REFERENCES games(appid) ON DELETE CASCADE
                    );

                    CREATE INDEX IF NOT EXISTS idx_changelogs_appid ON changelogs(appid);
                    CREATE INDEX IF NOT EXISTS idx_changelogs_published ON changelogs(published_at DESC);
                    CREATE INDEX IF NOT EXISTS idx_changelogs_fingerprint ON changelogs(fingerprint);

                    CREATE TABLE IF NOT EXISTS settings (
                        key TEXT PRIMARY KEY,
                        value TEXT NOT NULL
                    );
                    """
                )
                # Migrations for older DBs
                cols = {row[1] for row in conn.execute("PRAGMA table_info(games)").fetchall()}
                if "installed" not in cols:
                    conn.execute("ALTER TABLE games ADD COLUMN installed INTEGER NOT NULL DEFAULT 0")
                if "favorite" not in cols:
                    conn.execute("ALTER TABLE games ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0")

                conn.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS bug_reports (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        appid INTEGER NOT NULL,
                        title TEXT NOT NULL,
                        body TEXT NOT NULL DEFAULT '',
                        status TEXT NOT NULL DEFAULT 'open',
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        FOREIGN KEY(appid) REFERENCES games(appid) ON DELETE CASCADE
                    );
                    CREATE INDEX IF NOT EXISTS idx_bugs_appid ON bug_reports(appid);
                    """
                )

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")

    def get_watchlist(self) -> list[dict[str, Any]]:
        with self._lock:
            with self._connect() as conn:
                rows = conn.execute(
                    """
                    SELECT g.appid, g.name, g.icon_url, g.store_url, g.added_at, g.installed,
                           COALESCE(g.favorite, 0) AS favorite,
                           COUNT(c.entry_id) AS total_entries,
                           SUM(CASE WHEN c.is_read = 0 THEN 1 ELSE 0 END) AS unread_count,
                           (SELECT COUNT(*) FROM bug_reports b WHERE b.appid = g.appid AND b.status = 'open') AS open_bugs
                    FROM games g
                    LEFT JOIN changelogs c ON c.appid = g.appid
                    GROUP BY g.appid, g.name, g.icon_url, g.store_url, g.added_at, g.installed, g.favorite
                    ORDER BY COALESCE(g.favorite, 0) DESC, g.installed DESC, g.name COLLATE NOCASE
                    """
                ).fetchall()
        return [dict(row) for row in rows]

    def set_favorite(self, appid: int, favorite: bool) -> dict[str, Any]:
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    "UPDATE games SET favorite = ? WHERE appid = ?",
                    (1 if favorite else 0, int(appid)),
                )
        return {"ok": True}

    def get_bugs(self, appid: int | None = None) -> list[dict[str, Any]]:
        clauses = ["1=1"]
        params: list[Any] = []
        if appid is not None:
            clauses.append("b.appid = ?")
            params.append(int(appid))
        where = " AND ".join(clauses)
        sql = f"""
            SELECT b.*, g.name AS game_name, g.icon_url
            FROM bug_reports b
            JOIN games g ON g.appid = b.appid
            WHERE {where}
            ORDER BY CASE b.status WHEN 'open' THEN 0 WHEN 'watching' THEN 1 ELSE 2 END,
                     b.updated_at DESC
        """
        with self._lock:
            with self._connect() as conn:
                rows = conn.execute(sql, params).fetchall()
        return [dict(row) for row in rows]

    def add_bug(self, appid: int, title: str, body: str = "") -> dict[str, Any]:
        now = self._now_iso()
        title = (title or "").strip()
        if not title:
            return {"ok": False, "error": "Titre requis"}
        with self._lock:
            with self._connect() as conn:
                cur = conn.execute(
                    """
                    INSERT INTO bug_reports(appid, title, body, status, created_at, updated_at)
                    VALUES(?, ?, ?, 'open', ?, ?)
                    """,
                    (int(appid), title, (body or "").strip(), now, now),
                )
                bug_id = int(cur.lastrowid)
        return {"ok": True, "id": bug_id}

    def update_bug_status(self, bug_id: int, status: str) -> dict[str, Any]:
        status = (status or "").strip().lower()
        if status not in {"open", "watching", "done"}:
            return {"ok": False, "error": "Statut invalide"}
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    "UPDATE bug_reports SET status = ?, updated_at = ? WHERE id = ?",
                    (status, self._now_iso(), int(bug_id)),
                )
        return {"ok": True}

    def delete_bug(self, bug_id: int) -> dict[str, Any]:
        with self._lock:
            with self._connect() as conn:
                conn.execute("DELETE FROM bug_reports WHERE id = ?", (int(bug_id),))
        return {"ok": True}

    def get_feed(
        self,
        *,
        appid: int | None = None,
        patch_only: bool = False,
        favorites_only: bool = False,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        clauses = ["1=1"]
        params: list[Any] = []
        if appid is not None:
            clauses.append("c.appid = ?")
            params.append(appid)
        if patch_only:
            clauses.append("c.is_patch = 1")
        if favorites_only:
            clauses.append("COALESCE(g.favorite, 0) = 1")
        where = " AND ".join(clauses)
        sql = f"""
            SELECT c.entry_id, c.fingerprint, c.appid, g.name AS game_name, g.icon_url,
                   c.title, c.published_at, c.url, c.source, c.source_label,
                   c.is_patch, c.is_read, c.fetched_at, COALESCE(g.favorite, 0) AS favorite
            FROM changelogs c
            JOIN games g ON g.appid = c.appid
            WHERE {where}
            ORDER BY c.published_at DESC
            LIMIT ?
        """
        params.append(limit)
        with self._lock:
            with self._connect() as conn:
                rows = conn.execute(sql, params).fetchall()
        return [dict(row) for row in rows]

    def add_game(
        self,
        appid: int,
        name: str,
        icon_url: str = "",
        store_url: str = "",
        installed: bool = False,
    ) -> dict[str, Any]:
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    """
                    INSERT INTO games(appid, name, icon_url, store_url, added_at, installed)
                    VALUES(?, ?, ?, ?, ?, ?)
                    ON CONFLICT(appid) DO UPDATE SET
                        name = CASE
                            WHEN excluded.name LIKE 'Jeu %' THEN games.name
                            ELSE excluded.name
                        END,
                        icon_url = excluded.icon_url,
                        store_url = excluded.store_url,
                        installed = excluded.installed
                    """,
                    (
                        appid,
                        name,
                        icon_url or "",
                        store_url or "",
                        self._now_iso(),
                        1 if installed else 0,
                    ),
                )
        return {"ok": True, "appid": appid}

    def update_game_names(self, names: dict[int, str]) -> int:
        if not names:
            return 0
        updated = 0
        with self._lock:
            with self._connect() as conn:
                for appid, name in names.items():
                    if not name:
                        continue
                    cur = conn.execute(
                        "UPDATE games SET name = ? WHERE appid = ?",
                        (str(name), int(appid)),
                    )
                    updated += cur.rowcount
        return updated

    def get_last_fetched(self) -> dict[str, Any]:
        with self._lock:
            with self._connect() as conn:
                row = conn.execute(
                    "SELECT MAX(fetched_at) AS last_fetched, COUNT(*) AS entries FROM changelogs"
                ).fetchone()
        return {
            "last_fetched": row["last_fetched"] if row else None,
            "entries": int(row["entries"] or 0) if row else 0,
        }

    def remove_game(self, appid: int) -> dict[str, Any]:
        with self._lock:
            with self._connect() as conn:
                conn.execute("DELETE FROM changelogs WHERE appid = ?", (appid,))
                conn.execute("DELETE FROM games WHERE appid = ?", (appid,))
        return {"ok": True}

    def upsert_entries(self, appid: int, entries: list[dict[str, Any]]) -> int:
        merged = merge_entries(entries)
        if not merged:
            return 0
        now = self._now_iso()
        with self._lock:
            with self._connect() as conn:
                for entry in merged:
                    existing = conn.execute(
                        "SELECT is_read FROM changelogs WHERE entry_id = ?",
                        (entry["entry_id"],),
                    ).fetchone()
                    is_read = int(existing["is_read"]) if existing else 0
                    conn.execute(
                        """
                        INSERT INTO changelogs(
                            entry_id, fingerprint, appid, title, published_at, url,
                            source, source_label, is_patch, content_raw, content_html,
                            is_read, fetched_at
                        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(entry_id) DO UPDATE SET
                            fingerprint = excluded.fingerprint,
                            title = excluded.title,
                            published_at = excluded.published_at,
                            url = excluded.url,
                            source = excluded.source,
                            source_label = excluded.source_label,
                            is_patch = excluded.is_patch,
                            content_raw = excluded.content_raw,
                            content_html = excluded.content_html,
                            fetched_at = excluded.fetched_at
                        """,
                        (
                            entry["entry_id"],
                            entry.get("fingerprint") or entry["entry_id"],
                            appid,
                            entry.get("title") or "",
                            int(entry.get("published_at") or 0),
                            entry.get("url") or "",
                            entry.get("source") or "",
                            entry.get("source_label") or "",
                            1 if entry.get("is_patch") else 0,
                            entry.get("content_raw") or "",
                            entry.get("content_html") or "",
                            is_read,
                            now,
                        ),
                    )
        return len(merged)

    def get_changelog(self, entry_id: str) -> dict[str, Any] | None:
        with self._lock:
            with self._connect() as conn:
                row = conn.execute(
                    """
                    SELECT c.*, g.name AS game_name, g.icon_url
                    FROM changelogs c
                    JOIN games g ON g.appid = c.appid
                    WHERE c.entry_id = ?
                    """,
                    (entry_id,),
                ).fetchone()
        return dict(row) if row else None

    def mark_read(self, entry_id: str) -> dict[str, Any]:
        with self._lock:
            with self._connect() as conn:
                conn.execute("UPDATE changelogs SET is_read = 1 WHERE entry_id = ?", (entry_id,))
        return {"ok": True}

    def export_meta(self) -> dict[str, Any]:
        with self._lock:
            with self._connect() as conn:
                game_count = conn.execute("SELECT COUNT(*) AS n FROM games").fetchone()["n"]
                entry_count = conn.execute("SELECT COUNT(*) AS n FROM changelogs").fetchone()["n"]
        return {"games": game_count, "entries": entry_count}

    def is_watchlist_empty(self) -> bool:
        with self._lock:
            with self._connect() as conn:
                count = conn.execute("SELECT COUNT(*) AS n FROM games").fetchone()["n"]
        return int(count) == 0

    def get_setting(self, key: str, default: str = "") -> str:
        with self._lock:
            with self._connect() as conn:
                row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return str(row["value"]) if row else default

    def set_setting(self, key: str, value: str) -> None:
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    (key, value),
                )

    def add_games_bulk(self, games: list[dict[str, Any]]) -> int:
        now = self._now_iso()
        added = 0
        with self._lock:
            with self._connect() as conn:
                for game in games:
                    appid = int(game.get("appid") or 0)
                    if appid <= 0:
                        continue
                    conn.execute(
                        """
                        INSERT INTO games(appid, name, icon_url, store_url, added_at, installed)
                        VALUES(?, ?, ?, ?, ?, ?)
                        ON CONFLICT(appid) DO UPDATE SET
                            name = CASE
                                WHEN excluded.name LIKE 'Jeu %' THEN games.name
                                ELSE excluded.name
                            END,
                            icon_url = excluded.icon_url,
                            store_url = excluded.store_url,
                            installed = excluded.installed
                        """,
                        (
                            appid,
                            str(game.get("name") or f"App {appid}"),
                            str(game.get("icon_url") or ""),
                            str(game.get("store_url") or ""),
                            now,
                            1 if game.get("installed") else 0,
                        ),
                    )
                    added += 1
        return added

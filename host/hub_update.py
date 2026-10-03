"""Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.

SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

Local suite version for HWND titles, allowlisted support URLs,
and a read-only GitHub Latest check (notification + browser link, no download).
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

try:
    import msvcrt
except ImportError:  # pragma: no cover — hubs are Windows-only
    msvcrt = None  # type: ignore[assignment]

_LOCK_TIMEOUT_S = 5.0

SUPPORT_URLS: dict[str, str] = {
    "discord": "https://discord.com/users/406891052516114442",
}
_ALLOWED_SUPPORT_HOSTS = frozenset({"discord.com"})

_CRYPTO_JSON_NAME = "crypto_donations.json"
_CRYPTO_CACHE: list[dict[str, Any]] | None = None

HUB_INSTALL_DIR = "PCCommand"
_LEGACY_HUB_INSTALL_DIRS = ("MrAurevoX",)

HUB_PACK_IDS: dict[str, str] = {
    "systeme": "hub-systeme",
    "reseau": "hub-reseau",
    "securite": "hub-securite",
    "utilitaires": "hub-utilitaires",
}

HUB_GITHUB_REPOS: dict[str, str] = {
    "systeme": "Mr-Aurevo-X/Hub-Systeme",
    "reseau": "Mr-Aurevo-X/Hub-Reseau",
    "securite": "Mr-Aurevo-X/Hub-Securite",
    "utilitaires": "Mr-Aurevo-X/Hub-Utilitaires",
}

HUB_ZIP_ASSETS: dict[str, str] = {
    "systeme": "Launch-Hub-Systeme.zip",
    "reseau": "Launch-Hub-Reseau.zip",
    "securite": "Launch-Hub-Securite.zip",
    "utilitaires": "Launch-Hub-Utilitaires.zip",
}

_HUB_ALIASES = {
    "system": "systeme",
    "systeme": "systeme",
    "network": "reseau",
    "reseau": "reseau",
    "security": "securite",
    "securite": "securite",
    "utilities": "utilitaires",
    "utilitaires": "utilitaires",
}

_ALLOWED_API_HOSTS = frozenset({"api.github.com"})
_ALLOWED_RELEASE_HOSTS = frozenset({"github.com", "www.github.com"})
_ALLOWED_RELEASE_ORGS = frozenset({"mr-aurevo-x"})

def localappdata_root() -> Path:
    return Path(os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local"))

def user_settings_path() -> Path:
    return localappdata_root() / "Mr-Aurevo-X" / "user-settings.json"

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
    """Merge keys into %LOCALAPPDATA%/Mr-Aurevo-X/user-settings.json (preserves accent/language)."""
    current = read_user_settings()
    current.update(patch or {})
    path = user_settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(current, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return current

def is_github_update_check_enabled() -> bool:
    """Default True — opt-out via user-settings.checkGithubUpdates = false."""
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

def _user_desktop_dirs() -> list[Path]:
    """Possible Desktop folders (FR Bureau / EN Desktop / OneDrive)."""
    home = Path.home()
    out: list[Path] = []
    for rel in (
        "Desktop",
        "Bureau",
        "OneDrive/Desktop",
        "OneDrive/Bureau",
        "OneDrive - Personal/Desktop",
        "OneDrive - Personal/Bureau",
    ):
        p = home / Path(rel)
        if p.is_dir():
            out.append(p)
    return out

def _user_downloads_dir() -> Path | None:
    home = Path.home()
    for name in ("Downloads", "Téléchargements", "Telechargements"):
        p = home / name
        if p.is_dir():
            return p
    return None

def resolve_hub_exe_dir(hub_id: str | None = None) -> Path | None:
    """Folder that contains the shipped Launch-Hub-*.exe when known.

    Frozen / shipped: parent of ``sys.executable`` — wherever the user put it
    (Desktop, USB, Downloads, Programs…). That is the path shown in About.

    Dev (Lancer.cmd): search common locations for the exe; never return monorepo.
    """
    if getattr(sys, "frozen", False):
        try:
            return Path(sys.executable).resolve().parent
        except OSError:
            return None

    hub_key = normalize_hub_id(hub_id or "")
    asset = HUB_ZIP_ASSETS.get(hub_key, "")
    exe_name = asset[:-4] + ".exe" if asset.lower().endswith(".zip") else ""
    if not exe_name:
        return None

    local = localappdata_root()
    search_roots: list[Path] = []
    search_roots.extend(_user_desktop_dirs())
    dl = _user_downloads_dir()
    if dl is not None:
        search_roots.append(dl)
    search_roots.extend(
        [
            local / "Programs" / "PCCommand",
            local / "Programs" / "PC Command",
            local / "Programs" / "Mr-Aurevo-X",
            local / "PCCommand",
            local / "Programs",
        ]
    )
    pf = os.environ.get("ProgramFiles") or r"C:\Program Files"
    pfx86 = os.environ.get("ProgramFiles(x86)") or r"C:\Program Files (x86)"
    search_roots.extend([Path(pf) / "PCCommand", Path(pfx86) / "PCCommand"])

    seen: set[Path] = set()
    for root in search_roots:
        try:
            root = root.resolve()
        except OSError:
            continue
        if root in seen or not root.is_dir():
            continue
        seen.add(root)
        direct = root / exe_name
        if direct.is_file():
            return root
        # One level of subfolders (zip extract folder)
        try:
            for child in root.iterdir():
                if child.is_dir():
                    hit = child / exe_name
                    if hit.is_file():
                        return child.resolve()
        except OSError:
            continue
    return None

def about_local_paths(app_dir: Path, *, hub_id: str | None = None) -> dict[str, Any]:
    """Labeled absolute paths for About — uninstall / manual cleanup guidance.

    Never expose monorepo / SoT / clone paths (even when running via Lancer.cmd).
    ``app_dir`` is kept for API compatibility; it is not shown in the UI.

    Install path = real folder of the running / found Launch-Hub-*.exe
    (Desktop, USB, …) — never a invented Programs path.
    """
    _ = app_dir  # API compat — never surface SoT/clone in About
    hub_key = normalize_hub_id(hub_id or "")
    entries: list[dict[str, Any]] = []

    exe_dir = resolve_hub_exe_dir(hub_id)
    if exe_dir is not None:
        entries.append(
            {
                "id": "app",
                "label": "Install (dossier de l’exe)",
                "path": str(exe_dir),
                "hint": "Dossier réel de l’exe lancé (Bureau, USB, Downloads…) — à supprimer pour désinstaller.",
            }
        )

    entries.append(
        {
            "id": "version",
            "label": "Métadonnées / version",
            "path": str(default_install_dir()),
            "hint": r"%LOCALAPPDATA%\PCCommand — version.json et métadonnées suite.",
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

    if hub_key == "reseau":
        roadway = localappdata_root() / "Mr-Aurevo-X" / "RoadWay-X"
        entries.append(
            {
                "id": "data-roadway",
                "label": "Données Traffic",
                "path": str(roadway),
                "hint": "Caches / alertes Traffic — optionnel si tu n’utilises plus le module.",
                "optional": True,
            }
        )

    return {"ok": True, "hubId": hub_key or None, "paths": entries}

def hub_install_dir_candidates() -> list[Path]:
    root = localappdata_root()
    names = [HUB_INSTALL_DIR, *_LEGACY_HUB_INSTALL_DIRS]
    return [root / name for name in names]

def default_install_dir() -> Path:
    return hub_install_dir_candidates()[0]

def normalize_version(raw: str | None) -> str:
    s = (raw or "").strip()
    if not s:
        return ""
    if s.lower().startswith("v") and len(s) > 1 and s[1].isdigit():
        return s
    if s and s[0].isdigit():
        return f"v{s}"
    return s

def format_version_bracket(version: str | None) -> str:
    return normalize_version(version) or ""

def read_local_version(*search_roots: Path, pack_id: str | None = None) -> str | None:
    for root in search_roots:
        if not root:
            continue
        path = Path(root) / "version.json"
        if not path.is_file():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if pack_id:
            packs = data.get("packs")
            if isinstance(packs, dict):
                stamped = str(packs.get(str(pack_id).lower()) or "").strip()
                if stamped:
                    return normalize_version(stamped) or stamped
            continue
        tag = str(
            data.get("suiteVersion") or data.get("tag") or data.get("version") or ""
        ).strip()
        if tag:
            return normalize_version(tag) or tag
    if getattr(sys, "frozen", False):
        meipass = Path(getattr(sys, "_MEIPASS", ""))
        if meipass.is_dir():
            path = meipass / "version.json"
            if path.is_file():
                try:
                    data = json.loads(path.read_text(encoding="utf-8"))
                    tag = str(
                        data.get("suiteVersion")
                        or data.get("tag")
                        or data.get("version")
                        or ""
                    ).strip()
                    if tag:
                        return normalize_version(tag) or tag
                except (OSError, json.JSONDecodeError):
                    pass
    return None

def version_search_roots(app_dir: Path) -> list[Path]:
    roots: list[Path] = []
    install = default_install_dir()
    if install not in roots:
        roots.append(install)
    ad = Path(app_dir)
    if ad not in roots:
        roots.append(ad)
    if getattr(sys, "frozen", False):
        exe_parent = Path(sys.executable).resolve().parent
        if exe_parent not in roots:
            roots.insert(0, exe_parent)
    return roots

def get_local_suite_version(app_dir: Path) -> str | None:
    return read_local_version(*version_search_roots(app_dir))

def normalize_hub_id(hub_id: str) -> str:
    hub_key = (hub_id or "").strip().lower().replace("hub-", "").replace("_", "-")
    return _HUB_ALIASES.get(hub_key, hub_key)

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

def _assert_api_url(url: str) -> None:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https":
        raise ValueError(f"non-HTTPS URL rejected: {url!r}")
    host = (parsed.hostname or "").lower()
    if host not in _ALLOWED_API_HOSTS:
        raise ValueError(f"host not allowlisted: {host!r}")

def _api_latest_release(repo: str) -> dict[str, Any]:
    if repo not in set(HUB_GITHUB_REPOS.values()):
        raise ValueError(f"release repo not allowlisted: {repo!r}")
    url = f"https://api.github.com/repos/{repo}/releases/latest"
    _assert_api_url(url)
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "PC-Command-HubReleaseNotice",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(req, timeout=8) as resp:  # nosec B310
        return json.loads(resp.read().decode("utf-8"))

def _release_payload(
    repo: str, release: dict[str, Any], asset_name: str | None
) -> dict[str, Any]:
    tag = str(release.get("tag_name") or "").strip()
    html = str(release.get("html_url") or "").strip()
    if not html:
        html = f"https://github.com/{repo}/releases/latest"
    names = [str(a.get("name") or "") for a in (release.get("assets") or [])]
    has_zip = bool(asset_name and asset_name in names)
    return {
        "repo": repo,
        "tag": tag,
        "remote": normalize_version(tag) or tag,
        "releaseUrl": html,
        "hasZip": has_zip,
        "asset": asset_name,
    }

def check_hub_release(hub_id: str, app_dir: Path) -> dict[str, Any]:
    """Compare local version.json to GitHub Latest on this hub's own repo. Never downloads."""
    hub_key = normalize_hub_id(hub_id)
    local = get_local_suite_version(app_dir)
    zip_name = HUB_ZIP_ASSETS.get(hub_key)
    hub_repo = HUB_GITHUB_REPOS.get(hub_key)
    if not hub_repo:
        return {
            "ok": False,
            "updateAvailable": False,
            "error": f"hub inconnu: {hub_id!r}",
            "local": local,
        }

    if not is_github_update_check_enabled():
        return {
            "ok": True,
            "updateAvailable": False,
            "skipped": True,
            "reason": "checkGithubUpdates disabled",
            "local": local,
            "hubId": hub_key,
            "repo": hub_repo,
            "checkGithubUpdates": False,
            "message": None,
            "error": None,
        }

    last_err = None
    try:
        raw = _api_latest_release(hub_repo)
        chosen = _release_payload(hub_repo, raw, zip_name)
        if not chosen.get("remote"):
            chosen = None
    except urllib.error.HTTPError as exc:
        last_err = f"HTTP {exc.code}"
        chosen = None
    except Exception as exc:  # noqa: BLE001
        last_err = str(exc)
        chosen = None

    if not chosen:
        return {
            "ok": False,
            "updateAvailable": False,
            "error": last_err or "no release",
            "local": local,
            "hubId": hub_key,
            "checkGithubUpdates": True,
        }

    remote = str(chosen.get("remote") or "")
    available = bool(remote) and is_remote_newer(remote, local)
    return {
        "ok": True,
        "error": None,
        "updateAvailable": available,
        "local": local,
        "remote": remote,
        "hubId": hub_key,
        "repo": chosen.get("repo"),
        "asset": chosen.get("asset"),
        "hasZip": chosen.get("hasZip"),
        "releaseUrl": chosen.get("releaseUrl"),
        "checkGithubUpdates": True,
        "message": (
            f"Nouvelle version {remote} (installée : {local or '?'})"
            if available
            else None
        ),
    }

def open_release_url(url: str) -> dict[str, Any]:
    """Open an allowlisted Mr-Aurevo-X GitHub release page in the default browser."""
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

def open_support_url(kind: str) -> dict[str, Any]:
    """Open Discord (allowlisted). Crypto tips use list/copy APIs, not a browser URL."""
    key = (kind or "").strip().lower()
    if key == "crypto":
        return {"ok": False, "error": "use list_crypto_donations / copy_crypto_address"}
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

def _crypto_json_candidates() -> list[Path]:
    here = Path(__file__).resolve().parent
    return [
        here / _CRYPTO_JSON_NAME,
        here.parent / _CRYPTO_JSON_NAME,
        Path(getattr(sys, "_MEIPASS", "")) / _CRYPTO_JSON_NAME
        if getattr(sys, "_MEIPASS", None)
        else Path(),
    ]

def load_crypto_donations() -> list[dict[str, Any]]:
    """Load allowlisted crypto tip addresses from adjacent JSON (SoT sync)."""
    global _CRYPTO_CACHE
    if _CRYPTO_CACHE is not None:
        return list(_CRYPTO_CACHE)
    for path in _crypto_json_candidates():
        if not path or not path.is_file():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        assets = data.get("assets") if isinstance(data, dict) else None
        if not isinstance(assets, list):
            continue
        out: list[dict[str, Any]] = []
        for row in assets:
            if not isinstance(row, dict):
                continue
            aid = str(row.get("id") or "").strip().lower()
            addr = str(row.get("address") or "").strip()
            if not aid or not addr:
                continue
            item: dict[str, Any] = {
                "id": aid,
                "symbol": str(row.get("symbol") or "").strip(),
                "name": str(row.get("name") or "").strip(),
                "network": str(row.get("network") or "").strip(),
                "address": addr,
            }
            note = str(row.get("note") or "").strip()
            if note:
                item["note"] = note
            out.append(item)
        if out:
            _CRYPTO_CACHE = out
            return list(out)
    _CRYPTO_CACHE = []
    return []

def list_crypto_donations() -> dict[str, Any]:
    assets = load_crypto_donations()
    return {"ok": True, "assets": assets, "count": len(assets)}

def _copy_text_windows(text: str) -> None:
    """Copy unicode text to the Windows clipboard (no third-party dep)."""
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.WinDLL("user32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    CF_UNICODETEXT = 13
    GMEM_MOVEABLE = 0x0002

    user32.OpenClipboard.argtypes = [wintypes.HWND]
    user32.OpenClipboard.restype = wintypes.BOOL
    user32.EmptyClipboard.argtypes = []
    user32.EmptyClipboard.restype = wintypes.BOOL
    user32.CloseClipboard.argtypes = []
    user32.CloseClipboard.restype = wintypes.BOOL
    user32.SetClipboardData.argtypes = [wintypes.UINT, wintypes.HANDLE]
    user32.SetClipboardData.restype = wintypes.HANDLE

    kernel32.GlobalAlloc.argtypes = [wintypes.UINT, ctypes.c_size_t]
    kernel32.GlobalAlloc.restype = wintypes.HGLOBAL
    kernel32.GlobalLock.argtypes = [wintypes.HGLOBAL]
    kernel32.GlobalLock.restype = ctypes.c_void_p
    kernel32.GlobalUnlock.argtypes = [wintypes.HGLOBAL]
    kernel32.GlobalUnlock.restype = wintypes.BOOL
    kernel32.GlobalFree.argtypes = [wintypes.HGLOBAL]
    kernel32.GlobalFree.restype = wintypes.HGLOBAL

    if not user32.OpenClipboard(None):
        raise OSError(f"OpenClipboard failed ({ctypes.get_last_error()})")
    try:
        if not user32.EmptyClipboard():
            raise OSError(f"EmptyClipboard failed ({ctypes.get_last_error()})")
        raw = text.encode("utf-16-le") + b"\x00\x00"
        h_global = kernel32.GlobalAlloc(GMEM_MOVEABLE, len(raw))
        if not h_global:
            raise OSError(f"GlobalAlloc failed ({ctypes.get_last_error()})")
        locked = kernel32.GlobalLock(h_global)
        if not locked:
            kernel32.GlobalFree(h_global)
            raise OSError(f"GlobalLock failed ({ctypes.get_last_error()})")
        try:
            ctypes.memmove(locked, raw, len(raw))
        finally:
            kernel32.GlobalUnlock(h_global)
        if not user32.SetClipboardData(CF_UNICODETEXT, h_global):
            kernel32.GlobalFree(h_global)
            raise OSError(f"SetClipboardData failed ({ctypes.get_last_error()})")
    finally:
        user32.CloseClipboard()

def copy_crypto_address(asset_id: str) -> dict[str, Any]:
    """Copy a catalogued donation address to the clipboard. Never accepts raw addresses."""
    key = (asset_id or "").strip().lower()
    if not key:
        return {"ok": False, "error": "missing asset id"}
    match: dict[str, Any] | None = None
    for row in load_crypto_donations():
        if row.get("id") == key:
            match = row
            break
    if not match:
        return {"ok": False, "error": f"unknown asset: {asset_id!r}"}
    address = str(match.get("address") or "")
    if not address:
        return {"ok": False, "error": "empty address"}
    try:
        if sys.platform.startswith("win"):
            _copy_text_windows(address)
        else:
            # Non-Windows fallback for LocalCrypt / tests — prefer pyperclip if present.
            try:
                import pyperclip  # type: ignore[import-untyped]

                pyperclip.copy(address)
            except Exception as exc:  # noqa: BLE001
                return {"ok": False, "error": str(exc), "asset": key}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc), "asset": key}
    return {
        "ok": True,
        "asset": key,
        "symbol": match.get("symbol"),
        "network": match.get("network"),
        "preview": address[:8] + "..." + address[-6:] if len(address) > 16 else address,
    }

def title_with_version(base_title: str, version: str | None, *, module: str | None = None) -> str:
    """Build HWND / tool-chrome title.

    Accueil: ``PC Command | System [v1.4.1]``
    Module:  ``PC Command | System [WinCleaner]`` (module wins over version)
    """
    base = (base_title or "").strip() or "PC Command"
    mod = (module or "").strip()
    ver = format_version_bracket(version)
    if mod:
        return f"{base} [{mod}]"
    if ver:
        return f"{base} [{ver}]"
    return base

@contextmanager
def _version_lock(install_dir: Path) -> Iterator[None]:
    Path(install_dir).mkdir(parents=True, exist_ok=True)
    lock_path = Path(install_dir) / ".version.lock"
    fh = lock_path.open("a+b")
    if fh.seek(0, 2) == 0:
        fh.write(b"\0")
        fh.flush()
    locked = False
    deadline = time.monotonic() + _LOCK_TIMEOUT_S
    try:
        if msvcrt is None:
            yield
            return
        while True:
            try:
                fh.seek(0)
                msvcrt.locking(fh.fileno(), msvcrt.LK_NBLCK, 1)
                locked = True
                break
            except OSError:
                if time.monotonic() >= deadline:
                    raise RuntimeError("Timeout verrou version.json")
                time.sleep(0.05)
        yield
    finally:
        if locked and msvcrt is not None:
            try:
                fh.seek(0)
                msvcrt.locking(fh.fileno(), msvcrt.LK_UNLCK, 1)
            except OSError:
                pass
        fh.close()

def write_pack_stamp(
    install_dir: Path,
    pack_id: str | None,
    tag: str,
    catalog: dict | None = None,
) -> None:
    path = Path(install_dir) / "version.json"
    with _version_lock(install_dir):
        existing: dict = {}
        if path.is_file():
            try:
                loaded = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(loaded, dict):
                    existing = loaded
            except (OSError, json.JSONDecodeError):
                existing = {}
        suite = str((catalog or {}).get("suiteVersion") or tag or "").strip() or tag
        payload = dict(existing)
        payload["tag"] = tag
        payload["suiteVersion"] = suite
        packs = payload.get("packs")
        if not isinstance(packs, dict):
            packs = {}
        else:
            packs = dict(packs)
        if pack_id:
            packs[str(pack_id).lower()] = suite
        payload["packs"] = packs
        path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

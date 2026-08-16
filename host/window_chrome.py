"""Frameless tool chrome helpers for pywebview (EdgeChromium / WinForms).

Drag and edge-resize go through js_api only (ReleaseCapture + WM_NCLBUTTONDOWN,
plus pointer-driven SetWindowPos via get/set_window_bounds).
Do NOT install a Win32 WndProc NCHITTEST subclass — that path blacks out WebView2.
"""
from __future__ import annotations

import ctypes
import sys
from ctypes import Structure, byref, c_long
from typing import Any

import webview

_GWL_STYLE = -16
_WS_THICKFRAME = 0x00040000
_WS_MINIMIZEBOX = 0x00020000
_WS_MAXIMIZEBOX = 0x00010000
_SWP_NOZORDER = 0x0004
_SWP_NOACTIVATE = 0x0010
_WM_NCLBUTTONDOWN = 0x00A1
_HTCAPTION = 2
_HT_BY_EDGE = {
    "left": 10,
    "right": 11,
    "top": 12,
    "top-left": 13,
    "top-right": 14,
    "bottom": 15,
    "bottom-left": 16,
    "bottom-right": 17,
}

# Default standalone tool window geometry (sidebar ~240px + main must fit).
TOOL_WIDTH = 1320
TOOL_HEIGHT = 960
TOOL_MIN_SIZE = (1200, 780)


class _RECT(Structure):
    _fields_ = [
        ("left", c_long),
        ("top", c_long),
        ("right", c_long),
        ("bottom", c_long),
    ]


def window_hwnd(window: Any) -> int:
    """Resolve the WinForms HWND for a pywebview window."""
    if window is None:
        return 0
    native = getattr(window, "native", None)
    if native is None:
        return 0
    handle = getattr(native, "Handle", None)
    if handle is None:
        return 0
    try:
        return int(handle.ToInt32())
    except Exception:  # noqa: BLE001
        try:
            return int(handle)
        except Exception:  # noqa: BLE001
            return 0


def ensure_thickframe(hwnd: int) -> None:
    """Re-add WS_THICKFRAME on frameless forms so native sizing messages can work.

    Does NOT touch FormBorderStyle / SWP_FRAMECHANGED (those black out WebView2).
    """
    if not hwnd or sys.platform != "win32":
        return
    try:
        user32 = ctypes.windll.user32
        style = int(user32.GetWindowLongW(hwnd, _GWL_STYLE))
        wanted = style | _WS_THICKFRAME | _WS_MINIMIZEBOX | _WS_MAXIMIZEBOX
        if wanted != style:
            user32.SetWindowLongW(hwnd, _GWL_STYLE, wanted)
    except Exception:  # noqa: BLE001
        pass


def window_bounds(hwnd: int) -> dict:
    if not hwnd:
        return {"ok": False, "error": "no hwnd"}
    try:
        user32 = ctypes.windll.user32
        rect = _RECT()
        if not user32.GetWindowRect(hwnd, byref(rect)):
            return {"ok": False, "error": "GetWindowRect failed"}
        return {
            "ok": True,
            "x": int(rect.left),
            "y": int(rect.top),
            "w": int(rect.right - rect.left),
            "h": int(rect.bottom - rect.top),
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


def set_window_bounds(
    hwnd: int,
    x: int,
    y: int,
    w: int,
    h: int,
    min_size: tuple[int, int] = TOOL_MIN_SIZE,
) -> dict:
    if not hwnd:
        return {"ok": False, "error": "no hwnd"}
    try:
        min_w, min_h = int(min_size[0]), int(min_size[1])
        w = max(min_w, int(w))
        h = max(min_h, int(h))
        user32 = ctypes.windll.user32
        ok = user32.SetWindowPos(
            hwnd, 0, int(x), int(y), w, h, _SWP_NOZORDER | _SWP_NOACTIVATE
        )
        return {"ok": bool(ok), "x": int(x), "y": int(y), "w": w, "h": h}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


def nc_drag(hwnd: int, ht: int) -> dict:
    """Synchronous caption/edge drag via ReleaseCapture + WM_NCLBUTTONDOWN."""
    if not hwnd:
        return {"ok": False, "error": "no hwnd"}
    if sys.platform != "win32":
        return {"ok": False, "error": "unsupported"}
    try:
        user32 = ctypes.windll.user32
        ensure_thickframe(hwnd)
        user32.ReleaseCapture()
        user32.SendMessageW(hwnd, _WM_NCLBUTTONDOWN, int(ht), 0)
        return {"ok": True}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


class WindowChromeMixin:
    """Mixin for tool Api classes — expects self._window set via set_window / bind."""

    _window: Any = None
    _maximized: bool = False
    _min_size: tuple[int, int] = TOOL_MIN_SIZE

    def set_window(self, window: Any) -> None:
        self._window = window
        self._maximized = False

    def _resolve_hwnd(self) -> int:
        hwnd = window_hwnd(getattr(self, "_window", None))
        if hwnd:
            return hwnd
        if sys.platform != "win32":
            return 0
        try:
            return int(ctypes.windll.user32.GetForegroundWindow())
        except Exception:  # noqa: BLE001
            return 0

    def window_minimize(self) -> dict:
        w = getattr(self, "_window", None)
        if w is None:
            return {"ok": False, "error": "no window"}
        try:
            w.minimize()
            return {"ok": True}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc)}

    def window_toggle_maximize(self) -> dict:
        w = getattr(self, "_window", None)
        if w is None:
            return {"ok": False, "error": "no window"}
        try:
            if getattr(self, "_maximized", False):
                w.restore()
                self._maximized = False
            else:
                w.maximize()
                self._maximized = True
            return {"ok": True, "maximized": self._maximized}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc)}

    def window_close(self) -> dict:
        w = getattr(self, "_window", None)
        if w is None:
            return {"ok": False, "error": "no window"}
        try:
            w.destroy()
            return {"ok": True}
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc)}

    def window_start_drag(self) -> dict:
        if sys.platform != "win32":
            return {"ok": False, "error": "unsupported"}
        return nc_drag(self._resolve_hwnd(), _HTCAPTION)

    def window_start_resize(self, edge: str = "right") -> dict:
        """Best-effort native edge resize (needs WS_THICKFRAME). Prefer set_window_bounds."""
        if sys.platform != "win32":
            return {"ok": False, "error": "unsupported"}
        key = str(edge or "right").strip().lower().replace("_", "-")
        ht = _HT_BY_EDGE.get(key)
        if ht is None:
            return {"ok": False, "error": f"bad edge: {edge}"}
        return nc_drag(self._resolve_hwnd(), ht)

    def get_window_bounds(self) -> dict:
        """Screen rect — used by pointer-driven frameless resize."""
        if sys.platform != "win32":
            return {"ok": False, "error": "unsupported"}
        return window_bounds(self._resolve_hwnd())

    def set_window_bounds(self, x: int = 0, y: int = 0, w: int = 960, h: int = 640) -> dict:
        """Apply screen bounds during pointer-driven frameless resize."""
        if sys.platform != "win32":
            return {"ok": False, "error": "unsupported"}
        hwnd = self._resolve_hwnd()
        ensure_thickframe(hwnd)
        min_size = getattr(self, "_min_size", None) or TOOL_MIN_SIZE
        return set_window_bounds(hwnd, int(x), int(y), int(w), int(h), tuple(min_size))


def create_tool_window(
    *,
    title: str,
    url: str,
    js_api: Any,
    width: int = TOOL_WIDTH,
    height: int = TOOL_HEIGHT,
    min_size: tuple[int, int] = TOOL_MIN_SIZE,
    background_color: str = "#06070c",
    **extra: Any,
) -> Any:
    """Create a frameless, resizable tool window and bind js_api._window."""
    kwargs: dict[str, Any] = dict(
        title=title,
        url=url,
        js_api=js_api,
        width=int(width),
        height=int(height),
        min_size=tuple(min_size),
        frameless=True,
        resizable=True,
        easy_drag=False,
        shadow=True,
        background_color=background_color,
    )
    kwargs.update(extra)
    window = webview.create_window(**kwargs)
    if hasattr(js_api, "set_window") and callable(getattr(js_api, "set_window")):
        js_api.set_window(window)
    else:
        js_api._window = window
        js_api._maximized = False
    js_api._min_size = tuple(min_size)

    def _on_loaded() -> None:
        try:
            ensure_thickframe(window_hwnd(window))
        except Exception:  # noqa: BLE001
            pass

    try:
        window.events.loaded += _on_loaded
    except Exception:  # noqa: BLE001
        pass
    return window

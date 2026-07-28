#!/usr/bin/env python3
"""PC Command — localhost metrics API + static dashboard."""

from __future__ import annotations

import ctypes
import json
import os
import platform
import socket
import subprocess
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
SUITE_ROOT = ROOT.parent.parent  # La Suite/
HOST = "127.0.0.1"
PORT = 8765
DASH_PATH = "/systems/14-pc-command/hub.html"

try:
    import psutil
except ImportError:
    print("psutil missing — run: python -m pip install -r requirements.txt", file=sys.stderr)
    sys.exit(1)

# Optional NVIDIA bindings
_pynvml = None
_gputil = None
try:
    import pynvml as _pynvml  # type: ignore
except Exception:
    try:
        from nvidia import ml as _pynvml  # type: ignore
    except Exception:
        _pynvml = None

try:
    import GPUtil as _gputil  # type: ignore
except Exception:
    _gputil = None

_hw_cache: dict | None = None
_hw_lock = threading.Lock()
_nvml_ok = False


def _run_ps(cmd: str, timeout: float = 4.0) -> str:
    try:
        r = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", cmd],
            capture_output=True,
            timeout=timeout,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if r.returncode != 0:
            return ""
        raw = r.stdout or b""
        for enc in ("utf-8", "utf-16-le", "cp1252"):
            try:
                return raw.decode(enc).strip()
            except UnicodeDecodeError:
                continue
        return raw.decode("utf-8", errors="replace").strip()
    except Exception:
        return ""


def _init_nvml() -> bool:
    global _nvml_ok
    if _pynvml is None:
        return False
    try:
        _pynvml.nvmlInit()
        _nvml_ok = True
        return True
    except Exception:
        _nvml_ok = False
        return False


def _cpu_model() -> str:
    if platform.system() == "Windows":
        out = _run_ps("(Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty Name)")
        if out:
            return out
    return platform.processor() or "CPU"


def _gpu_name_wmi() -> str | None:
    out = _run_ps(
        "(Get-CimInstance Win32_VideoController | "
        "Where-Object { $_.Name -and $_.Name -notmatch 'Microsoft Basic' } | "
        "Select-Object -First 1 -ExpandProperty Name)"
    )
    return out or None


def _ram_modules_summary() -> str:
    out = _run_ps(
        "[Console]::OutputEncoding = [Text.UTF8Encoding]::new(); "
        "$m = Get-CimInstance Win32_PhysicalMemory; "
        "if (-not $m) { '' } else { "
        "$gb = [math]::Round(($m | Measure-Object Capacity -Sum).Sum / 1GB, 1); "
        "$speeds = ($m.Speed | Select-Object -Unique) -join '/'; "
        "\"$gb GB / $speeds MHz\" }"
    )
    return out or ""


def hardware_info() -> dict:
    global _hw_cache
    with _hw_lock:
        if _hw_cache is not None:
            return _hw_cache
        uname = platform.uname()
        info = {
            "hostname": socket.gethostname(),
            "os": f"{uname.system} {uname.release}",
            "os_version": uname.version,
            "arch": uname.machine,
            "cpu_model": _cpu_model(),
            "cpu_cores_physical": psutil.cpu_count(logical=False) or 0,
            "cpu_cores_logical": psutil.cpu_count(logical=True) or 0,
            "ram_summary": _ram_modules_summary(),
            "gpu_name": None,
            "gpu_source": "none",
        }
        # Prefer NVML / GPUtil name, else WMI
        name = None
        source = "none"
        if _nvml_ok:
            try:
                h = _pynvml.nvmlDeviceGetHandleByIndex(0)
                name = _pynvml.nvmlDeviceGetName(h)
                if isinstance(name, bytes):
                    name = name.decode("utf-8", errors="replace")
                source = "nvml"
            except Exception:
                pass
        if not name and _gputil is not None:
            try:
                gpus = _gputil.getGPUs()
                if gpus:
                    name = gpus[0].name
                    source = "gputil"
            except Exception:
                pass
        if not name:
            name = _gpu_name_wmi()
            if name:
                source = "wmi"
        info["gpu_name"] = name
        info["gpu_source"] = source
        _hw_cache = info
        return info


def _gpu_metrics() -> dict:
    """Return GPU load/mem/temp when possible; degrade gracefully."""
    result = {
        "available": False,
        "source": "none",
        "name": None,
        "load_percent": None,
        "memory_used_mb": None,
        "memory_total_mb": None,
        "memory_percent": None,
        "temperature_c": None,
        "note": "No GPU API available",
    }
    hw = hardware_info()
    result["name"] = hw.get("gpu_name")

    if _nvml_ok and _pynvml is not None:
        try:
            h = _pynvml.nvmlDeviceGetHandleByIndex(0)
            util = _pynvml.nvmlDeviceGetUtilizationRates(h)
            mem = _pynvml.nvmlDeviceGetMemoryInfo(h)
            temp = None
            try:
                temp = _pynvml.nvmlDeviceGetTemperature(h, _pynvml.NVML_TEMPERATURE_GPU)
            except Exception:
                pass
            name = _pynvml.nvmlDeviceGetName(h)
            if isinstance(name, bytes):
                name = name.decode("utf-8", errors="replace")
            used_mb = mem.used / (1024 * 1024)
            total_mb = mem.total / (1024 * 1024)
            result.update(
                {
                    "available": True,
                    "source": "nvml",
                    "name": name,
                    "load_percent": float(util.gpu),
                    "memory_used_mb": round(used_mb, 1),
                    "memory_total_mb": round(total_mb, 1),
                    "memory_percent": round(100.0 * mem.used / mem.total, 1) if mem.total else None,
                    "temperature_c": temp,
                    "note": "Live via NVIDIA NVML",
                }
            )
            return result
        except Exception as e:
            result["note"] = f"NVML error: {e}"

    if _gputil is not None:
        try:
            gpus = _gputil.getGPUs()
            if gpus:
                g = gpus[0]
                result.update(
                    {
                        "available": True,
                        "source": "gputil",
                        "name": g.name,
                        "load_percent": float(g.load * 100),
                        "memory_used_mb": round(float(g.memoryUsed), 1),
                        "memory_total_mb": round(float(g.memoryTotal), 1),
                        "memory_percent": round(float(g.memoryUtil * 100), 1),
                        "temperature_c": g.temperature,
                        "note": "Live via GPUtil",
                    }
                )
                return result
        except Exception as e:
            result["note"] = f"GPUtil error: {e}"

    # PowerShell / WMI: name only (no reliable load without vendor APIs)
    if result["name"]:
        result["note"] = "Name via WMI — load/mem unavailable (install nvidia-ml-py or GPUtil for NVIDIA)"
        result["source"] = "wmi-name"
    else:
        result["note"] = "No discrete GPU metrics (NVML/GPUtil/WMI)"
    return result


# Win32 GetDriveTypeW
_DRIVE_UNKNOWN = 0
_DRIVE_NO_ROOT = 1
_DRIVE_REMOVABLE = 2
_DRIVE_FIXED = 3
_DRIVE_REMOTE = 4
_DRIVE_CDROM = 5
_DRIVE_RAMDISK = 6

_DRIVE_META = {
    _DRIVE_REMOVABLE: ("removable", "USB", True),
    _DRIVE_FIXED: ("fixed", "Fixed", False),
    _DRIVE_REMOTE: ("network", "Network", False),
    _DRIVE_CDROM: ("cdrom", "CD/DVD", False),
    _DRIVE_RAMDISK: ("ramdisk", "RAM", False),
}


def _windows_volumes() -> list[dict]:
    """List fixed + removable (+ ready) volumes via Win32 — USB plug/unplug live."""
    kernel32 = ctypes.windll.kernel32
    buf = ctypes.create_unicode_buffer(512)
    n = kernel32.GetLogicalDriveStringsW(ctypes.sizeof(buf) // 2, buf)
    if not n:
        return []
    roots = [d for d in buf[:n].split("\x00") if d]
    out: list[dict] = []
    for root in roots:
        dtype = int(kernel32.GetDriveTypeW(root))
        if dtype in (_DRIVE_UNKNOWN, _DRIVE_NO_ROOT):
            continue
        kind, type_label, removable = _DRIVE_META.get(
            dtype, ("unknown", "Unknown", False)
        )
        free = ctypes.c_ulonglong(0)
        total = ctypes.c_ulonglong(0)
        total_free = ctypes.c_ulonglong(0)
        ok = kernel32.GetDiskFreeSpaceExW(
            ctypes.c_wchar_p(root),
            ctypes.byref(free),
            ctypes.byref(total),
            ctypes.byref(total_free),
        )
        if not ok or total.value == 0:
            # Not ready (empty CD / mid-eject USB) — skip until next poll
            continue
        vol_buf = ctypes.create_unicode_buffer(261)
        fs_buf = ctypes.create_unicode_buffer(261)
        kernel32.GetVolumeInformationW(
            ctypes.c_wchar_p(root),
            vol_buf,
            261,
            None,
            None,
            None,
            fs_buf,
            261,
        )
        total_b = total.value
        free_b = free.value
        used_b = max(0, total_b - free_b)
        letter = root.rstrip("\\")
        label = (vol_buf.value or "").strip() or letter
        out.append(
            {
                "device": letter,
                "mount": root if root.endswith("\\") else root + "\\",
                "label": label,
                "fstype": (fs_buf.value or "").strip(),
                "drive_type": kind,
                "type_label": type_label,
                "removable": removable,
                "total_gb": round(total_b / (1024**3), 2),
                "used_gb": round(used_b / (1024**3), 2),
                "free_gb": round(free_b / (1024**3), 2),
                "percent": round(100.0 * used_b / total_b, 1) if total_b else 0.0,
            }
        )
    return out


def _psutil_volumes() -> list[dict]:
    """Fallback for non-Windows (or if Win32 listing fails)."""
    disks: list[dict] = []
    for part in psutil.disk_partitions(all=True):
        opts = (part.opts or "").lower()
        if "cdrom" in opts:
            continue
        if os.name == "nt" and part.fstype == "":
            continue
        try:
            usage = psutil.disk_usage(part.mountpoint)
        except Exception:
            continue
        removable = "removable" in opts
        kind = "removable" if removable else "fixed"
        letter = part.device.rstrip("\\") if part.device else part.mountpoint
        disks.append(
            {
                "device": letter,
                "mount": part.mountpoint,
                "label": letter,
                "fstype": part.fstype or "",
                "drive_type": kind,
                "type_label": "USB" if removable else "Fixed",
                "removable": removable,
                "total_gb": round(usage.total / (1024**3), 2),
                "used_gb": round(usage.used / (1024**3), 2),
                "free_gb": round(usage.free / (1024**3), 2),
                "percent": usage.percent,
            }
        )
    return disks


def list_volumes() -> list[dict]:
    if os.name == "nt":
        try:
            vols = _windows_volumes()
            if vols:
                return vols
        except Exception:
            pass
    return _psutil_volumes()


def collect_metrics() -> dict:
    # One blocking sample for both aggregate + per-core (avoid near-zero race)
    per_core = psutil.cpu_percent(interval=0.15, percpu=True)
    cpu_percent = round(sum(per_core) / len(per_core), 1) if per_core else 0.0
    vm = psutil.virtual_memory()
    swap = psutil.swap_memory()

    disks = list_volumes()

    net = psutil.net_io_counters()
    boot = psutil.boot_time()
    hw = hardware_info()
    gpu = _gpu_metrics()

    # Composite "system load" for the big gauge (CPU-weighted + RAM pressure)
    load_score = min(100, round(cpu_percent * 0.65 + vm.percent * 0.35, 1))
    if load_score >= 75:
        load_label = "HIGH"
    elif load_score >= 45:
        load_label = "MEDIUM"
    else:
        load_label = "LOW"

    return {
        "ts": time.time(),
        "hostname": hw["hostname"],
        "os": hw["os"],
        "arch": hw["arch"],
        "cpu": {
            "percent": cpu_percent,
            "per_core": per_core,
            "model": hw["cpu_model"],
            "cores_physical": hw["cpu_cores_physical"],
            "cores_logical": hw["cpu_cores_logical"],
            "freq_mhz": getattr(psutil.cpu_freq(), "current", None) if psutil.cpu_freq() else None,
        },
        "ram": {
            "percent": vm.percent,
            "used_gb": round(vm.used / (1024**3), 2),
            "total_gb": round(vm.total / (1024**3), 2),
            "available_gb": round(vm.available / (1024**3), 2),
            "summary": hw["ram_summary"],
            "swap_percent": swap.percent,
        },
        "disk": disks,
        "network": {
            "bytes_sent": net.bytes_sent,
            "bytes_recv": net.bytes_recv,
        },
        "gpu": gpu,
        "load": {
            "score": load_score,
            "label": load_label,
        },
        "procs": len(psutil.pids()),
        "uptime_sec": int(time.time() - boot),
        "degraded": {
            "gpu_metrics": not gpu.get("available", False),
            "gpu_note": gpu.get("note"),
        },
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SUITE_ROOT), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        msg = fmt % args if args else fmt
        if "/api/" in str(msg):
            return
        sys.stderr.write("[pc-command] " + str(msg) + "\n")

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path in ("/api/metrics", "/api/metrics/", "/systems/14-pc-command/api/metrics"):
            payload = json.dumps(collect_metrics(), ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        if path in ("/", "/index.html", "/hub.html", "/hub"):
            self.path = DASH_PATH
        return super().do_GET()


def main() -> None:
    _init_nvml()
    threading.Thread(target=hardware_info, daemon=True).start()
    psutil.cpu_percent(interval=None)

    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    url = f"http://{HOST}:{PORT}{DASH_PATH}"
    print(f"PC Command listening on {url}")
    print("API: /api/metrics  (localhost only)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
    finally:
        if _nvml_ok and _pynvml is not None:
            try:
                _pynvml.nvmlShutdown()
            except Exception:
                pass
        httpd.server_close()


if __name__ == "__main__":
    main()

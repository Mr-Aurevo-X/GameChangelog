# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

"""SteamDB URL helpers (no scraping — SteamDB forbids automated access)."""

from __future__ import annotations


def patchnotes_url(appid: int) -> str:
    """Public patch notes page on SteamDB for manual cross-reference."""
    return f"https://steamdb.info/app/{int(appid)}/patchnotes/"


def app_url(appid: int) -> str:
    return f"https://steamdb.info/app/{int(appid)}/"

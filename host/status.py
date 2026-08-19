# Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Author: Mr-Aurevo-X | https://github.com/Mr-Aurevo-X

"""Service status probes (Downdetector-like) without scraping Downdetector."""



from __future__ import annotations



import time

from concurrent.futures import ThreadPoolExecutor, as_completed

from typing import Any

from urllib.error import HTTPError, URLError

from urllib.parse import quote

from urllib.request import Request, urlopen



USER_AGENT = (

    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "

    "(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 GameChangelog/1.0"

)



DOWNDETECTOR_STEAM_URL = "https://downdetector.fr/statut/steam/"



# Verified Downdetector slugs only — never invent via name slugify (404).

# FR path: /statut/<slug>/  ·  EN path: /status/<slug>/  (same slug).

_DOWNDETECTOR_SLUGS: dict[int, str] = {

    730: "counter-strike",

    570: "dota-2",

    440: "team-fortress-2",

    252950: "rocket-league",

    1172470: "apex-legends",

    359550: "rainbow-six",

    578080: "playbattlegrounds",

    271590: "gta5",

    1245620: "elden-ring",

    892970: "valheim",

    1623730: "palworld",

    1938090: "call-of-duty",

    945360: "among-us",

    236390: "war-thunder",

    230410: "warframe",

    381210: "dead-by-daylight",

    582010: "monster-hunter",

    553850: "helldivers-2",

}





def _probe(url: str, *, timeout: float = 8.0) -> dict[str, Any]:

    t0 = time.perf_counter()

    try:

        req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})

        with urlopen(req, timeout=timeout) as resp:

            _ = resp.read(256)

            ms = int((time.perf_counter() - t0) * 1000)

            code = int(getattr(resp, "status", 200) or 200)

            status = "ok" if 200 <= code < 400 else "degraded"

            return {"ok": True, "status": status, "http": code, "ms": ms, "error": None}

    except HTTPError as exc:

        ms = int((time.perf_counter() - t0) * 1000)

        code = int(exc.code or 0)

        status = "degraded" if code in (401, 403, 429) else "down"

        return {"ok": False, "status": status, "http": code, "ms": ms, "error": str(exc)}

    except (URLError, TimeoutError, OSError) as exc:

        ms = int((time.perf_counter() - t0) * 1000)

        return {"ok": False, "status": "down", "http": 0, "ms": ms, "error": str(exc)}





def downdetector_slug(appid: int) -> str | None:

    return _DOWNDETECTOR_SLUGS.get(int(appid))





def downdetector_url(appid: int, name: str = "") -> str:

    """Direct Downdetector page if known; otherwise Steam (never invent a slug)."""

    _ = name  # kept for call-site compatibility

    slug = downdetector_slug(appid)

    if not slug:

        return DOWNDETECTOR_STEAM_URL

    return f"https://downdetector.fr/statut/{quote(slug)}/"





def steam_bug_forum_url(appid: int) -> str:

    return f"https://steamcommunity.com/app/{int(appid)}/discussions/"





def steam_news_hub_url(appid: int) -> str:

    return f"https://store.steampowered.com/news/app/{int(appid)}/"





def check_steam_services() -> dict[str, Any]:

    targets = {

        "Steam Store": "https://store.steampowered.com/",

        "Steam Community": "https://steamcommunity.com/",

        "Steam API": "https://api.steampowered.com/ISteamWebAPIUtil/GetServerInfo/v1/",

        "Steam Login": "https://login.steampowered.com/",

    }

    services: list[dict[str, Any]] = []

    with ThreadPoolExecutor(max_workers=4) as pool:

        futures = {pool.submit(_probe, url): name for name, url in targets.items()}

        for future in as_completed(futures):

            name = futures[future]

            result = future.result()

            services.append({"name": name, **result})

    services.sort(key=lambda s: s["name"])

    downs = sum(1 for s in services if s.get("status") == "down")

    degraded = sum(1 for s in services if s.get("status") == "degraded")

    if downs:

        overall = "down"

    elif degraded:

        overall = "degraded"

    else:

        overall = "ok"

    return {

        "ok": True,

        "overall": overall,

        "checked_at": time.strftime("%Y-%m-%dT%H:%M:%S"),

        "services": services,

        "steamstatus_url": "https://steamstat.us/",

        "downdetector_steam_url": DOWNDETECTOR_STEAM_URL,

    }





def game_status_links(games: list[dict[str, Any]]) -> list[dict[str, Any]]:

    """Build Downdetector / Steam status links for watched games."""

    out: list[dict[str, Any]] = []

    for game in games:

        appid = int(game.get("appid") or 0)

        if appid <= 0:

            continue

        name = str(game.get("name") or f"App {appid}")

        exact = downdetector_slug(appid) is not None

        out.append(

            {

                "appid": appid,

                "name": name,

                "icon_url": game.get("icon_url") or "",

                "favorite": int(game.get("favorite") or 0) == 1,

                "installed": int(game.get("installed") or 0) == 1,

                "downdetector_exact": exact,

                "downdetector_url": downdetector_url(appid, name),

                "steam_discussions_url": steam_bug_forum_url(appid),

                "steam_news_url": steam_news_hub_url(appid),

            }

        )

    out.sort(key=lambda g: (not g["favorite"], g["name"].lower()))

    return out



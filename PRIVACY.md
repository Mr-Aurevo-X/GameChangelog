# Privacy Policy / GDPR — PC Command / Mr-Aurevo-X Suite

Publisher: Mr-Aurevo-X · Product: {{PRODUCT}}  
Copyright (c) 2026 Mr-Aurevo-X. All rights reserved.

## 1. Publisher collection: none

Mr-Aurevo-X does **not** collect personal data on its servers. There is **no** analytics tracker, **no** crash-reporting telemetry, **no** user account, and **no** background data mining operated by the publisher.

Because the publisher does not gather, process, store, or transmit personal data to any Mr-Aurevo-X server, GDPR rights that assume a publisher-side filing (access / erasure on our servers) do not apply. You may uninstall the software and delete local settings at any time.

## 2. Architecture: local-first

Execution is **local-first** on your machine (Python + WebView2). Preferences live in the install folder and/or `%LOCALAPPDATA%\Mr-Aurevo-X`. Tool outputs are stored where you save them.

The Suite as a whole is **not** advertised as “100% local”: some modules can use the network when **you** use them. Showcase apps that never call the network may state “100% local” in their own README.

## 3. Network exceptions (not publisher telemetry)

| Component | Why | With whom |
|-----------|-----|-----------|
| Hub release notice | Compare local version to GitHub Latest (no download) | `api.github.com` |
| Trad-X | Translation you request | Google Translate via `deep_translator` — **text leaves this PC** |
| RoadWay-X reputation | Opt-in lookup | URLhaus / AbuseIPDB (plus browser links to VirusTotal / Talos) |
| NetAdmin / NetMap tests | Diagnostics you start | Hosts **you** type |
| Local metrics dashboard | Live KPIs on Accueil | `127.0.0.1` only |
| Discord / PayPal / Revolut buttons | Optional contact or donation | Those operators’ sites and privacy policies |

WifiKey shows keys already on the PC; they are not sent to Mr-Aurevo-X. Clipboard / cleanup / uninstall stay on local paths you confirm.

## 4. Support links

Opening Discord, PayPal, or Revolut is a **user-initiated** navigation. Those services process data under their own policies. This is not Mr-Aurevo-X telemetry.

## 5. Contact

GitHub organization: https://github.com/Mr-Aurevo-X  
Discord (optional): https://discord.com/users/406891052516114442

# Security Policy — GameChangelog

## Scope (EN)

**GameChangelog** is a **local Windows** desktop app (Python + WebView2).  
There is **no** Mr-Aurevo-X backend, **no** account, and **no** telemetry.

Your watchlist, changelog cache and bug notes stay in `%LOCALAPPDATA%\ChangeLog-Central\`.  
They are **not** sent to Mr-Aurevo-X.

Outbound network (when it happens):
- Steam APIs you trigger (store search, news, events, names, server status)
- **Optional** read-only GitHub **Latest release** check (opt-out in About)
- Browser opens you start: Steam / SteamDB / Downdetector / Releases
- Support links (Discord / PayPal / Revolut) only when you click

Official builds: only Releases on **https://github.com/Mr-Aurevo-X/GameChangelog** (`GameChangelog.zip`).  
Forks / modified copies are **not** covered by this policy.

## Périmètre (FR)

App **locale** Windows. Pas de serveur Mr-Aurevo-X, pas de compte, pas de télémétrie.  
Listes et cache : `%LOCALAPPDATA%\ChangeLog-Central\` — **pas** envoyés à l’éditeur.

Sorties réseau possibles :
- API Steam que **tu** lances (recherche, news, events, noms, statut)
- vérif. version GitHub **désactivable** (À propos) — lecture seule, **rien** ne se télécharge tout seul
- pages Steam / SteamDB / Downdetector / Releases **au clic**
- dons / Discord **au clic**

Builds officielles uniquement : Releases de ce dépôt. Les forks modifiés ne sont **pas** couverts.

## Threat model

**In scope:** issues in **this** repository’s code / official zip that could lead to unexpected network egress, path traversal, command injection, or reading local data **beyond** the intended Steam / GitHub calls.

**Out of scope:** malware already on the machine, fake downloads from third parties, Windows / SmartScreen on unsigned binaries, Steam / Downdetector / GitHub outages, misuse of features you explicitly start (opening a store page, syncing Steam, checking status).

**Dans le périmètre :** failles de **ce** dépôt / zip officiel (sortie réseau inattendue, traversal, injection, fuite locale hors usage prévu).  
**Hors périmètre :** malware déjà présent, faux zip ailleurs, SmartScreen (binaire non signé), pannes Steam / GitHub, actions que tu lances volontairement.

## Reporting / Signalement

Prefer a **private GitHub Security Advisory** on this repository:  
https://github.com/Mr-Aurevo-X/GameChangelog/security/advisories/new

Do **not** open a public issue or pull request with exploit details.  
This repo is a **read-only** distribution (`CONTRIBUTING.md`) — a private advisory is the **only** accepted security channel.

Préférez une **advisory privée** GitHub. Ne publiez pas de détails d’exploit en issue / PR.  
Dépôt en **lecture seule** : l’advisory privée est le **seul** canal sécurité accepté.

## Hardening (high level)

- Support / GitHub release hosts are allowlisted in code
- Downdetector / status links are restricted to known hosts
- No in-app download or install from GitHub

## Dependencies

Review Dependabot / dependency alerts on this repo when enabled.  
No auto-install of app updates.

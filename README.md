# Game Changelog

Distribution **lecture seule**. Pas de pull requests ni d'issues (`CONTRIBUTING.md`). Licence PolyForm Noncommercial 1.0.0. Éditeur : **Mr-Aurevo-X**.

Standalone Lab (comme `Opti/`, `Track/`) — SoT : **`Dev Central Tree/GameChangelog/`**.

Lancement depuis la racine du tree : `Lancer-GameChangelog.cmd`

Application Windows pour suivre les patch notes de vos jeux Steam.

## FonctionnalitÃ©s

- Recherche de jeux sur le Steam Store
- Liste de jeux suivis
- RÃ©cupÃ©ration automatique des changelogs au lancement
- Fusion des sources Steam News + Steam Events sans doublons
- Fil chronologique avec dÃ©tail des patch notes

## Lancer (SoT)

```cmd
Lancer.cmd
```

Windows peut afficher « potentiellement dangereux » : les binaires ne sont pas signés Authenticode (pas de certificat éditeur payant). C'est un avertissement de réputation SmartScreen, pas un verdict antivirus.

`Lancer.cmd` exÃ©cute **`python host\host.py`** quand Python est disponible (sources Ã  jour).
Sinon fallback sur `GameChangelog.exe` (build PyInstaller â€” relancer `Build.cmd` aprÃ¨s des changements UI/host).

Ã‰quivalent manuel :

```bash
pip install -r requirements.txt
python host/host.py
```

## Build

```bash
Build.cmd
```

Le binaire `GameChangelog.exe` est copiÃ© Ã  la racine du projet.

## DonnÃ©es locales

Les jeux suivis et le cache des changelogs sont stockÃ©s dans :

`%LOCALAPPDATA%\ChangeLog-Central\`

## SteamDB

[SteamDB](https://steamdb.info/) n'expose **pas d'API publique** et interdit le scraping automatisÃ© (rÃ©ponses 403). Son flux RSS patch notes est fortement mis en cache et n'est pas prÃ©vu pour la surveillance automatique.

L'app rÃ©cupÃ¨re les changelogs via les **API Steam officielles** (News + Events). Un bouton **Â« Voir sur SteamDB Â»** ouvre la page patch notes du jeu dans le navigateur pour consultation manuelle.
---

Rêvée par **Mr-Aurevo-X**. Cursor a réalisé le rêve.

[Discord](https://discord.com/users/406891052516114442) · [PayPal](https://www.paypal.com/paypalme/aurevo1) · [Revolut](https://revolut.me/mr_aurevo_x)

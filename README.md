# Game Changelog

Distribution **lecture seule**. Pas de pull requests ni d'issues (`CONTRIBUTING.md`). Licence PolyForm Noncommercial 1.0.0. Éditeur : **Mr-Aurevo-X**.

Standalone Lab (comme `Opti/`, `Track/`) — SoT : **`Dev Central Tree/GameChangelog/`**.

Lancement depuis la racine du tree : `Lancer-GameChangelog.cmd`

Application Windows pour suivre les patch notes de vos jeux Steam.

## Fonctionnalités

- Recherche de jeux sur le Steam Store
- Liste de jeux suivis
- Récupération automatique des changelogs au lancement
- Fusion des sources Steam News + Steam Events sans doublons
- Fil chronologique avec détail des patch notes

## Où s’installe

| Mode | Emplacement |
|------|-------------|
| **Release** (`GameChangelog.zip`) | Dossier **portable** : extrayez le zip où vous voulez, lancez `GameChangelog.exe` depuis ce dossier (gardez le contenu du zip ensemble). |
| **Données** (jeux suivis, cache) | `%LOCALAPPDATA%\ChangeLog-Central\` |
| **Dev (sources)** | Clone `03_Standalones\GameChangelog\` (ou junction tree) + `Lancer.cmd` / `Lancer-GameChangelog.cmd` à la racine du tree |

Téléchargement : [Releases GameChangelog](https://github.com/Mr-Aurevo-X/GameChangelog/releases).

## Lancer (SoT)

```cmd
Lancer.cmd
```

Windows peut afficher « potentiellement dangereux » : les binaires ne sont pas signés Authenticode (pas de certificat éditeur payant). C'est un avertissement de réputation SmartScreen, pas un verdict antivirus.

`Lancer.cmd` exécute **`python host\host.py`** quand Python est disponible (sources à jour).
Sinon fallback sur `GameChangelog.exe` (build PyInstaller — relancer `Build.cmd` après des changements UI/host).

Équivalent manuel :

```bash
pip install -r requirements.txt
python host/host.py
```

## Build

```bash
Build.cmd
```

Le binaire `GameChangelog.exe` est copié à la racine du projet.

## Données locales

Les jeux suivis et le cache des changelogs sont stockés dans `%LOCALAPPDATA%\ChangeLog-Central\` (voir tableau « Où s’installe » ci-dessus).

## SteamDB

[SteamDB](https://steamdb.info/) n'expose **pas d'API publique** et interdit le scraping automatisé (réponses 403). Son flux RSS patch notes est fortement mis en cache et n'est pas prévu pour la surveillance automatique.

L'app récupère les changelogs via les **API Steam officielles** (News + Events). Un bouton **« Voir sur SteamDB »** ouvre la page patch notes du jeu dans le navigateur pour consultation manuelle.
---

Rêvée par **Mr-Aurevo-X**. Cursor a réalisé le rêve.

[Discord](https://discord.com/users/406891052516114442) · [PayPal](https://www.paypal.com/paypalme/aurevo1) · [Revolut](https://revolut.me/mr_aurevo_x)

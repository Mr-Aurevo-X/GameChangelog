# Game Changelog

Application Windows pour suivre les patch notes de vos jeux Steam.

## Fonctionnalités

- Recherche de jeux sur le Steam Store
- Liste de jeux suivis
- Récupération automatique des changelogs au lancement
- Fusion des sources Steam News + Steam Events sans doublons
- Fil chronologique avec détail des patch notes

## Lancer en développement

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

Les jeux suivis et le cache des changelogs sont stockés dans :

`%LOCALAPPDATA%\NewsGameChangelog\`

## SteamDB

[SteamDB](https://steamdb.info/) n'expose **pas d'API publique** et interdit le scraping automatisé (réponses 403). Son flux RSS patch notes est fortement mis en cache et n'est pas prévu pour la surveillance automatique.

L'app récupère les changelogs via les **API Steam officielles** (News + Events). Un bouton **« Voir sur SteamDB »** ouvre la page patch notes du jeu dans le navigateur pour consultation manuelle.

# UI proprietaire — PC Command design kit

Source of truth for the Mr-Aurevo-X / L'Atelier Windows visual system.

**Not** an npm/NuGet package: apps vendor a **file copy** only (PyInstaller-friendly). Never symlink or junction `pc-command-kit` into apps.

Hub sync: `..\scripts\Sync-All-UiKit.ps1`. Health: `..\scripts\Assert-UiKitStructure.ps1` + `Assert-UiKitCoverage.ps1`.

| | |
|--|--|
| **VERSION** | see root `VERSION` |
| **Theme apply** | `components/settings-panel.js` → `applyTheme(theme, targetDoc)` |

## Layout

| Path | Role |
|------|------|
| `tokens/` | CSS variables (`base.css`, `kit.css`), `theme-schema.json` |
| `tokens/presets/*.json` | **Canonical** palette SoT per preset |
| `tokens/presets/manifest.json` | Preset catalog + color key contract |
| `components/` | Shell, settings panel (`applyTheme`), craft, dashboard, tool-chrome, **hub-about** |
| `docs/ABOUT-CONTRACT.md` | Règle À propos / légal / chemins locaux par produit |
| `fonts/` | Outfit + JetBrains Mono (local woff2) |
| `brand/` | PC Command icon (ico/png) |
| `scripts/sync-ui-kit.ps1` | Copy kit → `ui/vendor/pc-command-kit/` |
| `scripts/Sync-PresetsIntoSettingsPanel.ps1` | Rebuild embedded `PRESETS` from JSON SoT |

## Theme / presets

User overrides: `%APPDATA%\Mr-Aurevo-X\atelier-theme.json`  
Schema: `tokens/theme-schema.json`

**Contract:** JSON under `tokens/presets/` is SoT. After editing a preset, run:

```powershell
.\scripts\Sync-PresetsIntoSettingsPanel.ps1
```

Then hub `.\scripts\Sync-All-UiKit.ps1` to fan-out vendors.

### Presets

- `void-glow` (default) — title bar minimale, glow only
- `pc-command` — cyber command center, accent `#e03545`
- `soft-glass` — softer panels, lower glow
- `neon-precision` — stronger cyan/amber telemetry accents
- `graphite-minimal` — flat graphite chrome, muted cyan, low glow
- `amber-ops` — warm ops desk, amber telemetry + brand red

`applyTheme` merges preset defaults with overrides, sets `html[data-preset]` / `body.theme-*`, and writes CSS variables `--bg`, `--panel`, …

## Dev vs release

- **Dev:** apps may resolve sibling `..\..\UI proprietaire\` (or env `PC_COMMAND_KIT`).
- **Release:** always a real directory copy under `ui/vendor/pc-command-kit` (no reparse points).

## À propos / légal / chemins

Contract for hubs: [`docs/ABOUT-CONTRACT.md`](docs/ABOUT-CONTRACT.md).

```js
PcCommandAbout.wire({
  title: "À propos — Hub System",
  blurb: "…",
  repoUrl: "https://github.com/Mr-Aurevo-X/Hub-Systeme",
  openBtn: "#btnAbout",
  dialog: "#aboutDialog",
});
```

Legal markdown SoT remains **LegalHelpers** (`Sync-All-LegalHelpers.ps1`). Paths SoT: **HostHelpers** `about_local_paths` (never monorepo).

## Notes

- See `docs/REFRACTOR-PLAN.md` (Vague 3) and `docs/CORE-CONTRACT.md`.
- Void Glow is the default preset (`tokens/presets/void-glow.json`).

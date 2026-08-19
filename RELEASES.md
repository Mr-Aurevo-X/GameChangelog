# Release channels

Official hub / suite binaries ship through GitHub Releases:

**https://github.com/Mr-Aurevo-X/MrAurevoX-Launcher**  
(also `Mr-Aurevo-X/PCCommand-Releases` — same channel)

Packs are **`Launch-Hub-*.zip` per hub**. There is no monolithic `Hubs.zip`.

## Stable

Production tags on the default branch. GitHub “Latest” non-prerelease. Use this unless you are testing.

## Beta

Prerelease tags named `*-beta.*` (GitHub prerelease flag). Expect breakage. Not for daily machines.

## Nightly / Dev

Convention only: `nightly-YYYYMMDD`. No public automated nightly pipeline in this inner-source model. Dev builds stay with the owner.

## Isolation

Pin Python dependencies (`requirements.txt` with `==`) and run under Windows Sandbox when you want the build to outlive host OS churn. See `ISOLATION.md`.

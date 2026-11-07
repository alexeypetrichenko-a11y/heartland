# Heartland — Implementation Status

**Snapshot date:** 2026-11-07  
**Source:** Read-only inspection of the current GitHub `main` repository and `README.md`. This file is an initial proposed status baseline, not a code audit or executed test report.

## Verified existing scaffold

- [x] GitHub repository exists.
- [x] `AGENTS.md` exists with Codex change-control rules.
- [x] React + TypeScript + Vite application and build script configured.
- [x] GitHub Pages deployment workflow and `/heartland/` base path configured.
- [x] Responsive starting screen described in README.

## Not verified as implemented / pending

- [ ] Region map and country selection.
- [ ] Weekly simulation and autonomous AI.
- [ ] Economy, ground forces and diplomacy.
- [ ] Actual playable match and final score.
- [ ] Save/resume gameplay.
- [ ] Multiplayer invite links, synchronization, pause.
- [ ] Offline-capable installable PWA.

## Immediate next step

1. Complete T00: add `GAME_DESIGN.md`, `TASKS.md` and this `STATUS.md` to the repository in a dedicated PR.
2. Then assign **T01 only** to Codex.

## Verification required

`npm run build` was **not** executed for this documentation snapshot. Last live site deployment status was **not** independently checked during this preparation.

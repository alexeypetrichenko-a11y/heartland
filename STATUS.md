# Heartland — Implementation Status

**Snapshot date:** 2026-11-07  
**Source:** Repository inspection and local T01 build/browser checks on 2026-11-07.

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

## T01 — Accessible prototype view

- [x] Existing title and subtitle preserved, with an Open local prototype button.
- [x] Local prototype view includes Country, Week, Orders and Status placeholders.
- [x] Clear notice that gameplay is not implemented; return button reaches the title screen.
- [x] Keyboard navigation, focus on view changes, touch-sized buttons and responsive safe-area spacing.
- [x] No game engine, map data or additional gameplay features added.

## Immediate next step

T01 is complete on its dedicated branch. T02 remains pending and requires a separate assignment.

## Verification required

- `npm run build`: passed (TypeScript check and Vite production build).
- Chromium checks at 320×568, 390×844 and 1440×900: title/prototype round trip, HUD labels, keyboard focus/navigation, touch return, minimum 44px button height, no horizontal overflow and no runtime errors all passed.
- Browser checks used the production preview at `/heartland/`. Real iPhone/Safari testing remains for the owner.
- The first dependency install failed because the default npm cache was not writable; installation succeeded with a temporary cache. No dependency files changed.
- GitHub Pages workflow and Vite base path are unchanged. Live deployment was not independently verified.

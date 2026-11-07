# Heartland — Implementation Status

**Snapshot date:** 2026-11-07  
**Source:** Repository inspection, prior T01/T02 verification, and local T03 tests/build/Chromium checks on 2026-11-07.

## Verified existing scaffold

- [x] GitHub repository exists.
- [x] `AGENTS.md` exists with Codex change-control rules.
- [x] React + TypeScript + Vite application and build script configured.
- [x] GitHub Pages deployment workflow and `/heartland/` base path configured.
- [x] Responsive starting screen described in README.

## Not verified as implemented / pending

- [x] Illustrative region map with region selection (T03).
- [ ] Player country selection (T04).
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

## T02 — Typed state and fictional test world

- [x] Pure TypeScript models in `src/game/models.ts` for countries, regions, economy, relations, divisions, week, player selection, AI ownership and seed; no React imports.
- [x] `createInitialState()` in `src/game/initialState.ts` returns fresh, deterministic JSON-compatible data: Alden, Belora and Cyrin, six named regions with reciprocal adjacency, three neutral relations and three divisions.
- [x] Initial week is 1, seed is 2401, and player selection is null. Countries have AI ownership labels only; no AI behavior runs.
- [x] Economy numbers and division headcounts are explicitly temporary fixture values; no economic, combat or diplomatic rules are implemented.
- [x] Six focused tests in `src/game/initialState.test.ts` verify references/ownership, unique IDs, connected reciprocal adjacency, complete neutral relations, stable initialization, independent copies and JSON round trips (including a manually represented player selection).
- [x] `npm test` uses Node's built-in test runner and TypeScript stripping; no dependencies added. TypeScript permits explicit `.ts` imports for this runner.
- [x] T01 application/UI files and GitHub Pages configuration unchanged.

## Immediate next step

T03 is implemented on `task/t03-interactive-map` and locally verified; owner review/approval is required before merging. Test it on a real iPhone/Safari. T04 requires a separate assignment; player country selection remains unimplemented.

## Verification

- `npm run build`: passed (TypeScript check and Vite production build).
- Chromium checks at 320×568, 390×844 and 1440×900: title/prototype round trip, HUD labels, keyboard focus/navigation, touch return, minimum 44px button height, no horizontal overflow and no runtime errors all passed.
- Browser checks used the production preview at `/heartland/`. Real iPhone/Safari testing remains for the owner.
- The first dependency install failed because the default npm cache was not writable; installation succeeded with a temporary cache. No dependency files changed.
- GitHub Pages workflow and Vite base path are unchanged. Live deployment was not independently verified.

### T02 validation

- `npm test`: passed, 6 tests, 0 failures on Node 24.22.1.
- `npm run build`: passed (TypeScript check, including tests, and Vite production build).
- No new browser/iPhone checks were run for T02 because UI source is unchanged; prior T01 checks above remain historical evidence, not a new device verification.
- Serialization is verified in memory only; save/load storage, runtime validation of imported saves, simulation and gameplay remain unimplemented.

## T03 — Interactive fictional region map

- [x] `App.tsx` creates the existing T02 fixture once and passes it through `PrototypePage.tsx` to the new `src/ui/RegionMap.tsx`. Game models and fixture data are unchanged.
- [x] Six labeled SVG polygons use distinct colors for Alden, Belora and Cyrin, with a named country legend. Illustrative shared edges match the fixture's adjacency; no mapping library or dependency added.
- [x] Touch or mouse selection marks one region with a dashed border. The details panel displays its name, owning country and neighboring region names from the fixture. No demographic/resource details were invented.
- [x] Each region is a focusable button with an accessible name and pressed state. Tab/Shift+Tab navigate; Enter/Space select. Keyboard focus has a visible border, and details have a polite live region.
- [x] Map scales to the available width. Details stack below it on small screens and sit beside it on desktop; existing iPhone safe-area spacing, title navigation and placeholder HUD are preserved.
- [x] Only T03 implemented. No player-country selection, turns, economic simulation, combat, AI behavior, multiplayer, PWA or deployment changes.

### T03 validation and limitations

- `npm test`: passed, all 6 existing fixture tests, 0 failures.
- `npm run build`: passed (TypeScript check and Vite production build).
- Automated Playwright/Chromium checks against the production preview at `/heartland/`: passed at 320×568, 390×844, 844×390 and 1440×900. Every region was selected using touch emulation on the first three sizes and mouse on desktop; names, owners, neighbor lists, country colors, single selection, minimum 44px target bounds, map width and absence of horizontal overflow were checked.
- Keyboard checks at all four sizes passed: complete region Tab order, visible focus, Enter/Space activation, focus alone preserving selection, return to title and focus restoration. Existing HUD labels and fresh empty selection after reopening the prototype were checked.
- No JavaScript runtime errors or application asset failures. Chromium reported the existing missing `/favicon.ico` (404); the baseline has no favicon. This warning remains unchanged.
- Screenshots were visually inspected at small-screen and desktop sizes. Browser checks use Chromium touch emulation, not a physical iPhone or Safari/WebKit; real-device touch, safe areas and VoiceOver remain unverified.
- The map is a static fictional illustration with native page scrolling/browser zoom, no custom pan/zoom. Selection is inspection only and resets when leaving the prototype. Details are limited to the region fields available in T02; no simulation or persistence is implemented.

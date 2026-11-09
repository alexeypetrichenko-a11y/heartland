# Heartland — Implementation Status

**Snapshot date:** 2026-11-09
**Source:** Repository inspection, prior T01–T04 verification, and local T05 tests/build/Chromium checks on 2026-11-09.

## Verified existing scaffold

- [x] GitHub repository exists.
- [x] `AGENTS.md` exists with Codex change-control rules.
- [x] React + TypeScript + Vite application and build script configured.
- [x] GitHub Pages deployment workflow and `/heartland/` base path configured.
- [x] Responsive starting screen described in README.

## Current implementation and pending work

- [x] Illustrative region map with region selection (T03).
- [x] Player country selection and static national dashboard (T04).
- [x] Manual weekly turn progression and inert standing-order persistence (T05).
- [ ] Economic/military simulation and autonomous AI.
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

T04 is merged into `main` (PR #8). T05 is implemented on `task/t05-weekly-turn-engine` and locally verified; its dedicated PR awaits owner review. Test it on a real iPhone/Safari. T06 requires a separate assignment; economic simulation remains unimplemented.

The T01–T04 sections below retain their historical verification scope; T05 records the current additions.

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

## T04 — Player country selection and national dashboard

- [x] Choose Alden, Belora or Cyrin and press **Start local scenario**. A choice is required; exactly one country is player-controlled and the other two are AI-controlled labels, with no AI behavior.
- [x] `src/game/selectCountry.ts` performs the selection as a pure state update, validates the country ID, preserves fixture/world statistics and leaves the original state unchanged. T02 models and fixture are unchanged.
- [x] `src/app/App.tsx` holds the selected state in memory. Returning to the title and reopening retains the country; reloading clears it. No save/load feature is implied.
- [x] `src/ui/PrototypePage.tsx` displays the selected name, initial week, owned regions, treasury, weekly income/expenses, division count, and each owned division's name, location and headcount. Values are explicitly labeled temporary static fixture data with illustrative economic units.
- [x] Native labeled country selector, disabled start before selection, dashboard focus after starting, touch-sized controls and responsive styles in `src/ui/styles.css`.
- [x] Existing T03 `RegionMap` is reused unchanged, including country colors, all six tappable/keyboard-accessible regions, owner and neighbor details. Map inspection does not change the player country.
- [x] Clear local single-player/prototype wording. No weekly simulation, economic calculations, combat, diplomacy, AI behavior, multiplayer or new dependencies. Deployment configuration and base path remain unchanged.

### T04 validation and limitations

- `npm test`: passed, 8 tests, 0 failures (6 existing fixture tests and 2 focused country-selection tests). New tests cover all three choices, exactly one player/two AI controllers, unchanged world/statistics, original-state preservation, JSON serialization, replacement choice and invalid IDs.
- `npm run build`: passed (TypeScript check and Vite production build).
- Playwright with installed Chromium against the production preview at `/heartland/`: passed at 320×568, 390×844, 844×390 and 1440×900. All three countries were started at every size; displayed statistics, owned regions, military details and controller labels matched the fixture.
- Touch emulation on the first three sizes and mouse on desktop verified all six map regions. Keyboard country selection/start, dashboard focus, map Enter/Space activation, title navigation, in-memory country retention, region-selection reset on reopening, country reset on reload, minimum 44px form/button targets, no horizontal overflow and no JavaScript runtime errors passed.
- Small-screen and desktop screenshots were visually inspected. These are Chromium checks, not physical iPhone/Safari/VoiceOver verification; owner real-device testing remains pending. Live GitHub Pages deployment was not independently verified.
- An initial browser-check script used an unreliable native select popup key sequence. The check was corrected to use native keyboard typeahead; the complete suite then passed. No application changes were needed for this test-script issue.

## T05 — Deterministic weekly turns and standing orders

- [x] Pure TypeScript `advanceTurn(state, commands = [])` in `src/game/advanceTurn.ts`, independent of React. Each successful call returns a new state exactly one week later; a selected player country is required. Invalid/overflowing week values are rejected.
- [x] `StandingOrder` and `TurnCommand` types in `src/game/models.ts`; `createInitialState()` now includes an empty `standingOrders` array. Existing fictional statistics, seed and ownership data are unchanged.
- [x] Minimal, explicitly temporary `placeholder` orders contain ID, country ID and an inert label. These test order lifecycle only and have no economic, military or other gameplay effects. No gameplay order types or order-editing UI are introduced.
- [x] `set-standing-order` inserts/replaces an order by ID; `cancel-standing-order` removes it. Commands are processed in array order. Unchanged orders persist across turns; only the selected player can change their orders. Unknown/AI-country commands, malformed/unsupported commands, foreign order IDs and missing cancellation targets are rejected.
- [x] Rejected command batches throw without advancing time or mutating the input state/commands, even after earlier valid commands. Commands are not stored as standing orders. No random source is used; the seed is preserved.
- [x] `App.tsx` calls the engine through a functional state update. `PrototypePage.tsx` adds a touch-sized **Next week** button after country selection, shows the current week with a polite live announcement, and explains that only time advances. Existing responsive styles and safe-area spacing are reused.
- [x] Country selection, dashboard, controller labels and unchanged T03 interactive map are preserved. Country/week remain in memory through title navigation and reset on reload.
- [x] T05 only: no economic calculations, movement/combat, diplomacy, AI behavior, real-time timer, multiplayer, persistence storage, dependencies or deployment changes.

### T05 validation and limitations

- `npm test`: passed, 16 tests, 0 failures (8 existing tests and 8 focused engine tests). Covers repeated exact one-week increments for all countries, unchanged world statistics, selection/week guards, order persistence/replacement/cancellation, ordered batches, runtime command validation and ownership, atomic rejection, frozen-input immutability and deterministic replay including JSON round trips.
- `npm run build`: passed (TypeScript check and Vite production build). `git diff --check`: passed.
- Production-preview Playwright/Chromium checks at `/heartland/`: passed at 320×568, 390×844, 844×390 and 1440×900. All three countries advanced from week 1 to week 8 at every size; touch/mouse and keyboard Enter/Space activation advanced exactly once per activation, with unchanged dashboard statistics and country control.
- Browser checks also passed for all six map regions, map keyboard activation, selected region retained across a turn, title navigation retaining week/country, reload resetting selection, minimum 44px Next week target height, no horizontal overflow and no JavaScript runtime errors. Small-screen and desktop screenshots were visually inspected.
- Physical iPhone/Safari/VoiceOver and live GitHub Pages deployment remain unverified. Order lifecycle is tested through the engine API only; no gameplay order controls or effects exist. Turns are manual, local and in memory; this is not yet a complete playable simulation or save/load system.

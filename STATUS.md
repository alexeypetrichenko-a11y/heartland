# Heartland — Implementation Status

**Snapshot date:** 2026-11-09
**Source:** Repository inspection, prior T01–T06 verification, and local T07 tests/build/Chromium checks on 2026-11-09.

## Verified existing scaffold

- [x] GitHub repository exists.
- [x] `AGENTS.md` exists with Codex change-control rules.
- [x] React + TypeScript + Vite application and build script configured.
- [x] GitHub Pages deployment workflow and `/heartland/` base path configured.
- [x] Responsive starting screen described in README.

## Current implementation and pending work

- [x] Illustrative region map with region selection (T03).
- [x] Player country selection and national dashboard (T04, economy updated in T06).
- [x] Manual weekly turn progression and inert standing-order persistence (T05).
- [x] Minimal weekly treasury simulation and persistent tax policy (T06).
- [x] Minimal land-division movement, defence, combat and territorial capture (T07).
- [ ] Full economy/military systems, diplomacy and autonomous AI.
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

T06 is merged into `main` (PR #10). T07 is implemented on `task/t07-land-orders` and locally verified; owner review is required before merging. Test it on a real iPhone/Safari. T08 requires a separate assignment; diplomacy and autonomous AI remain unimplemented. The interface redesign is deferred until after T08.

The T01–T06 sections below retain their historical verification scope; T07 records the current additions.

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

## T06 — Minimal weekly economy and treasury feedback

- [x] Reuses the deterministic `advanceTurn` engine. Each successful week settles all three countries' fixed budgets once, including AI-labeled countries without adding AI decisions. Country selection, regions, map, divisions, controller labels and placeholder order lifecycle are preserved.
- [x] Pure `src/game/economy.ts` calculates effective income, expenses and balance, and resolves treasury. `src/game/models.ts` adds one `EconomicPolicy` setting to each country and a validated `set-economic-policy` turn command; `src/game/initialState.ts` starts every country at standard taxation.
- [x] Only the selected player can change their policy. Commands apply in array order before budget settlement; the final policy persists across empty turns and JSON round trips. Existing `weeklyIncome` remains base income, so the policy adjustment never compounds.
- [x] `src/ui/PrototypePage.tsx` displays treasury, effective weekly income, expenses, weekly balance, active policy and its numeric income effect. A labeled, touch-sized native selector stages the next week's policy; a pending-policy message distinguishes it from the active policy. The choice applies when **Next week** successfully resolves.
- [x] Insufficient funds explicitly reject the entire turn: week, all countries, active policy and standing orders stay unchanged. The error names the country, treasury, income, expenses and shortfall. `src/app/App.tsx` catches errors and shows an alert, allowing a retry with an affordable policy. Zero treasury is valid. No negative treasury, borrowing, unpaid bills or automatic policy reset.
- [x] Updated `src/game/advanceTurn.test.ts` for weekly economic changes while preserving its progression, order lifecycle, validation, immutability and replay coverage. Added nine focused tests in `src/game/economy.test.ts`.
- [x] No dependencies, deployment configuration, GitHub Pages base path or approved `GAME_DESIGN.md` rules changed. Only T06 is implemented.

### Provisional economic parameters and rules

All figures and formulas here are **prototype-only, reversible demo assumptions** for the fictional test world, not final balance, real currency, or implementation of the full economic design.

| Country | Starting treasury | Base weekly income | Fixed weekly expenses | Standard weekly balance | Tax-relief income | Tax-relief weekly balance |
|---|---:|---:|---:|---:|---:|---:|
| Alden | 100 | 12 | 8 | +4 | 6 | -2 |
| Belora | 90 | 11 | 7 | +4 | 5 | -2 |
| Cyrin | 110 | 13 | 9 | +4 | 7 | -2 |

- The starting treasury, income and expenses reuse the T02 fixture without rebalance. Amounts use whole illustrative units; invalid negative, fractional, non-finite or unsafe integer inputs and treasury overflow are explicitly rejected.
- One tax policy has two settings: **Standard taxation** reduces base income by 0; **Tax relief** reduces it by 6 units each week, with a floor of zero. The reduction is defined in `ECONOMIC_POLICIES` in `src/game/economy.ts`. There is no separate social, growth or political benefit in T06.
- Effective income = `max(0, base weekly income - policy reduction)`; weekly balance = `effective income - fixed weekly expenses`; next treasury = `current treasury + weekly balance`. The same week's income can pay that week's expenses; there is no rounding or randomness.
- If any country's calculated treasury would be negative, the whole week fails atomically. This is a temporary no-debt rule for T06, not a sovereign default or defeat mechanic. Standard taxation yields +4 for each fixture country and permits recovery from an exhausted treasury. The AI-labeled countries retain their standard policy without decisions.
- The active policy, treasury and week survive title navigation in memory. Reload resets the scenario. An unapplied selector choice is only a draft and resets to the active policy when leaving the prototype; it is not a saved order.

### T06 validation and limitations

- `npm test`: passed, **25 tests, 0 failures** (16 existing tests, with the progression expectation updated, plus 9 new economic tests). Covers all three countries' standard and tax-relief budgets, non-compounding policy persistence/replacement, income floor, current-week income funding, exact-zero treasury, insufficient funds and recovery, atomic rejection including pending commands and another country's shortfall, invalid amounts/overflow, runtime command validation/ownership, and deterministic replay including failed turns and JSON round trips.
- `npm run build`: passed (TypeScript check and Vite production build). `git diff --check`: passed.
- Automated Playwright/Chromium against the production preview at `/heartland/`: passed for all three selected countries at **320×568, 390×844, 844×390 and 1440×900**. Touch/mouse policy changes, staged versus active policy, weekly numbers, persistence through turns/title navigation, restoration of standard taxation, keyboard selector and Next week activation, country reset on reload, all six map regions/owners, retained map selection across a turn, unchanged division details, minimum 44px policy/turn controls and no horizontal overflow were checked.
- At 390×844, 50 tax-relief weeks exhausted Alden's treasury exactly. The next press displayed the shortfall without advancing week 51 or changing treasury/policy; selecting standard taxation then advanced to week 52 with treasury 4 and cleared the error. No JavaScript runtime errors or application asset failures occurred. Small-screen, desktop and insufficient-funds screenshots were visually inspected.
- These are Chromium touch-emulation checks; physical iPhone/Safari/VoiceOver and live GitHub Pages deployment remain unverified. No markets, resources beyond treasury, industry, debt, military actions, diplomacy, AI behavior, multiplayer, storage or PWA were added. The local prototype remains incomplete beyond T06.

## T07 — Minimal land-division orders and combat

- [x] Reuses the existing TypeScript division/region models and deterministic `advanceTurn` engine. `src/game/models.ts` adds typed move/defend/attack orders, `set-military-order` commands and latest-week military results. `src/game/initialState.ts` reuses the three existing 1,000-person divisions, initially defending their current regions, with no initial combat results.
- [x] Pure `src/game/military.ts` normalizes runtime orders, validates division ownership/availability, friendly origin, target existence, adjacency and friendly/enemy target ownership, then resolves orders during weekly processing. Invalid new commands reject the entire batch, including earlier policy/order changes, with no change to the input state or commands.
- [x] Commands are validated and applied to staged state in array order; the last valid command for a division replaces its earlier order. Budgets settle before military outcomes within the same atomic turn. An economic or military failure leaves week, treasury, policies, divisions, territory and results unchanged.
- [x] Friendly moves complete in one week and become Defend. Defend persists and stops an ongoing attack. Unfinished attacks persist across empty turns; capture or destruction completes the attack. Obsolete standing orders (for example, an attack whose target another friendly unit captured) are cancelled with a visible reason and become Defend.
- [x] `src/ui/MilitaryPanel.tsx` adds native labeled division/order/adjacent-target selectors, staging/discard controls, division locations/headcounts/active orders, and latest-week movement/combat/cancellation results. Only player-owned divisions can be selected; zero-personnel units are disabled. Staged commands are separate from active orders, retained after a failed turn and cleared after success.
- [x] `src/ui/PrototypePage.tsx` submits staged military commands and the chosen tax policy together with Next week. `src/app/App.tsx` reports success/failure so rejected turns retain their staged orders. Existing responsive controls, safe-area styles and overall layout are reused without a redesign.
- [x] Existing `RegionMap.tsx` already reads ownership from game state: captures update country color, accessible owner label, region details and the national region list without changing the map implementation. Country selection, title navigation, economy/policy behavior, placeholder orders and deployment configuration are preserved.
- [x] Fourteen focused tests added in `src/game/military.test.ts`. No dependencies added; no aviation, navy, advanced logistics, recruitment, technology, autonomous AI decisions, diplomacy, multiplayer or timers implemented. T08 and later tasks remain pending.

### Provisional combat parameters and rules

These are **prototype-only, reversible demo rules**, not final combat balance or implementation of the full military design. Constants live in `COMBAT_PARAMETERS` in `src/game/military.ts`.

| Parameter/behavior | Provisional value or rule |
|---|---|
| Starting manpower | Existing T02 fixture: 1,000 per division; no new forces |
| Move | One adjacent friendly region per completed week; no casualties or extra cost |
| Defend | Hold current region; no numerical bonus; also the default for idle units |
| Attacker damage budget | `max(1, floor(attacker manpower / 2))` |
| Return damage | `ceil(total living enemy defenders in target / 4)` |
| Loss application | Both sides use pre-round manpower; losses are simultaneous within each combat, capped at available manpower |
| Capture | Only if attacker survives and every enemy defender in the target is at zero; attacker enters and changes ownership |
| Undefended target | Captured without casualties |
| Zero manpower | Retained as an unavailable/destroyed division record at its last location; cannot receive orders, move, defend or capture |
| Resolution order | Player divisions by stable string ID; defender damage allocated by stable defender ID until the damage budget is exhausted |

- Each division acts at most once per week. Multiple combats resolve sequentially by division ID; this is a deterministic local prototype, not full simultaneous multiplayer resolution. All living enemy divisions in a target contribute to return damage. Defence in place is passive, with no autonomous AI movement or attack decisions.
- With the fixture's 1,000 versus 1,000, repeated attacks produce attacker/defender survivors of **750/500**, **625/125**, then **593/0** with capture. Attackers stay at the origin until capture. Both sides reaching zero leaves ownership unchanged; there is no retreat, surrender, occupation, reinforcement or regime-defeat system.
- Capturing territory does not change fixed national income/expenses or create additional military expenses in T07. The T06 provisional budget formulas and insufficient-funds behavior remain unchanged. No clock or randomness is used; the seed is preserved.
- Military results show only the latest resolved week, labeled with the week just completed; a quiet turn clears the previous results. Active orders, casualties and ownership remain in memory through title navigation; unapplied form/staged choices are discarded on leaving the prototype. Reload resets the scenario; no save/load feature is implied.

### T07 validation and limitations

- `npm test`: passed, **39 tests, 0 failures** (all 25 existing tests plus 14 focused military tests). Covers valid friendly movement for all countries, defend persistence/attack replacement, wrong ownership/unavailable units/unfriendly origins, self/nonadjacent/missing targets, friendly/enemy target rules, malformed runtime commands, atomic rejection of mixed batches, exact simultaneous casualties, multiweek capture, undefended capture, defeat/both sides destroyed, nonnegative manpower, multiple defenders and stable resolution order, obsolete-order cancellation, no autonomous AI attacks, policy settlement during combat, insufficient-funds rollback, invalid/unsafe manpower, and deterministic replay including invalid turns and JSON round trips.
- `npm run build`: passed (TypeScript checking includes the new tests; Vite production build). `git diff --check`: passed.
- Production-preview Playwright/Chromium at `/heartland/`: all three player countries passed at **320×568, 390×844, 844×390 and 1440×900**. Touch/mouse checks cover own-division selection, staged versus active orders, move/defend/attack, discarding drafts, exact casualties, standing attack persistence, territorial capture with map color/owner/detail updates, all six map regions, national economy/policy values during combat, title navigation preserving active state, reload reset, keyboard map/Next week activation, minimum 44px controls and absence of horizontal overflow.
- At 390×844, an attack against stronger defenders exhausted a division and correctly disabled further orders without capturing territory. A separate keyboard-staging/budget check exhausted treasury with 50 tax-relief weeks, staged a move, verified the rejected week kept location/treasury/week unchanged and retained the draft, then restored standard taxation and completed the move with treasury 4. No JavaScript runtime errors or application asset failures were observed. Mobile/desktop military and captured-map screenshots were visually inspected.
- Physical iPhone/Safari/VoiceOver and live GitHub Pages deployment remain unverified. Combat is a small headcount-only demonstration with fixed national budgets, no geographic defence modifiers, no retreat/supply/equipment/morale systems and no combat history beyond the latest week. The wider playable match remains incomplete; interface redesign is intentionally deferred.

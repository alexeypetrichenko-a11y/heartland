# Heartland — Implementation Status

**Snapshot date:** 2026-11-10
**Source:** Repository inspection at `0a16931` on `main` (UI-01A/UI-01A.2 merged in PRs #13/#14), the approved `design/Heartland-interface.html`, historical T01–T08/UI-01A/UI-01A.2 verification, and local UI-01B.1 tests/build/browser checks on 2026-11-10.

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
- [x] Basic public/private diplomacy, bilateral relationships and autonomous rule-based diplomatic AI (T08).
- [x] Compact map-first navy interface with World, Politics, Economy, Diplomacy and Military navigation; Politics is a placeholder (UI-01A).
- [x] Viewport-fitted compact overviews and on-demand detail panels based on the actual approved HTML mockup (UI-01A.2).
- [x] Interactive map zoom/pan, bounded camera and in-frame controls (UI-01B.1).
- [ ] Map overlays (UI-01B.2), unit interaction/geographical positioning (UI-01B.3), and UI-01C (separate assignments pending).
- [ ] Full economy/military systems, comprehensive diplomacy and advanced AI.
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

UI-01A and UI-01A.2 are merged into `main` (PRs #13/#14). UI-01B.1 is implemented on `task/ui-01b1-map-zoom-pan` for owner review through a dedicated PR targeting `main`. Do not merge without owner approval. Physical iPhone/Safari playtesting remains pending. UI-01B.2, UI-01B.3, UI-01C and T09 require separate assignments and are not implemented.

The earlier sections retain their historical verification scope. UI-01B.1 at the end records the current map interaction and validation.

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


## T08 — Basic diplomacy and proactive AI decisions

- [x] Reuses the three-country/six-region fixture, existing neutral bilateral relations, seed and atomic weekly engine. `src/game/models.ts` adds serializable public declarations, private cooperation offers/replies and diplomatic commands; `src/game/initialState.ts` starts with an empty diplomatic history.
- [x] Pure `src/game/diplomacy.ts` validates commands, updates shared bilateral scores, enforces recipient-only replies and one pending offer per unordered pair, and filters public/private records through `visibleDiplomaticMessages`. Offers retain their original channel after acceptance or rejection. Unknown viewers receive no feed. Unknown/self targets, unauthorized/duplicate replies and malformed commands are rejected.
- [x] Independent `src/game/ai.ts` chooses and applies exactly one diplomatic action per non-player country per successful week. National priorities, acceptance thresholds and stable tie-breaking are explicit. AI reads public declarations and its own bilateral messages; public explanations never announce a pending private offer. No cloud API, randomness, network, long-term planning or new dependency is used.
- [x] `advanceTurn` validates external player commands, applies player diplomacy, runs AI countries in stable string-ID order, settles the unchanged national budgets, resolves unchanged military rules and advances one week. Later AI countries can react to earlier AI actions in that week. Any failure rolls back the whole turn, including diplomatic records, AI replies, scores, economy and military outcomes.
- [x] `src/ui/DiplomacyPanel.tsx` adds native labeled action/counterpart selectors, one staged diplomatic draft, accept/reject buttons for incoming offers, shared relationship indicators, public declarations and only the player's private bilateral offers. Actual score changes, response reasons and completed-week labels are visible. The existing layout, responsive styles, map, economy and military panels are retained; no interface redesign.
- [x] `PrototypePage.tsx` combines diplomatic/military/policy drafts with Next week; successful turns clear applied drafts, failures preserve them. Active diplomacy and scores persist in memory through title navigation; leaving the prototype discards drafts, and reloading resets the scenario, as with existing orders.
- [x] Added `src/game/diplomacy.test.ts` and `src/game/ai.test.ts`. Updated only the old turn test's assumption that diplomatic state remains inert; its checks for unchanged geography, military data and base economics remain. No deployment, package, combat, economic formula or approved `GAME_DESIGN.md` changes.

### Provisional diplomatic parameters and decisions for owner review

All choices below are **temporary, reversible T08 demonstration rules**, not final balancing or a treaty design. Constants live in `DIPLOMACY_PARAMETERS` (`src/game/diplomacy.ts`) and `AI_PRIORITIES` (`src/game/ai.ts`). Owner review is needed before adopting them as lasting design.

| Parameter/behavior | Provisional value or rule |
|---|---|
| Relationship | One shared integer per unordered pair, initially 0; clamp to -100…+100 |
| Public goodwill / condemnation | +5 / -10 to the targeted bilateral relationship; declaration visible to all three countries |
| Private cooperation offer | No immediate score change or payment; one pending offer per pair, in either direction |
| Accept / reject | +10 / -5 to that pair; only the recipient can reply, exactly once; reply remains private |
| Player action allowance | At most one diplomatic command per successful week, including an offer response; new UI staging replaces the draft |
| AI action allowance | Exactly one diplomatic command per AI country per successful week |
| Alden priority | Strengthen its highest relationship; accept offers at a score of at least -10 |
| Belora priority | Repair its lowest relationship; accept offers at a score of at least -30 |
| Cyrin priority | Repair its lowest relationship cautiously; accept offers at a score of at least 0 |
| Offer lifetime | Pending until answered; no expiry, withdrawal, cooldown or negotiation chain |
| Display/history | All records stay in local memory; show latest 12 public declarations, latest 12 resolved own offers and all pending own offers |

- AI decision priority: answer the oldest-week incoming pending offer (string-ID tie-break), otherwise mirror a player declaration addressed to it in the current week, otherwise select a counterpart by the national priority (string-ID tie-break). Propose cooperation if the score meets its acceptance threshold and no offer is pending for that pair; otherwise issue public goodwill. Offer responses take precedence over declaration reactions. Old player declarations do not trigger repeat retaliation in later weeks.
- A public goodwill declaration normally receives +5 goodwill back from the targeted AI, producing +10 total that week; condemnation can receive -10 back, producing -20. Other AI decisions can also affect publicly visible scores. Offer acceptance/rejection uses the score at the moment of decision; this makes player diplomacy affect subsequent AI behavior.
- At relationship bounds, actual changes may be smaller or zero and are reported accurately. Repeated offers/goodwill can saturate relationships; there is no balance against repetitive diplomacy in this small demonstration.
- Public scores can reveal that a relationship changed, but private offer participants, content, status and reasons are not published to outsiders. This is gameplay visibility in a local single-player app: the complete simulation state still exists in browser memory. It is not a multiplayer security boundary or encrypted messaging.
- Cooperation means only improving the relationship. There are no treaties, alliances, ceasefires, trust/reputation scores, transfers, trade bonuses, obligations or constraints on attacks. Diplomatic AI does not change taxes, treasury formulas, military orders, damage or territorial ownership. It does not react to military invasions in T08. Military/economic AI and wider strategy remain later work.

### T08 validation and limitations

- `npm test`: passed, **57 tests, 0 failures** (39 existing tests plus 18 focused diplomacy/AI tests). Covers diplomatic validation/ownership, all three public/private country perspectives before and after replies, symmetric bilateral scores, limits and actual deltas, duplicate/persistent offers, autonomous decisions for every player choice, national priorities and threshold boundaries, player-action reactions, private-information isolation, stable AI ordering, frozen-input immutability, mixed-system atomic rollback, unchanged economic/military outcomes and deterministic replay with multiple seeds and JSON round trips. The seed is preserved and no random draw is needed.
- `npm run build`: passed (TypeScript check including tests and Vite production build). `git diff --check`: passed.
- Production-preview Playwright/Chromium at `/heartland/`: passed for all three player countries at **320×568, 390×844, 844×390 and 1440×900**. Checks cover country selection, all six map regions, weekly progression, staged/discarded diplomacy, public goodwill and AI replies, shared score updates, combined tax policy and combat, exact casualties and capture, map owner updates, friendly movement, title navigation, reload reset, keyboard Enter/Space Next week activation, at least 44px form/button controls and no horizontal overflow.
- Additional mobile/desktop checks passed for AI-generated private offers, player acceptance/rejection, player-initiated private offers, accepted neutral versus rejected post-condemnation offers, and exclusion of AI-to-AI private offers. At 390×844, 50 tax-relief weeks exhausted treasury; the failed next week preserved both diplomatic/military drafts and resolved messages, and standard taxation successfully retried the week. No browser runtime errors or application asset failures occurred. Mobile/desktop diplomacy and private-offer screenshots were visually inspected.
- A browser-script assertion initially expected country selection directly after reload; corrected it to reopen the prototype from the existing title screen. The full browser suite then passed. During implementation, the new action-count test was corrected to count an AI reply to an offer created earlier in the same week; a TypeScript test narrowing error was also corrected. All final checks above passed.
- Physical iPhone/Safari/VoiceOver and live GitHub Pages deployment remain unverified. Turns/state are local and in memory; no networking, multiplayer, save/load, PWA, advanced negotiation, treaty framework or new military systems were added. The separate mobile-first redesign and T09 remain unimplemented.

## UI-01A — Compact map-first interface

- [x] Replaces the stacked dashboard with a sticky country/week/treasury top bar and an always-accessible **Next week** action. The five sections are ordered **World, Politics, Economy, Diplomacy, Military**. World is the default view and contains the existing interactive map. Politics is a simple future domestic stability/regime-management placeholder, with no political mechanics. A compact bottom bar serves phone-sized screens (including landscape); desktop keeps side navigation, a wider map/details layout and side-by-side economic figures/policy controls.
- [x] Uses the owner's exact navy palette from the `Heartland-interface.html` design reference: background `#0E1620`, surface `#16222F`, secondary surface `#1D2D3E`, borders `#2A3B4E`, primary text `#EAE6DA`, muted text `#A9B8C7` and accent `#E3B15C`. Shared color variables apply to the title/setup screens, cards, navigation, native controls, map surroundings and focus/error states; browser theme color matches the background. Existing spacing and responsive structure are retained with rounded cards and restrained surfaces. The reference HTML was unavailable in the repository/workspace, so the owner's stated palette and principles are the visual source; no other design was substituted.
- [x] Exactly one section is visible and keyboard-accessible at a time. Hidden sections remain mounted, preserving selected regions, unfinished forms and staged commands while navigating or resizing. A shared draft summary makes pending changes visible from every section; Next week continues to submit the existing military, diplomatic and policy commands together.
- [x] Existing economy, military and diplomacy controls/results remain functional. The country selector and title screen are preserved. Active game state survives title navigation; leaving the prototype discards drafts and map selection, and reload resets the scenario, as before. Country-control labels, owned regions, provisional-rule explanations and placeholder-order counts are available under World's **Scenario information** disclosure.
- [x] Native buttons/selectors, at least 44px control targets, visible focus, focused section headings, labeled navigation with a current-section indicator and iPhone safe-area padding. Hidden controls are excluded from keyboard traversal. A rejected turn focuses the shared error and retains drafts for correction from any section.
- [x] Presentation changes only: `PrototypePage.tsx`, `styles.css`, `index.html` theme color, and heading/focus adjustments in `RegionMap.tsx`, `MilitaryPanel.tsx` and `DiplomacyPanel.tsx`. Updated `TASKS.md` with a separate UI-01A/UI-01B/UI-01C milestone before T09. No engine, model, economy/combat/diplomacy/AI rule, dependency, approved `GAME_DESIGN.md`, title-screen component or deployment configuration changes. UI-01A was subsequently merged in PR #13; UI-01A.2 supersedes its layout below. UI-01B, UI-01C and T09 remain unimplemented.

### UI-01A validation and limitations

- `npm test`: passed, **57 existing tests, 0 failures**. `npm run build`: passed (TypeScript and Vite production build). `git diff --check`: passed. Source comparison against `origin/main` confirms `src/game`, `GAME_DESIGN.md`, dependency files and deployment configuration are unchanged.
- Production-preview Playwright with installed Chromium at `/heartland/`: all three countries passed at **320×568, 390×844, 844×390, 1024×768 and 1440×900**. Touch emulation at the first three sizes and mouse on desktop covered country selection, all six map regions, single-section navigation, selection/form/draft retention, policy changes, staged/discarded military and diplomatic commands, combined weekly submission, exact multiweek casualties/capture, map ownership updates, friendly movement, title navigation and reload reset.
- Keyboard checks at all five sizes passed for country selection/start, navigation with Enter/Space, native policy/military/diplomatic controls, map selection and Next week. Repeated Tab traversal skipped hidden panels and kept focused controls clear of the persistent bars. Resizing preserved the active section and unfinished form. No horizontal overflow or targets below 44px at normal or 200% root text size; the enlarged-text check prompted a correction to prevent the desktop details column shrinking the map targets.
- Additional checks at **390×844 and 1440×900** passed for incoming private offers, acceptance/rejection, outgoing cooperation offers and exclusion of other countries' private records. Fifty tax-relief weeks exhausted Alden's treasury; the rejected week preserved time, treasury, military position, diplomatic records and both staged actions, focused the shared error, and then successfully applied both drafts after restoring standard taxation. No JavaScript runtime errors or failed application assets were observed. Mobile and desktop screenshots were visually inspected.
- These are Chromium checks with touch emulation, not physical iPhone/Safari/VoiceOver verification. Real-device safe areas and assistive-technology behavior remain for owner playtesting. Live GitHub Pages deployment is unchanged and was not independently verified. The existing fictional map has no custom pan/zoom; local state is still in memory with no save/load, PWA or match endpoint added.

### UI-01A owner design correction — PR #13

- Updated the existing branch/PR to the specified navy visual identity and five-section order. Politics remains a text-only placeholder. No simulation or political rules were added. `index.html` now sets the browser theme color to the same navy background; no dependency or deployment configuration changed.
- `npm test`: **57 passed, 0 failures**. `npm run build` and `git diff --check`: passed. Confirmed `src/game`, `GAME_DESIGN.md`, dependency files and deployment configuration are unchanged against `origin/main`.
- Repeated the existing gameplay browser checks for all three countries at **320×568, 390×844, 844×390, 1024×768 and 1440×900**: map selection, policies, staged military/diplomatic drafts, exact multiweek combat/capture, movement, turn progression and title/reload behavior passed. Additional checks at every size verified the exact computed palette, ordered five-button navigation, World as the initial view, and Politics as a placeholder with no gameplay controls. Advancing from Politics applied the same combined policy/military/diplomatic drafts correctly for each country.
- Keyboard traversal through all five sections, resizing with an unfinished form, 200% text, minimum 44px targets and absence of horizontal overflow passed. All labels fit on one line at normal text size even at 320px, including the active state. Mobile/desktop private-offer acceptance/rejection and insufficient-funds rollback/recovery also passed. No runtime errors or failed application assets; screenshots were visually inspected.
- At that validation the reference HTML was unavailable, so visual verification followed the owner-specified palette and principles. The HTML has since been uploaded to `design/Heartland-interface.html` and PR #13 merged. Physical iPhone/Safari/VoiceOver and live deployment were unverified; UI-01A.2 below uses the actual reference.

## UI-01A.2 — Compact interface from the approved HTML reference

- Read and visually inspected `design/Heartland-interface.html`. Adapted its dynamic-height app, compact brand/section header, icon tabs, rounded cards, four budget tiles, short rows and map/region sheet to React. The reference HTML and standalone JavaScript are unchanged; no mock data or standalone architecture was copied into gameplay.
- The active game occupies `100dvh`, with the header and bottom tabs outside the scrolling content. Next week, week, treasury and selected country remain accessible in the compact header. Only an overview/detail panel scrolls when content exceeds its space; the document stays fixed. Safe-area insets are respected. Short landscape and desktop layouts use columns; desktop content is bounded rather than stretched across the whole screen.
- World keeps the original six-region geometry, adjacency, ownership and touch/keyboard selection. A player's first owned region is selected for immediate real region/owner information. Muted country fills and a gold selection follow the reference's visual treatment; the named legend and accessible owner labels remain. Neighbor names and instructions open on demand. Selection persists through turns and section navigation.
- Economy shows treasury, income, expenses and weekly balance immediately. `EconomyPanel.tsx` moves the existing tax selector, active policy/effect and rules into a secondary panel. Diplomacy shows public bilateral scores and incoming-offer count/counterparts; composition, public declarations and private offers/replies open separately. Military shows divisions, personnel, locations, active orders and latest-operation summary; all order/discard controls and full combat/movement results remain available in secondary panels. Politics stays a placeholder with no invented data or mechanics.
- `DetailPanel.tsx` provides a back action, focused heading and keyboard-scrollable body. Panels and forms stay mounted behind `hidden`, retaining drafts and unfinished selections across tabs and detail changes. Navigation remains available while editing. Scenario explanations, country controllers/AI priorities, owned regions, placeholder-order count and Back to title are in the header's Scenario menu. Title navigation/reload retain their existing in-memory/reset behavior.
- No `src/game` files, models, economic/combat/diplomacy/AI rules, `GAME_DESIGN.md`, dependencies, deployment settings or design reference files changed. UI-01B, UI-01C and T09 were unimplemented in this phase. Dedicated branch: `task/ui-01a-2-compact`, subsequently merged into `main` in PR #14.

### UI-01A.2 validation and limitations

- `npm test`: **57 existing tests passed, 0 failures**. `npm run build`: passed (TypeScript and production Vite build). `git diff --check`: passed. Compared simulation/design/dependency/deployment paths against `origin/main` to confirm they are unchanged.
- Production-preview Playwright/Chromium at `/heartland/`: **all three countries passed at 320×568, 390×844, 844×390, 1024×768 and 1440×900**. At normal text size, the complete initial map, selected-region summary, header and bottom tabs fit; Economy, Diplomacy and Military primary cards fit without overview or document scrolling. The initial landscape check prompted side-by-side overview groups and a single row of budget tiles to fit the short viewport.
- Gameplay checks passed for all six regions/owners and neighbor details, active/pending economic policy, staged/discarded military and diplomatic drafts, cross-tab form/selection retention, combined weekly commands, exact multiweek casualties/capture, changed map ownership, friendly movement, defend staging, title round trips and reload reset. Next week also worked from secondary panels and Politics.
- Keyboard Enter/Space navigation, native selectors, map activation, focused detail headings/back return, exclusion of hidden controls, focus visibility, internal detail scrolling and 44px-or-larger touch targets passed at all five sizes. Resizing, including a shorter 390×620 viewport, preserved unfinished orders and kept the bars accessible. At 200% text, panels may scroll internally; the document still has no horizontal/vertical overflow and tab labels stay within the viewport.
- Additional mobile/desktop checks passed for private incoming/outgoing offers, acceptance/rejection and private-feed isolation. Fifty tax-relief weeks exhausted treasury; a rejected week retained military/diplomatic drafts, position, week, treasury and diplomatic records, focused the error, and then resolved both drafts after restoring standard taxation. A destroyed-division check verified zero personnel and disabled new orders. No JavaScript runtime errors or failed app assets. Reference and application screenshots were visually inspected.
- Unavoidable compact-screen tradeoff: expanded orders, explanations, long diplomatic histories and enlarged text require internal panel scrolling, especially at 320×568 or short landscape heights. Primary views fit at the tested normal text size. Title/country setup retain ordinary page flow; the fixed viewport applies after starting the scenario. Chromium touch emulation does not verify physical iPhone/Safari/VoiceOver, real browser chrome or device safe areas; those remain owner playtest items. Live deployment was not independently checked. No save/load, custom map pan/zoom, PWA or match endpoint was added.

## UI-01B.1 — Interactive map zoom and pan

- Pinch-to-zoom and one-finger pan use Pointer Events; desktop supports mouse drag and wheel zoom. The moving pinch midpoint and wheel pointer anchor the zoom. Wheel deltas are normalized and capped; continuous gestures update directly without animation lag or inertia. Zoom is limited to **100–400% of the fitted map**. Panning keeps the world covering each enlarged axis and centers axes that fit. Resizing reclamps the view without changing geographical coordinates or the selected region.
- Compact **+, − and reset** controls sit in a 44px-wide rail inside the existing map frame. They have 44×44px targets, accessible names, visible focus and a live zoom readout. The rail leaves all six labels visible, including at 320px wide. Reset fits the entire map and retains the selected region. The approved header, region sheet, five bottom tabs, navy palette, country fills and gold selection are retained.
- A **6 CSS-pixel movement threshold** distinguishes a tap/click from a drag. Any two-finger gesture suppresses selection until all contacts end. Captured pointers continue outside the map, and compatibility clicks from gestures are blocked. Cancellation, lost capture, window blur, hidden views and resizing clear active gestures. Ordinary taps/clicks, small pointer jitter and keyboard region activation remain supported.
- Keyboard: focus the map or a region; **+/−** zoom, **arrows** pan, **Shift+arrows** take larger steps, and **0/Home** reset. Tab still reaches each region, and Enter/Space selects. Focusing an offscreen region brings it into view without changing selection. Browser keyboard zoom shortcuts are left available. Selection and camera state survive section/detail navigation and weekly turns; leaving the prototype resets the map view as before.
- `mapViewport.ts` holds presentation-only camera math; `useMapNavigation.ts` handles input and resize/capture lifecycle. A single SVG group transforms the existing fixed world geometry and grid together, so future geographic overlays can share the camera. No overlay renderer, layer controls, markers, unit coordinates or game-state changes were added. Future units must have meaningful positions inside regions, with border proximity eventually affecting movement/engagement time; those simulation rules are explicitly deferred.
- Changed files: `src/ui/RegionMap.tsx`, `src/ui/styles.css`, new `src/ui/mapViewport.ts`, `src/ui/useMapNavigation.ts` and `src/ui/mapViewport.test.ts`, `package.json` (test command only), `TASKS.md` and `STATUS.md`. No dependencies added. Compared with `origin/main`: `src/game`, `AGENTS.md`, `GAME_DESIGN.md`, the design reference, dependency versions and deployment configuration are unchanged. Dedicated branch: `task/ui-01b1-map-zoom-pan`; PR targets `main` and must remain unmerged pending owner approval.

### UI-01B.1 validation and limitations

- `npm test`: **63 passed, 0 failures** — all 57 existing gameplay tests plus 6 camera tests covering fitted centering, cursor anchoring, moving pinch anchoring, all pan boundaries, zoom-limit drift and resize behavior. `npm run build`: passed (TypeScript and Vite production build). `git diff --check`: passed.
- Production-preview Playwright/Chromium at `/heartland/`: passed at **320×568, 390×844, 844×390, 1024×768 and 1440×900**. Checked all six region taps/clicks, mouse drag with release outside the frame, wheel/pinch anchoring, minimum/maximum zoom, limits on both pan axes, reset, sub-threshold jitter, gesture selection suppression, one-finger drag, two-finger pinch, transition back to one finger, touch cancellation and subsequent selection. Touch checks used browser multi-touch input in touch-emulated Chromium, not synthetic clicks alone. No document scrolling/overflow; the selected-region summary and bottom navigation stayed visible at normal text size. Controls stayed inside the frame with 44px targets.
- Keyboard map zoom/pan/reset, control activation, all six regions' Tab/Enter/Space behavior, revealing offscreen focus, detail back navigation, retained camera/selection through tabs and portrait/landscape/desktop resizing all passed. Extra checks passed for line/page wheel-delta modes, blur/capture recovery, 200% root text and repeated keyboard traversal at all five sizes. At enlarged text sizes the existing region sheet/details can require **internal scrolling**, particularly on small or short screens; header/navigation and the document remain fixed.
- Gameplay checks passed for **all three countries at all five sizes**: tax-policy drafts/settlement, staged/discarded military and diplomatic commands, cross-section form retention, public declarations and AI reactions, combined weekly submission, exact three-week casualties/capture (750 → 625 → 593 survivors), map ownership/summary updates while zoomed, friendly movement, title round trips and reload reset. Mobile/desktop checks also exhausted treasury after 50 tax-relief weeks, verified atomic rejection retained both drafts and existing diplomatic records, then restored standard taxation and successfully applied both drafts. No JavaScript runtime or application-asset errors were observed. Production-preview screenshots were visually inspected.
- Initial checks exposed a floating-point centering error and a small pinch-anchor drift from processing contacts sequentially. Both were corrected, and final unit/browser checks passed. WebKit launch was attempted but its executable is not installed in this environment. Physical iPhone/Safari/VoiceOver, real browser chrome/safe areas and live GitHub Pages remain unverified; owner device playtesting is still required.

### Deferred UI-01B.2 / UI-01B.3

- **UI-01B.2 — Map overlays:** not implemented. Cities, divisions, fortifications, roads, railways, ports and airports, their data/visibility and any layer controls require a separate assignment.
- **UI-01B.3 — Unit interaction/geographical positioning:** not implemented. No draggable units, positions inside regions, border-distance calculations, movement/engagement timing or military mechanics changed. Future position-sensitive behavior requires separately approved mechanics and model changes. UI-01C and T09 also remain deferred.

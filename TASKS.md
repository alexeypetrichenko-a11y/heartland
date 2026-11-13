# Heartland — Codex Backlog and Execution Plan

**Version:** 1.0 (2026-11-07)  
**Purpose:** Turn approved `GAME_DESIGN.md` decisions into small, testable tasks.  
**Status disclaimer:** This is a *plan*, not a record of implemented features. Check the repository before claiming completion.

## Project snapshot, verified in GitHub on 2026-11-07

- Repository: `alexeypetrichenko-a11y/heartland`, default branch `main`.
- Existing: React 19, TypeScript 5.9, Vite 7, `AGENTS.md`, `README.md`, `src/app`, `src/ui`, GitHub Pages workflow and initial responsive title screen.
- `README.md` explicitly states that **game features are not yet implemented**.
- `GAME_DESIGN.md`, `TASKS.md`, `STATUS.md` were not present in root when inspected. Create them as documentation before feature changes.
- Published site configured for `https://alexeypetrichenko-a11y.github.io/heartland/`.
- Never redo scaffolding, PWA setup, remote hosting or deployment as a preliminary task.

## Working rules for Codex

1. Read `AGENTS.md`, `GAME_DESIGN.md`, `TASKS.md` and `STATUS.md` if present, then inspect relevant source files.
2. Do **one numbered task per request**; do not bundle adjacent tasks or implement future features.
3. Keep the core game engine independent from React UI and network synchronization.
4. For every task, define acceptance criteria, run `npm run build`, add focused automated tests when game rules change, and explain what is and is not working.
5. Preserve the existing GitHub Pages base path and responsive iPhone design.
6. Use a dedicated branch and PR for changes where supported. Never merge without explicit owner approval.
7. Keep `STATUS.md` grounded in facts and mark the current task's checkboxes only after verified completion.
8. If a decision depends on a rule still marked unresolved in `GAME_DESIGN.md`, ask the owner or propose the *smallest explicitly temporary demo assumption*, clearly labeled and reversible; do not silently adopt it as design.

## Milestone 0 — Document baseline, no gameplay coding

### T00 — Commit the agreed design documents and create status snapshot

**Scope:** Add `GAME_DESIGN.md`, `TASKS.md` and `STATUS.md` to repo root; preserve existing `AGENTS.md`. The supplied files are the proposed source for the first two; create an honest `STATUS.md` identifying implemented scaffold and pending functionality.

**Acceptance:** All three files are visible in repository; `STATUS.md` says game logic is not yet present unless source proves otherwise; no gameplay/UI or deployment changes; code still builds.

## Milestone 1 — The earliest useful playable solo loop

### T01 — Inspect existing UI and add an accessible game-view placeholder

- [x] Completed and verified: title/prototype navigation, placeholder HUD and build.

**Scope:** Preserve title screen. Add a clearly labeled local prototype/play view with a basic game HUD container (country/week/orders/status). No real game logic or map library yet.

**Acceptance:** Title and prototype screen can be reached on iPhone and desktop; nothing falsely presented as a working game; build passes.

### T02 — Define small typed game-state data and a fictional test world

- [x] Completed and verified: pure TypeScript models, fixed three-country/six-region fixture, consistency and JSON serialization tests, and production build.

**Scope:** Pure TypeScript data models for countries, regions, numeric economy, relations, divisions, game week, player selection, AI ownership and seed. Create **three fictional countries** and a handful of named fictional regions with explicit adjacency; do not import real global borders.

**Acceptance:** Initial state is valid, testable and serializable; no React imports in game models; explicit data are stable across reloads; tests for consistency.

### T03 — Render tappable region map using existing stack

- [x] Completed and locally verified: six-region SVG using the T02 fixture, country colors, touch/mouse selection, region/owner/neighbor details, keyboard activation, responsive production-preview checks and build. Merged into `main` in PR #7.

**Scope:** Show a **small, simple illustrative map** (SVG or similarly low-complexity approach) tied to game-state regions, with country colors, region selection and details. Avoid new mapping libraries unless approved.

**Acceptance:** Region selection works with touch, visible owner/details update, map fits small iPhone viewport and desktop, keyboard accessibility if practical; build passes.

### T04 — Choose a player country and display dashboard

- [x] Completed and locally verified: one player country, two AI-control labels, national regions/economy/division overview using T02 data, preserved T03 map, focused tests, responsive Chromium checks and production build. Merged into `main` in PR #8.

**Scope:** Select one of the available fictional countries. Show state overview and selected-country regions; other countries are designated AI-controlled. No online lobby.

**Acceptance:** A player can start a local scenario, select a unique country and see relevant stats. No misleading claim of multiplayer.

### T05 — Implement pure weekly turn resolution and standing orders

- [x] Completed and locally verified: pure deterministic one-week engine, validated set/cancel commands, persistent inert standing orders, Next week button, progression/validation/persistence/replay tests, responsive Chromium checks and production build. Merged into `main` in PR #9.

**Scope:** One-week increment via a deterministic `advanceTurn` engine, standing order persistence, action validation and explicit separation of commands from simulation. Use one seeded random source or none initially. No automatic real-time timer yet.

**Acceptance:** Multiple weeks can be advanced; unchanged orders persist; invalid orders rejected; unit tests for replay and turn increments; no UI-specific simulation logic.

### T06 — Add minimal economy and treasury feedback

- [x] Completed and locally verified: deterministic weekly budgets for all three fictional countries, one persistent tax policy with a measurable income effect, dashboard feedback, explicit atomic insufficient-funds rejection and recovery, focused economic/persistence/replay tests, responsive Chromium checks and production build. Provisional parameters/formulas are documented in `STATUS.md`. Merged into `main` in PR #10.

**Scope:** For the fictional test world only, track small illustrative resource/income/expense/budget variables and one government policy/order that affects them weekly. No full market, debt or industry simulation yet.

**Acceptance:** A visible policy choice changes next week's measurable numbers; no negative resources without explicit handling; calculations covered by tests; parameters marked as prototype-only.

### T07 — Add a minimal land-division order and outcome

- [x] Completed and locally verified: player-owned division selection and staged move/defend/attack orders, ownership/availability/adjacency validation with atomic rejection, deterministic weekly casualties and territorial capture, persistent attacks, active orders/results in the dashboard, existing map ownership updates, preserved economy/policies, 14 focused military tests and mobile/desktop Chromium checks. Provisional combat rules are documented in `STATUS.md`; production build passes. Merged into `main` in PR #11.

**Scope:** Add land divisions to fictional regions and one or two actions (move, defend, attack) with a small deterministic resolution model. Don't implement air, naval, manpower training, technology or full supply chains yet.

**Acceptance:** Player can move or fight across adjacent valid regions; ownership/strength changes according to a documented provisional model; cannot attack nonadjacent region; tests for casualties/ownership where appropriate.

### T08 — Add basic diplomacy and proactive AI decisions

- [x] Completed and locally verified: public goodwill/condemnation declarations, private bilateral cooperation offers and replies, shared relationship indicators and visible consequences, one deterministic rule-based diplomatic decision per AI country per week, player-action reactions, preserved economy/combat/map and existing responsive layout, 18 focused diplomacy/AI tests, mobile/desktop Chromium checks and production build. All parameters and limitations are documented in `STATUS.md`. Merged into `main` in PR #12.

**Scope:** Add simple public declaration or bilateral offer, a relationship indicator and **one meaningful autonomous AI action per turn based on basic national priorities**. Keep private/public distinction in the model even if the UI is minimal. Do not invent a comprehensive treaty framework.

**Acceptance:** Non-player country does not remain inert; AI decision is deterministic for a given state/seed; visible reaction to player choices; no cloud APIs required; tests for AI action and bilateral visibility.

## Interface redesign milestone — Mobile-first interface (before T09)

This is a separate UI milestone. Preserve the existing engine, models, economy, combat, diplomacy and AI rules throughout. UI-01A, UI-01A.2, UI-01B.1 and UI-01B.2 are merged. MAP-01A is merged in PR #17. The current assignment is MAP-01B rendering, split into political and physical presentation PRs; UI-01B.3 and later interface phases need separate requirements and approval.

### UI-01A — Compact map-first navigation

- [x] Implemented and locally verified on `task/ui-01a-map-first` in PR #13: compact top bar, primary map, five section views, mobile bottom navigation, responsive desktop layout, preserved gameplay controls/drafts, touch/keyboard checks, 57 passing existing tests and production build. Merged into `main` in PR #13. See `STATUS.md` for validation and limitations.

**Scope:** Replace the stacked prototype dashboard with a compact country/week/treasury top bar, a primary interactive map and five navigation sections in this exact order: **World, Politics, Economy, Diplomacy, Military**. World contains the existing map; Politics is a placeholder for future domestic stability and regime management, without political mechanics. Use bottom navigation on phone-sized screens and a responsive desktop layout. Keep Next week available in every section, preserve the existing controls, country selection and title screen, and retain drafts and map selection across section navigation. Maintain touch and keyboard access and iPhone safe-area spacing without adding dependencies.

**Visual reference:** The owner-selected `design/Heartland-interface.html`, now committed to the repository. Read the actual HTML before further interface work. Its navy palette is background `#0E1620`, surface `#16222F`, secondary surface `#1D2D3E`, borders `#2A3B4E`, primary text `#EAE6DA`, muted text `#A9B8C7`, accent `#E3B15C`.

**Acceptance:** Only the selected section is displayed; the existing gameplay workflows work at mobile and desktop sizes, with no horizontal overflow or inaccessible controls. Run `npm test` and `npm run build`; record browser checks and device limitations in `STATUS.md`. Do not implement UI-01B, UI-01C or T09, change approved gameplay rules or merge without owner approval.

### UI-01A.2 — Compact interface based on the approved Claude mockup

- [x] Implemented and locally verified on `task/ui-01a-2-compact`: actual mockup inspected, viewport-fitted header/map/overviews/icon tabs, internally scrolling secondary panels, preserved gameplay and drafts, 57 passing existing tests, production build and all requested Chromium sizes. Merged into `main` in PR #14. See `STATUS.md` for evidence and compact-screen limits.

**Scope:** Adapt the actual `design/Heartland-interface.html` layout and density to the existing React game. Keep header and five icon tabs fixed within the dynamic viewport, with a central map/compact region sheet and concise economy, diplomacy and military overviews. Open tax settings, orders, offers, declarations, results and explanations in secondary panels with internal scrolling. Retain country/title navigation, drafts across sections, keyboard/touch access, safe areas and the permanently accessible Next week action. Use real T01–T08 state only; Politics remains a placeholder. No simulation, dependency, UI-01B/UI-01C or T09 work.

**Acceptance:** At normal text size, initial World, Economy, Diplomacy and Military show essential information without page scrolling at 320×568, 390×844, 844×390, 1024×768 and 1440×900 whenever practical. Verify internal scrolling/focus, resizing, policies, attacks/capture, offers, draft retention and weekly progression. Run `npm test` and `npm run build`; record limitations in `STATUS.md`. Dedicated branch `task/ui-01a-2-compact` and PR targeting `main`; do not merge without owner approval.

### UI-01B — Map interaction, delivered in separate phases

#### UI-01B.1 — Interactive map zoom and pan

- [x] Implemented and locally verified on `task/ui-01b1-map-zoom-pan`: pinch zoom, one-finger/mouse pan, mouse wheel zoom, in-frame +/−/reset controls, keyboard navigation, bounded 100–400% zoom, preserved selection and compact World layout. `npm test`: 63 passed (57 existing and 6 camera tests); production build passed. Merged into `main` in PR #15. Browser evidence and device limitations are in `STATUS.md`.

**Scope:** Improve the existing six-region fictional map without changing geography, country ownership colors, the approved compact interface or gameplay. Zoom follows the pointer or moving pinch midpoint; panning stops at the world edges and centers axes that fit. Use a small drag threshold and suppress gesture-generated clicks. Keep the selected-region summary, header and bottom navigation accessible without document scrolling. Provide touch, mouse and keyboard access without new dependencies.

**Architecture:** A presentation-only camera transforms fixed SVG world coordinates together. Future cities, divisions, fortifications, roads, railways, ports and airports can use the same coordinates and camera. No overlay system or new geographical game-state fields are implemented here.

**Acceptance:** Run `npm test` and `npm run build`. Verify portrait, landscape, desktop and keyboard interaction, pointer/pinch anchoring, one-to-two-finger transitions, pan/zoom limits, reset, tap/click selection and no accidental selection during gestures. Check economy, military, diplomacy and weekly progression. Preserve `src/game`, approved rules, dependencies and deployment configuration. Physical iPhone/Safari verification remains an owner playtest item.

#### UI-01B.2 — Horizontal overlay toolbar and Divisions layer

- [x] Implemented and locally verified on `task/ui-01b2-map-overlays`: horizontal icon/label toolbar, independent layer flags, real division region markers under the shared camera, isolated marker input and a separate visibility adapter. `npm test`: 71 passed; production build passed. Merged into `main` in PR #16. See `STATUS.md` for browser verification and limitations.

**Scope:** Place a compact navy/gold toolbar directly below the World map, before the region sheet on phones. Prepare **Divisions, Cities, Bunkers / fortifications, Roads, Railways, Ports and Airports** with separate on/off flags. All start off. Only Divisions is available after country selection; the other six controls are visibly disabled because they have no corresponding data/rendering. Independent flags support simultaneous future layers, without making unavailable controls appear functional.

**Divisions:** Show existing living divisions at stable illustrative anchors inside their current region polygons. Anchors share zoom/pan; symbols and hit targets retain readable screen sizes. Markers update from existing turn results/state, without modifying the simulation. Gold solid symbols identify the player's units; outlined symbols identify reported opponents. Tap or Enter/Space inspects the unit and its correct region. Marker drags are ignored. The interface labels these as illustrative region markers, not real geographical military positions.

**Prototype visibility choice:** A UI-only selector shows the player's living divisions and surviving opposing defenders explicitly named in the latest existing player combat report, only while still in the reported region. Other units are not disclosed; replaced reports do not create permanent sightings. Show name, owner and region; show personnel only for the player's own units, never opponents' headcounts/orders. This reuses information already exposed by Military results and adds no detection, fog-of-war, geographical positioning or intelligence mechanics. This conservative display choice is documented for owner review.

**Acceptance:** Run `npm test` and `npm run build`. Check layer toggling, disabled controls, marker visibility/redaction, positions after movement/combat/capture, zoom/pan and region selection with Divisions on/off, marker input isolation, keyboard access, at least 44px targets, iPhone toolbar swiping, gameplay workflows and no document overflow. Keep portrait map height and persistent navigation. Use internal scrolling when short screens/enlarged text require it. Preserve `src/game`, approved rules, dependencies and deployment settings. No UI-01B.3, UI-01C or T09 work.

**Deferred within the layer categories:** Cities, fortifications, roads, railways, ports and airports need separately authorized data and renderers before their controls can be enabled. No objects are invented for them.

#### UI-01B.3 — Unit interaction and geographical positioning (deferred)

- [ ] Not implemented or authorized by UI-01B.1. Future military units must have meaningful positions inside regions; proximity to borders will eventually affect movement and engagement time. Unit positioning, draggable units, movement/engagement timing and all related military rules require a separate assignment and approved mechanics. The current region-based military model and calculations remain unchanged.

### UI-01C — Interface redesign, third phase

- [ ] Deferred. Detailed scope and acceptance criteria require a separate owner assignment. No implementation is included in UI-01A.

## Geographic foundation milestone — Data before rendering

This assignment prepares a separate geographic reference. It does not replace the fictional scenario or authorize political/gameplay ownership decisions. Full source, coverage, processing and size documentation: [docs/geography/README.md](docs/geography/README.md).

### MAP-01A — Real-world geographic data foundation

- [x] Merged in PR #17: verified and checksum-pinned Natural Earth 5.1.1 layers; 258 Admin-0 entities and 4,596 Admin-1 source features; compact overviews plus country/regional assets; independent WGS84 types and lazy loading; source/quality documentation; 82 passing tests and production build. PR targets `main`; do not merge without owner approval.

**Scope:** Use 110m and 50m Admin-0 overviews, 10m country/territory detail and 10m Admin-1 detail. Preserve source multipolygons, holes, islands, overseas grouping, identifiers, parent references and political classification/notes. Use geographic identity separately from gameplay. No extra shape simplification; document numeric precision and inherited defects. Keep high-resolution assets out of initial loading; provide country indexes and bounded regional chunks.

**Acceptance:** Verify source URLs/version/license/coverage before importing. Test identifiers, exact country/region references, polygon/multipolygon structure, coordinates, continents, representative France/Germany/USA/Russia/China/Brazil/Australia, asset hashes/budgets/lazy requests and preservation of the existing fictional scenario. Run `npm test` and `npm run build`. Document actual administrative coverage, missing/unnamed/unclassified records, disputed/dependent territories and source geometry limitations. Preserve all `src/game`, current map/UI/zoom/pan, deployment settings and dependencies.

### MAP-01B — World political and physical rendering

The owner authorized a two-PR split to protect mobile performance, geographic accuracy and the playable scenario.

#### MAP-01B.1 — World renderer and country colors

- [x] Implemented on `task/map-01b1-world-renderer`: read-only world atlas, all-continent WGS84 view, independent 1×–128× touch/mouse/keyboard camera, 258 stable unique country/entity colors with 344 checked neighbor pairs, clear national outlines, progressive country detail and bounded loading. Scenario menu opens the atlas; returning preserves the existing fictional map and all game workflows. 89 tests and production build pass; responsive browser/gameplay checks are documented in [docs/geography/RENDERING.md](docs/geography/RENDERING.md). PR [#18](https://github.com/alexeypetrichenko-a11y/heartland/pull/18) targets `main` and remains unmerged; do not merge without owner approval.

#### MAP-01B.2 — Physical terrain layers

- [x] Implemented on `task/map-01b2-physical-terrain`, based on MAP-01B.1: real Natural Earth I relief/land-cover reference, 110m/50m/10m source rivers and lakes, progressive viewport tiles/chunks, an independent Terrain toggle, political outlines above physical imagery, 96 passing tests, production build and mobile/desktop browser checks. 218 physical assets total 16,952,158 bytes, with only 167,321 physical-data bytes needed for the first atlas world view. Source/accuracy/size/test details: [docs/geography/TERRAIN.md](docs/geography/TERRAIN.md). PR [#19](https://github.com/alexeypetrichenko-a11y/heartland/pull/19) targets `main`, depends on #18, and remains unmerged; do not merge without owner approval.

**Explicit limitations for owner review:** The available pinned publisher raster is an older 2009/2012 snapshot, not current land cover. Broad mountain/wooded/arid patterns are shown; separate classified forest/desert/grassland boundaries and geomorphological plains are not reliably represented or invented. ESA WorldCover and GEBCO were investigated but not imported. One geometry-less river record and two invalid lake polygons are documented. Source-scale alignment and old-device/Safari performance need review. No simulation, terrain bonuses, military commands or fictional-scenario replacement.

### MAP-01C — Country and region selection (deferred)

- [ ] Not implemented. A separate assignment must decide selection behavior and how source entities, mixed administrative levels, unknown names and disputed/dependent territory groupings are presented. Geographic selection must not automatically create sovereign playable countries or political owners.

MIL-01, UI-01B.3, UI-01C, T09, multiplayer, real military positions, movement/engagement timing and transport-route mechanics remain outside this assignment.

## Milestone 1 (continued) — Complete the solo loop

### T09 — Playable game loop, lightweight result and small-screen QA

**Scope:** Connect game HUD, map, economy, army, diplomacy and turns into a coherent local flow. Provide a simple, **explicitly provisional** match endpoint/result without pretending full 35/30/20/15 + 50/50 scoring is implemented. Make limitations prominent.

**Acceptance:** From iPhone, choose country -> issue an order -> advance multiple turns -> see economy and borders respond -> get a visible ending/result; `npm run build` passes; existing deployment still works.

### Gate G1 — Stop and playtest

Owner tests T01–T09 on real iPhone. Correct usability/game-breaking bugs **before** starting additional large systems. No assumption that all nine tasks can be delivered in one Codex prompt or one week.

## Milestone 2 — Make the solo game strategically rich (incremental)

- **T10:** Save/load locally for single-player; versioned game-state format, resilience to interrupted session.
- **T11:** Implement national fiscal policy, debt, interest/default survival, strategic reserves (one thin layer at a time).
- **T12:** Regional economic outputs, demand/inputs and the first regional prices; later expand trade/transport capacity without replacing it with one global price.
- **T13:** Road/rail/sea transport connectivity and supply priorities, then military/civilian competition.
- **T14:** More complete standing orders, division supply/morale/organization, multiweek combat and retreat.
- **T15:** Manpower, equipment stocks, private defense procurement, production and training; then tech generations, research and modernization.
- **T16:** Internal stability, protests, strikes, rebellions and crisis-episode regime changes; independent-state creation after rebellions.
- **T17:** Peace negotiation, limited versus full defeat, annexation, direct-control dependent states and their economic consequences.
- **T18:** Expand AI economic/diplomatic/military decisions and balancing; respect treaty rules.
- **T19:** Implement end-of-match scoring: approved weights (35/30/20/15), 50/50 absolute/progress, normalization and final thresholds **only after owner approval of formula details**.

Each item above is a **feature family** to be broken into small PRs before implementation. None is preauthorized as a single giant change.

## Milestone 3 — Advanced military, diplomacy and world simulation

- **T20:** Strategic points with independent capture and local sieges; POW handling.
- **T21:** Air formations, missions, aircraft losses, fixed ground-based PVO coverage and suppression.
- **T22:** Naval task forces, submarines, ASW, convoys and partial naval blockade.
- **T23:** Carrier/land-based naval aviation, amphibious transports, staged landings and logistics.
- **T24:** Treaty notice/trust rules, public/private diplomacy refinement, aid/loans, sector sanctions and coalition participation.
- **T25:** Border visibility: infrastructure within 75 km, probabilistic concentrations/movement sightings, fog of war; never reveal exact unit composition automatically.
- **T26:** Country-level 0.3% weekly random-event trigger, eligible event consequences and seeded tests.
- **T27:** Replace the fictional test map stepwise with vetted modern-world data. **Ask for a decision about disputed territories and scope before importing.** The owner's MAP-01A assignment separately authorizes Natural Earth reference-data preparation with its source treatment documented and unchanged. That scoped authorization does not settle political/game ownership decisions, authorize scenario replacement or implement T27.

## Milestone 4 — Internet multiplayer and deployment maturity

- **T28:** Technical design spike: evaluate minimal authoritative turn-sync approach and persistence; explain operational costs and limitations, request owner's approval **before adding a service**.
- **T29:** Private match invitations, lobby, unique country choice, start readiness and 2–4 player state management.
- **T30:** Simultaneous turn submission, configurable 30/60/90/120-second or unlimited timer, early unanimous ready, single authoritative resolution.
- **T31:** Multiplayer saves/restore, unanimous pause, disconnection/reconnection and voluntary withdrawal -> AI.
- **T32:** Offline-capable installable PWA for single-player, including caching rules/version changes. Maintain online requirement for internet multiplayer.
- **T33:** Multiplayer usability, synchrony and resilience tests on mixed device types and weak connections.

## What NOT to do now

- No full global realistic map import in the first coding task.
- No rewriting the React/Vite project or GitHub Actions pipeline.
- No expensive cloud AI integration; no assumption that GitHub Pages itself is a multiplayer server.
- No broad new dependencies or comprehensive back-end before the owner approves architecture.
- No implementation of all design systems in one prompt.
- No arbitrary final victory formulas, crisis probabilities, military constants or territorial-policy decisions disguised as approved rules.

## Current delivery and remaining phases

MAP-01A is merged in PR #17. MAP-01B.1 is ready for review in PR #18; MAP-01B.2 is implemented for review in a separate dependent PR under the current assignment, with its source/biome limitations explicitly documented. MAP-01C selection, fictional-scenario replacement, political/game ownership mapping, MIL-01, UI-01B.3, UI-01C, T09 and multiplayer remain deferred. Do not merge either PR without owner approval.

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

- [x] Completed and locally verified: deterministic weekly budgets for all three fictional countries, one persistent tax policy with a measurable income effect, dashboard feedback, explicit atomic insufficient-funds rejection and recovery, focused economic/persistence/replay tests, responsive Chromium checks and production build. Provisional parameters/formulas are documented in `STATUS.md`; dedicated branch `task/t06-weekly-economy` awaits owner review.

**Scope:** For the fictional test world only, track small illustrative resource/income/expense/budget variables and one government policy/order that affects them weekly. No full market, debt or industry simulation yet.

**Acceptance:** A visible policy choice changes next week's measurable numbers; no negative resources without explicit handling; calculations covered by tests; parameters marked as prototype-only.

### T07 — Add a minimal land-division order and outcome

**Scope:** Add land divisions to fictional regions and one or two actions (move, defend, attack) with a small deterministic resolution model. Don't implement air, naval, manpower training, technology or full supply chains yet.

**Acceptance:** Player can move or fight across adjacent valid regions; ownership/strength changes according to a documented provisional model; cannot attack nonadjacent region; tests for casualties/ownership where appropriate.

### T08 — Add basic diplomacy and proactive AI decisions

**Scope:** Add simple public declaration or bilateral offer, a relationship indicator and **one meaningful autonomous AI action per turn based on basic national priorities**. Keep private/public distinction in the model even if the UI is minimal. Do not invent a comprehensive treaty framework.

**Acceptance:** Non-player country does not remain inert; AI decision is deterministic for a given state/seed; visible reaction to player choices; no cloud APIs required; tests for AI action and bilateral visibility.

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
- **T27:** Replace the fictional test map stepwise with vetted modern-world data. **Ask for a decision about disputed territories and scope before importing.**

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

## Next task (requires a separate assignment)

T05 is merged into `main` (PR #9). T06 is implemented on `task/t06-weekly-economy` and locally verified; its pull request awaits owner review. T07 is next in the backlog and requires a separate assignment. Do not merge without owner approval.

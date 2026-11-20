# Economy integration API (ECON-05)

Audience: Codex (or whoever connects the game to the economy) and the project owner. This document describes the small, stable API in `economy-engine/src/integration/` that the playable game should use to run its economy. Nothing in the game uses it yet: **this milestone prepares the integration; it does not perform it.**

- The worked example is `examples/fictional-game.ts` (`npm run example`).
- The tests are `tests/integration.test.ts`.
- The benchmark is `reports/INTEGRATION_BENCHMARK.md` (`npm run bench:integration`).
- The engine's full contract (all commands, effects, events and report fields) remains in [`ECONOMY_INTEGRATION.md`](ECONOMY_INTEGRATION.md). This API is a thin layer over it, not a second economy.

## 1. Principles

| | |
|---|---|
| One economy | A session wraps the engine's state and the figures of the last resolved week. Nothing is simulated twice; the views are computed once per week. |
| Pure and atomic | Like the game's `advanceTurn`, every call returns a new session and leaves its input untouched. Invalid input throws **before** anything is computed, so a refused week changes nothing. |
| Deterministic | The same session plus the same input always gives the same result, also after save and load (checked with `economyFingerprint`). |
| Same identifiers | Countries and regions keep the game's ids (§4). |
| Same week numbers | The game starts in week 1. The economy's first week is resolved when the session is created, by the AI autopilot alone, so `session.week === gameState.week` throughout. |
| Nothing runs on import | `src/integration/index.ts` only declares functions and constant data (tested). An economy exists only once `createEconomySession` is called. |

## 2. Quick start

```ts
// Load lazily, when a game is launched (never to display the globe):
const economy = await import('../../economy-engine/src/integration/index.ts');

// 1. Initialise: from the game's own state (a GameState fits GameWorldInput as it is).
let session = economy.createEconomySession(gameState);       // ~0.5 s desktop, ~2 s on a slow phone (§6)

// 2. Read indicators for the dashboard.
const alden = economy.getCountryEconomy(session, 'alden');     // GDP, growth, inflation, unemployment, stability,
                                                               // budget, treasury, debt, central bank, sectors
const vale = economy.getRegionEconomy(session, 'alden-vale');  // production and shortages by sector, occupation

// 3. Check the player's decisions while they are being prepared (nothing runs).
const problem = economy.checkEconomyCommands(session, [{ type: 'set-tax', countryId: 'alden', tax: 'income', rate: 0.22 }]);
if (problem) showError(problem);

// 4. Advance one week, inside the game's own weekly turn (§5).
session = economy.advanceEconomyWeek(session, {
  playerCommands: draftEconomicCommands,                       // this week's decisions
  regionControl: nextGameState.regions,                        // owners after this week's military moves
});
for (const event of session.summary.events) log(event);
if (session.summary.playerRegimeFell) endGameWithDefeat();     // GAME_DESIGN.md section 6

// 5. Save and restore with the game's save.
const text = economy.saveEconomySession(session);
session = economy.loadEconomySession(text);
```

## 3. API reference

All functions are exported from `src/integration/index.ts`. Types are in `src/integration/session.ts` and `scenario.ts`.

### Functions

| Function | What it does |
|---|---|
| `createEconomySession(world, { profiles? })` | Builds and calibrates the economy for the game's countries and regions (31-good catalogue, 10 sectors), then resolves week 1. `world` is a `GameWorldInput`, which the game's `GameState` satisfies. Throws on any mapping error (§4). |
| `getCountryEconomy(session, countryId)` | `CountryEconomyView` of the last resolved week. |
| `getRegionEconomy(session, regionId)` | `RegionEconomyView` of the last resolved week. |
| `session.summary` | `EconomyWeekSummary`: `week`, all `countries` and `regions` views, `events`, `playerRegimeFell`. |
| `checkEconomyCommands(session, commands)` | `null` if the commands are valid for the player's country this week, otherwise the reason. Changes nothing. |
| `advanceEconomyWeek(session, { playerCommands?, regionControl?, effects? })` | Resolves the next week and returns a new session. AI countries are steered by the engine's autopilot. Throws, changing nothing, if: a command is invalid or belongs to another country; a region or country is unknown; no player country is set; or the conservation audit fails. |
| `regionControlEffects(session, regions)` | The occupation and liberation effects that `regionControl` would generate (for inspection). |
| `withPlayerCountry(session, countryId \| null)` | The same session with another player country. Simulates nothing. |
| `saveEconomySession(session)` / `loadEconomySession(text)` | Text form for the game's save. Loading validates the economy and its consistency with the saved weekly summary. |
| `economyFingerprint(session)` | 16-character fingerprint. Identical sessions give identical fingerprints (desync and regression checks). |
| `legacyEconomyView(countryView)` | `{ treasury, weeklyIncome, weeklyExpenses }` for the current economy panel during the migration. Display only (§5). |
| `fictionalGameWorld(player?)`, `FICTIONAL_REGION_PROFILES`, `worldSpecFromGame`, `validateGameWorld`, `roadLaneId` | Mapping helpers and the fictional scenario (§4). |

### Indicators

All money is in the engine's illustrative units, as decimal numbers; the UI rounds them for display. Rates are fractions, so 0.05 means 5%.

| `CountryEconomyView` field | Meaning |
|---|---|
| `gdpReal`, `gdpNominal` | GDP of the week, at constant and at current prices |
| `gdpGrowth` | Annualised real growth over the weeks on record (up to a year). `null` until half a year is on record. |
| `inflation`, `unemployment` | Annualised consumer-price inflation; unemployment rate |
| `stability`, `unrestTier`, `regime` | Political stability (0–100); unrest tier (0–3); regime changes so far |
| `budget` | `revenue`, `expenditure`, `balance`, `taxes`, `interest`, `borrowed`, `repaid`, `fundedShare`, plus every line in `detail` |
| `treasury`, `debt`, `debtToGdp`, `marketRate`, `marketAccess` | Public finances |
| `centralBank` | Policy rate, firm loan rate, reserves, loans to the state and to firms, money issued, equity (capital), lending capacity, exceptional money, plant held for sale |
| `sectors[]` | Per sector: `output` and `capacity` at constant prices, `utilization`, `shortage` (index 0–1 of its worst-supplied good, population-weighted), `goodsShort` |
| `regionIds`, `population`, `controller` | Regions controlled (including any occupied), population, `'player'` or `'ai'` |

| `RegionEconomyView` field | Meaning |
|---|---|
| `controllerId`, `legalOwnerId`, `occupied`, `occupationPolicy`, `resistance` | Who controls the region's economy, who legally owns it, and the occupation state (Milestone 4) |
| `population`, `unemployment`, `inflation`, `deprivation` | Regional conditions |
| `sectors[]` | As above, for the region alone. A country's sector output is exactly the sum over its regions (tested). |

### Commands, effects and events

`playerCommands` takes the engine's existing `EconomyCommand`s unchanged:

| Area | Commands |
|---|---|
| Fiscal | `set-tax`, `set-spending`, `set-borrowing`, `repay-debt`, `declare-default` |
| Trade | `set-tariff`, `set-sanction`, `set-reserve` |
| War economy | `set-procurement-priority`, `set-transport-requisition`, `set-occupation-policy` |
| Public firms and ownership | `set-public-objective`, `set-public-support`, `recapitalize-firm`, `acquire-assets`, `nationalize`, `privatize` |
| Money (explicit decision only) | `recapitalize-central-bank`, `create-money` |

Their fields and limits are listed in `ECONOMY_INTEGRATION.md` §2. Every command must carry the player's `countryId`.

`effects` takes the engine's `ExternalEffect`s, which are facts decided by other game systems: damage, blockades, random events, annexation (`transfer-zone`), funds transfers. `events` are the engine's `EconomyEvent`s, unchanged.

## 4. Country and region mapping specification

| Game (`src/game/models.ts`) | Economy | Rule |
|---|---|---|
| `GameState.seed` | engine seed | the same number (0 … 2³²−1) |
| `Country.id`, `Country.name` | country id and name | **identical strings**: no translation table |
| `Region.id`, `Region.name` | zone id and name | identical strings. Region ids must differ from country ids. |
| `Region.ownerId` at game start | the zone's legal owner and controller | identical |
| `Region.ownerId` after a capture | the zone's controller only | sent each week as `regionControl`. A different owner becomes `occupy-zone` (moderate policy); the legal owner taking it back becomes `liberate-zone`. Annexation is never inferred: it needs an explicit `transfer-zone` effect (peace terms). |
| `Region.adjacentRegionIds` | one road lane per adjacent pair | id `road-<a>\|<b>` (ids sorted), distance 0.8 (provisional). Adjacency must be symmetric. |
| `GameState.playerCountryId` | the session's player country | its commands are accepted; every other country is run by the autopilot |
| `Country.controller` | `CountryEconomyView.controller` | derived from the player country |
| (not in the game) | region profile: `population`, `technology`, `populationGrowth`, `advantage` | supplied by `FICTIONAL_REGION_PROFILES` for the six fictional regions (invented illustrations); real regions will need approved data |

`validateGameWorld` rejects, with a clear message:
- duplicate or empty ids;
- an unknown owner or player country;
- asymmetric or unknown adjacency;
- a country without a region;
- a region without a profile.

The mapping test runs on the **real** `createInitialState()` and `selectCountry()` from `src/game`. Those files are read but not modified.

The fictional scenario's profiles describe three economies:

| Country | Regions | Character |
|---|---|---|
| Alden | Alden Vale, Reed Coast | balanced industrial economy, food and consumer goods |
| Belora | Amber Plain, Silver Hills | farming and mining |
| Cyrin | Cedar Basin, Dawn Ridge | energy exporter with an industrial ridge |

## 5. One authoritative economy: migration strategy

**Target.** The engine session is the only economic state. The game's T06 treasury (`resolveWeeklyEconomy`) stops running for a game that has an economy session, so money is never counted twice. Activating this needs the owner's decision A1 (`DECISIONS_REQUIRING_APPROVAL.md`), because the engine allows deficits, borrowing and default where T06 rejects the week.

| Game field or system | Fate |
|---|---|
| `Country.economy.treasury`, `weeklyIncome`, `weeklyExpenses` | **Replaced.** During the migration they are display values computed by `legacyEconomyView`, never stored back or fed into `calculateWeeklyBudget` (those numbers are not whole and would be counted twice). Remove them afterwards. |
| `Country.economicPolicy` ('standard' / 'tax-relief') and the `set-economic-policy` command | **Replaced** by engine commands (`set-tax` and the others). Mapping the two old policies onto tax rates is a design decision for the owner; no mapping is assumed. |
| `economy.ts` (`calculateWeeklyBudget`, `resolveWeeklyEconomy`) | Kept, with its tests, for games without an economy session, until removal is approved. Not called when a session exists. |
| `week`, `seed`, `playerCountryId`, `countries` (id, name, controller), `regions` (id, name, ownerId, adjacency) | **Kept**; the economy reads them |
| `divisions`, military orders and results, `relations`, diplomacy, standing orders | **Kept**, unchanged |
| Region ownership changes from combat | Kept in the game. **Adapter:** passed each week as `regionControl` |
| Economy panel | **Adapter:** reads `CountryEconomyView` (or `legacyEconomyView` for the old three tiles) |
| Defeat | **Adapter:** `summary.playerRegimeFell` (the first regime change of the player's country) ends the game |
| Save | **Adapter:** the game save stores `saveEconomySession(session)` next to the `GameState`. On load, check `session.week === gameState.week`. |

### Economic and military commands in the same weekly turn

The session lives next to the `GameState` (for example in the same React state). It is not inside `GameState`, so the game's own state, tests and copies stay small. One combined, atomic weekly turn:

1. **Validate everything first.**
   - The game's commands: `advanceTurn`'s existing validation.
   - The economic commands: `checkEconomyCommands`.
   - If anything is invalid, refuse the week and change nothing.
2. **Diplomacy and AI diplomacy**, as now.
3. **Military resolution**, as now. This gives the regions' owners for the end of the week.
4. **Economy:**

   ```ts
   advanceEconomyWeek(session, { playerCommands, regionControl: nextGameState.regions, effects })
   ```

   If it throws, refuse the whole week; the old `GameState` and session are still intact.
5. **Commit both together**: the new `GameState` (week + 1) and the new session (same week number). Then check `summary.playerRegimeFell` and show `summary.events`.

The economy resolves after the military, so a capture changes who controls a region's economy in the same week. Military effects with economic consequences arrive the same way, as `effects`: battle damage as `destroy-capacity`, blockades as `set-lane`, mobilisation as `set-mobilization`, arms purchases as `military-procurement`. These mappings are later, separately approved tasks.

## 6. Performance and loading

The figures below come from `reports/INTEGRATION_BENCHMARK.md`, headless Chromium with CPU throttling. That is a proxy for a phone, not an iPhone measurement.

| | 1× | 6× throttle |
|---|---:|---:|
| Create a session (build and calibrate the world, then week 1) | 0.5 s | 2.2 s |
| One week through `advanceEconomyWeek` (median) | 1.5 ms | 9 ms |
| A whole 156-week game | 0.35 s | 1.7 s |
| Save / load | 1.3 / 2.6 ms | 15 / 21 ms |
| Save size (week 156) | 296 KB | |
| Bundle loaded lazily (integration API + engine + catalogue) | 147 KB minified, 48 KB gzip | |

The API adds about 15% to the engine's own weekly cost (the state copy that makes the call atomic, and the weekly summary): 2.6 ms against 2.3 ms in Node.

Rules for the game:
- **Never import the integration module statically** from anything the globe or the start screen loads. Use `await import(...)` when the player launches a game, as `App.tsx` already does for `AtlasMap`.
- **Create the session once** per game, when it starts.
  - On a slow phone this takes about 2 s, so show a "Preparing the economy…" state.
  - Better for the fixed fictional scenario: ship a pre-built save of week 1 and use `loadEconomySession`, which takes about 20 ms. The result is identical, because creation is deterministic.
  - A Web Worker is an alternative, later.
- **Keep the session immutable.** Store the returned session, don't copy or mutate `session.state`, and don't serialise it every week (only when saving).

## 7. Instructions for Codex: connecting the UI (each step a separate, approved task)

Read `AGENTS.md` first.

- **Work in the game's own folders.** Do not change anything in `economy-engine/`.
- **Use only `economy-engine/src/integration/index.ts`.** Do not use `economy-engine/src/index.ts` or engine internals from the game; ask for an API change instead.
- **Owner decision A1 comes first.** Do not remove T06 or change its rules until the owner has approved that the engine replaces it.

1. **Bridge (no UI change).** Add `src/game/economyBridge.ts`:
   - `startEconomy(gameState)` → session. It lazily imports the integration module and calls `createEconomySession`.
   - `advanceGameWeek(gameState, session, commands, economyCommands)` → `{ gameState, session }`, following the turn order in §5 (validate both, resolve the game turn, then `advanceEconomyWeek` with `regionControl`, then commit both).

   Tests use the fixture: weeks advance in step, a capture becomes an occupation, an invalid economic command refuses the whole week, and save/load round-trips. Run `npm test` and `npm run build`.
2. **Launch.** In `App.tsx`, create the session when a game starts (after country selection), with a loading state. Keep it in React state next to `gameState`. Nothing must load for the globe alone; check the network panel or bundle chunks to confirm.
3. **Economy panel (read-only).** Show the player country's `gdpReal`, `gdpGrowth`, `inflation`, `unemployment`, `stability`, `budget.revenue` / `expenditure` / `balance`, `treasury` and `debtToGdp`.
   - Use the existing tile and DetailPanel style, on iPhone first (safe areas, touch).
   - Use "—" for a `null` growth.
   - Keep the "Illustrative units" caption.
4. **Region details.** In the region panel, show `RegionEconomyView` sectors (output, utilisation, shortage) and occupation status.
5. **First decisions.** One or two controls (income tax rate, social spending share) producing `set-tax` / `set-spending` commands for next week.
   - Validate drafts with `checkEconomyCommands` and show the reason when invalid.
   - Pending drafts behave like the current tax-policy draft.
6. **Events and defeat.** Show `summary.events` in the weekly log. End the game on `playerRegimeFell`.
7. **Save/load.** Store `saveEconomySession(session)` with the game save, and verify the week numbers match on load.
8. **Validate on an iPhone** before adding more screens.

## 8. Limitations

- **Integration not done.** The engine is still unused by the game, and T06 still runs in the game.
- **Invented regional data.** The six region profiles are illustrations, and road distance and lane capacities are provisional. The real playable countries and regions need approved data.
- **Starting adjustment.** The economy's first weeks include a price adjustment: annualised inflation of about 7–11% in week 1, about 4–5% after a year and about 2% in the third year. Growth is therefore hidden until half a year is on record.
- **Money units.** Figures are illustrative units with decimals. There are no national currencies; one shared money unit is used (R36 not implemented).
- **AI countries** are steered only by the fiscal autopilot. They don't use trade, war-economy or ownership commands.
- **Creation time.** Creating a session takes about 2 s on a slow phone (§6). Shipping a pre-built save or using a worker is recommended but not done.
- **Same-week effects.** Commands are checked against the state at the start of the week. A command that depends on an effect of the same week, such as setting the policy of a region occupied this week, must wait until the next week.
- **No iPhone or Safari measurement** yet. Determinism across JavaScript engines is designed for but untested.
- **Long-run collapse.** The documented collapse after about 290 years (Milestone 3) is far beyond the 52–156-week games.

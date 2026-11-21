# Economy integration API (ECON-05)

> **Handoff (contract 1.0.0):** the owner approved:
> - **A1:** the engine is the only economy;
> - **direct fiscal controls** replace the `standard` / `tax-relief` presets;
> - **a pre-built starting economy** for the fictional scenario;
> - **capture means occupation.**
>
> The exact, step-by-step instructions for connecting the game are in [`CODEX_HANDOFF.md`](CODEX_HANDOFF.md). Where it and this document differ, `CODEX_HANDOFF.md` is current.

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
| Same week numbers | The game starts in week 1. The economy's first week is resolved when the session is created, by the autopilot for every country, before any player decision (so it does not depend on the player's choice). `session.week === gameState.week` throughout. |
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
| `startEconomyFromSave(text, world, { profiles? })` | **The normal way to start a game:** the pre-built week-1 economy (`scenarios/fictional-week1.economy.json`), checked against the world's fingerprint, with the player's country attached. Identical to `createEconomySession`, and 250–340 times faster. |
| `fiscalLimits(session)`, `fiscalCommands(countryId, { taxes?, spending? })` | The limits of the direct fiscal controls, and the `set-tax` / `set-spending` commands for the controls that changed (CODEX_HANDOFF.md §4) |
| `advanceWeekTogether({ game, session, advanceGame, economyCommands?, effects? })` | The combined, atomic weekly turn: check, game turn, economy turn with the new region owners, both returned together (CODEX_HANDOFF.md §5) |
| `weeklyEconomyNotices(session)`, `describeEconomyEvent(session, event)` | One notice per event (`defeat`, `critical`, `warning`, `info`), with text, sorted most severe first (CODEX_HANDOFF.md §6) |
| `worldFingerprint(world, profiles?)`, `session.worldFingerprint` | Fingerprint of the world an economy belongs to |
| `INTEGRATION_CONTRACT_VERSION` | `'1.0.0'` |
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
| `fiscal` | Current tax rates (`income`, `consumption`, `corporate`) and spending shares of GDP (`administration`, `social`, `military`, `infrastructure`) |
| `budget.detail.surplusReturned` | ECON-07: cash a debt-free treasury returned to households this week (only above a strategic reserve of 26 weeks of core spending). Counted in `expenditure`. |
| `budget.detail.unpaidInterest` | Interest due but not paid this week, which is added to the debt. Debt changes by exactly `borrowed − repaid − written off in a default + unpaidInterest` (tested). |

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

**Target (A1 approved).** The engine session is the only economic state. T06 is removed, not kept in parallel. The exact file-by-file migration is in `CODEX_HANDOFF.md` §3; this section gives the background.

| Game field or system | Fate |
|---|---|
| `Country.economy.treasury`, `weeklyIncome`, `weeklyExpenses` | **Removed** (A1). The panel reads `CountryEconomyView` (`treasury`, `budget.revenue`, `budget.expenditure`). `legacyEconomyView` remains only as a convenience in the old shape; its values must never be stored or fed into any game arithmetic. |
| `Country.economicPolicy` ('standard' / 'tax-relief') and the `set-economic-policy` command | **Retired** (approved). Replaced by direct controls for three taxes and four spending categories (`fiscalCommands`); no mapping from the old presets. |
| `economy.ts` (`calculateWeeklyBudget`, `resolveWeeklyEconomy`) | **Removed** with its tests (approved, A1) |
| `week`, `seed`, `playerCountryId`, `countries` (id, name, controller), `regions` (id, name, ownerId, adjacency) | **Kept**; the economy reads them |
| `divisions`, military orders and results, `relations`, diplomacy, standing orders | **Kept**, unchanged |
| Region ownership changes from combat | Kept in the game. **Adapter:** passed each week as `regionControl` |
| Economy panel | Reads `CountryEconomyView` and edits the fiscal controls (CODEX_HANDOFF.md §4) |
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
| Bundle loaded lazily (integration API + engine + catalogue) | 153 KB minified, 50 KB gzip | |
| Start from the pre-built starting save | 1.6 ms | 7.5 ms |

The API adds about 15% to the engine's own weekly cost (the state copy that makes the call atomic, and the weekly summary): 2.6 ms against 2.3 ms in Node.

Rules for the game:
- **Never import the integration module statically** from anything the globe or the start screen loads. Use `await import(...)` when the player launches a game, as `App.tsx` already does for `AtlasMap`.
- **Start from the pre-built save** with `startEconomyFromSave`: about 8 ms at 6× CPU throttle, against about 2 s for `createEconomySession`, with an identical result. The save is 182 KB (63 KB gzip), and the game loads it lazily as text (`?raw` in Vite).
- **Keep the session immutable.** Store the returned session, don't copy or mutate `session.state`, and don't serialise it every week (only when saving).

## 7. Instructions for Codex

Superseded by [`CODEX_HANDOFF.md`](CODEX_HANDOFF.md), which covers:
- starting a game (§2);
- the exact T06 migration (§3);
- the fiscal controls with command examples (§4);
- weekly sequencing and rollback (§5);
- events and defeat (§6);
- game-side tests (§7);
- when to ask Claude (§8).

## 8. Limitations

- **Integration not done.** The engine is still unused by the game, and T06 still runs in the game until Codex applies `CODEX_HANDOFF.md`.
- **Invented regional data.** The six region profiles are illustrations, and road distance and lane capacities are provisional. The real playable countries and regions need approved data.
- **Starting adjustment.** The economy's first weeks include a price adjustment: annualised inflation of about 7–11% in week 1, about 4–5% after a year and about 2% in the third year. Growth is therefore hidden until half a year is on record.
- **Money units.** Figures are illustrative units with decimals. There are no national currencies; one shared money unit is used (R36 not implemented).
- **AI countries** are steered only by the fiscal autopilot. They don't use trade, war-economy or ownership commands.
- **Creation time.** Building a new economy takes about 2 s on a slow phone. The pre-built starting save avoids this for the fictional scenario; other worlds will need their own save.
- **Same-week effects.** Commands are checked against the state at the start of the week. A command that depends on an effect of the same week, such as setting the policy of a region occupied this week, must wait until the next week.
- **No iPhone or Safari measurement** yet. Determinism across JavaScript engines is designed for but untested.
- **Long-run collapse.** The documented collapse after about 290 years (Milestone 3) is far beyond the 52–156-week games.

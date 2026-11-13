# Integrating the economic engine into HEARTLAND

Audience: whoever wires `economy-engine/` into the game after the owner has approved the open decisions ([`DECISIONS_REQUIRING_APPROVAL.md`](DECISIONS_REQUIRING_APPROVAL.md)). Nothing here has been done yet: **the engine is isolated and the game does not use it.** No file outside `economy-engine/` was changed, the game's 63 tests still pass and its production bundle is byte-identical.

## 1. How to include it

The engine is plain TypeScript with `.ts` import specifiers, exactly like the game's own `src/game/*`. Import from **one file only**:

```ts
// e.g. from src/game/economyBridge.ts
import { advanceEconomy, createEconomy, serializeEconomy, deserializeEconomy, autopilotCommands, getCountry } from '../../economy-engine/src/index.ts';
```

Verified: `economy-engine/src` and `examples/` type-check cleanly under the game's own `tsconfig.json` (DOM libs, `vite/client`, `verbatimModuleSyntax`), and an `esbuild` bundle of the engine is 90 KB minified / 30 KB gzip. The engine has no dependencies, uses no browser or Node API, and needs no PWA/service-worker change. The existing GitHub Pages workflow is unaffected (the engine is not part of the build until the game imports it).

Alternatively move the folder under `src/` (e.g. `src/economy/`) when approved; all internal imports are relative.

**Running the engine's own checks** needs only Node ≥ 22.12 (types are stripped at run time):

```bash
cd economy-engine
npm test               # 82 fast tests (≈20 s) incl. the ten scenarios
npm run test:long      # 10,000-week run with save/restore (≈6 s)
npm run typecheck      # needs TypeScript (the game's node_modules has it)
npm run scenarios      # regenerates reports/SCENARIO_REPORTS.md
npm run stress         # regenerates reports/STABILITY_REPORT.md (≈2.5 min)
npm run sim -- --turns 5000 --save /tmp/w.json      # standalone simulator, any number of turns
npm run sim -- --load /tmp/w.json --turns 52 --audit
```

## 2. The contract in one picture

```
 HOST GAME (rules for war, diplomacy, who may act, who is defeated)
   │  begin of turn
   │   • player economy commands   ─┐ validated by the host:
   │   • AI commands (autopilot)    ├─▶ { commands: EconomyCommand[], effects: ExternalEffect[] }
   │   • facts from other systems  ─┘   the engine does NOT know who is allowed to command whom
   ▼
 advanceEconomy(state, input, { audit: true })      ← pure; throws on invalid input, state untouched
   │
   ▼
 { state: EconomyState, report: TurnReport }
   │  end of turn
   │   • store `state` (it is the economic save)
   │   • show `report` numbers, log `report.events`
   └─▶ events → host decisions (regime-change of a human player ⇒ defeat; default ⇒ message)
```

`advanceEconomy` is the pure, atomic call (same contract as the game's `advanceTurn`: invalid input throws and nothing changes). `advanceEconomyInPlace` is the fast path for bulk fast-forwarding (no clone); it validates before changing anything but cannot undo a failed *audit*.

### Beginning of a turn: what the host sends

**Commands** — standing decisions of a government. They persist until changed.

| `type` | Fields | Meaning / validation |
|---|---|---|
| `set-tax` | `countryId`, `tax: 'income'│'consumption'│'corporate'`, `rate` | 0 … `maxTaxRate` (0.7) |
| `set-spending` | `countryId`, `category: 'administration'│'social'│'military'│'infrastructure'`, `share` | share of GDP, 0 … 0.5 |
| `set-tariff` | `countryId`, `goodId`, `rate│null`, `partnerId?` | 0 … 3; with `partnerId` it overrides for that partner; `null` removes the exception |
| `set-sanction` | `countryId`, `targetId`, `goodIds: string[]│'all'`, `imports`, `exports` | imposer refuses to buy from / sell to the target; both false lifts it; tradable goods only |
| `set-reserve` | `countryId`, `goodId`, `targetWeeks`, `mode?: 'automatic'│'hold'│'release'│'fill'` | strategic reserve target (0…52 weeks of use); storable goods only |
| `set-borrowing` | `countryId`, `enabled` | allow/forbid new borrowing |
| `set-procurement-priority` | `countryId`, `enabled` | war economy: state orders served before households |
| `repay-debt` | `countryId`, `amount` | repays what the treasury can afford |
| `declare-default` | `countryId` | immediate default (see design §8) |

**Effects** — facts decided by *other* game systems; the engine just applies them.

| `type` | Fields | Typical source in the game |
|---|---|---|
| `transfer-zone` | `zoneId`, `ownerId` | conquest, annexation, secession (capital moves with the region) |
| `destroy-capacity` | `zoneId`, `goodId│'all'`, `fraction` | bombing, battle damage |
| `destroy-stock` | `zoneId`, `goodId│'all'`, `fraction` | looting, fires, blockade losses |
| `set-lane` | `laneId`, `costMultiplier`, `throughput` | blockade, war zone, port capture (throughput 0 = closed, 1 = open) |
| `set-mobilization` | `zoneId`, `personnel` | manpower taken from the labour force |
| `military-procurement` | `countryId`, `goodId`, `quantity` | extra orders for equipment |
| `production-shock` | `zoneId`, `goodId`, `factor`, `recoveryWeeks` | disaster, crop failure, accident, epidemic (the 0.3% weekly events) |
| `stability-modifier` | `countryId`, `value` | war weariness, occupation, propaganda (a *level*, replaced each time) |
| `transfer-funds` | `fromCountryId`, `toCountryId`, `amount` | aid, indemnities; capped by the sender's treasury, creates no money |

**Order inside the engine:** effects first, then commands. Within each list, in array order. Within a week, a later command on the same setting overrides an earlier one (this is how scripts override the autopilot).

**Ownership is the host's job.** Use the pattern in `examples/heartland-adapter.ts` (`assertPlayerOwns`): refuse any command whose `countryId` is not the player's country, exactly as `advanceTurn` already does for its own commands.

### AI countries

`autopilotCommands(state, aiCountryIds)` returns ordinary commands (taxes, social spending) for the countries nobody steers. Use it, replace it, or write the real economic AI later: the engine cannot tell the difference. Sanctions, tariffs and reserves by AI countries are decisions of the future diplomatic/economic AI; the engine only executes them.

### End of a turn: what the host reads

`TurnReport` (full detail with `report: 'full'`, the default; `'none'` is the cheap mode for bulk runs):

| Field | Use |
|---|---|
| `countries[i]`: `gdpReal`, `gdpNominal`, `gdpRealPerCapita`, `consumptionPerCapita`, `cpi`, `inflation` (annualised), `unemployment`, `wage`, `deprivation` | dashboards, score inputs |
| `budget`: every tax, every spending line, `interest`, `balance`, `borrowed`, `repaid`, `fundedShare` | budget screen; `fundedShare < 1` means spending had to be cut |
| `treasury`, `debt`, `debtToGdp`, `marketRate`, `averageRate`, `marketAccess` | debt/credit screen |
| `stability`, `unrestTier`, `regime` | politics screen |
| `householdFill[g]`, `governmentFill[g]`, `buyPrices[g]` | shortage and price alerts per good |
| `exports`, `imports`, `tradeBalance`, `reserves[g]`, `armsStock` | trade and military-economy screens |
| `goods[g]`: world price, production, uses, traded volume, unmet demand | market screen |
| `trade[]` (only with `tradeDetail: true`) | route map of bilateral flows |
| `world`: GDP, inflation, interest rate, money, debt, population, `rebases` | world summary |
| `events[]` | `sovereign-default`, `market-access-lost/restored`, `missed-payment`, `unrest-started/escalated/ended`, `regime-survived`, `regime-change` |
| `audit` | conservation checks (see below) |

**Read-only helpers** (no turn is run): `getCountry`, `getZone`, `listSanctions`, `getProgress` (ratios since the start of the game), and history series `getCountryHistory / getGoodHistory / getWorldHistory` for charts (52 weekly, 40 quarterly, 50 yearly points, kept automatically).

### What the host must decide from events

* `regime-change` for the player's country → defeat (GAME_DESIGN.md §6). The engine never ends a game by itself.
* `sovereign-default` → show it; it is **not** a defeat.
* A country's `unrestTier` ≥ 1 → protests/strikes (the output cost is already applied by the engine; the host may add local unrest effects on the map).
* Defeat by subordination, capitulation, annexation → host decides; then send `transfer-zone` effects.

## 3. Mapping the game's world to the engine's

| Game (`src/game/models.ts`) | Engine |
|---|---|
| `Country.id` | `CountryId` (same string) |
| `Region.id`, `Region.ownerId` | zone id, zone owner. Ownership changes ⇒ `transfer-zone` (see `ownershipEffects`) |
| `Region.adjacentRegionIds` | one `lane` per adjacent pair (`worldSpecFromHost`). Sea routes, straits and ports are **waypoints + lanes** you add |
| future strategic points/ports/airports | lanes between zones and waypoints; capture ⇒ `set-lane` |
| `Country.economy.treasury` | `countries[i].treasury` |
| `Economy.weeklyIncome / weeklyExpenses` | `budget.revenue / budget.spending` (the `legacy` field returned by `runHostTurn` in the example) |
| `Country.economicPolicy` ('standard' / 'tax-relief') | one or more `set-tax` commands (e.g. income tax − 6 points) |

**Data the game still has to supply** for real regions: `population`, `technology`, `populationGrowth`, per-good `advantage`, optional `populationLimit` and `resourceHeadroom` (see `ZoneSpec`). The numbers in `examples/heartland-adapter.ts` are invented illustrations.

## 4. Conflicts with the existing rules (owner decision needed)

The T06 economy says: treasury never below zero; a week with insufficient funds is **rejected**; no borrowing. `GAME_DESIGN.md` §5 says the player *may spend beyond revenue and borrow* and default is survivable. The engine implements the design document: a government that cannot pay has its **spending scaled down** (`fundedShare`), borrows if it has market access, and eventually defaults. Replacing T06 therefore changes a visible rule; do not do it without approval. The two systems can coexist during a transition (T06 for the UI numbers, the engine behind a switch).

## 5. Saving and loading

```ts
const text = serializeEconomy(state);      // plain JSON string, 260–330 KB, no hidden state
const state = deserializeEconomy(text);    // validates structure, ranges, ids, cross-references; throws on damage
```

* Store it inside the game's own save (or next to it). A restored state continues **bit-for-bit** as the original would have (tested at many cut points, and after 5,000 weeks).
* `STATE_VERSION` is stored in every save; a different version is rejected with a clear message. Write a migration when the format changes.
* The save contains the configuration, so a change of default parameters never silently alters an existing game.
* `hashEconomy(state)` → 16 hex characters fingerprint. Use it for desync detection and golden-file tests.

## 6. Performance and scheduling

* Per week (9 countries / 11 zones / 7 goods): ≈0.25 ms desktop Chromium, ≈1.4 ms at 6× CPU throttle. Even 100× slower than that is ≤ 0.15 s per turn, inside a 30–120 s turn timer. Memory: ≈10 MB heap; steady forever.
* **Building a world** is the expensive step (≈0.25 s desktop, ≈1 s at 6× throttle, ≈170 weeks of calibration). Do it once at match creation, off the UI thread if convenient (a Web Worker or `await` yielding), or ship a pre-built `serializeEconomy` string for fixed scenarios.
* Use `report: 'none'` when fast-forwarding (e.g. AI-only turns). The conservation audit is computed every week anyway; `audit: true` only makes a failure throw, and neither it nor the full report added a measurable cost (< 5%, inside noise).
* Larger worlds scale roughly linearly in zones × goods and quadratically in zones for the route table (recomputed only when lanes change). A generated 60-zone world was run in the tests.
* iPhone/Safari were **not** available; the figures above are Chromium proxies (`reports/BROWSER_BENCHMARK.md`).

## 7. Multiplayer (future, T28–T31)

The engine is built for lockstep: send *commands/effects*, never states; every client calls the same `advanceEconomy`; compare `hashEconomy` each week to detect desync. All arithmetic is basic IEEE-754 (`+ − × ÷`, comparisons, `min/max/floor/abs/sqrt`); `Math.pow/exp/log/sin` and `**` are banned from `src/` by a test because engines may round them differently. **This is designed-for but untested across engines:** before relying on it, run the golden-hash test on Safari/JavaScriptCore (e.g. `hashEconomy` after 520 weeks of the test world is `61f628925444b0e0` on V8 — Node 22 and Chromium).

## 8. Units, display, and money rebasing

* Quantities and money are abstract ("illustrative units", as the existing UI already labels them). Prefer **real** (constant-price) indicators and ratios for display.
* After a very long game, `world.rebases` > 0 means all money amounts were divided by 2^30 that many times (this protects against floating-point overflow, see design §9). Percentages, ratios, rates and real quantities are unaffected. If you display absolute money, multiply by `1073741824 ** rebases` (or just keep showing the current units).

## 9. Suggested integration steps (each a small, separately approvable task)

1. Owner decisions on the list in `DECISIONS_REQUIRING_APPROVAL.md`, especially goods/sectors, default consequences, regime thresholds, and whether the engine replaces T06.
2. Data task: economic profile per region (population, technology, advantages) and transport lanes for the real map.
3. Bridge task: `src/game/economyBridge.ts` (create world, `runHostTurn`-style call inside `advanceTurn`, ownership sync, defeat on `regime-change`). Tests with the game's fixture (see `tests/adapter.test.ts`).
4. UI task: economy panel from `TurnReport` + `getCountry`; policy controls for the commands above.
5. Save/load (T10): store `serializeEconomy` with the game save.
6. Events (T26): map random events to `production-shock`. War (later): map damage to `destroy-capacity`, `set-lane`, `transfer-zone`.
7. Score (T19): consume `getProgress` once the formula is approved.

## 10. What the engine deliberately does not do

* It does not decide who may issue a command, who wins or loses, or what a regime change means.
* It does not model war, diplomacy, treaties, intelligence or events; it accepts their *consequences*.
* It does not read a clock, a network, storage or the DOM; the host supplies every input.
* It does not guarantee any country survives: collapses, defaults and unrest are possible results of play. It guarantees only that the *simulation itself* stays consistent (conservation, finiteness, determinism) for any number of turns.

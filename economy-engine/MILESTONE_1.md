# Milestone 1: sectors, goods catalogue and firm aggregates

Status: **implemented on branch `feature/economy-engine-m1` (based on `feature/economy-engine`), awaiting owner review.** Nothing outside `economy-engine/` was changed. Every value below is a provisional proposal, not an approved game rule.

## 1. What changed

| Area | Before | After |
|---|---|---|
| Sectors | Each good was its own "sector" (`types.ts`: "each sector produces exactly one good"). | `config.sectors` defines sectors; each good names its sector with `sectorId`. A sector can have several goods. |
| Goods | 7 goods. | New **31-good catalogue in 10 sectors** (`CATALOGUE_GOODS`, `createCatalogueConfig()`), following R59 and R64–R71. The 7-good catalogue is kept as the **legacy/compatibility** catalogue and is still the default of `createConfig()`. |
| Firms (R57) | One cash balance per **zone** (`zone.firmMoney`, `zone.firmCosts`) shared by every sector. | **Firm aggregates per zone × sector × ownership** (private, public, mixed): `state.firm.cash / costs / employment / revenue`. Each aggregate pays its own wages, inputs, investment and taxes, and pays dividends to its owners or receives rescues from them. |
| Tiers (R58) | One capacity per zone × good, plus a wide "viability band" standing in for hidden firm differences. | **Production lines per zone × good × owner × tier** (strong, average, fragile): `state.firmLine.capacity`. Tiers differ in labour productivity (1.1 / 1.0 / 0.9). Output is supplied in **merit order** (strong first), each tier stops at its own break-even, and loss-making tiers are scrapped first. |
| Construction | Per zone × good. | Per zone × good × owner (`state.firmGood.build1–3`), paid by that owner's aggregate. |
| Markets | Zone × good markets. | **Unchanged** zone × good markets, prices and stocks. Sales revenue is shared between owners by who owns the stock (`firmGood.stockShare`), or for made-to-order goods by who produced it. |
| Recipes | Multi-input Leontief recipes; a non-storable good could not use another non-storable good. | Same multi-input recipes. Non-storable goods may now use other non-storable goods, provided there is no loop; they are cleared in dependency order (electricity before the services that use it). |
| Public finances | — | New budget lines `firmDividends` (revenue from public and mixed firms) and `firmSupport` (rescues of struggling public and mixed firms). |
| Saves | `STATE_VERSION` 1. | `STATE_VERSION` **2**. Validation also checks the new arrays, rejects negative cash, capacity or construction, and rejects ownership shares outside 0..1. Version-1 saves are rejected with a clear message: no game save exists yet, so no converter was written. |
| Read-only view | — | `getFirmAggregates(state, zoneId)` lists every aggregate with its cash, costs, employment, revenue and capacity per tier. |

Code: `src/types.ts`, `src/config/defaults.ts`, `src/core/{model,planning,market,production,stats,state,rebase,commands,selectors,finance}.ts`, `src/world/{builder,testWorld}.ts`, `src/index.ts`. New files: `tests/firms.test.ts` (14 tests), `sim/benchmark.ts` (`npm run bench`), `reports/BENCHMARK.md`.

## 2. The 31-good catalogue (provisional, R64)

| Sector | Goods |
|---|---|
| Agriculture | cereals, other agricultural products |
| Mining | iron ore, non-ferrous ores, strategic minerals, **uranium** (R68), coal |
| Hydrocarbons | crude oil, natural gas, refined fuels |
| Electricity | electricity (**cannot be stored between weeks**, R66) |
| Heavy industry | steel, **aluminium** (R70), chemicals (single good; R72 not approved), cement |
| Manufacturing | machinery, **electronic components**, **semiconductors** (R71), vehicles |
| Consumer goods | **processed food** (R67), everyday goods, durable goods |
| Military industry | small arms, munitions, military vehicles, military aircraft, naval vessels (predefined equipment classes, R65) |
| Construction | construction materials, construction work (local, made to order) |
| Services | general services (local, made to order), technology/finance/business services (tradable, made to order) |

Most recipes have four to seven inputs, for example steel ← iron ore + coal + electricity + machinery + services, or electronic components ← semiconductors + aluminium + chemicals + strategic minerals + … The full table is in `src/config/defaults.ts` (`CATALOGUE_GOOD_DRAFTS`).

## 3. Results (all produced by running the code)

| Check | Result |
|---|---|
| Engine type-check (`tsc`, full and core-only) | pass |
| Engine fast suite `npm test` | **96 / 96 pass**: the 82 existing tests, adapted, plus 14 new Milestone 1 tests |
| Engine long test `npm run test:long` (10,000 weeks + save/restore) | pass |
| Ten mandatory scenarios | **10 / 10, all checks pass** (one horizon extended, see §5) |
| 31-good world, 520 weeks, audit every week | conservation error ≤ 2.6e-15; money = household + firm + treasury holdings every week; zone employment = sum of aggregate employment; stock shares sum to 1; budget identities hold; electricity is never stored |
| 31-good world, 5,200 weeks (100 years) | worst audit 5.0e-15, 0 defaults, 0 regime changes, highest country unemployment at the ten-year checkpoints 5.9%, save/restore exact, 3.0 ms/week |
| Save/load, 31-good world | restore at weeks 0, 1, 37 and 100 continues **bit-identically** to week 150; building the world twice gives the same fingerprint |
| Golden fingerprint (legacy world, 672 weeks) | re-pinned to `6202f97a08efb829`; **identical in Node and headless Chromium** (1×, 4×, 6× CPU throttle) |
| Main game `npm test` / `npm run build` | 63 / 63 pass; build passes (game code untouched) |

**Legacy world against the pre-Milestone-1 engine** (same world and autopilot, baseline measured on commit `ee5df99`): world real GDP −0.21% at week 52, −0.14% at week 104, +0.09% at week 260 and +1.13% at week 520. The largest country deviation is 2.5% (Ostmark, week 520). The difference comes from firm cash now being held per sector instead of pooled per zone.

**Benchmark** (`npm run bench`, desktop Node 22, audit on; full table in `reports/BENCHMARK.md`):

| World | ms / week | World build | Save (gzip) |
|---|---:|---:|---:|
| 11 zones × 7 goods (legacy) | 0.70 | 0.4 s | 119 KB |
| 11 zones × 31 goods | 2.58 | 1.0 s | 232 KB |
| 30 zones × 31 goods | 12.1 | 3.5 s | 381 KB |
| **60 zones × 31 goods** | **36.5** | 10.7 s | 716 KB |
| 120 zones × 31 goods | 121.7 | 36.9 s | 1,314 KB |

At 60 zones the market clearing takes 76% of the time and the new firm logic (planning) 14%. This is inside the 35–70 ms per week that the audit estimated. An iPhone has **not** been measured. Headless Chromium at 6× CPU throttle runs about 3–5 times slower than desktop Node, so roughly 0.1–0.2 s per weekly turn at 60 regions is expected: an estimate, not a measurement.

## 4. Provisional assumptions (to approve, adjust or reject)

1. **Catalogue contents**: the 31 goods, their recipes, freight, storability, capital needs and final-use shares (household budget, government administration, military, infrastructure, investment).
2. **Starting ownership per sector**, the same in every zone. Examples: hydrocarbons 35% public and 15% mixed; electricity 35% and 20%; military industry 40% and 20%; consumer goods and construction fully private. Countries cannot yet set their own ownership mix.
3. **Starting tier shares**: about 25% strong / 50% average / 25% fragile; agriculture, consumer goods, construction and services 20 / 50 / 30.
4. **Tier productivity 1.1 / 1.0 / 0.9**. A wider spread such as 1.2 / 0.8 would leave fragile firms in labour-heavy sectors (services) below their running costs even at normal prices, so the starting state could not be a resting point.
5. **Merit order**: demand is met by strong lines first, then average, then fragile; owners within the same tier share pro rata. Each tier produces only while the price covers its own running costs, smoothed over a ±3% band (the legacy catalogue keeps its ±10% band).
6. **Tier movements**: replacing worn-out plant keeps a firm in its tier; expansion always enters the average tier; loss-making tiers are scrapped faster. No other transitions yet, so over decades the mix drifts towards the average tier (strong share 22% → 14% over 20 years in the test world).
7. **Public and mixed firms follow the same rules as private ones**; only the owner differs. Profits go to the treasury of the zone's *current* owner; mixed firms split 50 / 50 (`mixedPublicShare`). Rescues of public firms come from the treasury, limited to 1% of it per zone per week; private rescues come from local households, limited to 1% of their cash per zone per week (as before).
8. **New sectors in a zone are started by private firms only**; the state founds no new firms (no such rule is approved).
9. **Each zone keeps one shared store of inputs**. Every aggregate orders and pays for its share of the zone's input needs.
10. **Electricity is tradable** with high freight (grid losses), so supply comes mostly from nearby. Technology/finance services are tradable. General services and construction work are local.
11. **Energy inputs are fixed proportions** (no substitution yet). For example, a gas shortage cuts electricity output in proportion.
12. **"Arms delivered"** in reports still counts a single good (military vehicles), the largest military-procurement good.
13. **Calibration**: the average tier earns exactly the normal return at the starting prices, and the starting wage is set from the workers that merit-order supply really needs.

## 5. Behaviour changes, limitations and open points

* **Scenario 3 (50% harvest collapse): recovery now takes 218 weeks instead of 165.** Farm losses are no longer covered by the cash of every other firm in the zone. They drain the farm aggregate's own cash and then its owners, the local households, which reduces their spending. I extended the scenario from 260 to 364 weeks so that its unchanged check ("GDP back within 2% of control for 13 weeks") can be observed. **This is a test change; please confirm it is acceptable.** Firm credit (bank loans), which would cushion such shocks, is not implemented yet.
* **Scenario 6B (government overspending without any policy response): Tavros ends at 75% of control GDP instead of 103%.** The sequence of events is the same within one to three weeks (defaults at weeks 116, 278 and 474). A random regime roll at week 478 now produces a regime change where the old run survived, so the end-of-run snapshot falls in a different phase of the cycle. All checks still pass. Other scenario indicators moved by small amounts (see `reports/SCENARIO_REPORTS.md`).
* **Firm debt (part of R57) is not modelled yet**: aggregates have cash but cannot borrow.
* R61–R63 and the audit defects C1–C4 are **untouched**: automatic money creation, occupation, transport requisition, serial defaults and the reserve money pump.
* Public firms in a zone that changes hands now pay the new owner. R62 (legal owners are kept under occupation) is not yet implemented.
* Building a 60-zone world takes about 11 s on desktop, likely 30–60 s on a phone. The game should ship a pre-built starting state rather than calibrate on the device.
* The default `createConfig()` is still the legacy 7-good catalogue, so that the existing scenarios, tests and integration example keep their meaning. Switching the default is a decision for a later milestone.

## 6. Proposed Milestone 2 (for approval; nothing implemented)

**Firm finance and money**, which removes the main gaps that Milestone 1 exposed:

1. Firm debt per aggregate and bank credit for working capital and investment, with interest, a credit limit and firm bankruptcy, i.e. the aggregate shrinking or changing hands per R57.
2. Normal central-bank credit with limited capacity (R61), replacing the automatic money creation (C1); exceptional money creation only on explicit player command.
3. Close the reserve fill/release money pump (C4).
4. Tier transitions (R58): investment can upgrade fragile capacity; wear and crises downgrade it. Rates are to be calibrated.
5. Tests: credit and debt conservation, bankruptcy without hidden firms, scenario 3 again (it should recover faster once firms can borrow), and the benchmark.

Ownership changes, occupation (R62), transport requisition (R63) and energy substitution (R66) would follow in Milestone 3.

# HEARTLAND economic engine — design

**Status:** working prototype, isolated in `economy-engine/`. Not wired into the game.
**Everything numeric here is a provisional balancing choice for fictional test worlds, not an approved game rule.** Per `AGENTS.md` and `GAME_DESIGN.md` §17 (items 1 and 6), the goods list, recipes, formulas and AI behaviour are *proposals* awaiting owner approval; the full list is in [`DECISIONS_REQUIRING_APPROVAL.md`](DECISIONS_REQUIRING_APPROVAL.md).

Throughout, **implemented** means the code exists and was run in the tests/reports listed at the end; **proposed** means it is not built.

---

## 1. What the engine is

A deterministic simulation of a world economy, advanced one week at a time:

```
state  ──advanceEconomy(state, { commands, effects })──▶  new state + report
```

* **No limit on turns.** The turn counter is a safe integer; memory is constant; money amounts are kept in a safe range automatically (§9). Runs of 100,000 weeks (≈1,900 years) and a 1,000,000-week run (≈19,200 years: 0 defaults, 0 regime changes, max unemployment 3.8%, bit-exact restore, memory flat) were executed (see `reports/STABILITY_REPORT*.md`).
* **Deterministic.** Same state + same input ⇒ bit-identical result. Randomness is a pure function of `(seed, week, stream, index)`; there is no hidden generator state to save.
* **Serializable.** The whole state is plain JSON (`serializeEconomy` / `deserializeEconomy`). A restored game continues bit-for-bit identically.
* **Offline, dependency-free, isolated.** No network, no clock, no storage, no DOM, no Node APIs in `src/` (enforced by a test). Nothing outside `economy-engine/` was modified.
* **Phone-sized.** 90 KB minified / 30 KB gzip. ≈0.25 ms per simulated week on a desktop (nine countries, eleven zones, seven goods), ≈1.4 ms under 6× CPU throttling; about 260–330 KB per save.

Gameplay quality has priority over economic precision (as requested): the model is deliberately aggregate and legible, not a replica of the real economy.

## 2. Fundamental assumptions vs adjustable parameters

**Structural assumptions** (change the engine's *shape*; changing them means changing code):

| # | Assumption |
|---|---|
| A1 | The world is a set of **zones** (a zone ≈ a region of the game map) owned by **countries**. Each zone is one local market with its own prices, wage and labour market. |
| A2 | Production is **fixed-proportion (Leontief)**: one unit of a good needs fixed units of intermediate goods plus labour. Capacity is a stock that wears out and is rebuilt by investment. |
| A3 | Seven goods in a **closed input–output system** (food, energy, materials, industrial, consumer, military, services). Services are local and made to order. |
| A4 | Prices move **gradually** in response to inventory gaps, unmet orders, unit cost and capacity pressure (no market-clearing auctioneer). Shortages are therefore possible and visible. |
| A5 | **Trade is physical.** Buyers order from specific producers' own stock; goods carry a freight cost along a transport graph, tariffs at national borders, and can be forbidden pair-by-pair and good-by-good. |
| A6 | **Money is conserved.** Households, firms and treasuries hold all money; debt is exactly the sum of claims held by households; the only source of new money is a rule-based world monetary authority. |
| A7 | **Private firms are autonomous**, predictable but imperfect: they invest when expected returns beat the cost of capital, with seeded behavioural noise, and scrap idle capacity slowly. |
| A8 | **Governments are the player's levers**: three taxes, four spending categories, tariffs, sanctions, strategic reserves, borrowing, debt repayment, default. |
| A9 | **Political stability** is a state variable (0–100) driven by living conditions and policy; crises are episodes with at most one regime test per tier. |
| A10 | Time scale: **52 weeks = 1 year**; all rates are annual and converted to weekly. |

**Adjustable parameters** (numbers in `src/config/defaults.ts`; 127 values + the goods table) are listed with meaning and default in the generated [`reports/CONFIG_REFERENCE.md`](reports/CONFIG_REFERENCE.md). They can be overridden per game with `createConfig({...})`; the configuration is validated and stored (frozen) inside the save.

## 3. State and units

* **Static description:** countries, zones, waypoints (straits/sea junctions), lanes (undirected edges with distance), goods and parameters.
* **Per zone:** owner, population, technology, infrastructure, wage, cash of households and firms, expected income, consumer price index, inflation, unemployment, living standard, deprivation.
* **Per zone × good:** capacity, three-stage construction pipeline, producer stock, input buffer, producer price, buyer price, reference price, expected demand, margin, utilisation pressure, resource cap, sector efficiency, yield factor (shocks), shortage, usage.
* **Per country:** treasury, debt, interest rates, market access, exclusion weeks, default count, GDP, stability, unrest tier, regime counter, equipment stock, and every standing policy (taxes, spending shares, borrowing switch, procurement priority).
* **Per country × good:** strategic reserves, reserve target/mode, tariff. Plus the list of sanctions and per-partner tariff exceptions.
* **World:** money supply, interest rate, credit utilisation, growth, inflation, rebase counter.
* **History:** three fixed-size ring buffers (52 weekly, 40 quarterly, 50 yearly entries).

**Units are abstract.** Quantities are "units of a good"; money is "illustrative units"; the base price of every good is 1.0. Population is in any consistent unit (the test world uses millions). Use ratios and real (constant-price) indicators for display; `world.rebases` converts absolute money if the unit was rebased (§9).

## 4. The weekly turn (implemented)

Fixed order, so results are reproducible (`src/core/step.ts`):

1. **Validate** all commands and effects (nothing is changed if any is invalid), rebase money if needed, snapshot stocks/money for the audit, apply external effects then commands, compile sanctions/tariffs into per-pair tables, compute transport routes (cached).
2. **Public finance, part 1** (`finance.ts`): each government plans spending (shares of smoothed GDP), requests credit, households lend (home bias), interest and principal are paid, cash transfers (social, military pay) reach households, and the rest of the budget becomes orders for goods. If cash is short, all spending is scaled down equally (*funded share*), never negative.
3. **Private planning** (`planning.ts`): firms plan output (expected sales + inventory adjustment, limited by capacity, price vs cost, workers, cash); order inputs; plan investment; households split budget between subsistence and shares.
4. **Markets clear** (`market.ts`), good by good, in up to three allocation passes (§6). Services are produced to order afterwards.
5. **Production and incomes** (`production.ts`): output uses the inputs actually obtained (the scarcest input limits output), wages (with income tax), corporate tax, dividends or owner capital calls.
6. **Adjustment**: prices, wages, CPI, expectations, living standard, deprivation, construction pipeline, depreciation, scrapping, shock recovery.
7. **Public finance, part 2**: repayment from surpluses, default detection, sovereign risk premia, market access, world monetary rule.
8. **Politics** (`politics.ts`): stability, unrest tiers, regime tests.
9. **Development**: technology, infrastructure, population.
10. **Audit, history, report** (`stats.ts`).

## 5. Production, consumption, prices

* **Capacity & utilisation.** Each sector has a *normal utilisation* (0.85). Output is planned from smoothed expected sales plus a stock-cover target (stock-holding sectors) and is capped by capacity × yield factor, workers and cash.
* **Comparative advantage.** Each zone has a per-sector *efficiency* (labour per unit). The world builder calibrates it so that, at the starting prices, every active sector earns exactly its normal return — which is why an oil state *stays* an oil state: it is genuinely cheaper for it to pump oil than to make machines. Sectors a zone does not have get exact zero capacity.
* **Shocks reduce productivity, not jobs.** A production shock (`production-shock`) lowers a sector's yield; staffing follows normal output, so costs rise and the supply curve shifts left. Shocks decay exponentially.
* **Households.** Weekly budget = 80% of expected income + 2.5% of cash + a little bond wealth (capped at half of cash). *Subsistence* quantities (food, energy, consumer goods, services) are bought first; if the budget cannot cover them, all necessities are cut proportionally (→ *deprivation*). The remainder is spent in fixed shares (consumer goods 35%, services 50%, …), so as incomes rise the food share of spending falls (Engel effect; measured 33% → 21% in scenario 10).
* **Prices** (per zone and good) change each week by a clamped sum of: inventory gap, share of orders left unfilled, pull towards "unit cost + normal margin + capital charge", and capacity pressure above/below normal. Limits: +10%/−6% per week, a floor at 50% of unit cost, and a ceiling of 4× the two-year average.
* **Wages** follow unemployment relative to 5%, labour-market tightness and half of past inflation (asymmetric: they fall slower than they rise). CPI is chained from the households' actual basket.
* **Calibration.** `createEconomy` solves for a production structure in which every zone's workers are employed and every government budget balances, finds starting prices by letting supply and demand act with structure frozen (≈160 weeks), calibrates efficiencies, wages and capacity trims, re-runs, and verifies 12 weeks under normal rules. The result is week 0; its indicators are stored as the baseline for "progress since start".

## 6. Trade, tariffs, sanctions (implemented)

* **Delivered price** = producer price × (1 + freight × distance + tariff). Freight per unit distance depends on the good's bulk. Distances come from the cheapest open path in the lane graph (Floyd–Warshall, cached, recomputed only when lanes change).
* **Orders.** Each buyer zone spreads its orders over all reachable producers with positive stock; a producer's weight = stock × preference × (cheapest delivered price ÷ its delivered price)^8, where preference favours own zone (8) and own country (3) over foreigners (1). Unfilled orders are redirected in later passes; what remains is a shortage. This yields **automatic redirection**: when a supplier is removed or becomes dearer, volumes move to the next-cheapest supplier.
* **Routes.** A lane has a *cost multiplier* and a *throughput* (0 = closed). Closing a lane reroutes cargo along the cheapest remaining path; with no path, trade stops. Throughput below 1 also caps a buyer's **total** foreign receipts (a blockaded island cannot get 25% of its needs from *each* supplier).
* **Tariffs.** Per importing country and good, with optional per-partner exceptions; paid at national borders only; revenue goes to the treasury.
* **Sanctions** (`set-sanction`): the imposer may refuse to buy from, sell to, or both, a named country for a list of goods. Enforcement is on the physical flow, so there is no leak.
* **No laundering.** Goods are bought *from a producer's own stock*. Anything a third country imports is consumed, held in non-exportable input buffers or reserves, or transformed into a different good; it is never re-listed as that country's stock. A country that cannot produce a good therefore cannot export it (tested: exports of energy from a country with zero energy capacity are exactly 0, and a third country's exports never exceed its own output plus stock drawdown).
  * *Allowed by design, as GAME_DESIGN §10 says:* a sanctioned state may buy equivalent goods from other suppliers. Note the economic side effect: a third country that imports embargoed goods for its own use frees its own production for export, which is displacement, not laundering.
  * *Not modelled:* smuggling, shell companies, price-discounted black markets (proposed, not built).
* **Strategic reserves.** Stored as stock owned by the government. Modes: automatic (buy up to a target when cheap and calm, release when prices exceed 130% of reference or shortages appear), hold, release, fill. Released stock is sold only to buyers in the owner's own country, at the going price.

## 7. Private companies (implemented)

* Firms are not individually simulated: each zone × sector is one aggregate producer.
* **Investment.** Expected return = 52 × margin × (1 − corporate tax) × utilisation ÷ (capital cost per unit of capacity) − depreciation. A sector expands when this beats the *hurdle* (world rate + 25% of the government's risk premium + equity premium 6%, capped at 20%) *and* utilisation pressure exceeds 94% of normal. Growth speed ≤ 0.25% of capacity per week, scaled by the return gap and by seeded noise (±20%): **predictable but imperfectly optimised**. A zone with no sector can enter when demand exists (entry plant 0.2% of local use per week).
* **Construction delay.** New capacity passes through three stages (13–52 weeks in total, by good) before it exists. It also consumes investment goods (80% industrial), so a country that lacks industry cannot rebuild quickly.
* **Contraction.** Idle (<60% utilisation) or loss-making capacity is scrapped at up to 0.3% per week, on top of normal depreciation (4–7%/year).
* **Resource-based sectors** (food, energy, materials) are limited by a natural-resource ceiling (starting capacity +30%) that rises with technology. While investment is pressed against the ceiling and demand keeps utilisation above normal, the ceiling itself expands by at most 0.15% per week (≈8% a year: new deposits, land, extraction methods). Scarcity therefore causes price spikes and slows growth in the short run, but it cannot become a permanent cap. (A fixed ceiling was tried first; see §17.)

## 8. Public finances (implemented)

* **Revenue:** income tax (on wages and dividends), consumption tax, corporate tax (on operating surplus), tariffs, seigniorage from the monetary rule, reserve sales. **Spending:** administration, social transfers, military (35% pay to households, 65% goods), infrastructure, reserve purchases, interest, aid transfers. Spending targets are shares of smoothed GDP.
* **Borrowing.** If `autoBorrow`, a government with market access borrows what it needs to keep a cash buffer (4 weeks of spending). Lenders are households, with a 3× home bias; each lender can lend ≤ 0.8% of its cash per week. Bonds are tracked per holder, so interest, repayments and default losses reach the right households.
* **Interest rate** = world rate + risk premium. World rate = 3% + 1% × tightness/(1−tightness) of the credit market. Premium = 2% × (debt/yearly GDP − 0.6) + 25% × (debt/GDP − 0.9)² + 0.5 × (deficit/GDP − 3%) + reputation premium + 4% × instability. Above 20% a country **loses market access** (it cannot borrow, and starts owing principal); access returns below 14% (hysteresis).
* **Missed payments and default.** If cash cannot pay interest, the shortfall is added to the debt and the missed-payment counter rises; **four consecutive misses force a default**. A government can also `declare-default`. A default: writes off 55% of debt (loss falls on bondholders, domestic and foreign), caps the average rate at 3%, locks the country out of credit for 78 weeks (+50% per previous default), adds a reputation premium (+5%, fading over 3 years), cuts stability by 12, and imposes a 6% output shock fading over a year (financial disruption).
* **A default is not a defeat.** The engine reports a default as an event; only a *regime change* (§10) is reported as a possible defeat, and the host decides what to do with it.
* **Repayment.** `repay-debt` repays what the treasury can afford; cash above 110% of the target is swept at 10% per week.
* **Monetary authority** (world level, automatic, not a player lever): money grows by `inflation target + real growth + 0.5 × (target − inflation) + slack term`, capped at 0.12% per week, so money supply follows output and inflation hovers near its 2% target.

## 9. Long-run safeguards (implemented)

| Hazard | Safeguard |
|---|---|
| Resource creation / destruction by bugs | Every week the engine audits **goods** (opening + production − use − spoilage − destruction − dust = closing, per good), **money** (agents' holdings = supply, created money only by the monetary rule) and **bonds** (debt = Σ claims). Relative error ≤ 1e-9 or the turn throws. Observed: ≤ 1e-14. |
| Negative / non-finite values | Reported by the audit; guarded at their sources (allowances clamped at zero, divisions guarded). A real defect of this kind (a negative allowance producing −∞) was found by the audit during development and fixed. |
| Denormal numbers / crumbs | Stocks below 1e-9 are removed and accounted as "dust" in the ledger. |
| Unbounded real growth | Technology growth fades cubically towards a ceiling (20); population growth fades towards a per-zone cap (3× start by default); infrastructure ≤ 1.8; resource ceilings scale with technology and expand slowly under persistent scarcity. |
| Unbounded nominal growth | When the money supply passes 2^70, **every money amount and the money columns of stored history are divided by 2^30**. Division by a power of two is exact in floating point and the engine is homogeneous of degree one in money, so nothing real changes (tested: rescaling by 2^±40 changes no real variable, bit for bit). `world.rebases` counts the events. |
| Unbounded history | Three fixed ring buffers; save size is constant after the yearly tier fills (week 2,600): 332 KB at 10,000, 100,000 weeks. |
| Cross-engine arithmetic differences | Only `+ − × ÷`, comparisons, `min/max/floor/abs/sqrt` are used. `Math.pow/exp/log/sin…` and `**` are banned in `src/` by a test, because their results can differ between JavaScript engines. |
| Randomness | Counter-based hash of (seed, week, stream, index); order of use cannot change a result. |
| State corruption on load | `deserializeEconomy` validates structure, ranges, ids and cross-references and rejects anything else. |

## 10. Political stability (implemented)

* **Stability** moves 8% per week towards a target: base 70, minus penalties for inflation above 4%, unemployment above 7%, deprivation, shortages, falling living standards (rising ones help only a little), tax burden above 35%, social spending below 10% of GDP, budget arrears; plus any `stability-modifier` set by the game (e.g. war weariness).
* **Unrest tiers** start below 40 / 25 / 10 (protests, mass unrest, collapse), cost output (2% / 7% / 18% strike losses) and end above 50.
* **Regime test.** A tier must persist 4 weeks, then the regime is tested **once per tier per crisis episode** (never every week): 15% / 50% / 100% as in the `GAME_DESIGN.md` §6 illustration, drawn from the seeded generator. On failure the regime counter increases, stability resets to 55 and a 26-week immunity applies. The host decides whether that defeats a human player; the design says it does.
* **Inflation, shortages, crises and fiscal policy** all reach stability through the terms above; a default does not by itself end a player.

## 11. Autopilot for AI countries (implemented, rule-based)

`autopilotCommands(state)` returns ordinary commands: every four weeks it moves the income tax towards a deficit target (a government with debt room tolerates a small deficit), tightens when debt exceeds 90%, the borrowing rate exceeds 8% or access is lost, raises social spending when stability is below 50 and affordable, and returns to normal when calm. No randomness. It exists so every country is steered in tests and scenarios; the real AI's priorities are an open design question.

## 12. Verified behaviour

Measured by the automated scenarios (`reports/SCENARIO_REPORTS.md`; each compares an event run against a control from the same state):

| # | Scenario | Headline measured result |
|---|---|---|
| 1 | Stable world, 20 years | +2.3%/yr real growth, 1.5% inflation, 0 defaults, 0 regime changes, debt ≤ 82% |
| 2 | Oil embargo (2 exporters → 2 importers) | direct flow 0.0 (was 10.9/wk); other suppliers' deliveries 1.9 → 7.1/wk; importers' energy price ×1.26; exporters' GDP −7%; no laundering |
| 3 | 50% farm collapse (Verdania) | output 39% of control, local price ×1.13, exports 58%, households still 100% fed, GDP −30%, stability 70 → 51, recovery in 165 weeks |
| 4 | Military spending 3.5% → 12% of GDP | equipment stock ×2.5, consumption −8%, income tax 14.7% → 26.8%, arms price spill-over ×1.56 |
| 5 | War on three lanes | world trade −7%; the country whose only lane is cut (Halcyon) −33% GDP; a diversified one 0%; recovery 45 weeks after reopening |
| 6 | Sovereign default | 55% written off, foreign creditors lose 55% of holdings, GDP −8%, access back after 78 weeks, no regime change; a second, undeclared default emerges 8 weeks after market access is lost |
| 7 | Five-country sanctions coalition | zero coalition↔target flow in 3 goods; target GDP −2.6%, trade −32%; senders −1.6%; trade diverted to non-members (4.1 → 11.8/wk) |
| 8 | Small import-dependent country | imports/GDP 81% vs 26%; blockade: consumption −3.2% with reserves vs −11.6% frozen |
| 9 | Prolonged crisis, recovery | GDP −52% trough; 95% of control after 506 weeks, 99% after 953; industrial capacity rebuilt by private investment (65% → 118% of control) |
| 10 | 30-year development | GDP/head ×2.16 (baseline), ×2.68 (infrastructure push), ×2.16 with +5 stability (social-first), ×2.13 and openness 40% vs 70% (protectionist); food share of purchases 33% → 21% |

Stability and performance: see `reports/STABILITY_REPORT.md` (100–100,000 weeks, three worlds), `reports/STABILITY_REPORT_LONG.md` (1,000,000 weeks), `reports/BROWSER_BENCHMARK.md`, and `reports/TEST_RESULTS.md`.

## 13. Requirement coverage

| Requirement (original brief) | Status |
|---|---|
| Multiple interconnected sectors; capacity/resources/intermediate inputs | **Implemented** (7 goods, recipes, capacities) |
| Public/private/industrial consumption; private inventories; strategic reserves; shortages, surpluses, substitution | **Implemented** |
| Price formation from supply/demand | **Implemented** (zone-level prices). |
| Initial global market; regional markets later | **Implemented as zone markets with freight**; true multi-currency regional blocs are **proposed** |
| Transport costs, tariffs, sector sanctions, strict enforcement, automatic redirection | **Implemented** |
| Private investment, gradual contraction, delays, imperfect behaviour | **Implemented** |
| Taxes, spending, deficits, debt, risk-based rates, default without automatic defeat | **Implemented** |
| Stability, protests, regime change, defeat reported | **Implemented** (host decides defeat) |
| Deterministic seed, serializable, unlimited turns, bounded memory/history, headless | **Implemented and tested** |
| Interfaces for host integration | **Implemented** (`src/index.ts`, `ECONOMY_INTEGRATION.md`, `examples/`) |
| Ten mandatory scenarios | **Run** (`npm run scenarios`) |
| 100 / 1,000 / 10,000 / longer runs | **Run** (see reports) |
| iPhone/Safari performance | **Not measured on a device.** Chromium under CPU throttling only |

## 14. Limitations and known issues (honest list)

1. **Not validated on Safari/JavaScriptCore or a real iPhone.** Cross-engine bit-identical determinism is *designed for* (basic IEEE arithmetic only) but *untested*; same-engine (V8 in Node and Chromium) fingerprints match.
2. **Fictional data.** The Meridian test world (9 countries, 11 zones) and the fixture profiles are invented. No real-world calibration; disputed borders are untouched.
3. **Aggregation.** One producer per zone × sector; one wage per zone; no labour mobility between zones, no exchange rates, no individual firm bankruptcies, no regional price formation inside a zone.
4. **Aftershocks.** After very large shocks the world shows investment-cycle oscillations in capital-goods prices for roughly a decade before damping (measured: inflation s.d. 10 pp → 0.2 pp over 20 years). A small early transient also appears in the no-shock control.
5. **Utilisation slack.** Resource sectors run at 85% normal utilisation like the rest; an attempt to give them thinner slack (93%) caused boom–bust cycles and was abandoned. The cost is that a supply shock to a resource sector is absorbed partly by drawing down stock and slack that real farms/wells may not have.
   * **Resource scarcity and import-dependent economies.** When population and incomes grow faster than resource ceilings can expand (≤ 8%/yr), resource prices rise and resource-poor economies lose real income. This is intended pressure; it is bounded, but a very fast-growing world will show a decade of tension.
6. **Defaults can look attractive.** A declared default cut Norland's debt to 23% of GDP versus 53% in the control at the price of 8% GDP and 78 weeks without credit. Whether that trade should be this cheap is a balancing decision.
7. **Sanction side effects.** Non-member countries gain substantially in scenario 7 (+6% GDP on average) because they inherit trade and buy cheap diverted goods. This is mechanically consistent but may be larger than intended.
8. **Price floors/caps are blunt.** 4× ceiling and 50% floor are pragmatic stabilisers; a blockaded island's food price is therefore bounded (3.6× in scenario 8) rather than extreme.
9. **Builder limits.** Starting debt must be ≤ 150% of GDP and the income tax chosen to balance a first budget is capped at 45%; a country cannot *start* in unsustainable fiscal distress (it can get there during play, scenario 6B).
10. **Startup cost.** Building a world runs ≈170 weeks of calibration: ≈0.25 s on a desktop, ≈1 s under 6× CPU throttling. Build once, then store the saved state.
11. **Autopilot is simple** and only manages tax and social spending. Its choices (and any AI personality) are placeholders.
12. **Military is economic only.** Procurement and an equipment stock exist; they are not connected to divisions, casualties or supply in the game's T07 combat.
13. **Mobilisation** removes workers from the labour force but pays no war costs by itself; war damage must be supplied by the host as effects.
14. **Some strategies are close to free lunches.** In scenario 10 an infrastructure push raised GDP per head by 24% over 30 years with no visible cost (debt 43% vs 42%, stability unchanged, consumption never lower), and social-first spending bought +5 stability at identical GDP. Taxes only hurt through lower household income and a stability penalty above a 35% burden; there is no deadweight loss, and returns to infrastructure are not diminishing enough beyond the 1.8 cap. These are balancing decisions (see the decision list), not bugs.
15. The 1,000,000-week run (`reports/STABILITY_REPORT_LONG.md`) covers only the default growing test world with the autopilot and no shocks. It shows the engine stays finite, conserved and healthy; it does not prove every possible player strategy is stable.

## 15. Proposed, not implemented

* Smuggling / sanction-evasion mechanics with detection and cost.
* Multiple currencies and exchange rates; regional currency or trade blocs.
* Labour migration between zones; demographic transition.
* Firm entry/exit with bankruptcies; credit constraints for firms; banking sector.
* Per-country monetary policy and central-bank independence.
* Event tables (the 0.3% weekly country event of `GAME_DESIGN.md` §14): the engine already exposes `production-shock`, `destroy-capacity`, etc. for them.
* Scoring formulas (35/30/20/15, 50/50): only `getProgress` baseline ratios are provided.
* Richer AI economic personalities.

## 16. Source map

```
economy-engine/
  src/index.ts            public interface (import only from here)
  src/types.ts            all data contracts (state, commands, effects, reports)
  src/config/defaults.ts  goods, recipes, parameters, validation
  src/core/               step · finance · planning · market · production · politics
                          commands · routes · stats · state · rebase · rng · model · selectors
  src/world/              builder (calibration) · testWorld (fictional worlds)
  src/ai/autopilot.ts     rule-based fiscal governments
  sim/                    cli · runner · scenarios · run-scenarios · stress · browser-bench · dump-config
  tests/                  automated tests (+ tests/long)
  examples/               host adapter example (compiled and tested)
  reports/                generated reports
```

## 17. Defects found and fixed during validation

Validation was run adversarially; the real problems it exposed are recorded so reviewers know what the tests are protecting against.

| Found by | Defect | Fix |
|---|---|---|
| First end-to-end run | Builder planned quantities that the engine could not deliver (storage losses, labour not fully used); prices and wages drifted for years | Builder accounts for warehouse spoilage, calibrates sector efficiency and wages jointly, repeats calibration rounds |
| Scenario 9 (large shock) | A government losing market access (rate > 20%) pushed its firms' cost of capital up with it, cutting private investment and re-igniting the crisis: a 14-year boom–bust cascade across the whole world | Private hurdle rate follows the world rate plus only 25% of the sovereign premium, capped at 20% |
| Scenario 8 (blockade) | A lane's throughput cap was applied per supplier, so a blockaded island could still import 25% of its needs from each partner | Cap now bounds the buyer's *total* foreign receipts |
| Same | That fix initially produced −∞ (a negative remaining allowance of −1.6e-17 divided by zero orders) and NaN in expected demand; the weekly audit caught it immediately | Allowances clamped at zero, scale guarded |
| Laundering test | Zones that cannot produce a good kept residual capacity of 7e-121 from the solver | Exactly zero |
| Over-indebted start | A 180% debt start made the builder choose a 70% income tax and the zone's GDP died at week 1 | Starting debt ≤ 150%, balancing tax ≤ 45%, and a tested recovery from a 70% tax slump |
| 100,000-week stress | Money reached 7e38 (inflation and unbounded technology/population compounding) with float overflow only ≈ 900,000 weeks away | Soft ceilings on technology and population; exact money rebasing by 2^30; basic IEEE arithmetic only |
| 100,000-week stress report (not visible in the console log) | After ≈20,000 weeks (≈390 years) the growing world collapsed: 98% unemployment and thousands of regime changes, first in the resource-less island economy. Counterfactual runs isolated it: no population growth ⇒ stable; no resource ceiling ⇒ stable; wage indexation, productivity-wage links and treasury rebates were ruled out experimentally | A fixed +30% resource ceiling was a Malthusian trap. Ceilings now expand slowly under persistent scarcity (≤ 8%/yr). Result: 100,000 weeks with max unemployment 3.8%, 0 regime changes |
| Test review | Several of my own tests asserted the wrong mechanism (e.g. a net *exporter* losing exports rather than importing more) | Tests and scenario text corrected to the mechanism actually observed |

Two remedies tried for the long-run collapse were **removed** after ablation showed they did nothing: a productivity-to-wage link and a rule returning idle government cash to households. They were treatments for symptoms.


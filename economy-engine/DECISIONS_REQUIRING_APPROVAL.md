# Gameplay decisions requiring owner approval

Per `AGENTS.md` §2 and `GAME_DESIGN.md` §17/§18, new mechanics and major rules need the project owner's explicit approval. The economic engine had to adopt **provisional** values to be testable. Each item below is a *proposal*, implemented only in `economy-engine/` (nothing in the playable game changed). Until approved, treat all of them as reversible demo assumptions.

For each: what the engine assumes now → why it matters → where it lives. "Config" means changeable by editing `src/config/defaults.ts` or passing `createConfig({...})`; "code" means a change to the model.

## A. Blocks integration into the game

| # | Decision | Engine's provisional answer | Where |
|---|---|---|---|
| A1 | **Does the engine replace the T06 treasury economy?** T06 rejects any week that would make a treasury negative and has no borrowing; GAME_DESIGN §5 says the player may spend beyond revenue, borrow and default. | The engine follows the design document (spending scaled down when cash is short, borrowing, default). Replacing T06 changes a visible rule. | Integration (`ECONOMY_INTEGRATION.md` §4) |
| A2 | **Goods and sectors** (GAME_DESIGN §17.1: "Exact economic goods/sectors, production/input coefficients and market-price formulas" are unresolved). | 7 goods: food, energy, raw materials, industrial goods, consumer goods, military equipment, services (local), with an invented input–output table. | Config (`DEFAULT_GOODS`); code for formulas |
| A3 | **Zones vs regions.** One economic zone per map region? Aggregate several regions? How are ports/straits/airports represented? | One zone per region; adjacency ⇒ a road lane; sea routes via waypoints and lanes added by hand. | Data + `worldSpecFromHost` |
| A4 | **Real-world starting data** for population, technology and comparative advantage, and what to do about disputed territories (GAME_DESIGN §2, §17.2). | None. Only fictional worlds exist. | Data task |
| A5 | **Match length vs unlimited engine.** Engine has no end; matches are 52/104/156 weeks (GAME_DESIGN §3). | The host ends a match; the engine never does. | Host |
| A6 | **Who may command what.** | The engine trusts the host; the host must check ownership. | Host |

## B. Rules that shape play (balance and design)

| # | Decision | Engine's provisional answer | Where |
|---|---|---|---|
| B1 | **Consequences of sovereign default.** | Write-off 55% of debt (borne by bondholders at home and abroad); 78 weeks without market access (+50% per earlier default); +5% risk premium fading over 3 years; stability −12; 6% output shock fading over 52 weeks. *Finding: this makes default fairly attractive for a heavily indebted state (debt 53% → 23% of GDP, GDP −8%, access back after 78 weeks).* | Config (`defaultHaircut`, `defaultExclusionWeeks`, `defaultReputationSpread`, `defaultStabilityShock`, `defaultOutputShock`) |
| B2 | **Credit-market rules.** When does a state lose market access, how are rates priced, how many missed payments force a default? | Rate = world rate + premium on debt/GDP (above 60%, quadratic above 90%) + deficit + reputation + instability; access lost above 20%, regained below 14%; 4 consecutive missed payments ⇒ forced default; households are the lenders. | Config (`spread*`, `marketAccessRate`, `accessRestoreRate`, `missedPaymentsToDefault`, `lenderHomeBias`) |
| B3 | **Regime-collapse model** (GAME_DESIGN §6, §17.4: thresholds, episodes, probabilities are tentative). | Stability 0–100; tiers below 40/25/10; one regime test per tier per episode after 4 weeks; probabilities 15%/50%/100% (the illustrative numbers from §6); after a change stability resets to 55 with 26 weeks' immunity. Engine only *reports* it; the host decides defeat. | Config (`unrestThresholds`, `collapseProbability`, `unrestGraceWeeks`, `postRegimeStability`, `regimeImmunityWeeks`) |
| B4 | **What drives stability and how strongly** (inflation > 4%, unemployment > 7%, deprivation, shortages, falling living standards, tax burden > 35%, social spending < 10% of GDP, arrears). | Weights chosen so a quiet world sits at ≈70 and severe crises reach single digits (scenario 9). | Config (`stability*`, `*Tolerance`, `socialNorm`) |
| B5 | **Strike and unrest output losses.** | 2% / 7% / 18% of output at tiers 1 / 2 / 3. | Config (`strikeLoss`) |
| B6 | **Sanction semantics.** Strict physical enforcement, legal substitution from other suppliers, no re-export, no smuggling. Do sanctions need a *cost of evasion* / *detection* mechanic (GAME_DESIGN §10 only forbids laundering)? | Enforcement exact; no smuggling; displacement through third countries is allowed (it is substitution, not laundering). | Code (proposed extension: evasion) |
| B7 | **Sanction coalitions.** The engine just executes each member's commands. Who decides to join, and with what influence cost, is diplomacy (T24). | Not modelled. | Host / AI |
| B8 | **Tax and spending levers.** Which taxes exist and their limits. | 3 taxes (income, consumption, corporate), max 70%; 4 spending categories (administration, social, military, infrastructure), max 50% of GDP each; tariffs up to 300%, per good and per partner. | Config (`maxTaxRate`, `maxSpendingShare`, `maxTariff`) |
| B9 | **Free lunches.** Scenario 10 shows infrastructure spending raising 30-year GDP/head by 24% with no visible cost, and social spending buying +5 stability at identical GDP (no deadweight loss of taxation). Should taxes depress growth, and infrastructure show stronger diminishing returns? | Taxes only cut household income and, above a 35% burden, stability. Infrastructure index ≤ 1.8: +12% productivity and +0.32%/yr growth at the cap. | Config (`infra*`, `taxTolerance`, `stabilityTaxWeight`); code for a tax-growth link |
| B10 | **Strategic reserves.** Who pays for storage, can they be sold abroad, automatic purchase/release thresholds? | Free storage; released only to the owner's own buyers; auto-buy when price ≤ 115% of reference and calm; auto-release at ≥ 130% or shortages. | Config (`reserve*`) |
| B11 | **Military economy.** How equipment stocks relate to divisions (T07/T15) and how personnel pay works. | Military spending = 35% pay to households + 65% goods; delivered "military equipment" accumulates in a national stock that wears out 0.2%/week; no link to divisions. | Config (`militaryPayShare`, `armsAttrition`); code for the link |
| B12 | **Private-sector behaviour.** How fast and how well do firms invest, scrap and adapt ("predictable but imperfect"). | Investment ≤ 0.25% of capacity/week, ±20% seeded noise, hurdle = world rate + 25% of the state's risk premium + 6%, construction 13–52 weeks, scrapping ≤ 0.3%/week. | Config (`invest*`, `behaviorNoise`, `scrap*`, `sovereignPassThrough`, `equityPremium`) |
| B13 | **Monetary policy.** Automatic and world-level (not a player lever): 2% inflation target, growth-following money. Should countries have their own central banks, currencies or exchange rates? | One world currency; rule-based creation capped at 0.12%/week. | Config (`inflationTarget`, `moneyRule*`); code for currencies |
| B14 | **Long-run growth.** Technology +1%/yr (+catch-up for laggards), population growth per zone, with soft ceilings (technology 20, population 3× start). Should growth continue, slow, or stop; is catch-up wanted? | As stated; ceilings only matter over centuries. | Config (`techGrowthBase`, `techCatchUp`, `techCeiling`; zone `populationGrowth/populationLimit`) |
| B15 | **Price behaviour.** Maximum weekly moves, floors and ceilings. | +10% / −6% per week, floor 50% of unit cost, ceiling 4× the two-year average. A blockaded island's food price therefore tops out near 3.6×. | Config (`price*`) |
| B16 | **Autopilot ("AI economy").** National priorities, thresholds, personalities (GAME_DESIGN §17.6). | One neutral rule set: balance budgets, tighten near debt trouble, extra social spending when stability < 50. | `src/ai/autopilot.ts` |
| B17 | **Random events** (GAME_DESIGN §14: 0.3%/week/country). | Not in the engine; `production-shock` etc. are the hooks. Event tables and severities are open (§17.8). | Host (T26) |
| B18 | **Scoring.** 35/30/20/15 weights, 50/50 absolute/progress, normalisation (GAME_DESIGN §13, §17.5). | Not implemented. `getProgress` returns raw ratios to the starting baseline only. | Host (T19) |
| B19 | **Calibrating the start.** Starting debt ≤ 150% of GDP; the opening income tax balances the budget (≤ 45%); the world is calibrated by ≈170 weeks of silent simulation. | As stated. | `src/world/builder.ts` |
| B20 | **Resource scarcity.** Resource sectors have a ceiling (+30% over start, rising with technology) that expands at most 0.15% per week while demand presses against it. Is scarcity meant to be a hard limit (e.g. oil fields that run out) or only a price pressure? | Soft: slows growth and raises prices, never a permanent cap. A hard ceiling was tested and collapsed resource-poor economies within ~400 simulated years. | Config (`resourceDiscoveryRate`, zone `resourceHeadroom`) |

## C. Technical choices already made (reversible; listed for transparency)

| # | Choice | Why |
|---|---|---|
| C1 | State is plain JSON; ~260–330 KB; versioned. | Save/restore anywhere, diff-friendly, no hidden state. |
| C2 | Counter-based random numbers; no `Math.random`, no clock. | Determinism, replay, lockstep multiplayer. |
| C3 | Basic IEEE-754 arithmetic only (no `pow/exp/log`). | Bit-identical results across JavaScript engines (untested on Safari). |
| C4 | Exact money rebasing by 2^30 above 2^70 total money. | Unlimited turns without overflow. Changes no real variable (tested). |
| C5 | Fixed ring-buffer history (52 weekly / 40 quarterly / 50 yearly). | Constant memory; configurable via `historyWeekly/Quarterly/Yearly`. |
| C6 | Isolated folder `economy-engine/`, own `package.json`, no dependencies. | "Do not modify the existing game." |
| C7 | The conservation audit is on in all tests and scenarios. | Detects any resource created or destroyed without a record. |

## D. Suggested order for the owner

1. A1 (replace T06 or run in parallel) and A2/A3 (goods and zone granularity) — everything else depends on them.
2. B1–B5 (default, credit, regime collapse, stability) — the political/fiscal risk layer the brief centres on.
3. B9 (free lunches), B6 (sanctions evasion) and B12 (private behaviour) — the main balance levers for "several viable strategies".
4. The rest can follow the corresponding backlog tasks (T10–T26).

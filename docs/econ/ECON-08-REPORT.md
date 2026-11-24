# ECON-08 — Real-world sovereign debt calibration

| | |
|---|---|
| **Status** | Review only. Not merged; not connected to the game |
| **Engine change** | Two **opt-in** builder inputs: `WorldSpec.holdStartingDebt` and `CountrySpec.effectiveRate`. There is no new state field, the save format is unchanged and no weekly rule changed |
| **Fictional scenario** | Unchanged: identical hashes before and after (§7) |
| **Data** | All in `docs/econ/ECON-08-data/` and `scenarios/europe-2023/build/financing.json`. Every number below comes from those files |

## 1. Summary

| | WORLD-03 as built | ECON-08 (solution C) on the recalibrated scenario |
|---|---|---|
| Debt ratios within ±1 pp at week 1 | 0 of 15 | **15 of 15** |
| WORLD-03 calibration targets missed | 18 | **0** |
| Countries without market access at week 1 | 7 | **0** |
| Sovereign defaults in 156 weeks (autopilot) | 8, in 6 countries | **0** |
| Regime changes in playable or simulated countries | Greece, Italy | **none** |
| Interest paid / GDP at week 1 vs 2023 | Italy 66% vs 3.6% | Italy 3.63% vs 3.63%; all countries within 0.3 pp, except Greece and Switzerland (§5) |

**The failure had two independent causes:**
1. **Initialisation (the main one).** The builder sets debt against the GDP it starts from, but settling prices then lowers nominal GDP 2–3×, so every debt ratio was multiplied.
2. **The financial model's parameters for this scenario.** The ECON-07 sovereign spread charges 2023 euro-area debt levels 5–15 points more than markets did.

**The fix:**
- **(B)** keep the starting balance sheet at its requested size during the build, consistently with the accounting;
- **(A)** feed the 2023 financing data: the effective rate on the stock and a spread fit on euro-area yields.

Neither changes a weekly rule. Market pressure, defaults, lender behaviour and the escalating cost of repeated defaults are intact and tested (§6).

## 2. Root cause (numbers from `diagnose-warmup.json`)

The builder creates the starting debt as an endowment, `debt = debtToGdp × 52 × GDP`. It assigns the bonds to households by savings, with home bias, and starts the average rate on the stock **at the current market rate**. It then runs a warm-up (160 weeks plus 3 × 40 weeks plus 12 check weeks) to let prices and stocks settle. During that warm-up:

| | Debt / GDP requested | After 4 weeks | After the full warm-up | Change in debt (bonds) | Change in nominal GDP |
|---|---:|---:|---:|---:|---:|
| Italy | 1.34 | 1.82 | **4.19** | × 1.31 | ÷ 2.39 |
| France | 1.09 | 1.47 | **2.77** | × 0.81 | ÷ 3.14 |
| Greece | 1.50 (capped) | 2.18 | **9.18** | × 2.49 | ÷ 2.46 |
| Germany | 0.62 | 0.81 | **1.05** | × 0.76 | ÷ 2.24 |
| Poland | 0.49 | 0.68 | **0.93** | × 0.92 | ÷ 2.05 |

**Initialisation effects:**
- **Nominal GDP falls 2–3×** while the economy settles (wages and prices find their resting point). Debt was fixed against the unsettled GDP. This alone takes France from 1.09 to about 3.4.
- **Treasury cash is set against the same unsettled GDP**, and repayment is switched off while the builder calibrates. France ends the build with 15.8 weeks of GDP in cash, against 2.6 at the start. In the check weeks that cash repays debt, which is why France's bonds *fell* by 19%.
- **The average rate on the stock** starts at the market rate, as if all debt had been issued that week. Italy starts paying 9.3% on all its debt, against 2.7% actually paid in 2023.
- **Market access** is held open during the build. It is lost in week 1 if the market rate is above 20%.

**Effects of the ongoing financial model:**
- **Interest** accrues at the stock's average rate. Unpaid interest is added to the debt.
- **The market rate** is the world rate plus a spread:
  - linear above 60% of GDP;
  - quadratic above 90%;
  - 0.5 × the deficit above 3%;
  - reputation, instability and money-printing terms.
- **Market access** is lost above 20% and restored below 14%.
- **A default** follows 4 missed payments or a declaration. A first default writes off 55%; later ones less (/record²), with longer exclusion, reputation and stability costs, and an output shock.

With the debt ratio already inflated by initialisation, the quadratic term and the deficit term compound: Italy reaches the 40% cap within the warm-up. This explains the WORLD-03 results: 7 countries without access in week 1 and 6 defaulting within 18 weeks.

**The fictional scenario has the same initialisation effect, mildly.** Its debt goes from 0.50 to 0.60 as GDP falls 1.32×. ECON-07's balance was tuned on that state, so the fix is opt-in and the fictional world does not use it.

## 3. Alternatives (`evaluate.json`, same inputs for all, 156 weeks with the autopilot steering every country)

| Variant | What changes | Debt within 1 pp at week 1 | Lose access at week 1 | Defaults in 156 weeks | Regime changes (not counting the MEA bloc) |
|---|---|---:|---|---|---|
| Base | — | 0 / 15 | 7 | 8 (Greece, Italy twice; Spain, UK, France, Belgium) | Greece, Italy |
| **A** | 2023 financing: effective rates + fitted spread parameters | 0 / 15 | 4 (France, Italy, Belgium, Greece) | 2 (Greece, Italy) | — |
| **B** | Starting balance sheet held during the build | **15 / 15** | none | 1 (Greece, week 106) | Greece (×2) |
| **C = A + B** | both | **15 / 15** | none | **none** | none |

- **A alone** does not help the debt ratio: the initialisation drift remains.
- **B alone** fixes the starting position, but the default spread still charges Greece and Italy crisis rates, so Greece defaults within about two years.
- **C** is needed, and it is also the smallest combination: both parts use existing state and existing parameters.

The money error stays below 3e-10 and the bond error below 2e-15 in every variant and every week.

## 4. Proposed implementation

**Engine:**
- `economy-engine/src/types.ts` and `src/world/builder.ts`. About 70 lines, opt-in, no weekly rule touched.

**`WorldSpec.holdStartingDebt` (boolean, default false).** It records each state's starting balance sheet as multiples of its GDP: debt ratio, cash buffer in weeks, average rate. After **each builder week** (calibration and check weeks):
1. Every holder's bonds on country *c* are scaled by **one common factor**, so that bonds plus central-bank loans equal requested ratio × 52 × current GDP. Bonds stay equal to the debt by construction; this is the same operation as the engine's existing `scaleDebt`.
2. The treasury is brought back to its starting cash buffer by a **transfer to or from the country's own households**, in proportion to their cash, taking at most half of what they hold. Money moves; none is created or destroyed.
3. The stock's average rate keeps its starting value. It is a price, not a stock.

**Why this is not "overwriting debt after the warm-up":**
- It is the builder's existing rule, "the state starts with this debt", applied to the GDP the economy has actually reached. It runs only before turn 0, exactly like the builder's other pinned inputs (population, capacity).
- **Holders keep their shares.** Money, the bond ledger and money issued are audited every week (§7).
- During the build, deficits are effectively financed by households, through the transfer, instead of new debt. That keeps the requested starting debt without inventing money.

**`CountrySpec.effectiveRate` (optional, 0 to `maxRate`).** The starting **average rate on the outstanding stock**. It is used only to initialise the existing `averageRate` state. Refinancing then moves it towards the market rate at 1/`debtMaturityWeeks` per week, exactly as before.

**Scenario data** (WORLD-03 pipeline; no engine change):
- `scenarios/pipeline/build_financing.py` → `build/financing.json`.
- The source snapshot `es_bond_yields`: Eurostat `irt_lt_mcby_a`, the 10-year benchmark yields, 2023 average.
- The scenario's engine config overrides three **existing** parameters: `spreadLinear` 0.02 → **0.016**, `spreadQuadThreshold` 0.9 → **1.65**, `spreadDeficit` 0.5 → **0.10**. `spreadDebtThreshold` (0.6) and `spreadQuad` (0.25) are unchanged.
- The fictional scenario keeps all ECON-07 values.

### The four rates are kept distinct

| Concept | Engine state | Data used | Instrument and accounting relationship |
|---|---|---|---|
| **Average effective interest on the stock** | `averageRate` | Interest paid (ESA D41) ÷ gross debt, 2023 | The whole stock, all maturities, at coupons fixed when issued. Interest due = debt × averageRate / 52, so this reproduces 2023 interest / GDP |
| **Market yield on new debt** | `marketRate` (world rate + spread) | 10-year benchmark yields, **as spreads over Germany, euro area only** | The rate on new borrowing. The stock reprices towards it as debt matures (156-week horizon in the engine; real average maturity is about 7–8 years). Germany's yield stands for the engine's world rate (3.5% in the engine; 2.43% in data). Only spreads are fitted |
| **Central-bank policy rate** | `cbRate` | **Not used** | Applies to central-bank loans to the state (none at the start) and to firm credit, not to bonds. Unchanged |
| **Risk premium** | the spread terms | the fit below | Debt and deficit dependent. Market pressure keeps its shape |

**Outside the euro area** (UK, Poland, Czechia, Norway, Bulgaria, Switzerland, Türkiye), yields also carry currency and inflation premia that a one-currency engine cannot represent. They are **recorded, not fitted**: these countries get the same spread formula as everyone. Their effective rates are used, because they reproduce the 2023 interest bill. Türkiye's 13.1% reflects lira inflation and converges to the engine's rate as its debt is refinanced.

### Spread fit (euro area, 2023)

The ECON-07 defaults have an RMS error of **5.30 pp**; the fitted parameters **0.31 pp**.

| Country | Debt | Deficit | Observed spread vs Germany | Model, ECON-07 defaults | Model, fitted |
|---|---:|---:|---:|---:|---:|
| Germany | 0.62 | 2.2% | 0.00 | 0.04 | 0.03 |
| Netherlands | 0.46 | 0.3% | 0.36 | 0.00 | 0.00 |
| Ireland | 0.42 | −1.5% | 0.44 | 0.00 | 0.00 |
| France | 1.09 | 5.4% | 0.56 | 3.12 | 1.03 |
| Austria | 0.77 | 2.6% | 0.65 | 0.35 | 0.28 |
| Belgium | 1.02 | 4.1% | 0.66 | 1.78 | 0.79 |
| Spain | 1.05 | 3.3% | 1.05 | 1.66 | 0.76 |
| Greece | 1.64 | 1.5% | 1.57 | 15.77 | 1.66 |
| Italy | 1.34 | 7.1% | 1.85 | 8.37 | 1.59 |

**Limitation of the fit.** The 2023 data are a calm period, with the ECB's backstop in place. They identify spreads for debt between 0.4 and 1.64× GDP; they **cannot identify crisis behaviour**. With the fit, a country loses market access at about 2.4× GDP (§6).

Forcing the ECON-07 deficit weight (0.5) does not fit the data better:
- the RMS error rises to 0.46 pp;
- almost all debt sensitivity below 1.4× GDP disappears.

So the fitted 0.10 is kept.

## 5. Results on the European scenario after recalibration (`evaluate-recalibrated.json`)

WORLD-03's calibrator was re-run with the ECON-08 options (`WORLD03_FINANCE=econ08`, output in `scenarios/europe-2023/build-econ08/`; PR #33's package is not touched).

**All targets were met in 4 rounds:**
- 61 zone output shares, worst **2.51%** (target ±3%);
- 112 tax and spending ratios, worst **0.96 pp**;
- 15 debt ratios, all within ±1 pp.

**Income tax is no longer a problem.** France, Belgium and Austria, which missed by 5–8 pp at the engine's 70% maximum, now reach their targets with rates of **0.33, 0.33 and 0.32**. That failure was a consequence of the debt spiral, not a separate defect.

**Week 1 against 2023:**

| | Debt target → week 1 | Effective rate 2023 → engine stock rate | Interest / GDP 2023 → week 1 | New-issue yield, observed in engine terms → engine |
|---|---|---|---|---|
| France | 1.09 → 1.09 | 1.72 → 1.74 | 1.88 → 1.88 | 4.13 → 4.33 |
| Germany | 0.62 → 0.62 | 1.41 → 1.43 | 0.87 → 0.87 | 3.57 → 3.57 |
| UK | 0.99 → 0.99 | 3.17 → 3.18 | 3.14 → 3.12 | — → 4.16 |
| Italy | 1.34 → 1.34 | 2.71 → 2.72 | 3.63 → 3.63 | 5.42 → 4.73 |
| Poland | 0.49 → 0.49 | 4.19 → 4.18 | 2.07 → 2.06 | — → 3.54 |
| Türkiye | 0.30 → 0.30 | 13.07 → 12.98 | 3.87 → 3.89 | — → 3.54 |
| Spain | 1.05 → 1.05 | 2.26 → 2.27 | 2.38 → 2.36 | 4.62 → 4.27 |
| Belgium | 1.02 → 1.02 | 1.90 → 1.92 | 1.94 → 1.94 | 4.23 → 4.22 |
| Greece | 1.50* → 1.50 | 2.06 → 2.08 | 3.38 → 3.08* | 5.14 → 4.98 |
| Austria | 0.77 → 0.77 | 1.54 → 1.56 | 1.20 → 1.19 | 4.22 → 3.82 |
| Switzerland | — → 0.50 (default) | — → 3.00 | 0.27 → 1.49 | — |

\* Greece's 1.64 is capped at the engine's maximum starting debt of 1.5 (§8). Switzerland has no verified debt data (WORLD-03 W3-D5).

The remaining neighbours (Ireland, Netherlands, Czechia, Norway, Bulgaria) match within 0.02 pp on debt and rates.

**Debt after week 1, autopilot steering everyone:**

| | Week 1 | Week 52 | Week 104 | Week 156 |
|---|---:|---:|---:|---:|
| France | 1.09 | 1.05 | 0.97 | 0.89 |
| Italy | 1.34 | 1.31 | 1.23 | 1.14 |
| UK | 0.99 | 0.95 | 0.88 | 0.82 |
| Greece | 1.50 | 1.45 | 1.37 | 1.28 |
| Germany | 0.62 | 0.57 | 0.54 | 0.52 |

There are no defaults and no lost market access. The debts **fall** because week-1 budgets show surpluses where 2023 had deficits. That is a WORLD-03 budget-mapping gap, not a sovereign-risk effect (§8).

## 6. Baseline and stress simulations (`stress.json`, variant C, recalibrated inputs)

The stressed country issues the stated commands and is not steered by the autopilot.

| Run | Country | Debt: week 1 → end | Market rate at end | Sovereign events |
|---|---|---|---:|---|
| Baseline (×2, identical hashes) | Italy | 1.34 → 1.14 | 3.9% | none |
| Passive Italy (no autopilot) | Italy | 1.34 → 1.20 | 4.0% | none |
| Mismanagement: social +8, administration +4, income tax −5 pp | Italy | 1.34 → 1.56 | 5.9% | none in 156 weeks (pressure rising) |
| **Reckless**: social +15, administration +10, income tax −10 pp, 312 weeks | Italy | 1.34 → 2.0 (week 156) | 11.3% at week 156 | **Access lost week 197; default week 203; regime changes weeks 243 and 269** |
| **Reckless**: social +10, administration +8, income tax −8 pp, 312 weeks | Greece | 1.50 → 1.89 (week 156) | 8.7% at week 156 | **Access lost week 232; default week 238** |
| High taxation: income tax +15, consumption tax +5 pp | France | 1.09 → 0.73 | 3.7% | none; stability falls to 46 |
| Austerity: social −6, administration −6, infrastructure −2 pp | Greece | 1.50 → 1.11 | 3.9% | none |
| **Deliberate default in week 10** | Italy | 1.34 → 0.51 | 7.4% | 55% write-off; excluded until week 108 |
| **Repeated defaults** (weeks 10, 60 and 110) | Italy | 1.34 → 0.64 | 26.5% | 3 defaults; shut out at the end; stability 40 |

**Legitimate instability vs initialisation defects:**
- **Initialisation defects (fixed):** the starting debt ratio, cash buffer and stock rate. Baseline crises in week 1 are gone.
- **Legitimate dynamics (kept):**
  - genuine crises after sustained reckless deficits;
  - harsher terms after repeated defaults;
  - stability costs of high taxes.

  A crisis now needs about 4 years of reckless policy instead of happening at week 1, because the 2023-fitted spreads are much flatter than ECON-07's. Whether crises should come faster than the 2023 data imply is a **game-balance choice** for the owner (§9).

## 7. Accounting, determinism, compatibility and regression

| Check | Result |
|---|---|
| Money conservation (audit, every week, every run) | Worst money error 2.5e-10, within the engine's audit tolerance of 1e-9 |
| Bonds = debt held (audit) | Worst bond error 2.0e-15 |
| Money in circulation = money issued by central banks | Checked by test after a held build (< 1e-9) |
| Determinism | Two identical baselines (same 156-week hash); held build reproduces its hash (test) |
| **Fictional scenario unchanged** | Hash identical with and without the option (test). Golden fingerprint `da69e1f5b0859ef6` test passes |
| **Existing saves play identically** (old engine `28ead75` vs ECON-08, 26 weeks, `compat.json`) | WORLD-03 package save `316f4d3c35b23218` = `316f4d3c35b23218`; v5 fixture save `12e5fb54c70cf5a4` = same; fictional world `ccdb2e7f9d719117` = same |
| Save format | Unchanged (`STATE_VERSION` 6, session v2): the change adds no state field |
| New engine tests (`tests/econ08.test.ts`, 7) | Unchanged default; the defect itself; exact hold with conservation; effective rate and refinancing; invalid inputs refused; market pressure still costs access; determinism |
| Engine typecheck and tests, game tests, production build | See the PR for the final run |

## 8. Other WORLD-03 problems, re-evaluated

| Problem | After ECON-08 | Recommendation |
|---|---|---|
| **Income tax in France, Belgium and Austria** at the 70% maximum | **Solved.** Targets met at rates 0.32–0.33 | Nothing further |
| **Greece's 1.64 debt above the engine maximum of 1.5** | The 1.5 cap (`MAX_STARTING_DEBT`) protected against "no workable opening position" under ECON-07 spreads (15.8 pp at 1.64). With the 2023 fit the spread at 1.64 is **1.66 pp**, a workable start. **Not changed** (no silent widening) | Raise `MAX_STARTING_DEBT` to 2.0, or make it a parameter, in a small approved follow-up. Then Greece starts at its data value |
| **Middle East and Africa bloc** regime changes (now from week 100, every about 26 weeks; before ECON-08 from week 27) | **Not a debt problem**: debt 0.50–0.59, market rate below 6.3%, spending fully funded. **32% of the bloc's basic needs are unmet from week 1**, against 0% in the other four blocs. Output per person (about $9.9k, PPP) cannot buy the engine's uniform subsistence basket, so stability erodes (`bloc-probe.json`) | Owner decision, not changed: exempt blocs (non-actors) from regime change; or split the bloc; or review the subsistence basket for low-income regions |
| **New finding: week-1 budget balance** | Every tax and spending category matches 2023, but budgets show **surpluses 4–10 pp of GDP better than 2023** (France +4.3 vs −5.4). Engine revenue the data do not contain: tariffs 2.4–2.6% of GDP (engine default 3% tariff; EU customs revenue is about 0.1–0.2%); central-bank profit 1.8–2.0% (Eurosystem transfers were about nil in 2023); public-firm dividends 2–4% | WORLD-03 follow-up: add the **net lending / GDP** of 2023 as a calibration target; take the tariff from data (customs duties / imports); review the starting public-firm share and central-bank profit transfers. Owner decisions |

## 9. Decisions requested

| ID | Decision | Recommendation |
|---|---|---|
| **E8-1** | Approve the opt-in builder inputs `holdStartingDebt` and `effectiveRate` | Approve |
| **E8-2** | Approve the European scenario's spread parameters fitted to 2023 euro-area yields (scenario data; fictional unchanged) | Approve. Optionally steepen beyond the data range (for example `spreadQuadThreshold` 1.65 but `spreadQuad` > 0.25) if crises should arrive faster; this is a balance choice the 2023 data cannot settle |
| **E8-3** | `MAX_STARTING_DEBT` 1.5 → 2.0 (or a parameter), so Greece starts at 1.64 | Approve as a small follow-up |
| **E8-4** | Budget-balance target and data-based tariff in WORLD-03 | Approve as a WORLD-03 follow-up |
| **E8-5** | Middle East and Africa bloc instability | Choose one of the §8 options |

## 10. Recommended follow-up changes to WORLD-03

After approval:
1. Run the pipeline with `WORLD03_FINANCE=econ08`. Fold it into the default and publish a new package version, `1.0.0-draft.2`. The current `1.0.0-draft.1` stays immutable.
2. Add `es_bond_yields` and `build_financing.py` to the documented pipeline. They are already in this branch.
3. Add the net-lending target and the data-based tariff (E8-4).
4. Re-run validation, the benchmarks and the iPhone page on the new version.

## 11. Reproduce

Run from the repository root.

1. Build the financing inputs (offline; the yields snapshot is fetched with `fetch_sources.py --only financing`):

   ```bash
   python3 scenarios/pipeline/build_financing.py
   ```

2. Diagnose the warm-up (writes `diagnose-warmup.json`):

   ```bash
   node --experimental-strip-types economy-engine/sim/econ08/diagnose.ts
   ```

3. Compare variants base, A, B and C (writes `evaluate.json`):

   ```bash
   node --experimental-strip-types economy-engine/sim/econ08/evaluate.ts
   ```

4. Recalibrate the scenario with the ECON-08 options:

   ```bash
   WORLD03_FINANCE=econ08 node --experimental-strip-types economy-engine/sim/world03/calibrate.ts
   ```

5. Evaluate C on the recalibrated scenario:

   ```bash
   node --experimental-strip-types economy-engine/sim/econ08/evaluate.ts --policy scenarios/europe-2023/build-econ08/calibration.json --out evaluate-recalibrated --variants C
   ```

6. Run the baseline and stress simulations (writes `stress.json`):

   ```bash
   node --experimental-strip-types economy-engine/sim/econ08/stress.ts
   ```

7. Probe the Middle East and Africa bloc (writes `bloc-probe.json`):

   ```bash
   node --experimental-strip-types economy-engine/sim/econ08/bloc-probe.ts
   ```

8. Check save compatibility. Run this once against an engine checkout from before ECON-08 and once against this one, then compare the hashes:

   ```bash
   node --experimental-strip-types economy-engine/sim/econ08/compat.ts <engine-root> .
   ```

# ECON-07 — Economic Balance Corrections

| | |
|---|---|
| **Type** | Experimental balancing corrections, implemented on a branch. **Not merged.** Waiting for review. |
| **Branch** | `feature/econ-07-balance-corrections`, from `main` at `608c48b` (INT-02 merged) |
| **Commits** | `5642303` ECON-06 analysis brought in unchanged · `7869cd8` correction A · `8337264` correction B · `0e96fbe` correction C · then the study, documentation and this report |
| **Scope** | Only files inside `economy-engine/`. No game, UI, geography, military or weekly-loop change. No API signature changed. |
| **Reproduce** | `cd economy-engine && npm run econ07:compare` (about 8 minutes on 4 cores). It writes `reports/econ07/*.json` and [`reports/ECON_07_DATA.md`](reports/ECON_07_DATA.md). |

---

## 1. Summary in plain language

ECON-06 found three serious balance problems. Each now has a small, separate correction.

| | Problem | Correction | Result (60 games per strategy, 20 seeds × 3 countries) |
|---|---|---|---|
| **A** | A tax shock turned into a collapse that undoing the policy could not stop. | The government's budget no longer shrinks as fast as a slumping economy. A debt-free treasury returns idle cash above a half-year reserve to households. | • Maximum taxation for 8 weeks then undone: defeat in **41 → 6** of 60.<br>• High taxes with spending cuts for 13 weeks then undone: **21 → 6**.<br>• Maximum taxation kept in place: still **60 / 60** defeats. |
| **B** | A first default was cheaper than austerity. | Defaults cost more output for longer, and lenders remember longer. A *voluntary* default (declared while the state could still pay) is judged more harshly. | • Strategic default: GDP −1.7% → **−4.5%**, consumption −2.1% → **−5.5%**.<br>• Austerity: GDP −2.8%, consumption −0.5%.<br>• Default still reduces debt more (22% vs 33%): a trade-off, not a free win.<br>• A default is still **never a defeat** by itself. |
| **C** | Social spending made political risk almost disappear. | Each extra point of social spending buys less stability, and the gain stays below 8 points. Previously it rose in a straight line to +30. | • Welfare at 18%: stability 75 → **72**.<br>• Welfare at the 50% limit: defeat in **4 → 16** of 60.<br>• Cutting welfare back still costs stability. |

Other checks:
- **Moderate tax rises are safe.** Income tax +5 points, or all three taxes +5 points: no defeat in 60 games before or after.
- **Excessive taxation is still very dangerous.** Maximum taxation: 60 / 60 defeats. High taxes with deep spending cuts: 57%.
- **No new dominant strategy appears.** Growth still costs jobs, welfare still costs debt, austerity still costs growth, and default still costs growth, consumption and reputation.
- **All tests pass**, including the conservation, determinism, accounting and save/load tests: 201 engine tests and 146 game tests.
- **Old saves keep working.** An old (version-5) economy upgrades on load and continues **bit-for-bit as before**. This is checked against the pre-ECON-07 engine.
- **Performance is unchanged:** 1.71 vs 1.72 ms per week.

**Still open:**
- Raising all three taxes by 10 points at once still causes a deep, quick slump, with 12% of games lost. That case is mostly driven by a fourth mechanism that I found but did **not** change without your approval: the central bank raises interest rates against the one-off price jump from a consumption-tax rise.
- The other ECON-06 issues (limits, infrastructure jobs, small state, military) are untouched, as instructed.

---

## 2. Method

For each issue:
1. Trace the mechanism week by week in the engine, and confirm it in the code.
2. Test candidate fixes in a scratch copy of the engine, with 8–12 seeds × 3 countries.
3. Implement the smallest one as its own commit.
4. Run the full test suite.
5. Measure with the ECON-06 strategies.

The comparison study, `sim/econ07-compare.ts`, runs the **same engine code** in five configurations. Only the parameters differ, set on the week-1 economy:

| Configuration | Meaning |
|---|---|
| **before** | Every ECON-07 parameter at its legacy value. This *is* the pre-ECON-07 engine: it reproduces ECON-06's defeat counts exactly (for example 41/60, 21/60, 54/60, 7/60 and 11/60), and a version-5 save gives a bit-identical state (automated test). |
| **A**, **B**, **C** | One correction alone. This separates the individual effects. |
| **all** | The corrected engine as committed. |

Each configuration runs:
- the 25 ECON-06 strategies plus 4 new ones, for 3 countries × seeds 2401 (the production starting save), 7 and 99, over 156 weeks;
- a sweep of 20 further seeds × 3 countries for the 21 strategies where defeat matters.

That makes 1,512 runs per configuration and 7,560 in total. As in ECON-06, a run stops at the player's defeat (the first regime change) and there are no military events.

New strategies:

| ID | Strategy | Why |
|---|---|---|
| M03 | Income tax +5 points | A moderate tax rise |
| M05 | All three taxes +5 points | A broad but moderate tax rise |
| R04 | All taxes +10 points (B03) for 26 weeks, then undone | Recovery after a large tax rise |
| X10 | Welfare at 18% for two years, then cut back to 10% | Do cuts have a political cost? |

---

## 3. Correction A: tax shocks no longer cause irreversible collapse

### 3.1 Mechanism (identified)

I traced a tax rise week by week: Alden, all taxes +10 points, seed 2401. Three things happen at once.

1. **Income falls immediately.** Revenue jumps from about 11.6 to 16.1 per week while spending stays at 10.5. That is a surplus of about 12% of GDP. Households spend 80% of their (smoothed) income, so demand falls fast: unemployment goes from 2.6% to 21% in 9 weeks.
2. **The budget then shrinks with the economy (pro-cyclical spending).** The spending shares applied to the 13-week smoothed nominal GDP (`finance.ts`: `base = country.gdp`). As GDP fell, spending fell with it, from 10.5 to 8.4 per week. The slump became automatic austerity, and the surplus persisted. **This is the main reason a reversed policy still ended in defeat.** After maximum taxation was undone in week 10, the economy needed about 18 weeks to recover, and the regime faced its crisis rolls during that time. Experiments confirm it: changing only this rule takes R01 defeats from 23/36 to 8/36.
3. **Money withdrawn by surpluses.**
   - While there is debt, the surplus repays bondholders at 10% of the excess cash per week. That money returns to households, so it is not the problem.
   - Once the debt is fully repaid, the cash piles up in the treasury with no outlet. The code comment says it should not ("money cannot pile up idle"), but it did: in ECON-06, Alden's treasury reached 344 under maximum taxation. This case is real but rare within 156 weeks; it occurs only in the most extreme strategies.

Three other mechanisms were investigated:
- **Persistent crises after reversal (political rule).** I tested postponing a regime roll when the stability *target* is already back above the crisis threshold.
  - Once A's budget-base change is in place, it adds little: the remaining defeats happen while conditions are still genuinely bad.
  - It would also let a default's stability shock never trigger a roll, which conflicts with correction B and the repeated-default rule (C3).
  - Not implemented. The GAME_DESIGN episode rule is unchanged.
- **The central bank fights a tax-driven price jump.** A consumption-tax rise passes into prices: CPI jumped at a 47% annualised rate in week 2. The policy-rate rule reacts to that weekly inflation and raised Alden's rate from 6% to 11%, deepening the slump.
  - Experiment: cutting the rule's response to inflation to a quarter took X05 defeats from 21/24 to 8/24.
  - This is a monetary-policy change, outside the three items you listed, so it is **not implemented** (question Q1).
- **The size of the income shock itself.** Households spend 80% of income and adjust within weeks, so +10 points on every tax costs about 12% of GDP in demand at once. That is a real cost of high taxes and was kept.

### 3.2 Change (exact, before → after)

| | Before | After |
|---|---|---|
| Base of the four spending shares | `base = gdp`, where `gdp += (1/13)·(nominal − gdp)` | `base = spendingBase`, where `spendingBase += r·(nominal − spendingBase)` with `r = 1/13` if nominal ≥ spendingBase, and `r = spendingBaseFall = 1/104` if it is below |
| During world building (calibration) | — | `spendingBase = gdp` every week, so starting economies are calibrated exactly as before (verified: identical week-1 state) |
| Debt-free treasury (no debt, no central-bank loans) | cash accumulates | Each week, households receive `surplusReturnShare × (cash after this week's bills − treasuryReserveWeeks × core spending)` = 10% of the cash above **26 weeks** of core spending, paid by population like a cash transfer. New budget line `budget.detail.surplusReturned`. |
| New parameters | — | `spendingBaseFall` 1/104 · `treasuryReserveWeeks` 26 · `surplusReturnShare` 0.1 |
| New state field | — | `country.spendingBase` (state format version 6) |

**Economic logic.**
- **Spending base.** Real budgets are set in money terms from past revenue forecasts and are revised slowly, so they act as automatic stabilisers in a recession. They are not cut week by week as output falls. A base that rises with the economy at the old speed but falls over about two years models that. It also explains why a bad year costs debt.
- **Surplus return.** A government that has repaid everything keeps a half-year war chest; anything above it goes back to households. Surpluses stay useful: they repay debt first and build a reserve.

### 3.3 Individual effect (configuration A vs before)

| Strategy | Defeat (60 games) | Week 52: GDP vs base / unemployment / stability | Week 156: GDP vs base / stability |
|---|---|---|---|
| R01 Maximum taxation for 8 weeks, then undone | 41 → **6** | −15.5% / 18.6% / 51 → −7.1% / 11.9% / 53 | in office 3/9 → 7/9 |
| R02 High taxes with cuts for 13 weeks, then undone | 21 → **6** | −6.5% / 9.4% / 62 → −4.2% / 7.8% / 61 | in office 6/9 → 7/9 |
| X05 High taxes with spending cuts (kept) | 54 → 34 | all defeated → 4/9 in office | −25.8% / 22 for the survivors |
| B09 Maximum taxation (kept) | 60 → **60** | — | — |
| B03 All taxes +10 (kept) | 7 → 7 | −11.7% / 15.9% / 40 → −8.9% / 13.8% / 44 | −7.0% → −6.7%, unemployment 13.6% → 13.7% |
| R04 All taxes +10 for 26 weeks, then undone | 7 → 7 | −6.5% → −5.6% | +0.0% → −0.2%: full recovery |
| M03 / M05 moderate rises | 0 → 0 | M05: −5.8% → −5.0% | M05: −3.0% → −3.4% |
| B01 Baseline | 0 → 0 | unchanged | unchanged (calm economies are not affected) |

**Side effects.**
- Deficit strategies change only slightly: B08 defeats 11 → 8, and B02 0 → 3 in A alone, 0 with all corrections.
- In the regression suite's war-destruction scenario (35% of a country's plant destroyed), the devastated country keeps spending on a shrunken economy: debt is about 5 points higher and world output recovers less from its low.

---

## 4. Correction B: sovereign default is strategically costly

### 4.1 Mechanism (identified)

`applyDefault` (`finance.ts`) imposed these consequences for a first default:
- 55% of the debt written off;
- a 12-point stability drop, recovering within months;
- a 6% output shock fading over 52 weeks;
- 78 weeks without market access;
- a 5-point reputation premium decaying with a 156-week time constant.

A deliberate default from a healthy position (X01) therefore cost only 1.7% of GDP by week 156 while cutting debt from 54% to 20%. That beat austerity (B07: −2.7% GDP, debt 33%) on every measure. Nothing distinguished a chosen default from a forced one.

### 4.2 Change (exact, before → after)

| | Before | After |
|---|---|---|
| Output shock | 6%, recovering over 52 weeks | **8%, recovering over 78 weeks** (`defaultOutputShock`, `defaultShockRecoveryWeeks`) |
| Reputation premium decay | time constant 156 weeks | **260 weeks** (`reputationDecayWeeks`); it halves in about 3½ years |
| Voluntary default | not distinguished | **Voluntary** = declared while the state still has market access and no missed payments. It weighs like **half an extra previous default**: the multiplier `repeat = 1 + memory + 0.5` applies to the stability shock (12 → 18), the output shock (8% → 12%) and the reputation premium (5 → 7.5 points). Exclusion becomes `78 × (1 + 0.5 × (defaults + 0.5))` = 98 weeks instead of 78. (`voluntaryDefaultWeight` 0.5) |
| Write-off share | 55% / (1 + memory)² | **unchanged**: 55% for any first default, voluntary or not |
| Forced default, or one declared after lenders shut the country out | — | not voluntary: only the general changes apply |
| Event | `sovereign-default` | gains an optional `voluntary` flag, and the notice says so |

**Economic logic.**
- Defaults disrupt banks, trade credit and investment for well over a year.
- Investors price a default history for many years.
- A government that stops paying while it can still borrow shows unwillingness rather than inability to pay. Markets and the public judge that more harshly.
- The write-off stays at the approved provisional 55%. I tested also reducing it for voluntary defaults: it makes default pointless rather than costly (question Q2).

**A default is still not a defeat.** The stability shock (18 at most for a first voluntary default) cannot by itself open a crisis from normal stability: from 68 it falls to about 50, and the first crisis tier starts below 40. This is tested for all three countries: no crisis and no regime change in the year after a single default.

### 4.3 Individual effect (configuration B vs before), week 156

| Strategy | GDP vs base | Consumption/head | Debt/GDP | Stability | Defeat |
|---|---|---|---|---|---|
| X01 Strategic default (week 26) | −1.7% → **−4.5%** | −2.1% → −5.4% | 20% → 22% | 67 → 64 | 0 → 0 |
| B07 Austerity (for comparison, unchanged) | −2.7% | −0.4% | 33% | 64 | 0 |
| X02 Default, then welfare | −1.2% → −3.3% | +4.7% → +1.9% | 30% → 29% | 76 → 73 | 0 → 0 |
| X03 Welfare, then default in week 104 | −3.8% → −9.5% | +0.2% → −4.9% | 29% → 31% | 60 → 54 | 0 → 0 |
| B12 Borrow, then default (mostly not voluntary) | −0.7% → −2.1% | −2.4% → −3.9% | 24% → 25% | 66 → 65 | 3 → 3 |
| X04 Repeated defaults | −10.0% → −15.8% | −10.6% → −16.6% | 22% → 24% | 54 → 48 | 8 → 8 |

At week 52, the year after the default, X01 goes from −4.9% to −10.6% GDP and from stability 65 to 59.

**Comparison with austerity.**
- **Austerity** keeps the economy close to the baseline: GDP −2.8%, consumption −0.5%.
- **A strategic default** cuts debt further (22% vs 33%) but costs 1.7 more points of GDP, five times the consumption loss, three stability points in its first years and a lasting borrowing premium.

That is a trade-off with a clear cost, not a dominant move.

---

## 5. Correction C: diminishing returns on social spending

### 5.1 Mechanism (identified)

The stability target (`politics.ts`) added `150 × 0.5 × (social share − 10%)` for spending above the 10% norm: a straight line. This gave +6 points at 18% of GDP and +30 at the 50% limit. That is enough to absorb almost any other shock, so a player could buy immunity.

### 5.2 Change (exact, before → after)

| | Before | After |
|---|---|---|
| Social spending above the norm, gap g > 0 | `x = 75 · g` | `x / (1 + x / 8)` with `x = 75 · g` (`socialStabilityCap` 8). Plain arithmetic, so it is bit-identical on every JavaScript engine; the engine's hygiene test forbids `Math.exp`. |
| Below the norm, g < 0 | `150 · g` (full weight) | unchanged: cuts hurt fully |

| Social spending | 12% | 14% | 18% | 25% | 50% (limit) |
|---|---:|---:|---:|---:|---:|
| Stability bonus before | +1.5 | +3.0 | +6.0 | +11.3 | +30.0 |
| Stability bonus after | +1.3 | +2.2 | +3.4 | +4.7 | +6.3 |

**Economic logic.** Each extra transfer reaches people whose most pressing needs are already met, so goodwill grows less and less. The first points cost what they always did, so moderate welfare remains as useful as before.

**Cuts.** Reducing social spending still has a political cost through the existing living-standard rule: falling living standards hurt fully. X10 (18% for two years, then back to 10%) ends at stability 63, against 72 if spending is kept and 68 if it was never raised. This is tested.

### 5.3 Individual effect (configuration C vs before)

| Strategy | Stability, week 52 / 156 | Defeat (60 games) |
|---|---|---|
| B05 Welfare 18% | 74 / 75 → **72 / 72** | 0 → 0 |
| X08 Welfare at the 50% limit | 54 / 50 → **45 / 41** | 4 → **16** |
| X02 Default, then welfare | 65 / 76 → 63 / 73 | 0 → 0 |
| X10 Welfare, then cut back | 74 / 62 → 72 / 62 | 0 → 0 |

**Side effect.** The AI autopilot raises social spending when stability is low, and that now helps it less. In the war-destruction regression scenario the devastated country stays in deeper unrest with more strikes, so world output ends 1.2 points lower (88.1% of its start instead of 89.3%).

---

## 6. Defeat probabilities

A defeat is the player's regime falling (`GAME_DESIGN.md` §6). Each cell counts defeats out of 60 games (20 seeds × 3 countries, 156 weeks).
- **before** = pre-ECON-07 engine.
- **A**, **B**, **C** = one correction alone.
- **all** = the corrected engine.

| ID | Strategy | before | A | B | C | all |
|---|---|---:|---:|---:|---:|---:|
| B01 | Baseline | 0/60 (0%) | 0/60 (0%) | 0/60 (0%) | 0/60 (0%) | 0/60 (0%) |
| B02 | Low taxes | 0/60 (0%) | 3/60 (5%) | 2/60 (3%) | 0/60 (0%) | 0/60 (0%) |
| B03 | High taxes | 7/60 (12%) | 7/60 (12%) | 7/60 (12%) | 7/60 (12%) | 7/60 (12%) |
| M05 | Broad tax rise (all taxes +5 points) | 0/60 (0%) | 0/60 (0%) | 0/60 (0%) | 0/60 (0%) | 0/60 (0%) |
| B05 | Social welfare | 0/60 (0%) | 0/60 (0%) | 0/60 (0%) | 0/60 (0%) | 0/60 (0%) |
| B07 | Austerity | 0/60 (0%) | 0/60 (0%) | 0/60 (0%) | 0/60 (0%) | 0/60 (0%) |
| B08 | Deficit-financed expansion | 11/60 (18%) | 8/60 (13%) | 9/60 (15%) | 7/60 (12%) | 8/60 (13%) |
| B09 | Maximum taxation | 60/60 (100%) | 60/60 (100%) | 60/60 (100%) | 60/60 (100%) | 60/60 (100%) |
| B10 | Maximum spending | 60/60 (100%) | 60/60 (100%) | 60/60 (100%) | 60/60 (100%) | 60/60 (100%) |
| B12 | Borrow, then default | 3/60 (5%) | 3/60 (5%) | 3/60 (5%) | 3/60 (5%) | 3/60 (5%) |
| X01 | Strategic default | 0/60 (0%) | 0/60 (0%) | 0/60 (0%) | 0/60 (0%) | 0/60 (0%) |
| X02 | Default, then welfare | 0/60 (0%) | 0/60 (0%) | 0/60 (0%) | 0/60 (0%) | 0/60 (0%) |
| X03 | Welfare, then default | 0/60 (0%) | 0/60 (0%) | 0/60 (0%) | 0/60 (0%) | 0/60 (0%) |
| X04 | Repeated defaults | 8/60 (13%) | 8/60 (13%) | 8/60 (13%) | 8/60 (13%) | 8/60 (13%) |
| X05 | High taxes with spending cuts | 54/60 (90%) | 34/60 (57%) | 54/60 (90%) | 54/60 (90%) | 34/60 (57%) |
| X08 | One category at the limit | 4/60 (7%) | 7/60 (12%) | 4/60 (7%) | 16/60 (27%) | 16/60 (27%) |
| R01 | Maximum taxation for 8 weeks, then undo | 41/60 (68%) | 6/60 (10%) | 41/60 (68%) | 41/60 (68%) | 6/60 (10%) |
| R02 | High taxes with spending cuts for 13 weeks, then undo | 21/60 (35%) | 6/60 (10%) | 21/60 (35%) | 21/60 (35%) | 6/60 (10%) |
| R03 | Deficit expansion for a year, then undo | 0/60 (0%) | 0/60 (0%) | 0/60 (0%) | 0/60 (0%) | 0/60 (0%) |
| R04 | High taxes for 26 weeks, then undo | 7/60 (12%) | 7/60 (12%) | 7/60 (12%) | 7/60 (12%) | 7/60 (12%) |
| X10 | Welfare, then cut back | 0/60 (0%) | 0/60 (0%) | 0/60 (0%) | 0/60 (0%) | 0/60 (0%) |

With 60 games, a count has an uncertainty of roughly ±4. The before/after comparisons use the same seeds, so they share the same random draws.

---

## 7. Comparative results at weeks 52, 104 and 156

Each cell is **before → all corrections**: means over the 9 runs (Alden, Belora, Cyrin × seeds 2401, 7 and 99) still in office at that week. GDP and consumption are compared with each configuration's own baseline. "In office" counts the runs not yet defeated; averages over survivors flatter strategies that lost many games. Results for each correction alone are in [`reports/ECON_07_DATA.md`](reports/ECON_07_DATA.md).

### Week 52: before → all corrections

| ID | Real GDP vs base | Unemployment | Debt/GDP | Stability | Consumption/head vs base | In office (of 9) |
|---|---|---|---|---|---|---|
| B01 | 0.0% → 0.0% | 3.7% → 3.7% | 54% → 54% | 69 → 69 | 0.0% → 0.0% | 9 → 9 |
| M03 | -1.0% → -1.0% | 4.7% → 4.6% | 53% → 53% | 68 → 68 | -3.6% → -3.5% | 9 → 9 |
| M05 | -5.8% → -5.0% | 9.4% → 8.8% | 54% → 54% | 61 → 61 | -9.8% → -9.5% | 9 → 9 |
| B03 | -11.7% → -8.9% | 15.9% → 13.8% | 56% → 55% | 40 → 44 | -18.9% → -17.3% | 9 → 9 |
| R04 | -6.5% → -5.6% | 8.9% → 8.5% | 53% → 54% | 64 → 64 | -4.2% → -4.3% | 9 → 9 |
| X05 | — → -23.9% | — → 24.3% | — → 62% | — → 11 | — → -30.4% | 0 → 4 |
| R01 | -15.5% → -7.1% | 18.6% → 11.9% | 57% → 56% | 51 → 53 | -11.9% → -7.9% | 3 → 7 |
| R02 | -6.5% → -4.2% | 9.4% → 7.8% | 55% → 56% | 62 → 61 | -5.1% → -4.9% | 6 → 7 |
| B09 | — → — | — → — | — → — | — → — | — → — | 0 → 0 |
| B07 | -3.0% → -2.6% | 5.3% → 5.0% | 52% → 52% | 64 → 64 | -2.0% → -1.8% | 9 → 9 |
| X01 | -4.9% → -10.5% | 5.0% → 5.7% | 24% → 25% | 65 → 58 | -4.0% → -7.7% | 9 → 9 |
| X02 | -4.5% → -11.1% | 4.2% → 5.9% | 24% → 25% | 65 → 55 | +2.9% → -2.0% | 9 → 9 |
| X03 | +1.2% → +1.2% | 2.4% → 2.4% | 58% → 58% | 74 → 72 | +6.2% → +6.2% | 9 → 9 |
| X04 | -4.9% → -10.5% | 5.0% → 5.7% | 24% → 25% | 43 → 37 | -4.0% → -7.7% | 9 → 9 |
| B12 | -7.3% → -8.5% | 9.2% → 8.3% | 27% → 28% | 54 → 54 | -6.3% → -6.6% | 9 → 9 |
| B08 | +3.1% → +3.1% | 3.5% → 3.5% | 60% → 60% | 58 → 57 | +12.3% → +12.3% | 9 → 9 |
| B02 | +2.9% → +2.9% | 0.4% → 0.4% | 57% → 57% | 67 → 67 | +9.2% → +9.2% | 9 → 9 |
| B05 | +1.2% → +1.2% | 2.4% → 2.4% | 58% → 58% | 74 → 72 | +6.2% → +6.2% | 9 → 9 |
| X08 | -8.6% → -3.9% | 11.3% → 6.5% | 60% → 61% | 54 → 44 | +6.6% → +11.7% | 8 → 6 |
| X10 | +1.2% → +1.2% | 2.4% → 2.4% | 58% → 58% | 74 → 72 | +6.2% → +6.2% | 9 → 9 |
| B04 | +1.8% → +1.8% | 9.6% → 9.6% | 54% → 54% | 65 → 65 | -1.3% → -1.3% | 9 → 9 |
| B11 | +1.0% → +1.0% | 7.1% → 7.1% | 53% → 53% | 70 → 69 | -1.2% → -1.2% | 9 → 9 |
| X09 | +1.9% → +1.9% | 0.1% → 0.1% | 53% → 53% | 66 → 66 | +8.8% → +8.8% | 9 → 9 |

### Week 104: before → all corrections

| ID | Real GDP vs base | Unemployment | Debt/GDP | Stability | Consumption/head vs base | In office (of 9) |
|---|---|---|---|---|---|---|
| B01 | 0.0% → 0.0% | 5.7% → 5.7% | 51% → 51% | 69 → 69 | 0.0% → 0.0% | 9 → 9 |
| M03 | -0.8% → -0.8% | 6.3% → 6.3% | 46% → 47% | 67 → 67 | -3.2% → -3.2% | 9 → 9 |
| M05 | -4.3% → -4.5% | 9.6% → 9.9% | 45% → 45% | 63 → 62 | -8.4% → -8.6% | 9 → 9 |
| B03 | -7.0% → -7.4% | 12.7% → 13.4% | 39% → 40% | 49 → 49 | -15.6% → -15.7% | 9 → 9 |
| R04 | -1.5% → -2.7% | 6.5% → 7.6% | 49% → 50% | 70 → 70 | -1.4% → -2.0% | 9 → 9 |
| X05 | — → -19.8% | — → 21.7% | — → 38% | — → 19 | — → -28.3% | 0 → 4 |
| R01 | -7.5% → -7.5% | 11.8% → 12.7% | 53% → 53% | 62 → 62 | -6.4% → -5.6% | 3 → 7 |
| R02 | -4.9% → -4.5% | 9.4% → 9.4% | 51% → 53% | 68 → 67 | -2.9% → -3.2% | 6 → 7 |
| B09 | — → — | — → — | — → — | — → — | — → — | 0 → 0 |
| B07 | -2.8% → -2.7% | 6.0% → 6.0% | 42% → 43% | 64 → 64 | -0.8% → -0.8% | 9 → 9 |
| X01 | -3.0% → -7.7% | 7.1% → 8.9% | 22% → 24% | 66 → 62 | -3.3% → -8.1% | 9 → 9 |
| X02 | -4.7% → -7.2% | 8.4% → 7.5% | 24% → 25% | 66 → 60 | +1.2% → -3.9% | 9 → 9 |
| X03 | +1.4% → +1.4% | 4.4% → 4.4% | 28% → 28% | 65 → 57 | +7.1% → +7.1% | 9 → 9 |
| X04 | -17.9% → -24.7% | 13.8% → 15.0% | 25% → 26% | 49 → 44 | -14.3% → -18.1% | 5 → 5 |
| B12 | -3.1% → -4.8% | 8.3% → 8.6% | 26% → 27% | 62 → 61 | -4.9% → -6.3% | 9 → 9 |
| B08 | -5.3% → -7.5% | 8.2% → 8.3% | 27% → 28% | 41 → 40 | +2.1% → +0.9% | 7 → 7 |
| B02 | +3.1% → +3.5% | 2.2% → 2.0% | 61% → 61% | 66 → 66 | +13.0% → +13.5% | 9 → 9 |
| B05 | +1.4% → +1.4% | 4.4% → 4.4% | 62% → 62% | 76 → 74 | +7.1% → +7.1% | 9 → 9 |
| X08 | -9.7% → -18.7% | 11.6% → 19.6% | 59% → 63% | 47 → 35 | +2.3% → -1.8% | 5 → 5 |
| X10 | +1.4% → +1.4% | 4.4% → 4.4% | 62% → 62% | 76 → 74 | +6.9% → +6.9% | 9 → 9 |
| B04 | +2.9% → +2.9% | 12.9% → 12.9% | 52% → 52% | 59 → 59 | -2.2% → -2.2% | 9 → 9 |
| B11 | +1.9% → +1.9% | 10.3% → 10.3% | 48% → 48% | 64 → 64 | -1.7% → -1.7% | 9 → 9 |
| X09 | +2.4% → +2.4% | 1.1% → 1.1% | 53% → 53% | 67 → 67 | +9.8% → +9.8% | 9 → 9 |

### Week 156: before → all corrections

| ID | Real GDP vs base | Unemployment | Debt/GDP | Stability | Consumption/head vs base | In office (of 9) |
|---|---|---|---|---|---|---|
| B01 | 0.0% → 0.0% | 6.8% → 6.8% | 49% → 49% | 68 → 68 | 0.0% → 0.0% | 9 → 9 |
| M03 | -0.4% → -0.4% | 7.1% → 7.1% | 41% → 41% | 67 → 67 | -2.9% → -2.9% | 9 → 9 |
| M05 | -3.0% → -3.4% | 9.6% → 10.0% | 35% → 36% | 62 → 62 | -7.9% → -8.1% | 9 → 9 |
| B03 | -7.0% → -6.7% | 13.6% → 13.7% | 22% → 24% | 51 → 50 | -15.6% → -15.6% | 9 → 9 |
| R04 | +0.0% → -0.2% | 6.6% → 6.8% | 47% → 48% | 69 → 69 | -0.8% → -0.8% | 9 → 9 |
| X05 | — → -25.8% | — → 28.3% | — → 11% | — → 22 | — → -31.7% | 0 → 4 |
| R01 | -3.9% → -5.5% | 9.8% → 11.8% | 48% → 50% | 65 → 64 | -4.7% → -5.0% | 3 → 7 |
| R02 | -1.2% → -2.3% | 7.6% → 8.5% | 48% → 49% | 68 → 68 | -1.6% → -2.0% | 6 → 7 |
| B09 | — → — | — → — | — → — | — → — | — → — | 0 → 0 |
| B07 | -2.7% → -2.8% | 6.6% → 6.7% | 33% → 33% | 64 → 64 | -0.4% → -0.5% | 9 → 9 |
| X01 | -1.7% → -4.5% | 7.8% → 8.7% | 20% → 22% | 67 → 64 | -2.1% → -5.5% | 9 → 9 |
| X02 | -1.2% → -2.9% | 6.6% → 5.9% | 30% → 29% | 76 → 71 | +4.7% → +2.1% | 9 → 9 |
| X03 | -3.8% → -10.1% | 8.4% → 10.9% | 29% → 31% | 60 → 51 | +0.2% → -5.2% | 9 → 9 |
| X04 | -10.0% → -16.1% | 12.9% → 15.0% | 22% → 25% | 54 → 47 | -10.6% → -17.0% | 5 → 5 |
| B12 | -0.7% → -2.1% | 7.5% → 8.0% | 24% → 26% | 66 → 64 | -2.4% → -4.0% | 9 → 9 |
| B08 | +1.5% → +0.3% | 3.1% → 2.7% | 28% → 28% | 42 → 39 | +3.8% → +2.2% | 7 → 6 |
| B02 | -1.2% → -2.7% | 4.3% → 4.0% | 43% → 43% | 50 → 50 | +8.6% → +8.0% | 9 → 9 |
| B05 | +1.8% → +1.8% | 5.0% → 5.0% | 67% → 67% | 75 → 72 | +9.7% → +9.7% | 9 → 9 |
| X08 | -5.5% → -8.1% | 6.5% → 7.8% | 58% → 64% | 50 → 38 | +12.2% → +11.1% | 5 → 5 |
| X10 | -0.6% → -0.1% | 7.5% → 7.2% | 63% → 63% | 62 → 63 | -0.9% → -0.7% | 9 → 9 |
| B04 | +6.1% → +6.1% | 12.1% → 12.1% | 51% → 51% | 59 → 59 | -2.0% → -2.0% | 9 → 9 |
| B11 | +4.6% → +4.6% | 10.5% → 10.5% | 44% → 44% | 63 → 63 | -1.2% → -1.2% | 9 → 9 |
| X09 | +1.7% → +1.7% | 2.6% → 2.6% | 54% → 54% | 66 → 66 | +10.3% → +10.3% | 9 → 9 |


### Week 156 by country (seed 2401): GDP vs base / stability / debt, before → all

| ID | Alden | Belora | Cyrin |
|---|---|---|---|
| B03 | -7.7% / 51 / 26% → -7.1% / 51 / 29% | -6.6% / 51 / 19% → -6.4% / 51 / 22% | -6.5% / 50 / 20% → -6.4% / 50 / 22% |
| M05 | -2.8% / 63 / 37% → -3.5% / 63 / 38% | -3.1% / 62 / 34% → -3.4% / 62 / 34% | -2.9% / 61 / 35% → -3.2% / 61 / 35% |
| R01 | -4.0% / 65 / 49% → -5.2% / 65 / 51% | ✕ wk 11 → ✕ wk 11 | ✕ wk 11 → ✕ wk 11 |
| R02 | -1.0% / 68 / 50% → -2.8% / 69 / 51% | ✕ wk 11 → ✕ wk 11 | ✕ wk 11 → ✕ wk 11 |
| X05 | ✕ wk 38 → -26.5% / 21 / 15% | ✕ wk 11 → ✕ wk 11 | ✕ wk 11 → ✕ wk 11 |
| B07 | -2.6% / 64 / 34% → -2.9% / 64 / 35% | -2.8% / 64 / 32% → -2.9% / 64 / 33% | -2.5% / 63 / 33% → -2.6% / 63 / 33% |
| X01 | -1.7% / 67 / 20% → -4.5% / 64 / 23% | -1.6% / 67 / 20% → -4.5% / 64 / 22% | -1.7% / 66 / 20% → -4.6% / 63 / 22% |
| X02 | -0.9% / 75 / 30% → -2.7% / 70 / 29% | -1.3% / 76 / 30% → -3.0% / 71 / 29% | -1.3% / 76 / 31% → -3.0% / 70 / 30% |
| B12 | -1.1% / 68 / 22% → -1.9% / 66 / 24% | -1.1% / 67 / 23% → -3.0% / 65 / 25% | +0.2% / 63 / 26% → -1.3% / 62 / 29% |
| B05 | +3.9% / 73 / 65% → +3.9% / 71 / 65% | +1.0% / 76 / 67% → +1.0% / 74 / 67% | +0.5% / 76 / 69% → +0.5% / 73 / 69% |
| X08 | -5.2% / 45 / 56% → ✕ wk 33 | -6.6% / 52 / 60% → -3.4% / 44 / 58% | ✕ wk 103 → -10.2% / 34 / 69% |
| X10 | -1.3% / 62 / 64% → -0.6% / 63 / 64% | -0.0% / 63 / 62% → +0.3% / 63 / 62% | -0.2% / 62 / 64% → -0.0% / 62 / 64% |


### Defeats per country (20-seed sweep), before → all

| ID | Alden | Belora | Cyrin |
|---|---|---|---|
| B03 | 4/20 → 4/20 | 2/20 → 2/20 | 1/20 → 1/20 |
| B08 | 3/20 → 3/20 | 5/20 → 2/20 | 3/20 → 3/20 |
| B12 | 3/20 → 3/20 | 0/20 → 0/20 | 0/20 → 0/20 |
| X04 | 2/20 → 2/20 | 4/20 → 4/20 | 2/20 → 2/20 |
| X05 | 20/20 → 12/20 | 14/20 → 11/20 | 20/20 → 11/20 |
| X08 | 2/20 → 8/20 | 0/20 → 7/20 | 2/20 → 1/20 |
| R01 | 16/20 → 1/20 | 14/20 → 5/20 | 11/20 → 0/20 |
| R02 | 16/20 → 1/20 | 5/20 → 5/20 | 0/20 → 0/20 |
| R04 | 4/20 → 4/20 | 2/20 → 2/20 | 1/20 → 1/20 |


---

---

## 8. Acceptance criteria

| Criterion | Result | Evidence |
|---|---|---|
| Moderate tax increases do not routinely create irreversible collapses | **Met** | • M03 (income tax +5) and M05 (all taxes +5): 0/60 defeats, GDP −0.4% and −3.4% at week 156.<br>• Even +10 points on every tax (B03) is fully reversible: R04 ends at −0.2% GDP. |
| Excessive taxation can still trigger severe crises | **Met** | • Maximum taxation (B09): 60/60 defeats, median week 17.<br>• High taxes with deep spending cuts (X05): 34/60.<br>• All taxes +10 (B03): 7/60, unemployment 13.7%. |
| Recovery after policy reversal is possible | **Met (not guaranteed)** | • R01 (maximum taxation for 8 weeks, then undone): defeat 41 → 6 of 60.<br>• R02 (13 weeks, then undone): 21 → 6.<br>• R03 (a year of deficits): 0 both before and after. |
| Strategic default is no longer an obviously superior alternative to austerity | **Met** | • Strategic default (X01): GDP −4.5%, consumption −5.5%, stability 64, debt 22%.<br>• Austerity (B07): −2.8%, −0.5%, 64, 33%.<br>• Default wins on debt only, at a clear cost.<br>• "Default, then welfare" is no longer the most stable strategy (71, against 72 for welfare alone). |
| Social spending improves stability but cannot guarantee immunity | **Met** | • Welfare at 18% still adds about 4 points (72 vs 68).<br>• Welfare at the 50% limit: 16/60 defeats.<br>• With maximum taxes, every regime falls within a year even with social spending at 50% (tested). |
| Growth, debt, employment and stability still involve trade-offs | **Met** | Unchanged from ECON-06 for the moderate strategies:<br>• infrastructure: +6.1% GDP, 12.1% unemployment, stability 59;<br>• balanced growth: +4.6% GDP, 10.5% unemployment, 63;<br>• welfare: debt 67%, stability 72;<br>• austerity: −2.8% GDP, debt 33%. |
| The player is not automatically defeated by default | **Met** | • 0/60 defeats after a single default (X01, X02, X03).<br>• Tested for all three countries: no crisis and no regime change in the year after a default.<br>• Repeated defaults (X04) remain dangerous (8/60), as before. |
| Conservation, determinism, accounting and save/load tests pass | **Met** | §10. |

### Did any correction create a new dominant strategy?

No. The strategies most changed, at week 156 with all corrections:

| Strategy | GDP vs base | Unemployment | Debt/GDP | Stability | Consumption | Defeat |
|---|---|---|---|---|---|---|
| B04 Infrastructure | **+6.1%** | 12.1% | 51% | 59 | −2.0% | 0% |
| B11 Balanced growth | +4.6% | 10.5% | 44% | 63 | −1.2% | 0% |
| B05 Welfare | +1.8% | 5.0% | 67% | **72** | +9.7% | 0% |
| X02 Default, then welfare | −2.9% | 5.9% | 29% | 71 | +2.1% | 0% |
| B07 Austerity | −2.8% | 6.7% | 33% | 64 | −0.5% | 0% |
| X01 Strategic default | −4.5% | 8.7% | **22%** | 64 | −5.5% | 0% |
| B08 Deficit-financed expansion | +0.3% | 2.7% | 28% | 39 | +2.2% | 13% |
| X09 Small state (ECON-06 issue 5, untouched) | +1.7% | **2.6%** | 54% | 66 | **+10.3%** | 0% |

Each leader pays for its lead somewhere else. The one exception is the small state, which is still close to dominating the baseline; it was ECON-06 issue 5 and outside this task (§11).

---

## 9. Compatibility

| Item | Status |
|---|---|
| Integration API | **No signature changed.** Contract stays **1.0.0**. Two additive fields: `budget.detail.surplusReturned` (number) and an optional `voluntary` flag on `sovereign-default` events. Game code compiles and its 146 tests pass unchanged. |
| Engine state format | Version **5 → 6** (new field `country.spendingBase`, five new parameters). The session save format stays v2. |
| Old saves (v5) | `restoreEconomy` upgrades them on load without modifying the caller's data. They get the new field (equal to the smoothed GDP) and **legacy** values for the new parameters (`spendingBaseFall` = 1/13, `surplusReturnShare` 0, `voluntaryDefaultWeight` 0, `socialStabilityCap` 0), and keep their own saved values for every existing parameter. An old game therefore **continues exactly as before**. Test: 60 weeks of tax changes, welfare and a declared default from the v5 save give a state digest identical to the pre-ECON-07 engine's (`2a254f59fbe5e339`). |
| Starting save (`scenarios/fictional-week1.economy.json`) | **Regenerated** with `npm run starting-save`. The week-1 economy itself is identical to the old one (same calibration, verified field by field), apart from the new field and the corrected parameter values. World fingerprint unchanged (`938db749d9c525c2`); economy fingerprint `8d1a5cea6a9b58dd` → `7eba7fbe1de2f117`; 186,259 → 186,533 bytes. The game tests that compare the save with a freshly built economy pass. The old save is kept as a test fixture (`tests/fixtures/fictional-week1.v5.economy.json`). |
| Golden fingerprint (`tests/golden.test.ts`) | Re-pinned once per correction, as intended model changes: `6f9bf1a361044b05` → `63e9873f967ab474` (A) → `c4f3bb8d9b057d5e` (B) → `da69e1f5b0859ef6` (C). |
| Migration plan for the game | Merging this branch changes nothing in the game's code. New games start from the new save and get the corrected balance. Any saved v5 economy (for example from Codex's SAVE-01 work) loads and keeps the old balance until a new game is started. If you would rather upgrade old games to the new balance, that is a one-line change in `legacyParamsV5` (question Q4). |

---

## 10. Tests and accounting

| Check | Result |
|---|---|
| Engine `npm test` | **201 / 201 pass** (190 before ECON-07, plus 11 new in `tests/econ07.test.ts`) |
| Engine `npm run typecheck` | passes |
| Game `npm test` (root) | **146 / 146 pass** |
| Conservation audit (money, goods, bonds) | passes every week of every test and of all 7,560 study runs (`advanceEconomyWeek` throws otherwise) |
| Budget identity | revenue and spending lines add up exactly, including the new `surplusReturned` line (`finance.test.ts`, `firms.test.ts`) |
| Determinism and save/load round trips | pass (existing suites, plus the v6 starting save round trip and the v5 upgrade) |
| Cross-engine determinism | the new curve uses only `+ − × ÷` (hygiene test) |

**New tests (`tests/econ07.test.ts`):**
- v5 → v6 upgrade, bit-identical continuation;
- the upgrade leaves input untouched;
- the v6 starting save is valid and round-trips;
- (A) the budget base falls slowly in a slump;
- (A) surplus is returned only above the 26-week reserve and only without debt;
- (B) a voluntary default has heavier consequences with the same write-off;
- (B) a default declared after losing market access is not voluntary;
- (B) a default is never a defeat (all three countries);
- (C) the curve is diminishing and bounded, cuts hurt fully, and the legacy line holds when the cap is 0;
- (C) maximum welfare doesn't protect a regime from ruinous taxes;
- (C) cutting welfare costs stability.

**Existing tests changed, each with an explanation in the code:**

| Test | Change | Why |
|---|---|---|
| `finance.test.ts`, `firms.test.ts` | budget identity includes the new `surplusReturned` line | new budget line |
| `horizon.test.ts`, energy shock | "no default or regime change" → "no default, and no crisis beyond tier 1" | Old and new engines bring the same country to the same single tier-1 crisis (one 15% roll). The crisis now starts one week earlier, so the seeded draw differs. |
| `horizon.test.ts`, war-scale capacity destruction | "output recovers 2 points from its low" → "1 point" | The devastated country stays in a tier-3 crisis in every version. Under A and C it keeps spending and can't buy calm with welfare: world output ends 1.2 points above its low (31-good world) instead of 2.5. |
| `golden.test.ts` | re-pinned three times | intended changes |

---

## 11. Performance

| | Before ECON-07 | After | |
|---|---:|---:|---|
| One week through `advanceEconomyWeek` (Node, median of 6 interleaved runs of a 155-week game) | 1.72 ms | 1.71 ms | no measurable difference |
| Start from the starting save | 1.65 ms | 1.65 ms | |
| Starting-save size | 186,259 bytes | 186,533 bytes | +274 bytes |

The new work per week is a few multiplications per country. Run-to-run noise (±15%) is larger than any difference.

---

## 12. Remaining balance problems

1. **A large tax rise (all three +10 points at once) still causes a deep, quick slump.**
   - Defeat in 7/60 games, GDP −6.7% and unemployment 13.7% while it lasts; it is fully reversible.
   - The fast part is the central bank's reaction to the consumption-tax price jump (§3.1). It is the main lever left, and needs your approval (Q1).
2. **"Borrow, then default" (B12) is still fairly cheap.** It ends at GDP −2.1% and stability 64 with debt halved, with a 5% defeat risk and a year-one consumption boom. The default usually comes after markets have closed, so it doesn't count as voluntary (Q3).
3. **High taxes with deep spending cuts (X05)** still end in defeat in 57% of games. I judge that an acceptable outcome for an extreme policy, but it is a calibration choice.
4. **ECON-06 issues outside this task are unchanged:**
   - the limits that allow instant self-destruction (B09, B10);
   - infrastructure raising unemployment;
   - the near-dominant small state (X09);
   - military spending being economically free;
   - the dashboard's weekly-annualised inflation.
5. **The AI autopilot gets less from welfare (C).** In the war-destruction scenario the devastated AI country stays in deeper unrest. AI priorities are still an open design question.

---

## 13. Questions requiring your approval

1. **Q1: Central bank and tax-driven price jumps.** May I make the policy-rate rule look through the one-off price change caused by a consumption-tax change? It would use inflation net of that effect. This is the main remaining driver of the slump after a large tax rise.
2. **Q2: Write-off for a voluntary default.** It stays at the approved provisional 55%. Should a voluntary default write off less (for example 55% / 1.5² = 24%)? That makes default nearly pointless rather than costly, so I did not do it.
3. **Q3: Borrowing to the brink, then defaulting.** Should a default declared after markets close, following a deliberate borrowing spree, count as voluntary? That needs a definition of "deliberate", for example a deficit above some level in the previous year.
4. **Q4: Old saves.** Keep the old balance for economies saved before ECON-07 (current behaviour), or upgrade them to the corrected balance on load?
5. **Q5: Parameter values.** Do you approve these values, or would you like a different strength?

   | Parameter | Value | Meaning |
   |---|---|---|
   | `spendingBaseFall` | 1/104 | about two years |
   | `treasuryReserveWeeks` | 26 | reserve of half a year of core spending |
   | `surplusReturnShare` | 10% per week | |
   | Output shock | 8% over 78 weeks | |
   | Reputation decay | 260 weeks | |
   | `voluntaryDefaultWeight` | 0.5 | |
   | `socialStabilityCap` | 8 | |
6. **Q6: Next step.** A pull request targeting `main` is open for review only. After your decisions, should I adjust this branch, and then prepare an ECON-08 for the remaining ECON-06 issues?

---

## 14. Files

| File | |
|---|---|
| `src/core/finance.ts` | A (budget base, surplus return), B (voluntary default, exclusion) |
| `src/core/politics.ts` | C (`socialStability`) |
| `src/config/defaults.ts`, `src/types.ts` | new and changed parameters, validation, `surplusReturned`, `spendingBase`, the event's `voluntary` flag |
| `src/core/state.ts` | state version 6, `upgradeEconomy`, `legacyParamsV5` |
| `src/core/model.ts`, `stats.ts`, `rebase.ts`, `world/builder.ts`, `integration/events.ts` | workspace fields, budget report, rebasing, calibration lock, notice text |
| `scenarios/fictional-week1.economy.json` | regenerated starting save (v6) |
| `tests/econ07.test.ts`, `tests/fixtures/fictional-week1.v5.economy.json` | new tests and the old save fixture |
| `tests/finance.test.ts`, `firms.test.ts`, `horizon.test.ts`, `golden.test.ts` | adjusted as explained in §10 |
| `sim/econ07-compare.ts`, `reports/econ07/*.json`, `reports/ECON_07_DATA.md` | comparative study and its data |
| `sim/scenarios.ts`, `ECONOMY_DESIGN.md`, `INTEGRATION_API.md`, `CODEX_HANDOFF.md`, `HANDOFF_REPORT.md`, `reports/CONFIG_REFERENCE.md` | documentation |
| `ECON_06_BALANCE_REPORT.md`, `sim/econ06-balance.ts`, `reports/ECON_06_BALANCE_DATA.md`, `reports/econ06_balance.json`, `reports/econ06-charts/` | the ECON-06 analysis, brought in **unchanged** |

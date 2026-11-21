# ECON-06 — Economic Gameplay Validation

**Type:** validation and balancing study. No new mechanics.
**Branch:** `analysis/econ-06-gameplay-validation`, from `feature/economy-engine-handoff` (`a09903d`).
**Engine changes:** none. No formula, parameter, game, UI or geography file was touched. PR #26 (Codex) was left alone.
**Reproduce:** `cd economy-engine && npm run econ06`. This runs 153 deterministic runs in about 45 s and rewrites `reports/econ06.json` and `reports/ECON_06_DATA.md`.

---

## Summary in plain language

The economy reacts quickly and in the expected *direction* to most choices. Borrowing has a limit. Repeated defaults hurt. High spending causes inflation. But four results are out of balance, and one of them can lose the game:

1. **Raising taxes sharply wrecks the country within months.** At taxes of about 35%, GDP falls about 27% and unemployment reaches about 28%. The government falls in all 9 test runs, the first time between week 11 and week 49. The cause is that spending is set as a share of GDP. When the economy shrinks, spending shrinks with it. The extra tax money is then taken out of the economy (it pays down debt or sits in the treasury) instead of being spent back into it. Nothing on screen explains this.
2. **A deliberate default is too cheap.** Defaulting in week 26 costs about 2% of GDP by week 156. There is no government collapse, and stability never goes below 56. It reduces debt faster than austerity does, and with less damage. "Default first, then spend on welfare" (variant V7) gives the **highest stability of any strategy (76)**. That makes it the dominant exploit.
3. **Welfare paid for by borrowing is almost free for about two years.** Social spending at 20% of GDP gives stability of 75–77 and 8–12% more consumption per head. The bill only starts to appear late in year 3, and a default (V6/V7) lets the player avoid it.
4. **Responsible investment is punished.** Infrastructure and the balanced plan raise GDP by 4.6–5.6% by week 156. But they also raise unemployment by 4–6 points and lower stability by 5–10. The player would read this as "investment is bad".
5. **Several displays and limits mislead the player.** Inflation is shown as a weekly rate scaled up to a year, so it spikes after any tax change (13% even in the baseline, 239% at most). Growth is blank for the first 26 weeks. The "maximum spending" setting is accepted but only 7–11% of it can actually be paid for.

**Recommended direction (not implemented):** first fix the surplus problem in issue 1, so that a tax rise can no longer wipe out spending. Then make defaults costly in a way the player can see. Then reduce how much stability the player gets from extra social spending. The owner's decisions are needed first (§11).

---

## 1. Method

- **Scenario:** the existing fictional world (`fictionalGameWorld`). It has three countries: Alden, Belora and Cyrin.
- **Session:** each run starts from week 1 with `createEconomySession`. The player country receives its fiscal commands in week 2 through the public integration API (`fiscalCommands`, contract 1.0.0). It is then advanced week by week to week 156 with `advanceEconomyWeek`. The other two countries stay on the engine's own policy autopilot, as they would in the game.
- **Comparison:** each strategy is compared with the baseline run (S1) for the same country and seed. So "GDP −5%" means "5% smaller than if the player had done nothing".
- **Seeds:** 2401 (the game's seed), 7 and 99. Results barely change between seeds: the GDP spread is usually under 1 point. So the conclusions do not depend on luck.
- **Scale:** 17 strategies (10 requested plus 7 variants that test exploits) × 3 countries × 3 seeds = 153 runs, plus the baselines.
- **What is measured:**
  - snapshots at weeks 52, 104 and 156: real GDP, growth, inflation, unemployment, revenue, expenditure, funded share, treasury, debt, debt/GDP, market access and rate, consumption per head (household welfare), deprivation (shortages), stability, unrest tier and regime;
  - the worst value over the whole run for stability, unemployment, inflation and funded share;
  - event counts: defaults, missed payments and regime changes;
  - the number of weeks until GDP first differs from the baseline by more than 1%.

### Strategies

All rates are shares of GDP. The starting values are about: income tax 13.7%, consumption tax 10%, corporate tax 20%, administration 12%, social 10%, military 2%, infrastructure 2%.

| ID | Strategy | Commands (week 2 unless stated) |
|---|---|---|
| S1 | Baseline | none |
| S2 | Low taxes, high spending | taxes income 5%, consumption 3%, corporate 5%; spending administration 15%, social 18%, military 4%, infrastructure 5% |
| S3 | High taxes, restrained spending | taxes 35% / 20% / 35%; spending administration 9%, social 8%, military 2%, infrastructure 2% |
| S4 | Heavy infrastructure | infrastructure 10% |
| S5 | Heavy military | military 10% |
| S6 | High social spending | social 20% |
| S7 | Maximum permitted taxation | all three taxes at 70% (the limit) |
| S8 | Maximum permitted spending | all four spending categories at 50% (the limit) |
| S9 | Deliberate default | declare default in week 26 |
| S10 | Balanced long-term plan | income tax +3 points; administration 11%, social 11%, infrastructure 4% |
| V1 | Borrow, then default | S2, then default in week 52 |
| V2 | Repeated defaults | default in weeks 26, 52 and 78 |
| V3 | Tax cut only | all taxes at 5%; spending unchanged |
| V4 | Infrastructure paid for by taxes | infrastructure 10% and income tax +6 points |
| V5 | Austerity | all spending halved |
| V6 | Spend, then default | S6, then default in week 104 |
| V7 | Default, then spend | default in week 26, then social 20% from week 27 |

---

## 2. Comparative results by strategy

Figures are means over 9 runs at week 156, compared with the baseline, unless stated otherwise.

- **S1 Baseline.** The economy is flat to slightly shrinking: real GDP for Alden goes 47.3 → 46.7. Inflation eases from 3.9% to 1.9%. Unemployment drifts up from 3.7% to 6.8%. Debt/GDP falls from 54% to 49%. Stability stays at about 68. Nothing dramatic happens: a quiet but slowly worsening "do nothing" path.
- **S2 Low taxes, high spending.** Households gain a lot: consumption is +10.7% at week 156. But the state cannot pay its bills:
  - markets closed in 6 of 9 runs by week 52 and in all 9 by week 104;
  - one forced default per run and 87 missed payments;
  - only 56% of spending is actually paid for at week 156, and at worst 0%;
  - stability 39, with regime changes in 2 of 9 runs (weeks 34 and 49).

  **Borrowing cannot be kept up forever. This works as intended.**
- **S3 High taxes, restrained spending.** A depression:
  - GDP −27.5%, consumption −35.5%, unemployment 29.6%;
  - deflation of −6.4% at week 52;
  - stability 19, with 28 regime changes across all 9 runs, the first between weeks 11 and 49.

  The budget runs a large surplus. For Alden, revenue is 11.5 per week against spending of 5.4. That surplus repays debt (1,123 → 212) and builds the treasury (70–113), so it never returns to the economy. Belora and Cyrin reach zero debt.
- **S4 Heavy infrastructure.** Almost no effect in year 1 (+0.4%). Real gains by year 3 (GDP +5.6%, growth +3.7%), the best GDP of any strategy. But unemployment rises to 12.4% (baseline 6.8%) and consumption is −2%. Stability is 58, against 68 for the baseline. Alden also loses market access for its last 9 weeks.
- **S5 Heavy military.** GDP +1.9% and consumption +3.2%: military spending acts as a demand boost. Inflation 5.7%, debt/GDP 66%, stability almost unchanged (67). Five times the military budget has no economic downside within three years, apart from Alden briefly losing market access (19 weeks).
- **S6 High social spending.** The most pleasant short-term strategy:
  - stability 75 at week 52 and 77 at week 104;
  - consumption +8% → +11% → +12%;
  - GDP +2.5%.

  The cost shows in year 3. Debt/GDP reaches 69%. Alden, the most indebted country, lost market access for about 37 weeks late in year 3, in all three seeds. In those runs only 8% of spending could be paid for at the worst point, and stability fell to 46 before recovering to 52. Belora lost access for 13–15 weeks. Cyrin never did.
- **S7 Maximum taxation.** A total collapse:
  - GDP −72%, consumption −86%, unemployment 74% (at worst 92%), deprivation 48%;
  - an inflation spike of up to 239% followed by deflation;
  - 51 regime changes, the first between weeks 11 and 28.

  Alden ends with a treasury of 344 and zero debt.
- **S8 Maximum spending.** The engine accepts 200% of GDP in spending orders but can only pay 7–11% of them. GDP −13%, unemployment 20%, stability 17, inflation up to 110%, 18 regime changes. The outcome is chaotic rather than an understandable "overspending" story.
- **S9 Default in week 26.** GDP −4.9% at week 52, recovering to −1.7% by week 156. Debt/GDP falls from 54% to 20% at once. Markets reopen after about 78 weeks. Stability is never below 56, and there is no regime change.
- **S10 Balanced plan.** GDP +4.6%, debt/GDP 44% (better than the baseline), inflation 2.0%. But unemployment is 10.5% and stability 63, 5 below the baseline. Consumption is −1.2%.
- **V1 Borrow, then default.** The worst of both: GDP −7%, stability 34, at worst 5. Regime changes in 4 of 9 runs.
- **V2 Repeated defaults.** GDP −10% (−17.8% at week 104), 27 defaults, markets closed for the whole game. Regime changes in 4 of 9 runs, all in week 81, after the third default. **The escalating penalty works.**
- **V3 Tax cut only.** Consumption +11% in year 1, then a forced default. Stability 39, GDP −7.5% by week 156.
- **V4 Infrastructure paid for by taxes.** GDP +4.2%, but unemployment 13.6% and consumption −7.8%. A moderate tax rise does **not** cause the S3 collapse, because spending rises alongside it.
- **V5 Austerity.** GDP −3.7%, debt/GDP 23%, stability 62.
- **V6 Spend, then default.** The welfare boost lasts two years. The default in week 104 then halves debt (62% → 28%). The final result is GDP −6.6% and stability 56, with no regime change.
- **V7 Default, then spend.** GDP −0.3%, consumption +8.1%, **stability 76 (the best of all 17)**, debt/GDP 32%, no regime change. Markets had reopened by week 104.

---

## 3. Tables at weeks 52, 104 and 156

Means of 9 runs. GDP and consumption per head are measured against the same-seed, same-country baseline. Inflation is the engine's annualised weekly rate. "Funded share" is the part of ordered spending that is actually paid for. The full tables, with ranges, growth, deprivation and absolute values for Alden, are in `reports/ECON_06_SUMMARY_TABLES.md`. Per seed and per country tables are in `reports/ECON_06_DATA.md`.

#### Week 52 (mean of 9 runs: 3 countries × 3 seeds; ranges in `reports/ECON_06_SUMMARY_TABLES.md`)

| Strategy | Real GDP vs baseline | Inflation | Unemployment | Funded share | Debt / GDP | Market closed (runs) | Consumption / head vs baseline | Stability | Regime changes so far (runs) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| S1 | 0.0% | 3.9% | 3.7% | 100% | 54% | 0/9 | 0.0% | 69 | 0 (0/9 runs) |
| S2 | -6.0% | 1.1% | 7.7% | 47% | 39% | 6/9 | 4.6% | 37 | 2 (2/9 runs) |
| S3 | -27.1% | -6.4% | 27.6% | 100% | 60% | 0/9 | -33.3% | 26 | 14 (9/9 runs) |
| S4 | 0.4% | 5.2% | 12.7% | 100% | 56% | 0/9 | -3.1% | 60 | 0 (0/9 runs) |
| S5 | 1.4% | 6.3% | 2.5% | 100% | 58% | 0/9 | 0.7% | 66 | 0 (0/9 runs) |
| S6 | 1.6% | 7.1% | 2.0% | 100% | 59% | 0/9 | 8.0% | 75 | 0 (0/9 runs) |
| S7 | -61.7% | 0.3% | 62.9% | 100% | 84% | 0/9 | -72.9% | 18 | 15 (9/9 runs) |
| S8 | -24.4% | -10.8% | 27.9% | 7% | 59% | 7/9 | -17.7% | 23 | 14 (9/9 runs) |
| S9 | -4.9% | 3.6% | 5.0% | 100% | 24% | 9/9 | -4.0% | 65 | 0 (0/9 runs) |
| S10 | 1.0% | 3.2% | 7.1% | 100% | 53% | 0/9 | -1.2% | 70 | 0 (0/9 runs) |
| V1 | -6.0% | 1.1% | 7.7% | 47% | 27% | 9/9 | 4.6% | 19 | 2 (2/9 runs) |
| V2 | -4.9% | 3.6% | 5.0% | 100% | 24% | 9/9 | -4.0% | 43 | 0 (0/9 runs) |
| V3 | 2.3% | 8.9% | 0.9% | 100% | 58% | 3/9 | 11.2% | 64 | 0 (0/9 runs) |
| V4 | -0.3% | 3.7% | 13.4% | 100% | 54% | 0/9 | -6.9% | 57 | 0 (0/9 runs) |
| V5 | -7.8% | -0.3% | 9.8% | 100% | 52% | 0/9 | -5.8% | 55 | 0 (0/9 runs) |
| V6 | 1.6% | 7.1% | 2.0% | 100% | 59% | 0/9 | 8.0% | 75 | 0 (0/9 runs) |
| V7 | -8.3% | 7.2% | 8.0% | 82% | 25% | 9/9 | 0.4% | 63 | 0 (0/9 runs) |

#### Week 104 (mean of 9 runs: 3 countries × 3 seeds; ranges in `reports/ECON_06_SUMMARY_TABLES.md`)

| Strategy | Real GDP vs baseline | Inflation | Unemployment | Funded share | Debt / GDP | Market closed (runs) | Consumption / head vs baseline | Stability | Regime changes so far (runs) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| S1 | 0.0% | 2.6% | 5.7% | 100% | 51% | 0/9 | 0.0% | 69 | 0 (0/9 runs) |
| S2 | -5.1% | -3.3% | 5.9% | 23% | 27% | 9/9 | 2.3% | 34 | 2 (2/9 runs) |
| S3 | -25.8% | -4.6% | 27.6% | 100% | 35% | 0/9 | -33.0% | 16 | 22 (9/9 runs) |
| S4 | 1.7% | 3.8% | 13.9% | 100% | 57% | 0/9 | -3.8% | 56 | 0 (0/9 runs) |
| S5 | 1.3% | 4.3% | 4.7% | 100% | 62% | 0/9 | 0.6% | 68 | 0 (0/9 runs) |
| S6 | 2.6% | 6.2% | 3.2% | 100% | 64% | 0/9 | 11.2% | 77 | 0 (0/9 runs) |
| S7 | -65.4% | 0.8% | 66.8% | 100% | 11% | 0/9 | -75.8% | 18 | 33 (9/9 runs) |
| S8 | -6.2% | 1.4% | 12.3% | 12% | 56% | 6/9 | -7.4% | 20 | 17 (9/9 runs) |
| S9 | -3.0% | 1.6% | 7.1% | 100% | 22% | 0/9 | -3.3% | 66 | 0 (0/9 runs) |
| S10 | 1.9% | 2.1% | 10.3% | 100% | 48% | 0/9 | -1.7% | 64 | 0 (0/9 runs) |
| V1 | -8.2% | -4.8% | 7.6% | 23% | 28% | 9/9 | -1.6% | 31 | 4 (4/9 runs) |
| V2 | -17.8% | -0.7% | 13.8% | 100% | 25% | 9/9 | -14.1% | 50 | 4 (4/9 runs) |
| V3 | -1.4% | 3.7% | 4.7% | 58% | 52% | 6/9 | 12.1% | 55 | 0 (0/9 runs) |
| V4 | 0.9% | 3.1% | 14.6% | 100% | 51% | 0/9 | -7.8% | 54 | 0 (0/9 runs) |
| V5 | -5.2% | 1.1% | 7.1% | 100% | 37% | 0/9 | -2.7% | 60 | 0 (0/9 runs) |
| V6 | 2.6% | 6.2% | 3.2% | 100% | 29% | 9/9 | 11.2% | 66 | 0 (0/9 runs) |
| V7 | -4.8% | 1.5% | 8.1% | 54% | 24% | 0/9 | 1.7% | 65 | 0 (0/9 runs) |

#### Week 156 (mean of 9 runs: 3 countries × 3 seeds; ranges in `reports/ECON_06_SUMMARY_TABLES.md`)

| Strategy | Real GDP vs baseline | Inflation | Unemployment | Funded share | Debt / GDP | Market closed (runs) | Consumption / head vs baseline | Stability | Regime changes so far (runs) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| S1 | 0.0% | 1.9% | 6.8% | 100% | 49% | 0/9 | 0.0% | 68 | 0 (0/9 runs) |
| S2 | -0.6% | 3.7% | 5.1% | 56% | 32% | 9/9 | 10.7% | 39 | 2 (2/9 runs) |
| S3 | -27.5% | -0.7% | 29.6% | 100% | 8% | 0/9 | -35.5% | 19 | 28 (9/9 runs) |
| S4 | 5.6% | 4.6% | 12.4% | 100% | 59% | 3/9 | -2.0% | 58 | 0 (0/9 runs) |
| S5 | 1.9% | 5.7% | 5.2% | 100% | 66% | 0/9 | 3.2% | 67 | 0 (0/9 runs) |
| S6 | 2.5% | 3.1% | 4.4% | 100% | 69% | 1/9 | 12.2% | 69 | 0 (0/9 runs) |
| S7 | -72.1% | -14.7% | 73.6% | 100% | 0% | 0/9 | -86.1% | 18 | 51 (9/9 runs) |
| S8 | -13.2% | 1.8% | 20.1% | 11% | 54% | 6/9 | -12.8% | 17 | 18 (9/9 runs) |
| S9 | -1.7% | 1.6% | 7.8% | 100% | 20% | 0/9 | -2.1% | 67 | 0 (0/9 runs) |
| S10 | 4.6% | 2.0% | 10.5% | 100% | 44% | 0/9 | -1.2% | 63 | 0 (0/9 runs) |
| V1 | -7.0% | -2.6% | 8.3% | 50% | 27% | 6/9 | 1.6% | 34 | 4 (4/9 runs) |
| V2 | -10.1% | -0.7% | 13.0% | 100% | 23% | 9/9 | -10.7% | 53 | 4 (4/9 runs) |
| V3 | -7.5% | -3.0% | 7.0% | 42% | 30% | 9/9 | 4.5% | 39 | 0 (0/9 runs) |
| V4 | 4.2% | 3.2% | 13.6% | 100% | 49% | 0/9 | -7.8% | 55 | 0 (0/9 runs) |
| V5 | -3.7% | 1.3% | 5.7% | 100% | 23% | 0/9 | -0.6% | 62 | 0 (0/9 runs) |
| V6 | -6.6% | -3.8% | 11.0% | 72% | 31% | 9/9 | -0.9% | 56 | 0 (0/9 runs) |
| V7 | -0.3% | 5.5% | 5.4% | 100% | 32% | 1/9 | 8.1% | 76 | 0 (0/9 runs) |


#### Whole game (weeks 2–156, totals or extremes over all 9 runs)


| Strategy | Defaults | Missed payments | Weeks without market access (all runs) | Runs with a regime change | First regime change (weeks) | Lowest stability | Highest unemployment | Highest annualised inflation | Lowest funded share | Weeks until GDP differs >1% from baseline |
|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|
| S1 | 0 | 0 | 0 | 0/9 | — | 64 | 7.0% | 13% | 100% | — |
| S2 | 9 | 87 | 1032 | 2/9 | 34–49 | 21 | 28.0% | 47% | 0% | 2–2 |
| S3 | 0 | 0 | 0 | 9/9 | 11–49 | 7 | 43.5% | 49% | 100% | 2–2 |
| S4 | 0 | 0 | 27 | 0/9 | — | 56 | 14.3% | 16% | 100% | 2–2 |
| S5 | 0 | 0 | 57 | 0/9 | — | 60 | 6.7% | 18% | 100% | 3–6 |
| S6 | 0 | 0 | 152 | 0/9 | — | 46 | 22.9% | 21% | 8% | 3–4 |
| S7 | 0 | 0 | 0 | 9/9 | 11–28 | 7 | 91.9% | 239% | 100% | 2–2 |
| S8 | 0 | 0 | 778 | 9/9 | 12–30 | 8 | 43.8% | 110% | 1% | 2–2 |
| S9 | 9 | 0 | 702 | 0/9 | — | 56 | 8.0% | 13% | 100% | 27–27 |
| S10 | 0 | 0 | 0 | 0/9 | — | 62 | 10.9% | 12% | 100% | 20–23 |
| V1 | 15 | 75 | 1155 | 4/9 | 34–55 | 5 | 28.0% | 47% | 0% | 2–2 |
| V2 | 27 | 0 | 1179 | 4/9 | 81–81 | 27 | 14.8% | 13% | 100% | 27–27 |
| V3 | 9 | 106 | 586 | 0/9 | — | 37 | 19.3% | 24% | 0% | 2–2 |
| V4 | 0 | 0 | 0 | 0/9 | — | 53 | 14.9% | 14% | 100% | 2–2 |
| V5 | 0 | 0 | 0 | 0/9 | — | 53 | 14.4% | 11% | 100% | 2–2 |
| V6 | 9 | 0 | 516 | 0/9 | — | 51 | 15.6% | 21% | 67% | 3–4 |
| V7 | 9 | 0 | 727 | 0/9 | — | 56 | 8.6% | 22% | 53% | 27–27 |
"Weeks until GDP differs >1% from baseline" measures how quickly the economy responds. Fiscal changes show within 2–6 weeks. A default shows in week 27, the week after it is declared.

---

## 4. Assessment: realism, balance and feedback

These are three separate questions. A result can be realistic and still bad for the game, or the reverse.

| Topic | Economic realism | Strategic balance | Player feedback and interpretability |
|---|---|---|---|
| Borrowing limits (S2, V3) | **Good.** Markets close and defaults are forced once deficits persist. | **Good.** Unlimited borrowing is not a free lunch. | **Fair.** The collapse comes some months after the cause, so the link needs to be explained in the game. |
| High taxes (S3, S7) | **Partly.** A surplus of roughly 15–20% of GDP (Alden S3) *would* cause a depression in reality. But no real government would cut spending in line with a falling GDP while hoarding the surplus. | **Poor.** An ordinary-looking choice loses the game within 3–12 months, so it is a trap rather than a trade-off. | **Poor.** The player sees "taxes 35%", not "surplus 19% of GDP". The cause is invisible. |
| Social spending (S6) | **Fair.** Transfers do raise consumption. | **Poor.** It is the easiest way to high stability, with almost no cost for two years. | **Good.** The effects are immediate and easy to read. |
| Military spending (S5) | **Fair.** It acts as a demand stimulus. | **Fair.** It is cheap because it has no economic cost yet. Whether that is acceptable depends on future military systems. | **Good.** |
| Infrastructure (S4, V4) | **Mixed.** Slow GDP gains are realistic. A lasting rise in unemployment is not usual. | **Questionable.** It is the best for GDP, but it is punished on stability. | **Poor.** It looks like "investment causes unemployment". |
| Default (S9, V7) | **Partly.** Real defaults cause 1–3 years of market exclusion, a deep recession, a banking crisis and often political change. The engine models the exclusion but not the depth of the recession. | **Poor.** It is cheaper than austerity and enables the dominant strategy. | **Fair.** The event is clear, but its consequences are mild. |
| Repeated default (V2) | **Good.** | **Good.** The penalty escalates and the third default topples the government in 4 of 9 runs. | **Fair.** |
| Limits (70% tax, 50% per category) | **Poor.** 200% of GDP in spending orders is accepted. | **Poor.** It invites nonsensical inputs. | **Poor.** The orders are accepted but mostly unpaid. |
| Speed of response | **Too fast** for GDP and unemployment, which react within 2–3 weeks. | **Good for play.** Choices matter within one game year. | **Good**, but weekly noise needs smoothing. |

---

## 5. Answers to the specific questions

- **Are high taxes unrealistically harmless?** No. The opposite is true: they are too harmful. A combined tax-rise-and-spending-cut (S3) causes a depression and regime change in all 9 runs. However, a moderate tax rise paired with matching spending (V4: income tax +6 points) is harmless. The real culprit is the **surplus**, not the tax rate.
- **Does government spending generate excessive growth?** Mostly no. Social and military spending of 10–20% of GDP adds only 2–3% to GDP after three years. The excess is in *stability* and *consumption*, not growth.
- **Is infrastructure too powerful?** No. On GDP it is the strongest strategy (+5.6% by year 3), but slow: +0.4% in year 1. The unemployment side effect makes it look *too weak* to the player.
- **Can low taxes and borrowing be sustained indefinitely?** No. Markets close within the first year in most runs, there is a forced default, and stability falls into the 30s. This works as intended.
- **Does social spending make stability trivial?** For about two years, yes. It holds stability at 75–77 against 69 for the baseline. Together with a default (V7), it stays trivial for the whole game.
- **Is default serious enough?** A **first** default is not. A **repeated** default is (V2).
- **Does the economy respond meaningfully within 52–156 weeks?** Yes, and if anything too quickly. Effects appear within 2–6 weeks. Differences at week 156 are large and stable across seeds.

---

## 6. Dominant strategies and exploits

| Behaviour | Classification | Why |
|---|---|---|
| **V7: default early, then raise social spending.** Best stability (76), consumption +8%, GDP about the same as baseline. | **Accidental exploit (dominant).** | A default cuts debt and removes interest costs, and the penalty is mild enough that the welfare spending it frees up more than pays for it. |
| **Default as a substitute for austerity (S9 vs V5).** S9 ends with GDP −1.7%, debt 20%, stability 67. V5 ends with GDP −3.7%, debt 23%, stability 62. | **Accidental exploit.** | The responsible path is strictly worse on all three measures. |
| **V6: spend for two years, then default.** | **Exploit, partly intended.** | The player escapes the bill at moderate cost. A default should end the party, but here it is survivable without a regime change. |
| S6: social spending for stability | **Intended mechanic, overpowered.** | Its direction is right; its size and the slowness of its cost are wrong. |
| S5: military spending is economically free | **Intended for now.** | Depends on future military design. |
| S2 and V3 forced defaults | **Intended.** | The borrowing limit works. |
| V2 escalating default penalty | **Intended.** | C3 consequences work. |
| S3 and S7 depressions | **Unintended side effect** (a design gap rather than an exploit). | Spending set as a share of GDP plus a surplus with nowhere to go. |
| S8: 200% of GDP in orders accepted | **Limit design gap.** | The limit is per category, not on the total. |

---

## 7. Unexpected behaviour

1. **Surplus deflation (S3, S7).** For Alden in S3 (seed 2401), unemployment rose from 5.1% to 20.6% in 3 weeks and 32% in 6 weeks. Stability fell from 65 to 39 by week 8 and to 24 by week 14. Inflation was +47% (annualised) in week 2, as the consumption tax was passed through to prices, then −19% by week 20. This government first fell in week 38, and then four more times by week 156.
2. **The tax collapse feeds itself.** Under S7, Alden's treasury *grows* to 344 while GDP falls 76%. The state ends up rich in a ruined country.
3. **Infrastructure raises unemployment.** S4, V4 and S10 all show unemployment 4–7 points above the baseline while GDP is *higher*. The likely explanation, not yet confirmed in the code, is that infrastructure raises productivity faster than demand grows, so firms need fewer workers. This needs a check by the owner or engineer (question Q6).
4. **The baseline drifts downward.** Doing nothing gives unemployment of 3.7% → 6.8% and GDP slightly down over three years. A "do nothing" game is a slow decline. That may be intentional pressure, but it should be a deliberate choice.
5. **Inflation spikes from any tax change.** Inflation is a weekly price change scaled up to a year, so a one-off price-level change appears as a huge "inflation" figure: 13% at most even in the baseline, 47% in week 2 under S3, and 239% under S7.
6. **Growth is blank for 26 weeks.** It is year-on-year and needs history, so the player gets no growth figure for half of the first year.
7. **Military spending raises consumption** (S5: +3.2%). This is plausible as a demand effect, but surprising to a player.

---

## 8. Top 5 balancing issues, ranked by severity

| Rank | Issue | Severity | Evidence |
|---|---|---|---|
| 1 | **High taxes and spending restraint cause a self-reinforcing depression and lose the game within 3–12 months.** The surplus is withdrawn from the economy. Spending set as a share of GDP shrinks with it. The player cannot see the cause. | **Critical.** A plausible choice is a trap that loses the game, and it is not understandable. | S3: GDP −27%, unemployment 28–30%, regime change in 9/9 runs (weeks 11–49). S7: GDP −72%, 51 regime changes. |
| 2 | **A deliberate default is too cheap and enables the dominant strategy.** | **High.** One choice beats responsible play. | V7 stability 76 (the best), GDP −0.3%. S9 beats V5 austerity on GDP, debt and stability. No regime change after a single default. |
| 3 | **Social spending financed by borrowing buys about two years of easy stability.** | **High.** Stability management becomes trivial. | S6 stability 75–77, consumption +8–12%, costs only late in year 3 (Alden). The cost can be escaped by default (V6/V7). |
| 4 | **Responsible investment looks punished.** | **Medium.** It teaches the wrong lesson. | S4 unemployment 12.4%, V4 13.6%, S10 10.5% (baseline 6.8%); stability 5–13 below baseline despite higher GDP. |
| 5 | **Limits and indicators mislead the player.** | **Medium.** It is about understanding, not balance. | 200% of GDP in spending orders accepted, 7–11% funded (S8). Inflation spikes of 13–239% from price-level jumps. Growth blank for 26 weeks. |

---

## 9. Recommended adjustments (not implemented)

These are proposals only. Each needs approval, and each would change the golden fingerprint, so it would be done as its own small task with re-calibration tests.

**For issue 1 (surplus depression):**
- **a) Recycle surpluses.** Spend surplus treasury money above a buffer (for example 8 weeks of spending) on automatic debt buy-back, or return it to the economy. Simplest option: cap the treasury and use the excess to repay debt, with debt repayment counting as income for domestic bondholders.
- **b) Stop spending shrinking with the economy.** Set spending as a share of *smoothed or starting* GDP, or keep the nominal amount fixed while GDP falls, so a recession does not automatically become austerity.
- **c) Lower the tax limits.** Lower the maximum rates to realistic levels, for example 50% income, 25% consumption and 40% corporate, or ask for confirmation above a threshold.
- **d) Explain it on screen** (feedback only, no formula change). Show "Budget surplus/deficit as % of GDP" with a warning when the surplus exceeds about 5%.

**For issue 2 (cheap default):**
- **a)** A one-off stability penalty on default, plus a deeper short recession, for example a banking or confidence shock that grows with the debt written off.
- **b)** A longer market exclusion, or a lasting risk premium (higher rates for several years), since reputation matters.
- **c)** Make a first default able to topple the government when stability is already moderate. In this study only the third default did.

**For issue 3 (cheap welfare stability):**
- **a)** Diminishing stability returns from social spending above the starting level.
- **b)** Expectations: stability gains fade over 1–2 years as people adapt, while cuts still hurt.
- **c)** A faster market reaction to rising debt, so the bill arrives in year 1 or 2 rather than year 3.

**For issue 4 (infrastructure unemployment):**
- **a)** First confirm the mechanism (a diagnostic run, no change).
- **b)** If it is the productivity channel, phase in productivity gains more slowly, or make construction jobs count during the build phase.

**For issue 5 (limits and indicators):**
- **a)** A limit on **total** spending (for example 60% of GDP) instead of 50% per category, or reject orders that cannot be funded.
- **b)** Show inflation as year-on-year, or as a 13-week moving average, and show the weekly price jump separately.
- **c)** Show growth from week 2 using a quarter-on-quarter annualised rate, labelled "early estimate".

**Suggested order:** 1(d) and 5(b) first. They are display-only and cheap, and they help the owner judge the rest. Then 1(a)/(b), then 2, then 3. Issue 4 only after diagnosis.

---

## 10. What works well (keep it)

- Results are deterministic and stable across seeds.
- The borrowing limit and forced default are clear and credible.
- The repeated-default penalty escalates properly.
- Inflation responds to excess spending (S8) and deflation to surplus (S3/S7).
- Effects show within one game year, as the game needs.
- Moderate, balanced choices (S10, V4) produce no collapse.

---

## 11. Questions requiring owner approval

1. **Q1 — Tax trap.** Should a big tax rise with spending restraint be able to lose the game within a year? If not, which fix do you prefer: recycle surpluses (1a), stop spending shrinking with GDP (1b), lower the limits (1c), or only a warning (1d)?
2. **Q2 — Default severity.** How painful should a *first* default be? Options:
   - deeper recession;
   - stability shock;
   - longer exclusion or lasting higher rates;
   - possible fall of the government.
3. **Q3 — Welfare stability.** Should extra social spending give lasting stability, or should the gain fade or shrink at higher levels?
4. **Q4 — Spending limit.** Keep 50% per category, or switch to a total limit or a "must be fundable" rule?
5. **Q5 — Indicators.** Show inflation as year-on-year (smoother, a familiar real-world figure) instead of the annualised weekly rate? Show an early growth estimate before week 26?
6. **Q6 — Infrastructure unemployment.** May I run a diagnostic (no changes) to confirm why infrastructure raises unemployment?
7. **Q7 — Baseline drift.** Is a slow decline when the player does nothing (unemployment 3.7% → 6.8%) the intended pressure?
8. **Q8 — Military.** Should military spending remain economically free until the military systems exist, or should it carry an opportunity cost now?

---

## 12. Limitations and verification

- **Coverage:**
  - one scenario (three countries);
  - only the player country changes policy;
  - commands are set once at week 2, apart from the default variants;
  - no wars, occupation or events.

  Real players adjust policy over time, so these runs show the "set and forget" extremes.
- The infrastructure explanation in §7.3 is a hypothesis. I have not verified it in the code.
- **Tests run:**
  - `npm test`: **190/190 pass**, golden fingerprint `6f9bf1a361044b05` unchanged;
  - `npm run typecheck`: passes, including the new `sim/econ06.ts`.
- **Files added:**
  - `sim/econ06.ts` (the study script);
  - the `econ06` script in `package.json`;
  - `reports/econ06.json`, `reports/ECON_06_DATA.md` and `reports/ECON_06_SUMMARY_TABLES.md`;
  - this report.

  No engine, game, UI or geography source was changed.

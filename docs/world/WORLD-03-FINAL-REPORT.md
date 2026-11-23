# WORLD-03-FINAL — European economic scenario stabilisation (`europe-2023` 1.0.0-draft.2)

**Status:** review only. Nothing is merged, and the game does not load this package. Before draft.2 can be used, three small opt-in engine inputs need your approval (§6).

**In one paragraph.** draft.2 now starts every real country with a 2023 budget balance close to what was actually observed. In ECON-08, every European state ran a surplus of 1–8% of GDP at the start. That happened for three reasons:
- **Tariffs:** every import paid a 3% duty to the national treasury, worth about 2.5% of GDP. EU customs duties actually belong to the EU, not to member states.
- **Bank profit:** the whole banking system's profit (about 1.8% of GDP) went to the treasury.
- **Dividends:** state firms paid 2–6% of GDP in dividends, against about 0.2% in reality.

All three are now corrected using scenario inputs and documented data:
- per-country tariffs fitted to the customs revenue each government actually keeps;
- bank profit paid to the banks' owners (households);
- state-ownership shares scaled to observed dividend income.

Each country's spending is now mapped on a cash basis. Greece starts at its observed 164% debt, the blocs no longer collapse politically, and the baseline runs 156 weeks with no default, no lost market access and no unrest. Stress plans still produce access loss, defaults and political crises. The package is **not distributable** yet: Türkiye's spending lines still come from a report without published reuse terms (§5).

---

## 1. Dependency and merge order

| Order | PR | Branch | Head |
|---:|---|---|---|
| 1 | #31 WORLD-01 architecture | `analysis/world-01-real-world-architecture` | `d2088f3` |
| 2 | #32 WORLD-02 data and performance | `analysis/world-02-european-scenario` | `77730c6` |
| 3 | #33 WORLD-03 pipeline and draft.1 | `analysis/world-03-europe-scenario` | `28ead75` |
| 4 | #34 ECON-08 sovereign debt | `feature/econ-08-sovereign-debt` | `b85d80f` |
| 5 | **this PR** WORLD-03-FINAL | `world-03-final` (from `b85d80f`) | see PR |

PRs #31–#34 are unchanged. This branch contains their commits, so merging it first would bring them all in. Merge them in the order above.

## 2. What changed (plain language)

| Area | Change | Where |
|---|---|---|
| Budget data | 2023 general-government accounts (full ESA breakdown) for 14 countries, plus UK national accounts, customs duties by receiving government and imports. All snapshotted with licence and query. | `scenarios/pipeline/fetch_sources.py` (steps `budget`, `che_debt`), `scenarios/europe-2023/sources/*.json` |
| Reconciliation | Each country's observed revenue, spending and balance mapped onto the engine's budget lines, with an identity check (engine revenue − spending − interest = observed balance, error < 1e-16) | `scenarios/pipeline/build_budget.py` → `build/budget.json` |
| Calibration | New `final` mode: net lending becomes a target, plus a per-country tariff, one ownership scale, cash-basis spending targets, Greece at 1.64 and Switzerland's debt | `economy-engine/sim/world03/calibrate.ts` → `build-final/` |
| Package | `1.0.0-draft.2` built through the public integration API. draft.1 rebuilds byte-for-byte unchanged. | `sim/world03/package.ts`, `scenarios/europe-2023/1.0.0-draft.2/` |
| Validator | New checks C5–C8, D5 and P2 (below) | `scenarios/pipeline/validate_scenario.py` |
| Runs | Before/after budgets, baselines and stress runs | `sim/world03/final-runs.ts` → `docs/world/WORLD-03-FINAL-data/runs.json` |
| Engine (opt-in, needs approval) | `WorldSpec.maxStartingDebt`, `CountrySpec.economicAggregate`, `CountrySpec.bankProfitToHouseholds` | `src/types.ts`, `src/world/builder.ts`, `src/core/politics.ts`, `src/core/credit.ts`, `tests/world03final.test.ts` |

No game code, UI, geography, naval or military-transport mechanics changed. The 1.0.0-draft.1 package did not change either.

## 3. Budget reconciliation by country (2023, % of GDP)

### 3.1 How observed accounts map onto the engine

The engine has only four spending lines and three tax lines. The mapping keeps the budget balance exact:

| Engine line | Mapped from (ESA 2010 codes) |
|---|---|
| Taxes | All taxes and social contributions (D2 + D5 + D91 + D61). Customs duties kept by the national government are split off into tariffs. |
| Tariffs | Import duties kept by the national government. EU members keep almost none: D2121 is revenue of the EU institutions (S212). Germany's national government kept 0 of €5.6 bn; France's kept €0.66 bn of €3.4 bn. |
| Dividends (public firms and bank profit) | Dividends received (D42) |
| Administration | Intermediate consumption + pay + social transfers in kind via market producers (P2 + D1 + D632), minus sales of goods and services (P11 + P12 + P131), minus defence pay and purchases. Cash basis: draft.1 used final consumption (P3), which also includes depreciation (P51C, not cash). |
| Military | Defence (COFOG 02), total expenditure |
| Infrastructure | Gross fixed capital formation (P51G) minus defence investment |
| Social | Cash social benefits (D62) **plus every flow the engine has no line for**, net: subsidies, other transfers paid, capital transfers, other property income and transfers received, net of other non-tax revenue |
| Interest | Interest paid (D41) |

Below, "net" revenue and spending means sales and other non-tax receipts are netted against spending, as the engine does. Those receipts are revenue in the national accounts but have no engine line.

### 3.2 Observed vs model: revenue, spending, balance (model = draft.2 at week 2, every country on the autopilot)

| Country | Observed revenue | Sales | Other non-tax revenue | Net revenue | **Model** | Observed spending | Net spending | **Model** | Observed balance | **Model** | Gap |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| France | 51.4 | 4.2 | 1.6 | 45.5 | **45.6** | 56.8 | 50.9 | **51.0** | −5.36 | **−5.44** | −0.08 |
| Germany | 45.5 | 4.1 | 1.6 | 39.8 | **39.8** | 47.7 | 42.0 | **42.1** | −2.23 | **−2.34** | −0.11 |
| United Kingdom | 40.3 | 2.4 | 0.9 | 37.0 | **37.0** | 46.4 | 43.1 | **43.2** | −6.11 | **−6.12** | −0.01 |
| Italy | 46.5 | 2.3 | 2.7 | 41.5 | **41.4** | 53.6 | 48.6 | **48.6** | −7.10 | **−7.20** | −0.10 |
| Poland | 41.7 | 2.3 | 3.4 | 35.9 | **35.9** | 46.9 | 41.1 | **41.1** | −5.20 | **−5.25** | −0.05 |
| Türkiye | 29.7 | 0.0 | 6.4 | 23.2 | **23.3** | 34.5 | 28.0 | **28.0** | −4.83 | **−4.73** | +0.10 |
| Ireland | 23.8 | 0.9 | 0.6 | 22.2 | **22.3** | 22.4 | 20.8 | **20.8** | +1.46 | **+1.47** | +0.01 |
| Spain | 42.1 | 2.2 | 3.1 | 36.9 | **37.0** | 45.5 | 40.2 | **40.3** | −3.34 | **−3.24** | +0.10 |
| Netherlands | 43.7 | 3.0 | 1.1 | 39.5 | **39.5** | 44.0 | 39.9 | **39.9** | −0.34 | **−0.41** | −0.07 |
| Belgium | 48.6 | 3.1 | 1.6 | 44.0 | **43.8** | 52.7 | 48.1 | **48.2** | −4.12 | **−4.33** | −0.21 |
| Switzerland | 32.6 | 4.1 | 1.5 | 26.9 | **26.7** | 32.3 | 26.6 | **26.6** | +0.34 | **+0.07** | −0.27 |
| Austria | 49.5 | 4.5 | 2.3 | 42.7 | **42.9** | 52.1 | 45.2 | **45.3** | −2.55 | **−2.45** | +0.10 |
| Czechia | 40.3 | 3.2 | 2.6 | 34.5 | **34.3** | 44.0 | 38.2 | **38.3** | −3.69 | **−3.99** | −0.30 |
| Norway | 60.9 | 3.6 | 4.1 | 53.2 | **40.6** | 45.0 | 37.3 | **37.4** | +15.89 | **+3.29** | not comparable |
| Greece | 48.0 | 3.1 | 4.3 | 40.6 | **40.4** | 49.5 | 42.1 | **42.2** | −1.48 | **−1.75** | −0.27 |
| Bulgaria | 36.6 | 2.1 | 4.1 | 30.5 | **29.8** | 38.6 | 32.5 | **32.5** | −1.98 | **−2.74** | −0.76 |

Revenue here = taxes + tariffs + bank profit + dividends. Spending = the four lines + interest. Financial and asset transactions (money creation, reserve trades, ownership sales and purchases, central-bank capital) are excluded on both sides, as in the national accounts.

**Material discrepancies (> 0.25 pp):**
- **Norway, +12.6 pp revenue.** 12.9% of GDP is property income (D42), mostly the government pension fund's returns. The engine has no sovereign wealth fund, so Norway's balance is reported as not comparable and is not a target.
- **Bulgaria, −0.76 pp.** Bulgaria received 0.87% of GDP in dividends; one scenario-wide ownership scale gives it 0.16%.
- **Czechia, −0.30 pp; Greece and Switzerland, −0.27 pp.** Same cause as Bulgaria: state dividends above the scenario average (0.41, 0.33 and 0.42%).

All of these are inside ±1 pp. Fitting dividends per country would need a per-country ownership input, which the engine doesn't have.

### 3.3 Spending mapping, draft.1 → draft.2 (targets, % of GDP)

| Country | Administration draft.1 (P3 basis) → draft.2 (cash) | Social: D62 + flows with no engine line | Military | Infrastructure | Customs kept nationally |
|---|---|---|---:|---:|---:|
| France | 22.67 → 18.45 | 18.73 + 6.13 | 1.81 | 3.89 | 0.02 |
| Germany | 20.24 → 17.69 | 15.56 + 3.97 | 1.24 | 2.69 | 0 |
| United Kingdom | 18.92 → 16.90 | 12.87 + 5.44 | 2.19 | 2.54 | 0.19 |
| Italy | 17.03 → 13.75 | 19.81 + 7.33 | 1.19 | 2.86 | 0 |
| Poland | 17.61 → 15.07 | 15.60 + 1.71 | 2.18 | 4.45 | 0 |
| Türkiye | 10.29 → 10.29 | 9.73 − 0.21 | 1.29 | 3.08 | 0.55 |
| Ireland | 12.05 → 10.65 | 5.56 + 1.44 | 0.21 | 2.28 | 0 |
| Spain | 18.94 → 16.52 | 16.82 + 0.79 | 0.94 | 2.77 | 0.01 |
| Netherlands | 24.17 → 21.17 | 10.42 + 3.13 | 1.37 | 3.13 | 0 |
| Belgium | 22.58 → 20.29 | 17.04 + 5.13 | 0.94 | 2.72 | 0 |
| Switzerland | 11.24 → 8.47 | 9.36 + 4.76 | 0.84 | 2.86 | 0.14 |
| Austria | 20.03 → 16.78 | 18.27 + 4.82 | 0.60 | 3.57 | 0 |
| Czechia | 18.87 → 14.75 | 13.54 + 3.00 | 1.22 | 4.42 | 0 |
| Norway | 20.16 → 16.78 | 12.55 + 0.90 | 1.73 | 4.32 | 0.07 |
| Greece | 17.57 → 14.16 | 17.23 + 1.45 | 2.25 | 3.63 | 0 |
| Bulgaria | 17.37 → 14.85 | 12.37 − 0.14 | 1.50 | 3.38 | 0 |

Two input fixes found while reconciling:
- **UK taxes.** draft.1 took UK taxes from OECD Revenue Statistics (34.97%). Those leave out imputed social contributions, which the national accounts record as revenue and include in pay (D1). draft.2 keeps the Revenue Statistics split and scales it to the national-accounts total (36.77%, × 1.052), the same basis as the ESA countries. Before this fix the UK balance missed by 1.7 pp.
- **Swiss debt.** Switzerland had no starting debt in draft.1 or ECON-08 (not in Eurostat), so it started at the engine default of 50% and paid 1.5% of GDP interest instead of 0.27%. draft.2 uses OECD government balance sheets: F2 + F3 + F4 = CHF 216,953 m = **26.0% of GDP** (estimate: non-consolidated, so it may slightly overstate consolidated debt). With that, interest is 0.27% (observed 0.27%).

## 4. Excess revenue: the three investigations

| | A. Tariffs | B. Central-bank profit | C. Public-enterprise dividends |
|---|---|---|---|
| **Mechanism** | `market.ts`: every cross-border import pays value × `tariff` to the importer's treasury. `CountrySpec.tariff` defaults to 0.03. | `credit.ts settleBanks`: the national bank stands for the whole banking system. It lends to firms at the policy rate + 2% and pays 100% of profit (`cbProfitPayout` 1.0) to the treasury. | `production.ts`: public and mixed firms pay 8% of excess cash per week (`dividendSpeed`). The catalogue's state shares are large: hydrocarbons and electricity 35% public + 15–20% mixed, military industry 40% + 20%, mining 20% + 10%. |
| **ECON-08 level** | 2.3–3.2% of GDP | 1.6–2.0% of GDP | 2.2–6.0% of GDP |
| **Reference** | Customs kept by national government. EU: D2121 received by S13 (`gov_10a_taxag`): 0–0.02%. UK, Türkiye, Norway, Switzerland: OECD 5123: 0.19 / 0.55 / 0.07 / 0.14% | Actual central-bank distributions in 2023 were small or nil (euro-area NCBs had losses). The engine's payout is really the whole banking system's interest margin, which goes to bank shareholders, not the state. | D42 dividends received by government: 0–0.4%, GDP-weighted 0.18% (Norway excluded) |
| **Why it was wrong** | The tariff *rate* (3%) was applied as if every import duty went to the national treasury. The EU's common external tariff is EU revenue, and most intra-European trade pays none. | The engine's national bank is the whole banking system, not only the central bank. | The catalogue's ownership shares are generic defaults, not calibrated to Europe |
| **Smallest consistent correction** | Scenario input: `tariff` per country, fitted so tariff revenue = customs kept nationally (EU members: 0; UK 0.22%, Türkiye 0.62%, Switzerland 0.14%, Norway 0.07%, France and Spain 0.04%). For non-EU countries customs are inside the observed tax total, so the consumption-tax target is reduced by the same amount. | **Opt-in engine input** `CountrySpec.bankProfitToHouseholds` (0–1). That share of the payout goes to households, in proportion to their money, taxed at the income-tax rate like dividends. draft.2 uses 1. There is no scenario-only way to do this: `cbProfitPayout` is world-wide and also funds bank capital. | Scenario input: one scale k on the catalogue's public and mixed shares, fitted to the GDP-weighted D42. **k = 0.0543** (for example, electricity public share 0.35 → 0.019). No engine change. |
| **Money conservation** | Duties are a transfer from buyers to the treasury, and are unchanged by the rate | Household payout is a transfer from the bank's profit to households (`cbIssued` unchanged). Money and issued-money audits stay within 1e-9 (test). | Unchanged: dividends are transfers |
| **Result (draft.2)** | 0–0.55%, every country within 0.03 pp of target (C6) | 0 to treasuries | 0.08–0.33%; scenario-wide 0.18% = observed (C8) |

## 5. Greece, the blocs and Türkiye

**Greece (starting debt 164%).** The builder rejects starting debt above 150% of GDP (`MAX_STARTING_DEBT`). Two options:

| Option | Effect | Choice |
|---|---|---|
| Raise the constant to 200% | Every world, including the fictional one, accepts more | Not chosen |
| **Per-scenario `WorldSpec.maxStartingDebt`** (allowed 1.5–3, default 1.5) | Only a world that asks for it accepts more; the fictional world is unchanged | **Used: draft.2 sets 2.0** |

Result: Greece starts at exactly **164.0%**. Over the 156-week baseline it keeps market access and never defaults; debt drifts to 149% and the market rate is 4.5%. No immediate default and no artificial loss of access.

**Blocs (Middle East bloc regime changes).** In the ECON-08 baseline, `bloc-mea` fell into unrest in weeks 11, 104 and 131, had regime changes in weeks 100 and 127, and ended at stability 9.6 with output down 13%. Two causes: deprivation, and the 18% strike losses at the top unrest tier. A bloc is an economic aggregate of many countries, so a "regime change" there has no meaning. The fix needs a small engine input, because the politics loop has no way to tell a bloc from a country:
- **Opt-in `CountrySpec.economicAggregate`.** The country's stability stays at its starting value, with no unrest tier, strikes or regime test. Its economy runs normally.
- It doesn't invent an institution or a new mechanic, and real countries are untouched (the test checks that a normal country under the same squeeze still falls into unrest).
- In draft.2 all five blocs are aggregates: **0 bloc political events in 156 weeks**, and the Middle East bloc's output index stays at 1.00.

**Türkiye.**

| Need | Source | Licence | Status |
|---|---|---|---|
| Taxes, customs | OECD Revenue Statistics | CC BY 4.0 (verified) | used |
| Debt (29.6%) | Ministry of Treasury and Finance, debt report | "reuse with reference"; commercial use not addressed | used (same as draft.1) |
| **Spending lines and 2023 balance** | Court of Accounts (Sayıştay) report, GFS | **no published reuse terms** | used: **not distributable** |
| Alternative 1 | TurkStat "Government Accounts 2023" (ESA) | verified publisher terms | needs a logged-in TurkStat portal (data API returns 401); not obtained |
| Alternative 2 | Ministry of Treasury and Finance GFS 2014 workbook (2008–2026) | site says "© Tüm hakları saklıdır" (all rights reserved) | not used |
| Alternative 3 | World Bank WDI fiscal series (from IMF GFS) | CC BY 4.0 (verified) | aggregates only (expense 33.0%, net lending −2.17%); its economic shares sum to 106% of expense, so they can't give a reliable split |
| Defence | WDI military expenditure (SIPRI) | SIPRI's own terms (not CC BY) | not used |
| Defence pay (military calculation) | no verified source | — | **unresolved: Türkiye's divisions stay empty (M1)** |

**Concept and vintage difference (material).** The Court of Accounts deficit (−4.83%) matches TurkStat's ESA headline (4.8%), and ESA is the concept every other country in the scenario uses, so draft.2 keeps it. The Ministry's GFS series, revised in September 2026, gives −2.44%, and WDI gives −2.17%. Most of the gap is about 898 bn TL (3.3% of GDP) of capital transfers that GFS records as revenue. This should be settled against TurkStat's ESA tables once they're available.

**Minimum decision needed:** one of these:
- (a) provide TurkStat Government Accounts 2023 tables, or a written reuse confirmation from Sayıştay or the Ministry; or
- (b) accept a Türkiye budget built from WDI totals only, with explicit estimate flags. Its split between administration, social and infrastructure would be an assumption, and the defence total would stay unresolved.

## 6. Proposed engine changes (opt-in; need your approval)

All three are additive inputs with neutral defaults:
- Worlds that don't use them build and play exactly as before. Tested on the fictional world and Meridian, including after 6 weeks of play, and draft.1 rebuilds byte-for-byte.
- No formula changes for existing worlds, no state-version bump: the fields live on `state.countries` entries, which already accept extra keys.

| ID | Input | What it does | Default |
|---|---|---|---|
| E-1 | `WorldSpec.maxStartingDebt` | Starting-debt limit for this world, 1.5–3 | 1.5 (current limit) |
| E-2 | `CountrySpec.economicAggregate` | No unrest, strikes or regime change for that country; economy unchanged | off |
| E-3 | `CountrySpec.bankProfitToHouseholds` | Share of bank profit paid to households (taxed) instead of the treasury | 0 |

Tests (`tests/world03final.test.ts`, 6 tests):
- neutrality;
- the debt limit: 1.64 refused by default, held exactly with a limit of 2, out-of-range limits refused;
- aggregate politics vs a normal country under the same squeeze;
- money and issued-money conservation with routed bank profit;
- save, restore and identical replay;
- invalid inputs refused.

No other engine change is proposed. Scenario-level corrections (tariffs, ownership scale, spending mapping) need none.

## 7. Calibration report (draft.2)

Validator: `python3 scenarios/pipeline/validate_scenario.py scenarios/europe-2023/1.0.0-draft.2` → **22 pass, 1 warning, 0 fail.** The warning is D3, the Türkiye licence.

| Check | Tolerance | Before (ECON-08 build) | **draft.2** |
|---|---|---|---|
| C1 regional output shares | ±3% relative | met (worst 2.51%) | worst 0.53% |
| C2 national PPP GDP shares | ±3% relative | met | worst 0.09% |
| C3 taxes and spending (112 ratios) | ±1 pp | met (P3-basis administration) | met, cash basis |
| C4 debt (16 countries) | ±1 pp | Greece held at the 1.50 limit; Switzerland unavailable (engine default 0.50) | met: Greece 1.640, Switzerland 0.260 |
| **C5 net lending (15 comparable)** | ±1 pp | not a target; every country too high by +3.4 to +9.9 pp (worst UK +9.85) | worst Bulgaria −0.71 pp (Norway not comparable) |
| C6 tariff revenue | ±1 pp | 2.3–3.2 pp too high | worst 0.022 pp |
| C7 interest (financing cost) | ±0.5 pp | Switzerland +1.2 pp | worst 0.02 pp |
| C8 dividends, scenario-wide | ±0.2 pp | about 3.3% vs 0.18% | 0.18% vs 0.18% |
| D5 budget/financing sources exist and have licences | — | — | 19 sources, pass |
| P2 distributable flag agrees with licence audit | — | — | `distributable: false` (Türkiye), pass |

The week-2 budgets above are measured on the package itself, loaded from `week1.session.json`. The C1–C8 calibration residuals come from the calibration run's week 1. The two agree within 0.1 pp, except Bulgaria (−0.76 vs −0.71).

## 8. Baseline and stress runs (draft.2; audits every week)

**Baseline, every country on the autopilot, 156 weeks.** The run was repeated, and both runs end with the same state hash (deterministic).

| Country | Debt/GDP w1 → 52 → 104 → 156 | Market rate w156 | Access | Defaults | Stability w156 | Real GDP index |
|---|---|---:|---:|---:|---:|---:|
| France | 1.09 → 1.11 → 1.07 → 1.02 | 3.7% | yes | 0 | 56.7 | 1.057 |
| Germany | 0.62 → 0.62 → 0.58 → 0.55 | 3.1% | yes | 0 | 68.3 | 1.027 |
| United Kingdom | 0.99 → 1.01 → 0.98 → 0.92 | 3.6% | yes | 0 | 60.5 | 1.010 |
| Italy | 1.34 → 1.38 → 1.34 → 1.27 | 4.1% | yes | 0 | 58.4 | 1.030 |
| Poland | 0.49 → 0.50 → 0.47 → 0.44 | 3.1% | yes | 0 | 62.6 | 1.084 |
| Türkiye | 0.30 → 0.31 → 0.30 → 0.29 | 3.1% | yes | 0 | 64.8 | 1.052 |
| Greece | 1.64 → 1.63 → 1.58 → 1.49 | 4.5% | yes | 0 | 56.0 | 1.074 |
| Middle East bloc | 0.50 → 0.51 → 0.50 → 0.50 | 3.1% | yes | 0 | 70 (aggregate) | 1.002 |

Across all 21 actors the baseline had **no defaults, lost market access, unrest or regime change**. The ECON-08 baseline (before) had 3 unrest episodes and 2 regime changes in the Middle East bloc.

**Stress (the stressed country gets no autopilot):**

| Plan | Weeks | Outcome for the stressed country |
|---|---:|---|
| Passive Türkiye (no commands) | 156 | stable: debt 0.36, no events |
| Mismanage Italy (social +8 pp, administration +4 pp, income tax −5 pp) | 156 | debt 1.34 → 1.88, rate 8.8%, access kept |
| Mismanage UK (same) | 156 | debt 0.99 → 1.53, rate 6.8% |
| Reckless Italy (+15 / +10 / −10 pp) | 312 | access lost w152, forced default w158, three regime changes (w188, w214, w240), access restored w236 |
| Reckless Greece (+10 / +8 / −8 pp) | 312 | access lost w169, default w175, unrest w181, access restored w253 |
| High taxes France (income +15, consumption +5 pp) | 156 | stability 52.6, no crisis |
| High taxes Poland (income +20, consumption +8, corporate +10 pp) | 156 | unrest from w13, stability 36.2, real GDP 0.99 |
| Austerity Greece (−6 / −6 / −2 pp) | 156 | debt 1.64 → 1.37, rate 4.3% |
| Deliberate default Italy / Greece (w10) | 156 | default w10, access back w108; debt 0.68 / 0.74 |
| Repeated defaults Italy (w10, 60, 110) | 156 | 3 defaults, no access at w156, rate 26.7%, regime change w113, real GDP 0.80 |
| Repeated defaults Türkiye (w10, 60, 110) | 156 | 3 defaults, no access, rate 26.8%, unrest, real GDP 0.81 |

Worst audit errors over all runs:
- money: 2.5e-10, within `AUDIT_TOLERANCE` 1e-9;
- bonds: 2.0e-15;
- money issued: 1.7e-14.

## 9. Tests, compatibility and performance

| Check | Result |
|---|---|
| Engine typecheck (`npm run typecheck`, both configs) | pass |
| Engine tests (`economy-engine`, `npm test`) | **218/218 pass**, including 6 new ones |
| Game tests (root `npm test`) | **156/156 pass** |
| Production build (`npm run build`) | pass |
| Scenario validator, draft.2 | 22 pass, 1 warn (Türkiye licence), 0 fail |
| draft.1 rebuilt with the new engine | byte-identical (`git status` shows no change) |
| Saves and fictional world: ECON-08 engine (`b85d80f`) vs this branch, 26 weeks each (`sim/econ08/compat.ts`) | identical hashes: draft.1 package save `316f4d3c35b23218`, v5 fixture save `12e5fb54c70cf5a4`, fictional world `ccdb2e7f9d719117` |
| Golden fingerprint, SAVE-01, GAME-UX-01, ECON-07 tests | pass (inside the suites above) |
| Determinism | baseline repeated: identical; package rebuild matches the calibration's week-1 hash `e0f18a0898bae961` |

**Performance on the draft.2 package (61 zones, 312 lanes):**

| | Node | Chromium 1× | Chromium 4× | Chromium 6× |
|---|---:|---:|---:|---:|
| Week median | 38 ms (draft.1: 45) | 17–18 ms | 74–77 ms | 114–126 ms |
| 95th percentile | 66 ms | 33–36 ms | 101–128 ms | 186–189 ms |
| 156 weeks | — | 3.2–3.4 s | 12.6–13.5 s | 19.4–21.5 s |
| Save, week 156 | 2,000 KB (780 KB gzip) | save 14–15 ms, restore 5–6 ms | | |

The iPhone page was regenerated from draft.2 (1.8 MB) and run once in headless Chromium: median 17.9 ms. **It has not been run on an iPhone.** Throttled Chromium is only a stand-in. Results are in `scenarios/europe-2023/1.0.0-draft.2/benchmark-node.json` and `benchmark-browser.json`.

## 10. Unverified or missing data

| Item | Status |
|---|---|
| Türkiye spending lines and 2023 balance | Court of Accounts report, no reuse terms. Package not distributable. |
| Türkiye defence pay | No verified source. Military divisions unresolved. |
| Türkiye ESA vs GFS deficit (−4.83 vs −2.44 / −2.17%) | Concept and vintage difference, not settled (§5) |
| Switzerland starting debt | Estimate (OECD, non-consolidated) |
| Bulgaria national customs (D2121 to S13) | Not published. Taken as 0 (EU member). |
| Norway balance | Not comparable (wealth-fund income) |
| Per-country dividends | Fitted scenario-wide only. Residuals up to 0.7 pp (Bulgaria). |
| Türkiye debt report terms | Ministry: "reuse with reference"; commercial use not addressed |

## 11. Owner decisions

1. **Approve or reject engine inputs E-1, E-2 and E-3 (§6).** draft.2 needs all three. Without them, it can't be built.
2. **Türkiye data (§5):** provide the TurkStat tables or written reuse permission, or accept a WDI-only estimate. Until then draft.2 stays `distributable: false`.
3. **Türkiye deficit concept:** keep ESA (−4.83%, as for the EU countries) or switch to the Ministry's revised GFS series (−2.44%)?
4. **Switzerland debt:** accept the 26.0% OECD estimate, or provide a consolidated figure.
5. **Norway:** accept "not comparable", or treat a sovereign wealth fund as a future design question (`GAME_DESIGN.md`).
6. **Per-country dividends:** accept the scenario-wide fit (all balances within ±1 pp), or ask for a per-country ownership input (an engine change).

## 12. Conditions for starting the Codex integration

Not started. Suggested conditions before it begins:
1. PRs #31–#34 and this PR reviewed and merged in order (§1).
2. Decision 1 (E-1 to E-3) approved.
3. Decision 2 resolved and `distributable: true` in the manifest, or an explicit owner statement that a review-only package may be integrated for development.
4. The proposed scenario loader, from WORLD-01/WORLD-03, approved. The current `startEconomyFromSave` refuses this package because its world fingerprint differs, so the game can't load it by accident.
5. The iPhone page run on a physical iPhone by the owner (WORLD-02-PERFORMANCE §4).

## 13. Reproduce

```
python3 scenarios/pipeline/fetch_sources.py --only budget,che_debt     # network; snapshots already committed
python3 scenarios/pipeline/build_budget.py
WORLD03_FINANCE=final WORLD03_ROUNDS=24 node --experimental-strip-types economy-engine/sim/world03/calibrate.ts
WORLD03_FINANCE=final node --experimental-strip-types economy-engine/sim/world03/package.ts
python3 scenarios/pipeline/validate_scenario.py scenarios/europe-2023/1.0.0-draft.2
node --experimental-strip-types economy-engine/sim/world03/final-runs.ts
node --expose-gc --experimental-strip-types economy-engine/sim/world03/bench.ts scenarios/europe-2023/1.0.0-draft.2 --repeats 2
node economy-engine/sim/world02-browser-bench.cjs scenarios/europe-2023/1.0.0-draft.2 --scenario scenarios/europe-2023/1.0.0-draft.2 --repeats 2 --rates 1,4,6 --html <out>.html
```

# WORLD-03 — European scenario data pipeline: report and decisions

| | |
|---|---|
| **Milestone** | WORLD-03: first calibrated, reproducible, versioned 61-zone European scenario. **Not connected to the game.** |
| **Package** | [`scenarios/europe-2023/1.0.0-draft.1/`](../../scenarios/europe-2023/1.0.0-draft.1/). The detailed tables are in its [`REPORT.md`](../../scenarios/europe-2023/1.0.0-draft.1/REPORT.md) |
| **Pipeline** | [`scenarios/README.md`](../../scenarios/README.md). The engine-side steps are in `economy-engine/sim/world03/` |
| **Codex handoff** | [`WORLD-03-HANDOFF.md`](WORLD-03-HANDOFF.md) |
| **Unchanged** | Engine formulas and parameters, integration contract 1.0.0, SAVE-01, GAME-UX-01, ECON-07, the fictional scenario and its saves |

## 1. Summary

**What works:**
- The pipeline runs from 30 verified source snapshots to a versioned package, deterministically. A rebuild reproduces the week-1 economy bit for bit (hash `3393edd582a74595`).
- **All 61 zones' real output shares are within ±3%** (worst 0.92%), and so are **all 21 countries' PPP GDP shares** (worst 0.52%).
- **109 of 112 tax and spending ratios are within ±1 percentage point.**
- The geography is validated:
  - Corsica has no land link;
  - land, maritime and movement links are separate;
  - every graph is connected.
- Performance on the real scenario is in line with WORLD-02 (§6).

**What does not work: the scenario is not playable yet.** Two limits of the *existing* engine block it. Both are explained below and need your decision; I changed no formula.
1. **Debt (W3-D1).** The engine cannot hold 2023 debt levels at its starting point. In 15 of 15 countries with debt data, week-1 debt is above the 2023 value (Italy 4.2× GDP against 1.34×). Within 18 weeks, six countries default (§4).
2. **Income tax (W3-D2).** France, Belgium and Austria reach the engine's 70% maximum income-tax rate and still collect 5–8 points of GDP less than the data.

**Also unresolved:**
- Türkiye's military starting forces (no verified source; nothing inserted);
- one licensing risk (W3-L1, Türkiye's spending source).

## 2. What was built

| Step | Script | Output |
|---|---|---|
| 1. Fetch (network) | `scenarios/pipeline/fetch_sources.py` | 30 snapshots in `scenarios/europe-2023/sources/`. Each holds the exact query URL, retrieval date, publisher update date, licence, attribution and the values used. Large downloads keep a SHA-256 |
| 2a. Geography | `build_geography.py` | Land borders from shared Natural Earth boundary vertices, for all 61 zones and every pair kind. Coastlines. Maritime links (16 curated, plus the WORLD-02 rule "blocs trade by sea with coastal zones and with each other"). Movement links |
| 2b. Inputs | `build_inputs.py` | Every input as `{value, sources, method, status}`. **Exits without writing if a mandatory input is missing** (this happened during development: UK debt, until the ONS series was added) |
| 3. Calibration | `economy-engine/sim/world03/calibrate.ts` | Fits zone technology, tax rates and spending shares on the unchanged engine. 22 rounds of about 12.5 s |
| 4. Package | `economy-engine/sim/world03/package.ts` | `scenario.json`, `week1.session.json`, `world-spec.json`, `provenance.json`, `calibration-report.json` and `manifest.json` (fingerprints) |
| Checks | `validate_scenario.py`, `world03/bench.ts`, `world02-browser-bench.cjs --scenario`, `report.py` | Validation report, benchmarks, `REPORT.md` |

## 3. Data (2023) and mapping

| Input | Source (licence) | Rule |
|---|---|---|
| Province output share | Eurostat `nama_10r_3gva` (FR, DE, IT, PL, TR); ONS regional GVA by industry, ITL1 (OGL v3) | Province GVA ÷ the sum over the country's provinces. France excludes the overseas departments (FRY) |
| Country real output | World Bank WDI GDP at PPP (CC BY 4.0) | Province target = country PPP GDP × province share. Neighbours: WDI. Blocs: sum over members with data (coverage 95.6–100% of bloc population) |
| Population | Eurostat (mean of 1 Jan 2023 and 1 Jan 2024); ONS mid-2023; WDI (blocs) | Millions |
| Sector groups → advantages | Regional A*10 with national A*64 splits (Eurostat); ONS regional detail; WDI resource rents and value-added shares (blocs) | Group share ÷ the output-weighted mean, clipped to 0.1–4. Military = 1 everywhere (E-3) |
| Taxes | Eurostat `gov_10a_taxag`/`main` (14 EU/EFTA countries); OECD Revenue Statistics (UK, Türkiye) | Income = personal income tax + social contributions (E-4); corporate; consumption = taxes on products **+ all other taxes folded in** (E-5, see W3-D3) |
| Spending | Eurostat `gov_10a_main`/`exp`; OECD Tables 11/12 (UK); Court of Accounts (Türkiye, W3-L1) | Social = D62; military = COFOG 02; infrastructure = P51G minus defence; administration = P3 minus defence pay and purchases |
| Debt | Eurostat EDP and quarterly (Norway); ONS YEQJ (UK, 98.8%); Turkish Treasury (29.6%) | Maastricht gross debt |

**Every estimate and gap is listed in the package report (§6).** The main ones:

| Kind | Items |
|---|---|
| **Unavailable** (engine defaults, flagged) | Switzerland's debt; the five blocs' fiscal policy (open fiscal aggregates are IMF-sourced); bloc members without PPP GDP, including Taiwan, North Korea, Venezuela, Cuba, Syria and Yemen |
| **Engine limit** | Greece's 164% debt exceeds the engine's 150% maximum starting debt; 150% is used |
| **Estimates** | Mining split by resource rents (WDI, mostly 2021); Poland's textiles value added is confidential; the bloc manufacturing split uses the European average; Türkiye's spending categories map GFS concepts onto ESA-style categories |
| **Design defaults** | Population growth 0; tariff at the engine default; neutral stability (70) and neutral relations |

## 4. Calibration results and the blocking limitation

| Target | Tolerance | Result |
|---|---|---|
| Zone output shares (61) | ±3% relative | **Met**, worst 0.92% |
| Country PPP GDP shares (21) | ±3% relative | **Met**, worst 0.52% |
| Tax and spending ratios (112) | ±1 pp | **109 met.** Income tax missed in France (−5.2 pp), Belgium (−7.9) and Austria (−6.9) at the 70% maximum rate |
| Debt ratios (15) | ±1 pp | **Not met** for any. Week 1 vs 2023: France 2.73 vs 1.09, UK 2.13 vs 0.99, Italy 4.18 vs 1.34, Greece 9.17 vs 1.64 (input capped at 1.5) |

**Why debt cannot be matched.** Two mechanisms of the current engine, both measured:

1. **The builder's warm-up does not hold debt fixed.**
   - The builder runs about 160 weeks to bring prices to rest. It normally keeps the budget balanced by choosing the income tax itself.
   - With real 2023 taxes and spending, deficits and interest accumulate during the warm-up.
   - Even low-debt countries drift: Poland goes from 0.49 to 0.92, Czechia from 0.42 to 0.73.
2. **The engine's sovereign risk premium is far above 2023 reality for high-debt countries.** These are the engine's rates at 2023 debt, before any deficit effect, against the effective rate governments paid (interest paid ÷ debt, from the same official sources):

| | Debt / GDP | Effective rate paid in 2023 | Engine rate at that debt | Engine interest / GDP |
|---|---:|---:|---:|---:|
| Germany | 0.62 | 1.4% | 3.0% | 1.9% |
| UK | 0.99 | 3.2% | 4.0% | 3.9% |
| Belgium | 1.02 | 1.9% | 4.2% | 4.3% |
| Spain | 1.05 | 2.3% | 4.5% | 4.7% |
| France | 1.09 | 1.7% | 4.9% | 5.4% |
| Italy | 1.34 | 2.7% | 9.3% | 12.5% |
| Greece | 1.64 | 2.1% | 18.8% | 30.8% |

For low-debt countries the engine is close to reality. Above about 0.9× GDP its quadratic premium makes debt unsustainable.

**What happens after week 1 (measured; the autopilot steers every country):**
- Seven countries start without market access: France, the UK, Italy, Spain, Belgium, Austria and Greece.
- Sovereign defaults: Greece (weeks 5 and 87), Italy (6 and 93), Spain (7), UK (11), France (15), Belgium (18).
- Regime changes: Greece at week 90, Italy at week 96.
- The Middle East and Africa bloc has a regime change every 26 weeks (W3-D4).

So the package is technically valid but **not a playable 2023 starting position.**

Fitting the debt *input* lower to hide the warm-up drift was tested and rejected:
- it destabilised the other targets;
- it would misstate the starting position.

## 5. Corsica, transport and military

**Corsica and transport (S-1 at the data level):**
- Corsica has no land link. Its maritime trade links go to Provence, Sardinia, Tuscany and the five blocs.
- Three separate link sets: 132 land borders, 180 maritime trade links and 74 movement links.
- Movement links are playable province to playable province only. Maritime and fixed links are never movement links, and that includes the Channel Tunnel (decision W3-D6).
- Geometry found three real borders that the WORLD-02 hand list missed: Austria–Baden-Württemberg (Lake Constance), Switzerland–Bourgogne-Franche-Comté and Switzerland–Trentino.
- Feeding maritime links to the engine needs a small additive API change (API-1 in the handoff). It is proposed, not implemented.

**Military, rule W** (defence pay ÷ the country's own average pay ÷ 25,000, a provisional parameter):

| | France | Germany | UK | Italy | Poland | Türkiye |
|---|---:|---:|---:|---:|---:|---|
| Personnel equivalents | 382,086 | 318,398 | 357,759 | 362,581 | 318,167 | — |
| Draft divisions | 15 | 13 | 14 | 15 | 13 | **unresolved** |

Differences between the five are small (13–15 divisions) because each country's defence pay is divided by its own wage level. Market exchange rates would have given 5 to 23 (WORLD-02).

**Türkiye's military is unresolved.** The proposed sources were checked:
- **Court of Accounts 2023 report:** downloaded and parsed. It gives defence by function (350.3 bn TRY) but not defence pay, and its site publishes no reuse terms.
- **Ministry of National Defence 2023 report:** the link now returns "not found".
- **Eurostat and OECD:** neither has Turkish defence spending by type.

So **no value was inserted.**

## 6. Performance on the calibrated scenario (F-1 thresholds)

| | Node (desktop) | Chromium 4× | Chromium 6× | F-1 (iPhone target) |
|---|---|---|---|---|
| Median week | 45.4 ms | 88–104 ms | 147–150 ms | ≤ 250 ms |
| 95th percentile | 87.6 ms | 128–178 ms | 222–225 ms | ≤ 500 ms |
| Slowest week | 241 ms | 594–679 ms | 933–950 ms | ≤ 1 s |
| Start from week-1 save | 13 ms | 54–71 ms | 66–79 ms | ≤ 1 s |
| Save + restore (week 156) | 31 ms | 83–115 ms | 134–142 ms | ≤ 1 s |

- **Scale:** 61 zones, 312 lanes.
- **Save size:** week-1 save 1.6 MB (0.6 MB gzip); week-156 save 2.0 MB (0.77 MB gzip).
- **Memory:** Node heap 17 MB; Chromium JS heap 30–87 MB.
- **Against F-1:** all thresholds are met in the Chromium proxy. The slowest week at 6× is the closest to its limit; those weeks are probably the default and crisis weeks of §4.
- **iPhone:** the iPhone benchmark page was regenerated from this package (1.8 MB, run in Chromium). **It has not been run on an iPhone.** That needs the owner (`WORLD-02-PERFORMANCE.md` §4). The 50-zone fallback is documented there and was not applied.

## 7. Decisions requested

| ID | Decision | Options | Recommendation |
|---|---|---|---|
| **W3-D1** | 2023 debt cannot be held by the engine | **(A)** Scenario-specific sovereign-spread parameters fitted to 2023 effective rates. No formula change, and the fictional scenario is untouched.<br>**(B)** Engine change: the builder keeps debt fixed during its warm-up.<br>**(C)** Start with lower, non-data debt (not recommended) | **A + B** as a separate approved engine task (for example ECON-08), then re-run this pipeline unchanged |
| **W3-D2** | Income-tax capacity in France, Belgium and Austria | Count **employer** social contributions with corporate tax, which is a mapping change; or wait for W3-D1, since the debt spiral also shrinks the base | Re-test after W3-D1, then decide |
| **W3-D3** | E-5: other taxes folded into the consumption tax (applied) | Fold (keeps total tax revenue equal to the data) or report as missing (creates a structural deficit) | Confirm fold |
| **W3-D4** | The Middle East and Africa bloc has a regime change every 26 weeks | Accept (blocs are not actors), or a bloc stability rule (a design change) | Review after W3-D1 |
| **W3-D5** | Unavailable values: Switzerland's debt, the blocs' fiscal policy | Keep engine defaults (flagged), or find a verified source | Keep defaults |
| **W3-D6** | Channel Tunnel: trade link only, or also army movement | Trade only (applied), or movement | Trade only in v1 |
| **W3-D7** | Greece's debt above the engine maximum (150% used) | Part of W3-D1 | With W3-D1 |
| **W3-L1** | Türkiye's spending comes from a Court of Accounts report without published reuse terms | Ask the Court of Accounts or Treasury for terms; or find a TurkStat equivalent | Before any release |
| **M-2 / M-3** | 25,000 per division; Türkiye's military | Approve the parameter; pursue Turkish personnel or pay data | Approve M-2; M-3 open |
| **API-1/2/3** | Additive integration API (maritime links, country policy, scenario start) | Approve or not | Approve, after W3-D1 |

## 8. Unresolved data and licensing risks

| Risk | Status |
|---|---|
| Türkiye's spending source has no published reuse terms (W3-L1) | Open. Flagged in provenance and validation (D3 warning) |
| Türkiye's military data | Open (M-3) |
| OECD licence verified through search only; ICP (PPP) dataset licence through search | Low risk. Re-check in a browser before release |
| WDI population comes from UN World Population Prospects (WDI does not mark it as restricted) | Low risk |
| Resource rents lag (mostly 2021) | Estimate, used only to split mining output |
| Taiwan and others missing from bloc output | Documented coverage gap |
| Ferry routes "to verify" | Re-verify before release |
| Publisher revisions | Snapshot dates and hashes make refreshes reviewable |

## 9. Verification

Run on the final commit (see the PR):
- WORLD-02 validators;
- the WORLD-03 validator: 14 pass, 1 warning (W3-L1), 2 fail (calibration C3 and C4, as explained above);
- the engine typecheck and tests;
- the game tests;
- the production build;
- the Node and Chromium benchmarks on the package.

**Fictional saves.** The fictional scenario, its week-1 save and the engine's golden fingerprint are unaffected: no engine or game source changed.

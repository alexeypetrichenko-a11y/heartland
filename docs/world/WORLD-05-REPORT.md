# WORLD-05 / WORLD-05-FINAL — Licensed European scenario and military initialisation (review only)

**Status:** review only. Nothing is merged, deployed or sent.
- **New package:** `scenarios/europe-2023/1.0.0-draft.3/`, licence-clean, with manifest `distributable: true`.
- **Earlier packages:** `1.0.0-draft.1` and `1.0.0-draft.2` are byte-for-byte unchanged and remain restricted review drafts.
- **Untouched:** no game, UI, movement-rule or engine file, and none of PR #36's files (`STATUS.md` and `TASKS.md` included).

This is a technical licensing assessment, **not legal advice**. The standard throughout is commercial distribution (WORLD-02 L-1).

**In short.**
1. **Türkiye now comes only from licence-clean sources.**
   - Balance and taxes come from the OECD.
   - Interest comes from the World Bank's CC BY 4.0 government-finance series.
   - Debt and government consumption come from Eurostat.
   - Administration, defence and infrastructure follow the structure of the other five playable countries. Social spending closes the budget identity.
   - **No value comes from the Court of Accounts, the Treasury debt report or the Ministry tables.**
2. **The OECD is verified (W5-L3).** Its Terms allow commercial redistribution of Data with a citation, unless a dataset has its own terms or third-party ownership. None of the six OECD datasets used carries such a notice in its published metadata.
3. **draft.3 is calibrated and stable.**
   - All validator checks pass (25/25).
   - The 156-week baseline has no default, lost market access, unrest or regime change.
   - Stress runs still trigger crises.
   - Only Türkiye's targets changed (§3.2).
4. **Military:**
   - The approved Rule W counts stay unchanged for five countries.
   - Türkiye gets **20 divisions by a documented gameplay assumption.** The approved Rule W figure (16) needs the Ministry's permission.
   - The P-1 placement is applied to all 46 provinces, 90 divisions in total.
   - Specification: [WORLD-05-SCENARIO-SPEC.md](WORLD-05-SCENARIO-SPEC.md). Codex handoff: [WORLD-05-CODEX-HANDOFF.md](WORLD-05-CODEX-HANDOFF.md).
5. **Permission letters are prepared but not sent** ([WORLD-05-PERMISSION-REQUEST.md](WORLD-05-PERMISSION-REQUEST.md)). draft.3 does not depend on them.

---

## 1. Owner decisions applied

| ID | Decision | How it was applied |
|---|---|---|
| W5-L1 | Licence-clean sources first; open aggregates and documented estimates as fallback; permission request in parallel | §2.3; letters prepared, not sent |
| W5-L2 | Include Turkish debt | Debt from Eurostat in draft.3; the debt report is covered by letter B |
| W5-L3 | Verify all OECD snapshots | §2.2: six datasets, nine snapshots |
| W5-F1 | Deficit concept consistent with the licensed source | OECD Economic Outlook general government net lending, **−4.48%**: national accounts, the same concept as the other 15 countries. The Ministry's revised GFS balance is not licensed, so it is not used |
| M-2 | 25,000 personnel equivalents per division | `military.parameter` |
| M-3 | Türkiye by Rule W, subject to clearance | Not cleared, so a gameplay assumption is used (§4) |
| P-1 | Frontier-weighted placement, provisional | `military.placement` |
| P-2 | Isolation acceptable for the prototype only | Recorded in the package; options for the mobility study are in the handoff |
| R-1 | Keep history; stop further distribution | §6: restricted values removed from the PR branch head, nothing restricted added |

## 2. Licensing

### 2.1 Final audit

`python3 docs/world/tools/world05_licence_audit.py`: [`data/world05-licence-audit.json`](data/world05-licence-audit.json). Verdicts come from the licence register [`scenarios/europe-2023/licences.json`](../../scenarios/europe-2023/licences.json). Evidence: [`data/world05-licence-evidence.json`](data/world05-licence-evidence.json).

| Publisher | Snapshots | Status | Commercial redistribution | Evidence |
|---|---:|---|---|---|
| Eurostat | 16 | cleared | yes, with acknowledgement. Covers EU and EFTA members and candidate countries, **Türkiye included**; never UK data from Eurostat | publisher page, read 2026-11-25 |
| ONS | 3 | cleared | yes (Open Government Licence v3.0) | publisher page |
| World Bank WDI | 12 | cleared | yes (CC BY 4.0, **labelled per indicator**). SIPRI-sourced series are labelled with SIPRI terms and are not used | World Bank API metadata, every series |
| OECD | 9 | cleared | yes, with the dataset citation (§2.2) | Terms via search; metadata primary |
| Natural Earth | — | cleared | public domain | publisher page (WORLD-02) |
| Court of Accounts (Sayıştay) | 1 | **restricted** | no terms | used only by draft.1/draft.2 |
| Treasury debt report | 1 | **restricted** | "May not be copied … without reference"; commercial use not addressed | used only by draft.1/draft.2 |
| Ministry GFS and budget tables (Muhasebat) | 0 | **restricted** | no reuse licence | research only; values kept out of the repository |

- **draft.3** cites 36 snapshots from four cleared publishers plus Natural Earth, and **no restricted source**. It also carries `NOTICE.md`, `ATTRIBUTION.json` and the manifest fields `licences`, `notDistributableBecause` and `releaseChecks`.
- **draft.1/draft.2** stay not distributable. draft.1 has no `distributable` field, so public packaging must treat a missing flag as `false`.

### 2.2 OECD datasets (W5-L3)

**The OECD Terms (Data section; search-based reading, because oecd.org refuses automated access) say:**
- Data may be extracted, copied, adapted, distributed and embedded "for any purpose, even for commercial use", with credit using the dataset's citation.
- Data may have "restrictions beyond the scope of these Terms", through dataset-specific terms or third-party ownership. The user should check the metadata.
- CC BY 4.0 covers OECD *written content*, not Data.

| Dataflow (version) | Snapshots: series key | Use | Dataset-specific terms in metadata | Third-party ownership | Citation |
|---|---|---|---|---|---|
| `OECD.CTP.TPS,DSD_REV_COMP_OECD@DF_RSOECD` (2.0) | `oecd_revenue`: GBR+TUR taxes 1100, 1200, 2000, 5110, 5120, 5000, total · `oecd_customs`: GBR+TUR+NOR+CHE 5123 | taxes (UK, Türkiye), customs kept | none | none indicated | OECD (2026), Revenue Statistics in OECD member countries – Comparative tax revenues |
| `OECD.SDD.NAD,DSD_NAMAIN10@DF_TABLE1_EXPENDITURE` (2.0) | `oecd_gdp` GBR+TUR · `oecd_uk_imports` GBR | GDP, UK imports | none | none indicated; UK figures originate with the ONS (OGL) | OECD (2026), Annual GDP and components – expenditure approach |
| `OECD.SDD.NAD,DSD_NASEC10@DF_TABLE11` (1.1) | `oecd_uk_defence` GBR COFOG 02 OTE, P51G, D1, P2 | UK defence | none | none indicated; ONS origin | OECD (2026), Annual government expenditure by function (COFOG) |
| `OECD.SDD.NAD,DSD_NASEC10@DF_TABLE12` (1.1) | `oecd_uk_government`, `oecd_uk_government_accounts` GBR S13 | UK government accounts | none | none indicated; ONS origin | OECD (2026), Annual government non-financial accounts and key indicators |
| `OECD.SDD.NAD,DSD_NASEC20@DF_T720GOV_A` (1.1) | `oecd_che_debt` CHE S13 liabilities F, F2, F3, F4 | Swiss starting debt (estimate) | none | none indicated | OECD (2026), Government Annual Financial Balance Sheets (stocks), non-consolidated |
| `OECD.ECO.MAD,DSD_EO@DF_EO` (1.5) | `oecd_eo_tur` TUR NLG, NLGQ, CG, GDP | **Türkiye balance target (draft.3)** | none | none indicated | OECD (2026), Economic Outlook 119 |

**Required attribution:** the citations above, printed in every package's `NOTICE.md`. The dataset metadata (names, descriptions, annotations and their SHA-256) is recorded in the evidence file.

**One release check remains:** read the Data section of the OECD Terms in a browser before a public release. It is listed in draft.3's manifest under `releaseChecks`. It is not a licence blocker, because the terms permit the use.

### 2.3 Türkiye: sources selected and rejected

| Input (2023) | draft.3 value | Source and status | Why |
|---|---:|---|---|
| Taxes (income, consumption, corporate) | unchanged | OECD Revenue Statistics: **data** | OECD Data terms |
| Customs kept | 0.548% of GDP | OECD: **data** | as above |
| Net lending (balance target) | **−4.48%** | OECD Economic Outlook: **data** | W5-F1: the licensed source, and the same national-accounts concept as the other 15 countries |
| Interest | 3.65% | World Bank WDI interest share × expense (IMF GFS, consolidated central government): **derived** | CC BY 4.0 label per series. Interest is almost entirely central government |
| Debt | **27.80%** | Eurostat consolidated general government liabilities F2+F3+F4 / GDP: **derived** (market value; EDP debt is at face value) | Eurostat terms cover candidate countries |
| Government final consumption | 13.24% | Eurostat `nama_10_gdp` P3_S13 (TurkStat data): **data** | basis for administration |
| Administration | 10.59% | final consumption × mean cash-administration ratio of FRA, DEU, GBR, ITA, POL (0.800): **estimate** | no licence-clean split for Türkiye |
| Defence | 1.72% | mean COFOG 02 share of the five: **estimate** | no licence-clean Turkish defence figure exists |
| Infrastructure | 3.29% | mean of the five: **estimate** | as above |
| Social | 8.46% | budget identity: **derived** | the same closing rule as every country |
| Dividends | 0 | **assumption**, as in draft.2 | no cleared source |

**Not used:**

| Source | Reason |
|---|---|
| Court of Accounts report | no terms |
| Ministry GFS and budget tables | no licence; and estimates are not derived from them |
| TurkStat | its reuse terms are verified, but its data portal and SDMX service need an account |
| IMF directly | commercial reuse by permission |
| WDI government-finance split | central-government coverage; components overlap |
| SIPRI | third-party terms |
| NATO | no published terms |
| IISS | proprietary |

## 3. Package `1.0.0-draft.3`

### 3.1 Contents

- **Identity:**
  - world fingerprint `12035be51198e4ee`;
  - week-1 economy hash `ff1a2f7acb5d4af3`;
  - content fingerprint `c796f615f0c46840…` (the manifest holds the full value).
- **Unchanged from draft.2:** 61 economic zones, 46 playable provinces, reference year 2023 and the draft.2 method. Built with `WORLD03_FINANCE=licensed`:
  1. `scenarios/pipeline/build_inputs.py --licensed`, `build_budget.py --licensed` and `build_financing.py --licensed`, writing `build-licensed/`;
  2. `calibrate.ts`;
  3. `package.ts`.
- **Status labels:** every value carries a status in `provenance.json`:
  - `data`: published statistics;
  - `derived`: arithmetic on published statistics;
  - `estimate`: modelled from other countries' structure;
  - `assumption`: a gameplay value;
  - `design`: a game-scale parameter.
- **New files outside the content fingerprint:**
  - `NOTICE.md`: attribution, OECD citations, the illustrative-content notice and the distribution status;
  - `ATTRIBUTION.json`: the machine-readable register.

  Both have SHA-256 entries in the manifest.
- **`distributable: true`.** Every cited publisher is cleared in the register. The one release check is OECD (§2.2).

### 3.2 Deviations from draft.2's targets

Only Türkiye's targets changed. **Every other country's targets are identical to draft.2.**

| Türkiye, 2023 | draft.3 target | Change vs draft.2 | Calibration result |
|---|---:|---:|---|
| GDP share (PPP) | 1.987% | 0 | error 0.001% |
| Net lending | −4.48% | +0.35 pp | −4.41% (C5 tolerance ±1 pp) |
| Taxes (income / consumption / corporate) | 8.76 / 10.95 / 2.96% | 0 | within 0.01 pp |
| Tariff revenue | 0.548% | 0 | exact |
| Debt | 27.80% | −1.80 pp | 27.87% |
| Defence | 1.72% | +0.43 pp | exact |
| Administration | 10.59% | +0.29 pp | exact |
| Infrastructure | 3.29% | +0.21 pp | exact |
| Social | 8.46% | −1.06 pp | exact |
| Interest (reported) | 3.65% | −0.22 pp | 3.64% |

- **Effective rate:** Türkiye's effective interest rate on its debt is 13.12% (draft.2: 13.07%). It follows from interest ÷ debt.
- **Ownership fit:** the scenario-wide ownership scale is 0.0541 (draft.2: 0.0543).

## 4. Military initialisation

The full specification is in [WORLD-05-SCENARIO-SPEC.md](WORLD-05-SCENARIO-SPEC.md); the Codex handoff in [WORLD-05-CODEX-HANDOFF.md](WORLD-05-CODEX-HANDOFF.md).

- **Five countries (Rule W, `status: data`):** FRA 15, DEU 13, GBR 14, ITA 15, POL 13, unchanged.
- **Türkiye: 20 divisions (`status: assumption`).** Its personnel equivalents per inhabitant equal the median of the other five, times the population of its nine provinces, giving 491,934.
  - Inputs are licence-clean only.
  - The value replaces the approved M-3 result (16), which depends on the uncleared Ministry inputs.
  - Alternatives: 14 (the median count) or 16 after permission (decision W5F-M1).
- **Placement P-1:**
  - one division in each reachable province; the remainder by population, with frontier provinces weighted double;
  - the four islands get 0;
  - 90 divisions in total.
  - Frontier totals: Germany–France 4–3, Germany–Poland 4–4, France–Italy 4–6.
- **Labelled illustrative.** Military gameplay is not enabled, and no movement rule changed.
- **Independent of naval transport or transit.** Placement reads only land movement links.

## 5. Validation

| Check | Result |
|---|---|
| Engine typecheck / engine tests / long test | pass / **218/218** / 1/1 |
| Game tests / production build | **156/156** / pass |
| Validators: draft.1 / draft.2 / draft.3 | 14 pass, 1 warn, 2 fail (documented C3/C4) / 22 pass, 1 warn (Türkiye licence), 0 fail / **25 pass, 0 warn, 0 fail** |
| draft.1 and draft.2 | byte-identical, including after a rebuild and re-validation with the modified scripts |
| Default pipeline (`build_*.py` without `--licensed`) | reproduces exactly what `main`'s scripts produce |
| Recalibration (draft.3) | 0 targets missed after 9 rounds; worst zone 0.45%, worst fiscal 0.71 pp |
| 156-week reference (draft.3) | no default, lost market access, unrest or regime change at any of 84 checkpoints; stability 53.3–70.1; Türkiye's debt 27.9% → 27.4% |
| Stress runs (draft.3) | crises still triggered: reckless Italy/Greece (default, access loss, unrest, regime change), repeated defaults, high-tax Poland (unrest) |
| Determinism | baseline repeat identical (hash `27b991f6c1d57d05`); a second full recalibration reproduces `build-licensed/calibration.json` apart from recorded run times; the draft.3 rebuild is byte-identical |
| Default modes unchanged | WORLD-03-FINAL reference runs reproduce the committed `runs.json` apart from run times; `build_*.py` without `--licensed` reproduce `main`'s output |
| Save compatibility | `main`'s engine and this branch's engine give identical hashes for the draft.1 package save, the v5 fixture save and the fictional world (26 weeks each); the engine source is unchanged |
| 61-zone performance, Node | week median 44.5 ms, 95th percentile 65 ms, slowest 199 ms; load 12.7 ms (`benchmark-node.json`) |
| 61-zone performance, Chromium (headless; CPU 1× / 4× / 6×) | week median 21 / 90 / 141 ms; 95th percentile 42 / 132 / 207 ms; slowest 169 / 489 / 911 ms; 156 weeks 3.9 / 15.2 / 23.8 s; save + restore at 6× about 160 ms (`benchmark-browser.json`). Within the iPhone thresholds F-1 even at 6×, on this engine-level harness. WORLD-04's integrated game benchmark and a physical iPhone remain separate checks |

## 6. Repository safeguards (R-1)

- **The previous WORLD-05 commit (`b40b319`) put restricted figures on the public PR branch:** Ministry GFS aggregates and central-budget defence pay, in the WORLD-05 Türkiye inputs file, the military proposal file and the report.
  - **They are removed from the branch head in this update.** A squash merge of PR #37 would therefore not carry them to `main`.
  - **They remain in that commit's history** (R-1: no rewrite).
- **Research copies are local only.** Restricted research copies are kept in local, non-public storage. That is this session's private scratch area, which is **temporary**; download it if it is needed after the session.
  - The fetcher writes Ministry values only with `--restricted-out <path outside the repository>`.
- **Nothing restricted is added by this update.**
  - draft.3 contains no restricted value.
  - The new Türkiye snapshots are Eurostat, OECD and World Bank data.
  - The public GitHub Pages build contains no scenario package.
- **Not done:**
  - no history rewrite;
  - no visibility change;
  - no package deleted;
  - no deployment, merge or letter sent.

## 7. Remaining blockers and owner decisions

| ID | Item | Recommendation |
|---|---|---|
| Release check | Read the OECD Terms' Data section in a browser and confirm the wording (§2.2) | Before any public release |
| W5F-M1 | Türkiye's starting count until M-3 is cleared: 20 (current), 14 or other | Keep 20 for the prototype |
| W5F-L4 | Send letters A and B (C optional) | Send. A positive answer allows Türkiye's spending and Rule W (16) from the Ministry in a later version |
| P-2 | Isolation of the UK, Türkiye and the islands in the complete game | Codex mobility study (options in the handoff) |
| W5F-R2 | Commit `b40b319` stays in the public PR branch history | Keep (R-1), or request removal only if a rights holder asks |
| W5F-D1 | `STATUS.md` / `TASKS.md` entries for WORLD-05 | Add after PR #36 lands, to avoid a conflict |
| Release | Public packaging needs an owner allow-list for `1.0.0-draft.3`, a separate deployment authorisation, and the WORLD-04 loader admitting the version | Separate task |

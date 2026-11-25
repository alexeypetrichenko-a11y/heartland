# WORLD-05 — Data licensing and military initialisation (review only)

**Status:** review only. Nothing is merged or deployed. **No scenario package was created or changed:** `1.0.0-draft.1` and `1.0.0-draft.2` are byte-for-byte unchanged, and no game, UI or engine file was touched. Every proposal below needs an owner decision before a new package (`1.0.0-draft.3`) is built.

**Standard used throughout:** commercial distribution of the game and its scenario packages (WORLD-02 decision L-1). This report is a technical risk assessment, **not legal advice**.

**In short.**
1. **Türkiye's public finances cannot yet be redistributed commercially from any verified source with the detail the scenario needs.** The best replacement for the Court of Accounts report is its own primary source, the Ministry of Treasury and Finance's general government fiscal statistics (GFS). It also has no published reuse licence, so the clean routes are **written permission** (a draft request is in [WORLD-05-PERMISSION-REQUEST.md](WORLD-05-PERMISSION-REQUEST.md)) or **licence-clean aggregates with documented estimates** (§1.4).
2. **Audit of all 38 source snapshots:** 28 are clear for commercial redistribution, 8 (OECD) need one manual licence check in a browser, and 2 (the Turkish sources) are restricted. Neither package carries the attribution notice that CC BY 4.0 and the Open Government Licence require (§2).
3. **Türkiye's military:** the approved Rule W gives **16 divisions** (about 407,500 personnel equivalents). It needs three documented substitutions and the same Ministry licence clearance before it can enter a package (§3).
4. **Placement proposal:** one division in every reachable province, the rest by population with frontier provinces weighted double. **86 divisions** in total. Under the current movement rules, only France, Germany, Italy and Poland can ever fight each other. The UK and Türkiye are cut off, and so are four islands (§4).
5. **Exposure:** ten aggregate Turkish figures and the values derived from them have been in the public repository since 22 November 2026. No source document was ever committed, and nothing restricted is in the public GitHub Pages build. Remediation options that need no history rewrite are in §6.

---

## 1. Türkiye's public-finance data

### 1.1 What draft.2 takes from the restricted sources

| Package value (Türkiye) | Source | Status |
|---|---|---|
| Social, military, infrastructure and administration spending, other expense, the 2023 balance reconciliation and financing | Court of Accounts (Sayıştay), *2023 Yılı Mali İstatistikleri Değerlendirme Raporu* (Sep 2024): 10 aggregates | **No reuse terms** (W3-L1) |
| General government gross debt, end-2023 (29.6% of GDP) | Ministry of Treasury and Finance, *Public Debt Management Report* | "May not be copied or duplicated, in whole or in part without reference." **Commercial use not addressed** (W5-L2) |
| Taxes (income, corporate, consumption) | OECD Revenue Statistics | Probably CC BY 4.0 (§2.2, W5-L3) |

Source: `docs/world/data/world05-licence-audit.json` (6 values in draft.1 and 8 in draft.2 cite a restricted source).

### 1.2 Alternatives checked

Evidence for every row: [`data/world05-licence-evidence.json`](data/world05-licence-evidence.json). Values: [`data/world05-turkiye-inputs.json`](data/world05-turkiye-inputs.json) (`tools/world05_turkiye_inputs.py`).

| Source | Coverage for Türkiye 2023 | Reuse terms | Usable? |
|---|---|---|---|
| **Ministry of Treasury and Finance (Muhasebat), general government GFS workbook 2008–2026** (revised 30 Sep 2026) | Complete: revenue by type, expense by economic type, defence by function, net lending | **None published.** Searched the Muhasebat and hmb.gov.tr sites and the table metadata | Same licence gap as the Court of Accounts. It is the **primary producer** and the newer vintage |
| **TurkStat (TÜİK)** | General government accounts not reached: the data portal and SDMX service require an account login | **Verified:** "data obtained from our website, publications or databases may be reused, with the source cited, without the need for any permission" | Licence is clean. **Data access needs an owner account** (§1.4 route B) |
| **Eurostat** | No Turkish government finance (0 values in `gov_10a_main`, `gov_10a_exp`, `gov_10dd_edpt1`, `gov_10a_taxag`). Has national accounts and Labour Force Survey data | **Verified:** commercial reuse allowed for candidate countries, Türkiye included | Yes, for GDP, compensation of employees and employees (§3) |
| **OECD** | Revenue Statistics (taxes, already used). Economic Outlook: general government net lending **−4.48%** of GDP. No receipts or spending split; Tables 11 and 12 have no Türkiye 2023 | Probably CC BY 4.0. The data section could not be read (§2.2) | Yes, for taxes and the balance, after the manual check |
| **IMF** (receives the Ministry's GFS) | Full GFS | Search only: reuse with attribution, but "for any potential commercial reuse [...] request permission" | Not without permission |
| **World Bank WDI** | Revenue and expense totals (from IMF GFS) | CC BY 4.0 per indicator | Totals only; the split would be an assumption |

**Legal background** (official legislation portal, read 2026-11-25):
- The Statistics Law (No. 5429) makes official statistics public (Art. 4) but grants no reuse licence.
- The Copyright Law (No. 5846) frees officially published laws, decrees, regulations and court decisions (Art. 31). Statistics and audit reports are not in that list.
- Database protection "cannot be extended to the data" in a database (Art. 6(11)).
- A separate 15-year database right covers extracting **a substantial part or the whole** of a database (Additional Art. 8).

So reusing about ten aggregates with attribution is low risk, but it is **not** a licence.

### 1.3 The Court of Accounts figures are an older vintage of the Ministry's statistics

Same items, 2023, % of GDP (GDP 27,091,469 million TRY, Eurostat):

| 2023, % of GDP | Court of Accounts report (Sep 2024) | Ministry GFS (revised Sep 2026) | Change |
|---|---:|---:|---:|
| Compensation of employees | 7.25 | 7.92 | +0.68 pp |
| Goods and services | 4.34 | 4.16 | −0.17 pp |
| Interest | 3.87 | 3.75 | −0.11 pp |
| Subsidies | 2.01 | 2.03 | +0.02 pp |
| Social benefits | 9.73 | 9.74 | +0.01 pp |
| Other expense | 4.14 | 5.86 | +1.71 pp |
| Total expense | 33.46 | 35.64 | +2.18 pp |
| Net investment in non-financial assets | 1.04 | 1.14 | +0.10 pp |
| Defence (COFOG 02) | 1.29 | 1.65 | +0.36 pp |
| Net lending | −4.83 (draft.2 target) | **−2.44** | |

**Switching sources is therefore not a paperwork change.** Under the revised Ministry series, Türkiye's starting deficit roughly halves and defence rises by a quarter. Any switch needs a full recalibration in a new package version. It also settles WORLD-03-FINAL decision 3 (ESA −4.83% vs GFS −2.44%). For comparison, the OECD's −4.48% is close to the ESA basis.

### 1.4 Options (decision W5-L1)

| Route | What it takes | Effect on draft.3 | Recommendation |
|---|---|---|---|
| **A. Written permission from the Ministry (Muhasebat, Fiscal Statistics Department)** | Send the draft request ([WORLD-05-PERMISSION-REQUEST.md](WORLD-05-PERMISSION-REQUEST.md)); optionally ask the Court of Accounts as well | Ministry GFS 2023 replaces the Court of Accounts. Full split, newest vintage, deficit concept per decision W5-F1 | **Recommended**: the only route with full detail and a clean licence. It also covers the existing public repository retroactively (§6) |
| **B. TurkStat tables** | The owner registers on TurkStat's data portal and downloads the general government tables; TurkStat's reuse notice then applies (Law 5429 Art. 6 lets TurkStat distribute other institutions' official statistics) | Same as A if TurkStat publishes the same detail; **coverage not verified** (portal needs a login) | Try in parallel with A |
| **C. Licence-clean aggregates only** | OECD Revenue Statistics (taxes) + OECD Economic Outlook balance (−4.48%) + estimated split of spending (documented assumption, flagged `estimate`) | Distributable after the OECD check, but Türkiye's spending lines become assumptions | Fallback if A and B fail |
| D. Keep the Court of Accounts | — | Never distributable | Not recommended |

Whichever route is chosen, the debt figure (W5-L2) needs the same clearance. Alternatives are Eurostat's or the OECD's general government debt, if they carry Türkiye. A permission request under route A should cover the debt report too.

---

## 2. Redistribution audit of all inputs and packages

Generated by `python3 docs/world/tools/world05_licence_audit.py` → [`data/world05-licence-audit.json`](data/world05-licence-audit.json). The tool also checks that no Eurostat snapshot contains UK data (excluded from commercial reuse) and that every package value cites a known source. **No problems found.**

### 2.1 Sources

| Publisher | Snapshots | Licence (evidence) | Verdict |
|---|---:|---|---|
| Eurostat | 14 | Reuse "for commercial or non-commercial purposes [...] provided the source is acknowledged"; exception for countries outside EU/EFTA/candidates. **Re-verified 2026-11-25.** No UK data taken from Eurostat | **clear** |
| ONS | 3 | Open Government Licence v3.0 | **clear** |
| World Bank WDI | 11 (+3 in WORLD-02 data) | **CC BY 4.0 for every series**, checked indicator by indicator in the API metadata (2026-11-25); none is a third-party restricted series | **clear** |
| OECD | 8 | CC BY 4.0 is the default for OECD content since 1 July 2024, but the *data* section of the terms says data "may be subject to restrictions". oecd.org blocks automated reading | **confirm** (W5-L3) |
| Ministry of Treasury and Finance (debt) | 1 | Reuse with reference; commercial use not addressed | **restricted** (W5-L2) |
| Court of Accounts | 1 | No terms | **restricted** (W3-L1) |
| Natural Earth (geometry, all builds) | — | Public domain | **clear** |

OECD supplies **Türkiye's taxes** as well as the UK's government accounts. A one-minute manual reading of the [OECD Terms and Conditions](https://www.oecd.org/en/about/terms-conditions.html) "Data" section in a browser is therefore needed before any public release.

### 2.2 Packages

| Package | `distributable` | Restricted sources | Attribution notice file |
|---|---|---|---|
| `1.0.0-draft.1` | **field missing** | Court of Accounts, Treasury debt | none |
| `1.0.0-draft.2` | `false` | Court of Accounts, Treasury debt | none |

- **Every value-bearing file is derived from all sources:** `scenario.json`, `world-spec.json`, `week1.session.json`, `provenance.json` and `calibration-report.json`. Neither draft can be distributed, and both stay restricted review drafts.
- **draft.1 has no `distributable` field.** Public packaging must treat a missing flag as `false`. WORLD-04 already keeps both drafts out of the public build.
- **A distributable version needs a `NOTICE.md`.** It would list the required attribution statements (Eurostat, ONS OGL v3, World Bank CC BY 4.0, OECD, Natural Earth courtesy credit) and state that values were transformed. That is required by CC BY 4.0 and OGL v3. Specified in [WORLD-05-SCENARIO-SPEC.md](WORLD-05-SCENARIO-SPEC.md) §3.

---

## 3. Türkiye's military inputs (Rule W)

**Rule W (approved D3):** divisions = round(defence compensation of employees ÷ the country's own average pay ÷ X), with X = 25,000 (still provisional, M-2). Computed by `python3 docs/world/tools/world05_military.py`, which also reproduces the five existing draft.2 counts exactly.

| 2023 | Value | Source | Licence |
|---|---:|---|---|
| Defence personnel spending | 122,046 m TRY | Central government budget outturn, function × economic type, December cumulative ("Savunma Hizmetleri" × "Personel Giderleri") | Ministry: **not verified** |
| State social security contributions (employer) | 18,014 m TRY | same table ("Sosyal Güvenlik Kurumlarına Ödemeler") | Ministry: **not verified** |
| **Defence pay** | **140,060 m TRY** | sum (the budget equivalent of ESA D1) | |
| Whole-economy compensation of employees | 7,755,515 m TRY | Eurostat `nama_10_gdp` D1 (TurkStat data) | **verified** |
| Employees | 22,566.7 thousand | Eurostat `lfsa_eegan2`, age 15+ (Labour Force Survey) | **verified** |
| Average pay | 343.67 thousand TRY | ratio | |
| **Personnel equivalents → divisions** | **407,542 → 16** | Rule W, X = 25,000 | |
| Cross-check, Rule P (PPP spending, Y = 4.65 bn intl $) | 13 | General government defence by function, 447,072 m TRY (Ministry GFS) at the WDI PPP | |

**Substitutions that need approval (decision M-3):**
1. **Central government budget (cash) instead of general government COFOG 02 × D1 (ESA).** Defence is a central government function. The budget's defence total (336,910 m TRY) is below the GFS total (447,072 m TRY) mainly because of extra-budgetary procurement, which is not pay.
2. **Labour Force Survey employees instead of national-accounts employees.** Eurostat has no national-accounts employee count for Türkiye.
3. **The Ministry table's licence is unverified (W5-L1).** Values stay in the review data file until route A or B clears them.

**Limitation (unchanged from WORLD-02):** Rule W counts pay, so conscripts, who are paid far less than the average wage, are under-represented. Türkiye is the only country of the six with conscription in 2023. Its 16 divisions are close to France and Italy (15), although its real forces are larger. A correction would need licensed personnel data, and the open candidate (NATO's annual report) has unverified terms.

---

## 4. Division placement proposal (decision P-1)

Full proposal with both variants and per-frontier totals: [`data/world05-military-proposal.json`](data/world05-military-proposal.json). Specification for the next package: [WORLD-05-SCENARIO-SPEC.md](WORLD-05-SCENARIO-SPEC.md) §1.

**Rule P-1 (recommended).** It follows WORLD-01's "simple rule, near the capital and border provinces, labelled illustrative":
1. A country's **reachable** provinces are those in its main land-movement area. Islands without a movement link get **no division**: sea links are not army paths (S-1), so a division there could never leave.
2. Each reachable province gets **one division**, so no province can be taken by walking into it on the first turn.
3. The remaining divisions follow **population**, with provinces on a frontier with another playable country **weighted double** (largest-remainder rounding, deterministic tie-breaks). **P-0** is the same without the frontier weight.
4. Every division has the same manpower (25,000 personnel equivalents). Placement is **illustrative**, not a real order of battle.

| Country | Total | P-1 placement (province = divisions) |
|---|---:|---|
| France | 15 | NE 3 · IDF 2 · OUE 2 · NAQ 2 · ARA 2 · SE 2 · CEN 1 · OCC 1 · **COR 0** |
| Germany | 13 | NRW 2 · NOR 2 · MIT 2 · BW 2 · MO 2 · NO 2 · BY 1 |
| United Kingdom | 14 | NTH 3 · SE 3 · LON 2 · MID 2 · SW 2 · SCO 1 · WLS 1 · **NIR 0** |
| Italy | 15 | NO 6 · CEN 3 · NE 3 · SUD 3 · **SIC 0** · **SAR 0** |
| Poland | 13 | MAZ 2 · POL 2 · PN 2 · PZA 2 · PDZ 2 · WSC 2 · CEN 1 |
| Türkiye | 16 (proposed) | IST 2 · MAR 2 · EGE 2 · AKD 2 · BAN 2 · GDA 2 · KAR 2 · DOG 1 · OAN 1 |
| **Total** | **86** | |

**Frontier balance** (divisions on each side of every land frontier between playable countries):

| Frontier | P-1 | P-0 |
|---|---|---|
| Germany – France | 4 – 3 | 4 – 2 |
| Germany – Poland | 4 – 4 | 3 – 4 |
| France – Italy | 4 – 6 | 3 – 4 |

Note: under P-1 France holds 4 divisions on its Italian frontier (ARA 2, SE 2) against Italy's 6 in Nord-Ovest. Italy has only one frontier and four reachable provinces, so the frontier weight concentrates its army. P-0 is more even there; P-1 is more even on the two German frontiers.

**Balance findings for the owner (decision P-2):**
- **Only one theatre exists.** Land movement connects France (8 provinces), Germany (7), Italy (4) and Poland (7): 26 provinces and 56 divisions.
- **The UK (7 reachable provinces, 14 divisions) and Türkiye (9, 16) can never fight anyone.** The Channel link is not a movement link, and Türkiye's land neighbours are simulated countries without military. That is **30 of 86 divisions**.
- **Corsica, Northern Ireland, Sicily and Sardinia can neither be reached nor defended.**
- **Possible remedies are game-rule changes, not data:** a Channel Tunnel movement link, naval transport, or military for selected neighbours. They are listed for a future decision and **not proposed here**.

---

## 5. Scenario packages

- **No new package was built, because every input change depends on an open decision:**
  - the Turkish source and licence route (W5-L1/L2);
  - the deficit concept (W5-F1);
  - X (M-2) and Türkiye's method (M-3);
  - the placement rule (P-1).

  Building `1.0.0-draft.3` now would fix choices that belong to the owner, and it would still not be distributable.
- **`1.0.0-draft.1` and `1.0.0-draft.2` are unchanged** and were re-validated (§7).
- **The build plan for `1.0.0-draft.3` is in [WORLD-05-SCENARIO-SPEC.md](WORLD-05-SCENARIO-SPEC.md) §4,** once the decisions are made: new source snapshots, recalibration in `final` mode, the validator, save compatibility, the 156-week reference and stress runs, benchmarks, and the iPhone thresholds.

---

## 6. Exposure of restricted data in the public repository

### 6.1 Facts

| Item | Finding |
|---|---|
| Repository | Public; 0 forks and 0 stars (GitHub API, 2026-11-25) |
| What is exposed | **10 aggregate figures** from the Court of Accounts report and **1** debt figure (`scenarios/europe-2023/sources/tr_*.json`, with source URL and the PDF's SHA-256); values derived from them in `scenarios/europe-2023/build/{inputs,budget,financing}.json`, both packages (`scenario.json`, `provenance.json`, `world-spec.json`, `week1.session.json`, `calibration-report.json`, `validation-report.json`) and quoted figures in `docs/world/WORLD-03-FINAL-REPORT.md` and the package `REPORT.md` files |
| Not exposed | **No source document (PDF or spreadsheet) was ever committed**, in any branch or commit. The public GitHub Pages build (1,047 files) contains no scenario package and no Turkish figure |
| Since | First pushed on 2026-11-22 (WORLD-03, `28ead75`); on `main` since 2026-11-23. Also in the PR branches and refs of PRs #33–#36 |
| Nature and risk | Aggregate statistical facts, which are not protected as a work (Law 5846 Art. 6(11)). They are a small extract from a database whose substantial-part right is unlikely to be engaged. They come from public official statistics. **Low legal risk in the repository; the real exposure is a future commercial release built on them** |

### 6.2 Remediation options (none rewrites history or changes visibility)

| Option | Effect | Cost | Recommendation |
|---|---|---|---|
| **R1. Written permission** (route A, covering past publication and future distribution) | Resolves the past exposure and the release blocker | One letter; response time unknown | **Do first** |
| **R2. Supersede** with a licence-clean `1.0.0-draft.3`; keep draft.1/draft.2 as restricted review drafts outside every public build (already the case) | Stops new dependence on restricted data | Part of the draft.3 work | **Do** |
| R3. Forward-only removal of the restricted snapshots and derived build files from `main` | The files leave the current tree but stay in history, so the effect is small. The immutable packages would remain, and deleting them would break exact-version saves | Low | Only if the rights holder asks |
| R4. History rewrite and GitHub cache purge *(owner decision; not done)* | Removes the data from GitHub's history but not from existing clones; changes every SHA cited in PRs #31–#36 and the reports | High, disruptive | Only on a takedown request |
| R5. Make the repository private *(owner decision; not done)* | Stops new public access; past copies remain. **GitHub Pages on a private repository needs a paid plan, so the public fictional game could stop being served** | Medium | Not recommended |

---

## 7. Verification

| Check | Result |
|---|---|
| `world05_licence_audit.py` | 38 snapshots: 28 clear, 8 confirm, 2 restricted. No problems: no UK data from Eurostat, and every cited source resolves |
| `world05_military.py` | Reproduces draft.2's counts for all five countries exactly (the script stops if not). Türkiye 16; total 86 |
| Determinism | Both offline tools give byte-identical output under five different Python hash seeds |
| `world05_turkiye_inputs.py` | Re-run end to end (about 15 s): identical values on re-run, matching the manual inspection; workbook SHA-256 `40659ada…` |
| draft.1 / draft.2 validators | 14 pass, 1 warn, 2 fail (documented C3/C4) / 22 pass, 1 warn (Türkiye licence), 0 fail: unchanged |
| WORLD-02 validator | all checks passed |
| Game tests / production build | 156/156 / pass |
| Engine typecheck / engine tests | pass / 218/218 |
| Unchanged versus `main` | both packages, `sources/`, `build/`, `scenarios/pipeline/`, `src/`, `economy-engine/`, `public/`, `.github/`, `STATUS.md`, `TASKS.md`, `package.json` |

## 8. Owner decisions

| ID | Decision | Recommendation |
|---|---|---|
| **W5-L1** | Türkiye fiscal source route: A (Ministry permission), B (TurkStat tables via owner account), C (licence-clean aggregates + estimates) | **A**, with B in parallel; C as fallback |
| **W5-L2** | Türkiye debt: include it in the permission request, or switch to a licence-clean debt source | Include it in A |
| **W5-L3** | Confirm the OECD data terms manually in a browser | Do before any release |
| **W5-F1** | Türkiye deficit concept for draft.3: ESA-like (−4.83% Court of Accounts, −4.48% OECD) or the Ministry's revised GFS (−2.44%) | GFS if A succeeds (newest official vintage, same source as the split); otherwise the OECD balance |
| **M-2** | X = 25,000 personnel equivalents per division | Approve |
| **M-3** | Türkiye by Rule W with the three substitutions in §3 (16 divisions) | Approve, subject to W5-L1 |
| **P-1** | Placement rule: P-1 (frontier-weighted) or P-0 (population only) | P-1 |
| **P-2** | Accept that the UK, Türkiye and four islands cannot engage in v1, or schedule a rule change (Channel link, naval transport, neighbour military) | Accept for v1; decide later |
| **R-1** | Exposure remediation | R1 + R2 |

WORLD-04 (draft PR #36) is unaffected: WORLD-05 changes no file it changes. WORLD-05 entries in `STATUS.md` and `TASKS.md` are deferred so they do not conflict with PR #36, which appends to the same place.

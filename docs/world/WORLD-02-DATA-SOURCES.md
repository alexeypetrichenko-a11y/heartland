# WORLD-02 — Data sources, licences, reference year and mapping to the engine

| | |
|---|---|
| **Scenario** | Roster A: France, Germany, United Kingdom, Italy, Poland, Türkiye |
| **Checked on** | 21–22 November 2026, from this session (dataset queries and licence pages read directly; see the "Status" column) |
| **Status** | Research and data design only. No scenario asset was produced. No economic figure here is used by the game. |

Sources were checked by reading the publisher's own page or by querying its API with small, filtered requests. No bulk download was made. The one file downloaded in full, the ONS mid-2025 population tables (1.0 MB), was read for 12 regional totals.

**Status of each statement:**
- **Verified (primary):** I read the publisher's page or API response myself; quotes are verbatim.
- **Verified (search):** the publisher's page blocks automated access (HTTP 403). The statement comes from a web search of that publisher's own domain and must be confirmed in a browser before ingestion.
- **Not verified:** the host was outside this session's network allowance, or I found no statement.

---

## 1. Licences

| Publisher | Licence / terms (verbatim where quoted) | Bundle derived data in a public repo? | Commercial use | Attribution | Status |
|---|---|---|---|---|---|
| **Natural Earth** ([terms](https://www.naturalearthdata.com/about/terms-of-use/)) | "All versions of Natural Earth raster + vector map data found on this website are in the public domain." "No permission is needed to use Natural Earth." | Yes | Yes ("personal, educational, and commercial purposes") | not required ("Crediting the authors is unnecessary") | Verified (primary) |
| **Eurostat** ([copyright notice](https://ec.europa.eu/eurostat/help/copyright-notice)) | "Reuse of statistical data, metadata, publications, and other dissemination tools published on this website for commercial or non-commercial purposes is authorised provided the source is acknowledged." **Exception:** data "may not be reused for commercial purposes" for "countries other than: Member States of the European Union (EU), Member States of the European Free Trade Association (EFTA), official EU acceding and candidate countries." | Yes, with acknowledgement | **Yes for FR, DE, IT, PL and Türkiye** (a candidate country). **Not for UK data taken from Eurostat** (non-commercial only), so UK figures must come from ONS. | "source is acknowledged" | Verified (primary) |
| **ONS / UK Open Government Licence v3** ([ONS licences](https://www.ons.gov.uk/methodology/geography/licences), [OGL v3](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/)) | "if you wish to use or re-use ONS material, whether commercially or privately, you may do so freely without a specific application for a licence" (OGL). OGL: "exploit the Information commercially and non-commercially". | Yes | Yes | "Source: Office for National Statistics licensed under the Open Government Licence v.3.0"; default "Contains public sector information licensed under the Open Government Licence v3.0." | Verified (primary) |
| **INSEE** (France) ([legal page](https://www.insee.fr/fr/information/2008466)) | Data "sous la Licence Ouverte / Open Licence version 2.0 (Etalab). Cette licence autorise la réutilisation libre, y compris à des fins commerciales" | Yes | Yes | source and date (Licence Ouverte) | Verified (primary) |
| **Destatis** (Germany) ([legal notice](https://www.destatis.de/EN/Service/Legal-Notice/_node.html)) | "Reproduction and distribution, also of parts, are permitted provided that the source is mentioned." Data licence: "Data licence Germany – attribution – version 2.0". | Yes | Yes (dl-de/by-2-0) | source | Verified (primary) |
| **ISTAT** (Italy) ([legal notice](https://www.istat.it/en/legal-notice/)) | "Unless otherwise stated, content on this website is licensed under a Creative Commons License – Attribution – 4.0." "copy and redistribute the material in any medium or format for any purpose, even commercially" | Yes | Yes | CC BY 4.0 | Verified (primary) |
| **Statistics Poland (GUS)** ([copyright](https://stat.gov.pl/copyright/)) | GUS "nie ma zastrzeżeń co do kopiowania plików i stron oraz dokonywania wydruków, w tym do własnych opracowań, pod warunkiem, że będzie podane ich źródło" (no objection to copying, including for one's own work, provided the source is given). Reuse is governed by the 2021 Open Data Act. | Yes, with source | Not stated as restricted (open data act) | source | Verified (primary) for the copyright page; the reuse-conditions page did not load |
| **TurkStat (TÜİK)** ([legal notice](https://www.tuik.gov.tr/Kurumsal/Yasal_Uyari)) | "İnternet sitemizden, yayınlarımızdan veya veri tabanlarımızdan elde edilen verilerin, kaynak gösterilmek suretiyle herhangi bir izine gerek duymaksızın yeniden kullanımı mümkündür." (data may be reused, citing the source, without any permission). "telif hakkı ve diğer her türlü hakkı TÜİK'e aittir" (copyright reserved). | Yes, citing the source (micro-data excluded) | Not stated as restricted | cite TurkStat | Verified (primary) |
| **World Bank** ([dataset terms](https://www.worldbank.org/ext/en/legal/terms-conditions/datasets)) | "Unless specifically labeled otherwise, these Datasets are provided to you under a Creative Commons Attribution 4.0 International License (CC BY 4.0)". "Some datasets and indicators are provided by third parties, and may not be redistributed or reused without the consent of the original data provider". | Yes, for World Bank-owned indicators | Yes (CC BY 4.0) | per metadata | Verified (primary). The API shows that **"Armed forces personnel, total" comes from the IISS *Military Balance*** and **military expenditure from SIPRI**: third-party indicators |
| **World Bank ICP (PPPs)** (WDI indicators `PA.NUS.PPP`, `NY.GDP.MKTP.PP.CD`) | WDI metadata lists the sources as the International Comparison Program (World Bank), the Eurostat PPP Programme and the OECD PPP Programme, and does **not** mark them as third-party series (unlike the SIPRI and IISS ones). The World Bank data catalog lists the ICP 2021 dataset under CC BY 4.0. | Yes | Yes (CC BY 4.0) | "World Bank, International Comparison Program" | Verified (primary) for the WDI metadata; ICP dataset licence verified (search; the catalog host was outside the session allowance) |
| **Exchange rates** | (a) WDI `PA.NUS.FCRF` comes from the **IMF** International Financial Statistics: restricted (see IMF). (b) Eurostat `ert_bil_eur_a` (annual averages of the ECB euro reference rates) falls under the Eurostat notice. The ECB's own reuse terms were not readable from this session. (c) The rate implied by two WDI indicators, `NY.GDP.MKTP.CN` / `NY.GDP.MKTP.CD`, is CC BY 4.0 (World Bank-compiled). | (b) or (c) | (b), (c) yes; (a) no | source | (a), (c) verified (primary, API metadata); (b) Eurostat verified, ECB not verified |
| **OECD** | Content published from 1 July 2024 under CC BY 4.0; earlier content on similar terms; third-party material excluded. | Yes (CC BY 4.0) | Yes | CC BY 4.0 | Verified (search); oecd.org returned HTTP 403 to automated requests |
| **IMF** | Commercial reuse of IMF data requires permission (copyright@imf.org); attribution required. | Non-commercial use only without permission | **Needs permission** | "© IMF" | Verified (search); imf.org returned HTTP 403 |
| **US EIA** ([copyrights and reuse](https://www.eia.gov/about/copyrights_reuse.php)) | "U.S. government publications are in the public domain and are not subject to copyright protection. You may use and/or distribute any of our data". | Yes | Yes | "Source: U.S. Energy Information Administration (date)" | Verified (primary) |
| **FAO / FAOSTAT** ([database terms](https://www.fao.org/contact-us/terms/db-terms-of-use/en/)) | "licensed under the Creative Commons Attribution-4.0 International licence (CC BY 4.0) ... as complemented by the Terms of Use". Additional term: "Datasets shall not be used for or in conjunction with the promotion of a commercial enterprise and/or its product(s) or services". | Yes | **Mostly**, but with an extra restriction on promotional use | prescribed citation format | Verified (primary) |
| **SIPRI** ([terms](https://www.sipri.org/about/terms-and-conditions)) | "Use of SIPRI copyrighted material for commercial purposes must be authorized and will normally require the payment of a reasonable royalty. Unlicensed commercial use of SIPRI material, including SIPRI data, will be deemed to be in breach". Commercial use explicitly includes "websites that generate revenue from online advertising". | Only if the game is non-commercial | **No, without a licence** | clear reference | Verified (primary) |
| **IISS *Military Balance*** (via World Bank WDI) | Third-party data; WDI terms say such data "may not be redistributed or reused without the consent of the original data provider". | **No** (without consent) | No | — | Verified (primary), as a World Bank statement |
| **Wikidata** ([licensing](https://www.wikidata.org/wiki/Wikidata:Licensing)) | "All structured data ... is released into the public domain under Creative Commons Zero". | Yes | Yes | none | Verified (primary) |
| USGS, NGA World Port Index, CEPII BACI, UN Comtrade, OurAirports, NATO | — | — | — | — | **Not verified.** These hosts were outside the session's allowance. None of them is needed for the first version (see the alternatives below). |

**Consequences:**
1. **UK figures must come from ONS (Open Government Licence), not from Eurostat.** Eurostat holds UK data only to 2019, and that data is excluded from commercial reuse.
2. **Military data:**
   - SIPRI and the IISS-sourced World Bank series cannot be bundled for a commercial game without a licence.
   - Open alternatives cover **expenditure**: government spending on defence by function (COFOG GF02) from Eurostat, OECD and ONS, plus TurkStat.
   - No open, licence-verified source for **armed-forces personnel** has yet been confirmed for all six countries. NATO's annual defence-expenditure report (all six are members) is the candidate; its terms are not verified (decision D-M1).
3. **IMF data:** avoid for bundled figures unless permission is obtained. Every IMF series needed has an open equivalent (Eurostat, OECD, ONS, TurkStat).
4. **FAOSTAT** is usable, but its "no promotion of a commercial enterprise" clause should be reviewed if the game is ever commercial. Eurostat crop statistics (EU members and Türkiye) avoid that question.
5. Whether the game is or may become **commercial** decides several of these choices (decision D-L1).

---

## 2. Datasets: coverage and latest year

Latest years were obtained from the Eurostat API (filtered JSON queries), the OECD SDMX availability API and publisher pages on 21–22 November 2026. "—" means the source returned no values for that country.

### 2.1 Eurostat (FR, DE, IT, PL, TR; UK only to 2019)

| Dataset (code) | Variables | Granularity | FR | DE | IT | PL | TR | UK | Missing / notes |
|---|---|---|---|---|---|---|---|---|---|
| `nama_10_gdp` | GDP and components, current prices (B1GQ, CP_MEUR) | national | 2025 | 2025 | 2025 | 2025 | 2025 | — | — |
| `nama_10r_2gdp` | Regional GDP | NUTS 0–2 | 2024 | 2024 | 2024 | 2024 | 2024 | — | — |
| `nama_10r_3gva` | GVA by industry, NACE A*10 (TOTAL, A, B-E, C, F, G-I, J, K, L, M_N, O-Q, R-U); unit CP_MEUR | NUTS 0–3 | **2024 (all 15 series)** | 2023 (2024 total only) | 2023 (2024 partial) | 2023 (2024 total only) | 2024 (all 15 series) | — | NACE A*10 does **not** separate B (mining) from D (energy) and E; C is given separately |
| `nama_10r_3empers` | Employment by industry (EMP, THS) | NUTS 0–3 | 2024 | 2024 | 2024 | 2024 | **—** | — | **No Turkish regional employment** in Eurostat |
| `demo_r_pjanaggr3` | Population on 1 January | NUTS 0–3 | 2025 | 2025 | 2025 | 2025 | 2025 | 2019 | — |
| `gov_10a_exp` | Government expenditure by function (COFOG), incl. GF02 defence | national | 2024 | 2024 | 2024 | 2024 | **—** | — | No TR or UK |
| `gov_10a_taxag` | Taxes and social contributions by type | national | 2025 | 2025 | 2025 | 2025 | — | — | No TR or UK |
| `gov_10dd_edpt1` | Deficit and gross debt (Maastricht) | national | 2025 | 2025 | 2025 | 2025 | — | — | No TR or UK |
| `nrg_bal_c` | Energy balances (primary production etc.) | national | 2024 | 2024 | 2024 | 2024 | 2024 | 2019 | — |
| `apro_cpsh1` | Crop production (harvested production, EU humidity) | national (also NUTS-2) | 2026 (provisional) | — | — | — | — | — | Coverage per country to be checked at extraction |
| `tran_r_net` | Road (motorway) and rail network length | NUTS 2 | 2024 | 2024 | 2024 | 2024 | 2025 | 2018 | — |

### 2.2 OECD (all six, incl. UK and Türkiye)

| Dataflow | Variables | Coverage | Latest year | Notes |
|---|---|---|---|---|
| `OECD.CTP.TPS, DSD_REV_COMP_OECD@DF_RSOECD` (Revenue Statistics) | Tax revenue by type (1100 personal income, 1200 corporate, 2000 social contributions, 5110 general consumption taxes, 5120 excises, etc.) | 41 countries, including all six | **2024** | The single consistent source for tax structure across all six |
| `OECD.SDD.NAD, DSD_NASEC10@DF_TABLE11` (government expenditure by function, COFOG) | COFOG divisions | 42 countries; **Türkiye not included** | 2025 | UK COFOG available here (and from ONS / HM Treasury PESA) |

### 2.3 National sources

| Publisher | Dataset | Latest | Granularity | Notes | Status |
|---|---|---|---|---|---|
| ONS | Regional GDP and balanced GVA by industry, all ITL regions, 1998–2024 (bulletin "Regional economic activity by gross domestic product, UK: 1998 to 2024", released 23 September 2026) | **2024** | ITL1–ITL3 | ONS noted an issue in this release on 13 November 2026; ITL1 "unaffected" | Verified (primary) |
| ONS | Population estimates for the UK, mid-2025 (`mye25tablesuk.xlsx`) | **mid-2025** (30 June) | ITL1 and local authorities | Reference date differs from Eurostat's 1 January | Verified (primary); totals extracted |
| TurkStat | Provincial GDP by economic activity ("İl Bazında Gayrisafi Yurt İçi Hasıla, 2024", bulletin 11 December 2025) | 2024 | province (NUTS-3) | Revised after the 2025 main revision | Verified (search) |
| TurkStat | General government expenditure by function ("Harcamaların Fonksiyonel" table in the general-government accounts) | to be confirmed | national | Needed because Eurostat and OECD COFOG exclude Türkiye | Verified (search) that the table exists; year not confirmed |
| TurkStat | Regional employment (Labour Force Survey, NUTS-2) | to be confirmed | NUTS-2 | Fills the Eurostat gap | Not verified |
| INSEE, Destatis, ISTAT, GUS | Regional detail beyond Eurostat, if needed | — | — | Eurostat already covers FR, DE, IT and PL consistently; national sources only for gaps | Licences verified (§1) |
| EIA | International energy production by fuel | — | national | Public domain; covers all six, including the UK after 2019 | Licence verified |

---

## 3. Reference year

**Recommendation: 2023 for every economic and fiscal value. Population is taken as the 2023 average.**

| Requirement | 2023 | 2024 |
|---|---|---|
| Regional GVA by industry, all six countries | **complete** (Eurostat for FR, DE, IT, PL, TR; ONS for the UK) | incomplete (Germany, Italy and Poland only partial in Eurostat) |
| Regional GDP | complete | complete |
| Regional employment (productivity) | complete for FR, DE, IT, PL and UK; Türkiye from TurkStat (to confirm) | same |
| Tax revenue by type (OECD, all six) | complete | complete |
| Spending by function (COFOG) | EU four (Eurostat), UK (OECD/ONS); Türkiye from TurkStat (to confirm) | EU four only |
| Gross debt | complete (Eurostat for the EU four; ONS; TurkStat or the Treasury for Türkiye, to confirm) | complete |

So 2024 would be more recent, but not consistent across the six countries, and the WORLD-02 brief prefers consistency.

**Reconciliation rules:**
- **Population:** for Eurostat countries, the average of 1 January 2023 and 1 January 2024 approximates the 2023 annual average. For the UK, use the ONS mid-2023 estimate. Both are documented. The province table in `WORLD-02-PROVINCES.md` currently shows **2025** figures only to size the provinces; they are not scenario values.
- **A missing 2023 value for one country:** take the nearest available year (2024 first, then 2022) and scale it to that country's 2023 national total for the same variable. Mark it as an estimate in the provenance file. Never invent a value.
- **Currency:** the owner chose PPP-based calibration (decision D2). §6 gives the exact method:
  - **PPP** for real output;
  - **ratios to GDP in national currency** for taxes, spending and debt;
  - **market rates** only for reference display.

---

## 4. Mapping official data to engine parameters

The engine's inputs per zone are `population`, `technology`, `advantage` (6 broad groups) and `populationGrowth`. Per country (`CountrySpec`), they are three tax rates, four spending shares and debt/GDP. Infrastructure and transport come from lanes. Concepts differ in several places, listed below. Any choice that is not a measurement is marked as a **design choice** or an **estimate**.

### 4.1 Population and productivity

| Engine | Official data | Method | Mismatch / gap |
|---|---|---|---|
| `population` (millions) | Population per province (sum of its NUTS or ITL regions) | Direct sum | Reference dates (Eurostat 1 Jan; ONS mid-year): averaged to 2023 as in §3 |
| `technology` (productivity relative to a reference) | GVA per employed person per province (`nama_10r_3gva` / `nama_10r_3empers`; ONS; TurkStat) | **Fitted** (§5) so that each province's calibrated GVA share matches the data | Türkiye: regional employment needed from TurkStat. Prices: GVA in a single unit via the 2023 conversion rate |
| `populationGrowth` | Recent natural growth plus migration (Eurostat, ONS, TurkStat projections) | 2019–2023 average per country, or zero (design choice) | Optional for 52–156-week games |

### 4.2 Sector advantages

The engine's six broad groups (`food`, `energy`, `materials`, `industrial`, `consumer`, `military`) are spread over its 31 goods by the integration layer. Regional data come as NACE A*10 (Eurostat, ONS, TurkStat):

| NACE A*10 (regional) | Engine group | Notes |
|---|---|---|
| A — agriculture, forestry, fishing | `food` | Food *manufacturing* (C10–C12) sits inside C and cannot be separated at regional level. Estimate: national A*64 share of C10–C12 applied to the region's C |
| B-E minus C — mining, energy, water | `energy` and `materials` | **Gap:** B (mining) and D (electricity, gas) are not separated regionally. Split with national A*64 (`nama_10_a64`) and energy balances (`nrg_bal_c`, EIA). Estimate |
| C — manufacturing | `industrial` (and part of `food`, `consumer`) | Split of C by national A*64 shares. Estimate |
| G-I, J, K, L, M_N, R-U — services | `consumer` (household-facing goods and services) | The engine has one services sector; the six groups only steer goods. Design choice |
| O-Q — public administration, education, health | no group (government demand) | Absorbed by the engine's government purchases. Design choice |
| — | `military` | **No NACE equivalent at regional level** (weapons are in C25 and C30). Use a uniform low baseline, scaled per country by defence equipment spending (COFOG GF02 × equipment share). Estimate; or set no advantage. Decision D-E3 |

`advantage` is relative (1 = average). It is computed as the province's group share of GVA divided by the six-country average share, capped at a documented range (for example 0.1–4).

### 4.3 Resource ceilings

| Engine | Data | Method |
|---|---|---|
| Resource-based goods (crops, energy, ores) per zone, with a ceiling `resourceCap` = starting capacity × `resourceHeadroom` | National primary production by fuel (`nrg_bal_c` for EU and TR; EIA for all six), crop production (Eurostat, FAOSTAT), regional split by the region's B-E-minus-C or A share | `resourceHeadroom` = engine default unless a documented reserves figure exists (rarely available). Estimate |

### 4.4 Taxes: statutory rates, effective rates, bases and GDP

The engine's taxes are **effective rates on engine bases**:

| Engine rate | Engine base | Official numerator (OECD Revenue Statistics 2023) | Official denominator (national accounts 2023) |
|---|---|---|---|
| `taxIncome` | wages and dividends paid to households | 1100 personal income taxes **+ (decision D-E4) 2000 social security contributions** | compensation of employees (D1) + distributed income of corporations received by households (D42) |
| `taxConsumption` | household purchases | 5110 general taxes on goods and services (VAT) + 5120 taxes on specific goods (excises) | household final consumption expenditure (P31), net of those taxes, because the engine adds the tax to the price |
| `taxCorporate` | positive firm profits | 1200 corporate income taxes | gross operating surplus of corporations (B2G of S11 + S12), net of depreciation where available |

**Mismatches to keep in view:**
- **Statutory ≠ effective.** For example, a 25% corporate rate is not the 25% the engine needs. Using statutory rates would overstate revenue severalfold. Only effective rates computed as above are valid inputs.
- **Social security contributions.** These are a large share of revenue in all six countries (the exact share comes from OECD Revenue Statistics category 2000 at extraction) and have no engine counterpart. Leaving them out understates revenue; adding them to `taxIncome` raises the effective rate on wages. Decision D-E4.
- **Other taxes** (property, payroll, wealth, tariffs) are not in the engine's three rates. They are either folded into `taxConsumption` (design choice) or accepted as missing. Their share is reported.
- **Calibrating to GDP** is not enough: matching the engine's tax/GDP ratio to the official ratio is a **check**, not the rate itself.

### 4.5 The four government spending categories

The engine's categories are shares of GDP: `administration` (government purchases of goods), `social` (cash transfers to households), `military` (35% pay, 65% goods), `infrastructure` (public investment goods). A purely functional (COFOG) mapping mixes cash and in-kind spending, so the proposal combines COFOG with economic transactions (ESA 2010):

| Engine | Proposed official measure (2023) | Source |
|---|---|---|
| `social` | social benefits other than in kind (D62): pensions, unemployment benefits, family allowances | Eurostat `gov_10a_main`; ONS; TurkStat; OECD |
| `military` | COFOG GF02 defence, total expenditure | Eurostat `gov_10a_exp`; OECD Table 11 / ONS for the UK; TurkStat for Türkiye |
| `infrastructure` | general-government gross fixed capital formation (P51G) excluding defence | Eurostat `gov_10a_main` / COFOG-by-transaction; equivalents elsewhere |
| `administration` | final consumption expenditure of general government (P3), excluding defence, with in-kind social transfers (D632) included as purchases | Eurostat `gov_10a_main`; equivalents elsewhere |

Interest is not a spending input; the engine computes it from debt. Subsidies and other transfers have no category; their share is reported (design choice D-E5).

### 4.6 Public debt

| Engine | Official measure | Source | Mismatch |
|---|---|---|---|
| `debtToGdp` (multiple of yearly GDP) | General-government gross debt, Maastricht definition, end-2023 | Eurostat `gov_10dd_edpt1` (EU four); ONS "UK government debt and deficit" (Maastricht basis, OGL); TurkStat or the Ministry of Treasury and Finance (EU-defined general-government debt), to confirm | Use the same Maastricht definition for all six; the UK's headline "public sector net debt" is a different concept and must **not** be used. Debt holders (domestic or foreign) are assigned by the engine's home-bias rule, not by data (design choice) |

### 4.7 Infrastructure and transport

| Engine | Proposal |
|---|---|
| `zone.infrastructure` index (1 = normal) | Start every zone at **1** (neutral) in version 1. Optionally, a later version could derive relative values from motorway and rail density (`tran_r_net`, ONS / DfT for the UK). Design choice |
| Lane distances | Great-circle distance between province population-weighted centroids. Weights are NUTS-3 populations (Eurostat) at Natural Earth polygon centroids (public domain); one documented scale converts kilometres to engine distance units. No new dataset |
| Sea links | Curated list in [`data/world02-sea-links.json`](data/world02-sea-links.json) (`WORLD-02-PROVINCES.md` §2.1): Channel (fixed link), Corsica (D1), Irish Sea, Strait of Messina, Tyrrhenian, Aegean, North Sea. The Bosporus and Dardanelles are inside TUR-IST / TUR-MAR. The current API gives every link a road of fixed length 0.8 that is also an army path (decision S-1). Port presence from the Natural Earth **ports** layer (public domain) or Eurostat maritime port statistics; the NGA World Port Index licence is not verified |
| Capacities | Uniform in version 1 (as the fictional scenario today) |

---

## 5. Calibration method, tolerances and reporting

1. **Inputs:** only the measured values above, each with a provenance record (source, dataset, table code, reference year, access date, licence, transformation). Estimates carry their method.
2. **Fitting.** The world builder already makes the starting state a resting point. An offline loop adjusts `technology` per province, and the `advantage` scaling, until:

   | Target | Tolerance |
   |---|---|
   | Each province's share of its country's GVA | within ±3% relative |
   | Each country's GDP relative to the six-country total | within ±3% |
   | Each province's group shares | within ±5 percentage points |
   | Tax/GDP, spending/GDP by category and debt/GDP per country | within ±1 percentage point |

3. **No invented parameters.** If a target can't be met within tolerance, the residual is reported and the case goes to the owner. Engine formulas are never tuned for a scenario, and no country parameter is set "to make it pass".
4. **Report.** A calibration report lists every target, value, residual and estimate, and the share of revenue and spending that falls outside the engine's categories (§4.4–4.5).
5. **Behaviour checks.** The ECON-06/07 strategy suite and the 52/104/156-week horizon checks run on the calibrated world before any release.

---

## 6. Currency, purchasing power and the engine's accounting unit (owner decision D2)

### 6.1 What the engine does with money (measured)

- **One shared money unit.** The engine has no national currencies or exchange rates ("R36 not yet implemented": `economy-engine/INTEGRATION_API.md`, `MILESTONE_2.md`). Every price, wage, tax, debt and trade flow is in that one unit.
- **Money conservation** is tested every run (`economy-engine/tests/conservation.test.ts`, and the 520-week credit test). The unit is never converted while the game runs, so any conversion happens **once, offline, before the world is built**, and cannot break conservation.
- **Price levels barely differ between countries.** A synthetic experiment (`economy-engine/sim/world02-price-levels.ts`) builds four countries that are identical except for productivity, runs 104 weeks and compares GDP at current and constant prices:

| Country | Technology | GDP per person, current prices | GDP per person, constant prices | Price level (current / constant) | Real GDP per person relative to A |
|---|---:|---:|---:|---:|---:|
| A | 1 | 0.5473 | 0.6502 | 0.842 | 1.00 |
| B | 1.5 | 0.8589 | 0.9702 | 0.885 | 1.49 |
| C | 2 | 1.1669 | 1.2931 | 0.902 | 1.99 |
| D | 3 | 1.7961 | 1.9406 | 0.926 | 2.98 |

A **threefold** productivity gap produces only a **10%** gap in price levels (0.842 vs 0.926). Real output follows productivity almost exactly.

The real-world gap is much larger. In 2023 Türkiye's price level was 41% of Germany's (World Bank) or 39% (Eurostat). The engine cannot reproduce market-exchange-rate price differences. **Its money behaves like a common purchasing-power unit,** so PPP is the consistent choice for real quantities.

### 6.2 Verified 2023 data (extract: [`data/world02-ppp-fx-2023.json`](data/world02-ppp-fx-2023.json); table: `python3 docs/world/tools/world02_ppp.py`)

| 2023 | GDP, national currency (bn) | GDP at market rates (US$ bn) | GDP at PPP (intl $ bn) | PPP factor (LCU per intl $) | Exchange rate (LCU per US$) | Price level (PPP / rate) | Share of the six, market | Share of the six, PPP | PPP / market share |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| France | 2,827 | 3,056 | 4,166 | 0.6785 | 0.9248 | 0.734 | 20.0% | 17.8% | 0.89 |
| Germany | 4,219 | 4,562 | 6,019 | 0.7011 | 0.9248 | 0.758 | 29.8% | 25.7% | 0.86 |
| United Kingdom | 2,752 | 3,421 | 4,165 | 0.6607 | 0.8045 | 0.821 | 22.3% | 17.8% | 0.80 |
| Italy | 2,143 | 2,317 | 3,560 | 0.6019 | 0.9248 | 0.651 | 15.1% | 15.2% | 1.01 |
| Poland | 3,415 | 812 | 1,778 | 1.9205 | 4.2037 | 0.457 | 5.3% | 7.6% | 1.43 |
| Türkiye | 27,091 | 1,141 | 3,686 | 7.3503 | 23.7386 | 0.310 | 7.5% | 15.8% | 2.12 |
| **Six together** | | **15,310** | **23,374** | | | | | | |

**Sources:**
- **World Bank WDI API**, last updated 11 November 2026: `NY.GDP.MKTP.CN`, `NY.GDP.MKTP.CD`, `NY.GDP.MKTP.PP.CD`, `PA.NUS.PPP`.
- **Exchange rate:** implied by `NY.GDP.MKTP.CN` / `NY.GDP.MKTP.CD`. It is identical to the IMF-sourced `PA.NUS.FCRF` (shown only to compare).

**Checks (run by the script):**
- **Consistency:** WDI's PPP GDP equals GDP in national currency divided by the PPP factor, within 0.2%, for all six.
- **Cross-source agreement:** price levels relative to Germany agree with Eurostat's 2023 price level indices (`prc_ppp_ind`, updated 10 July 2025) to within 1% for five countries, and 3.9% for Türkiye.
- **Exchange-rate cross-check:** Eurostat's 2023 annual averages (`ert_bil_eur_a`: USD 1.0813, GBP 0.86979, PLN 4.542, TRY 25.7597 per euro) give the same rates to within 0.4%. Türkiye's ECB-based rate is 23.82 against WDI's 23.74.

**What it changes.**
- **Türkiye.** At PPP its economy is about **Italy's size** (15.8% vs 15.2% of the six). At market rates it is **half** that (7.5%).
- **Poland** rises from 5.3% to 7.6%.
- **The UK, Germany and France** fall by 2–4 points.

Türkiye's exchange rate moved strongly during 2023, a year of very high inflation. A market-rate figure therefore depends on the averaging period: the annual average (23.74 TRY per US$) differs from any single month. PPP does not have this problem.

### 6.3 Method (exact and auditable)

| Quantity | Real-world concept | Conversion into the engine | Why |
|---|---|---|---|
| **Real production and domestic purchasing power**: province output, the productivity used to fit `technology`, household consumption volumes | GVA in national currency, 2023 (Eurostat `nama_10r_3gva`; ONS; TurkStat) | **Divide by the country's 2023 PPP factor** (`PA.NUS.PPP`, LCU per international $). One factor per country. No official regional price levels exist, so every province of a country uses the national factor | The engine's money is a common purchasing-power unit (§6.1) |
| **Engine common accounting unit** | — | **1 engine unit = the engine's own output at base prices.** The calibration fits `technology` so that each zone's share of the scenario's GDP at constant prices matches its share of the PPP-converted GVA (tolerances §5). One documented scale factor `s` (engine units per international $) is recorded in the provenance file. No other conversion exists | Keeps the engine's absolute numbers in their tested range |
| **Nominal government finances**: tax rates, spending shares, debt, treasury | Revenue/GDP, spending/GDP, debt/GDP, all in national currency, 2023 | **Ratios only.** They are the same whichever currency is used. The engine applies them to its own GDP (effective tax rates §4.4, spending shares §4.5, debt/GDP §4.6) | Ratios avoid any currency choice and keep the fiscal burden realistic |
| **International trade prices and external purchasing power** | Imports and exports / GDP (national accounts, current prices) | **Ratio targets used as a check** (within the §5 tolerances where the engine allows). Trade happens at engine prices in one currency | See the limitation below |
| **Market-rate values**: GDP in US$, exchange rates | `NY.GDP.MKTP.CD`; WDI-implied rate | **Not fed to the engine.** Static reference shown on country cards with year and source (for example "GDP 2023 at market exchange rates: US$1,141 bn — World Bank") | Players expect familiar headline figures |

**Formulas.**

For zone *z* in country *c*:

- PPP-converted output: `V_z = GVA_z(LCU) / PPP_c`.
- Calibration target: `GDPreal_z / Σ GDPreal = V_z / Σ V`.
- Scale factor: `s = Σ GDPreal / Σ V`.

For country *c*:

- Fiscal inputs: `rate_c = revenue_c(LCU) / base_c(LCU)` and `share_c = spending_c(LCU) / GDP_c(LCU)`.
- Starting debt: `debt_c = (debt_c(LCU) / GDP_c(LCU)) × GDPnominal_c(engine)`.

Every value comes from one national-accounts vintage per country. For example, Eurostat's 2023 GDP for Türkiye is 26,546 bn TRY against WDI's 27,091 bn. Mixing vintages would create a 2% inconsistency.

**Limitation (not solvable without a new mechanic): external purchasing power.**

In reality, a low price level means a weak currency abroad. Türkiye pays for imported energy and machinery at world prices, which are expensive relative to its domestic prices. The engine has one currency and nearly uniform price levels, so it cannot represent this. With PPP calibration, Türkiye, Poland and Italy can import more cheaply than in reality.

The smallest mitigations within approved scope:
1. Calibrate trade **openness as a ratio** (above) rather than in levels.
2. Report the residual.

Representing exchange rates properly means national currencies (R36), a major mechanic. It is not proposed. **No formula was changed.**

---

## 7. Abstract military forces from open defence expenditure (owner decision D3)

### 7.1 Verified 2023 data (extract: [`data/world02-defence-cofog-2023.json`](data/world02-defence-cofog-2023.json))

**Facts:**
- **COFOG division 02 (Defence), general government, by economic transaction.** The source is OECD Table 11 (`OECD.SDD.NAD,DSD_NASEC10@DF_TABLE11`). For France, Germany, Italy and Poland it is identical to Eurostat `gov_10a_exp`.
- **Whole-economy compensation of employees and number of employees:**
  - Eurostat `nama_10_gdp` and `nama_10_a10_e` for France, Germany, Italy and Poland;
  - OECD national accounts tables 1 and 3 for the UK, which also cross-check France.
- **Türkiye** is in neither COFOG-by-transaction dataset, and has no employee count in either.

**Candidate Turkish sources, not verified:**
- the Court of Accounts' 2023 general-government fiscal statistics report and its table set;
- the Ministry of National Defence's 2023 annual report.

Their licence and coverage are not verified.

### 7.2 Two transparent rules (`python3 docs/world/tools/world02_military.py`)

**Rule W (wage-equivalent personnel):**
- `average pay = whole-economy compensation of employees / employees`
- `personnel equivalents = defence compensation of employees (COFOG 02, D1) / average pay`
- `divisions = round(personnel equivalents / X)`

**Rule P (PPP spending):**
- `divisions = round(defence total expenditure / PPP factor / Y)`

| 2023 | Defence % GDP (COFOG) | Pay / purchases / investment, % of defence | Average pay per employee (thousand LCU) | Personnel equivalents (thousand) | Spending, bn intl $ (PPP) | Spending, bn US$ (market) | Share: personnel / PPP / market | **Divisions W** / P / market |
|---|---:|---|---:|---:|---:|---:|---|---|
| France | 1.81% | 40 / 38 / 19 | 53.73 | 382 | 75.4 | 55.3 | 22.0 / 23.3 / 23.7% | **15** / 16 / 17 |
| Germany | 1.25% | 32 / 39 / 16 | 52.97 | 318 | 75.2 | 57.0 | 18.3 / 23.2 / 24.4% | **13** / 16 / 17 |
| United Kingdom | 2.20% | 27 / 40 / 33 | 46.24 | 358 | 91.8 | 75.4 | 20.6 / 28.4 / 32.4% | **14** / 20 / 23 |
| Italy | 1.19% | 58 / 9 / 28 | 41.07 | 363 | 42.4 | 27.6 | 20.9 / 13.1 / 11.8% | **15** / 9 / 8 |
| Poland | 2.18% | 41 / 20 / 30 | 95.55 | 318 | 38.8 | 17.7 | 18.3 / 12.0 / 7.6% | **13** / 8 / 5 |
| Türkiye | — | — | — | — | — | — | — | **gap** (no open data) |

**Assumptions (not data):**
- **X = 25 thousand personnel equivalents per division.** This is a game scale.
- **Y = 4.65 bn international $ per division.** It is chosen only so that rule P has the same total, 70 divisions, as rule W.
- **Placement** of divisions in provinces is illustrative and a game decision.

**High-wage bias, and how to avoid it.** At market exchange rates, the same spending buys far fewer soldiers in a high-wage country than in a low-wage one, so ranking by spending overstates rich countries. In the table:
- the UK gets 23 divisions at market rates but 14 by personnel;
- Poland gets 5 at market rates but 13 by personnel.

How each rule deals with it:
- **PPP** removes the general price-level difference but not the different mix of pay and equipment.
- **Rule W** divides each country's defence pay by its **own** average pay. Its result is independent of wage levels and close to a headcount.

**Recommendation:**
- Rule W for the number of divisions.
- Rule P as a published cross-check.
- Never market rates.

**Limitations:**
1. **Conscription.** Conscripts earn far less than the average wage, so Rule W undercounts them. Türkiye has conscription (and has no data); none of the five others did in 2023. The undercount cannot be corrected without personnel data, and the open personnel sources are restricted (IISS) or unverified (NATO).
2. **Definitions.**
   - COFOG 02 excludes military pensions, and its coverage of paramilitary forces differs by country.
   - It records equipment when delivered.
   - It is not NATO's definition, so the shares above are not NATO's "% of GDP" figures.
   - Italy's very low purchases share (9%) probably reflects how Italy records defence spending across transactions. It was not investigated; check it before calibration.
3. **Current mechanics.**
   - A game division has only `manpower` (`src/game/models.ts`: "no equipment, morale or supply simulation").
   - The engine's military spending does not create, maintain or pay for divisions.
   - The engine splits military spending in fixed proportions (35% pay, 65% goods) for every country, whereas the real pay share is 27–58%.

   So the formula can set only the **starting number of divisions per country** (with uniform manpower per division). Equipment intensity, upkeep and readiness would need new mechanics. **None is proposed.**

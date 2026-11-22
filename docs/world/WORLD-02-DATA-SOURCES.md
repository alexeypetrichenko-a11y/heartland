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
- **Currency:** convert national currencies (GBP, PLN, TRY) to the engine's single illustrative unit through one documented rate per country for 2023. Market or PPP rates are decision D-E2. Türkiye's very high 2023 inflation makes the choice and the averaging period important.

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
| Sea links | Curated: Channel (GBR-SE–FRA-NE, fixed link), Irish Sea (GBR-NIR), Strait of Messina (ITA-SIC), Tyrrhenian (ITA-SAR), Bosporus and Dardanelles (inside TUR-IST / TUR-MAR), Aegean and Mediterranean waypoints. Port presence from the Natural Earth **ports** layer (public domain) or Eurostat maritime port statistics; the NGA World Port Index licence is not verified |
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

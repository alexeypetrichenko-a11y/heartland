# WORLD-01 — Real-World Scenario Architecture

| | |
|---|---|
| **Type** | Research, architecture and planning only. No production code, data import or gameplay change. |
| **Branch** | `docs/world-01-architecture`, from `main` at `fde1c90` (SAVE-01 merged) |
| **Depends on** | ECON-07 (PR #29, approved, awaiting merge): the economic calibration a real-world scenario would use. GAME-UX-01 (Codex, in progress) is not touched. |
| **Relates to** | `TASKS.md` **T27** ("Replace the fictional test map stepwise with vetted modern-world data. Ask for a decision about disputed territories and scope before importing.") This document is the design study T27 needs before any import. |
| **Status** | Waiting for owner decisions (§11). Nothing is selected or implemented. |

---

## 1. Summary

**Recommendation.** Build the real-world scenario as a **data package** that feeds the systems that already exist, rather than a new engine or a national-only model:
- the Natural Earth globe and its region IDs;
- the regional economic engine;
- the weekly turn;
- the SAVE-01 save system.

It rests on six principles:

1. **Three region layers, one identifier chain.** Natural Earth **admin-1 units** (4,596 worldwide; already on the globe) are grouped into curated **provinces**, the game's regions. Each province is one **economic zone** in the engine.
   - **Example:** France's 101 departments become roughly 13 provinces.
   - **Why not more:** the engine's weekly cost grows roughly with the square of the number of zones (§8), so a playable country needs about 5–8 provinces, not 50–200.
2. **Three tiers of countries.**
   - **Six playable countries** are simulated region by region.
   - **About 8–15 simulated countries**, the neighbours and major partners, are one zone each and run by the AI autopilot.
   - **Every other entity** stays on the globe as a **passive geographic entity**, grouped economically into **4–6 rest-of-world blocs**. The world looks complete, and the simulation stays affordable on an iPhone.
3. **Everything numeric comes from cited data.**
   - Each figure in the package carries a provenance record: source, table, year and licence.
   - Where a value has to be estimated (for example, a region's sector mix where only national data exist), the estimation method is recorded and marked as an estimate.
   - Nothing is invented.
4. **The scenario is built offline into immutable, versioned assets.** These are a pre-built week-1 economy, like the fictional `fictional-week1.economy.json`, plus province geometry and the scenario manifest.
   - The phone never builds or calibrates a world.
   - It loads these assets lazily, only when a real-world game starts.
5. **The scenario changes no rules.** It uses the existing engine, turn and save mechanics. Integration gaps, such as passing fiscal starting values, transport distances, rest-of-world blocs and scenario-aware saves, are listed as small API extensions, each needing approval (§6.4).
6. **Small milestones** (§10) lead from "choose a real country on the globe" to military operations. Each has acceptance criteria and an iPhone performance check.

Two main rosters (§4) are proposed for decision, plus a higher-risk third:

| Roster | Countries |
|---|---|
| **A, Europe and Mediterranean** | France, Germany, United Kingdom, Italy, Poland, Turkey |
| **B, Americas** | United States, Canada, Mexico, Brazil, Argentina, Colombia |
| **C, higher risk** | Eastern Europe (§4.4) |

I make no final selection.

---

## 2. What exists today (review)

### 2.1 Where each concept lives

| Concept | Game (`src/game`) | Economic engine (`economy-engine/`) | Geography (`src/geography`, `public/geography`) |
|---|---|---|---|
| **Country** | `Country {id, name, controller}`; three fictional countries | `CountrySpec`: taxes, spending shares, debt/GDP, stability, tariff, reserves. Integration passes only `id`, `name` | 258 Natural Earth admin-0 entities, `ne:admin0:<ADM0_A3>`, with NE source codes, ISO codes and Wikidata IDs; catalogue and per-country geometry |
| **Region** | `Region {id, name, ownerId, adjacentRegionIds}`; six fictional regions | One **zone** per region: `population`, `technology`, `populationGrowth`, `advantage` over six broad goods (`RegionProfile`), resource ceilings, infrastructure index, wages, prices, households, firms | 4,596 admin-1 records, `ne:admin1:<ne_id>`, with `iso_3166_2`, `region` attribute, `wikidataid`; geometry chunked and loaded lazily |
| **Population** | none | `zone.population`, growth, ceiling, labour participation | not imported (source fields deliberately excluded) |
| **Production** | none | 31 goods in 10 sectors; firm aggregates per zone × sector × ownership (private, mixed, public) × productivity tier | none |
| **Resources** | none | resource-based goods with per-zone ceilings (`resourceCap`), `advantage`, `resourceHeadroom` | none |
| **Infrastructure** | none | `zone.infrastructure` index (1 = normal, up to 1.8), driven by infrastructure spending; raises productivity | Map toolbar has disabled layers for roads, rail, ports, airports, cities and bunkers (no data) |
| **Transport** | adjacency only | lanes between zones and **waypoints** (straits, sea junctions): distance, cost multiplier, throughput, capacity. Requisition by itinerary (M4). The integration layer currently makes one road lane per adjacency at a fixed distance of 0.8 | none |
| **Public finance** | none (decision A1: engine is the only economy) | treasury, debt, bonds by holder zone, market rate, central bank, defaults (ECON-07), seven fiscal controls (INT-02) | none |
| **Trade** | none | interconnected regional markets; tariffs, sanctions, reserves (commands exist; no game UI yet; AI does not use them) | none |
| **Diplomacy** | `Relation` score (−100…+100) per pair; public and private messages; offers; rule-based AI (T08) | none | none |
| **Military** | `Division {ownerId, regionId, manpower, order}`; move, attack, defend; deterministic combat; capture (T07) | military spending (35% pay, 65% goods), arms stock, procurement, mobilisation, **occupation** (capture = economic occupation), transport requisition | division markers drawn at illustrative anchors |
| **Saves** | SAVE-01: IndexedDB envelope (format 1, SHA-256) holding `game`, `economy` (the full `saveEconomySession` text), drafts. Validation **assumes the fictional scenario** (`createInitialState()`) | session save (format v2) holding the engine state (v5, or v6 after ECON-07) and a `worldFingerprint` of the game world and profiles | — |

### 2.2 Coupling points that matter for a real-world scenario

- **World fingerprint.** `worldFingerprint(world, profiles)` binds an economy save to its game world (countries, regions, adjacency, profiles). A real scenario gets its own fingerprint: saves can't be mixed across scenarios. This is good, and it is already in place.
- **Pre-built starting economy.** `startEconomyFromSave` is generic: any scenario can ship its own week-1 save, checked against its world fingerprint. This is essential for performance (§8).
- **Integration inputs are fictional-sized.**
  - `worldSpecFromGame` passes only names and the four `RegionProfile` fields.
  - Every country starts with the engine's default fiscal policy and debt.
  - Every adjacency is the same 0.8-length road, with no sea lanes or waypoints.

  A real scenario needs these as data (§6.4).
- **Every engine country must own game regions.** `validateGameWorld` rejects a country without a region. Simulated countries and rest-of-world blocs therefore need either game regions of their own, or an explicit "engine-only country" concept (decision D7).
- **SAVE-01 is fictional-only.** `saveFormat.ts` validates against `createInitialState()` and `worldFingerprint(scenario)`. SAVE-01's own documentation says "Future schema or scenario changes may require a migration." A real scenario therefore needs a scenario identifier in the save envelope and scenario-aware validation (Codex's area, §6.5).
- **Geography is ready for joining.** Admin-1 records carry ISO 3166-2 codes, a parent `region` attribute (for example 18 French regions, 20 Italian, 16 UK statistical regions, 4 US Census regions) and a Wikidata ID. These are enough to build an auditable crosswalk to official statistical regions without new geometry.

### 2.3 Natural Earth admin-1 counts for the candidate countries

These come from the repository's existing region indexes:

| Country | Admin-1 units | Country | Admin-1 units | Country | Admin-1 units |
|---|---:|---|---:|---|---:|
| France | 101 | United States | 51 | Ukraine | 25 |
| Germany | 16 | Canada | 13 | Russia | 86 |
| United Kingdom | 232 | Mexico | 33 | Romania | 42 |
| Italy | 110 | Brazil | 27 | Japan | 47 |
| Spain | 52 | Argentina | 24 | South Korea | 17 |
| Poland | 16 | Colombia | 34 | China | 32 |
| Turkey | 81 | Kazakhstan | 16 | India | 36 |

These are display and selection units. Natural Earth mixes administrative levels; for example, the United Kingdom's 232 are counties and unitary authorities. These counts are **not** the number of economic zones (§3.1).

---

## 3. Real-world scenario model

### 3.1 Three region layers and one identifier chain

```
Natural Earth admin-1 unit          (display, tap target; 4,596 worldwide; unchanged)
   ne:admin1:1159308481  "Haute-Corse"
        │   belongs to exactly one          (curated crosswalk, versioned data)
        ▼
Province = game region              (ownership, divisions, diplomacy, region sheet)
   FRA-COR  "Corse"
        │   is exactly one                  (1:1 for playable countries)
        ▼
Economic zone                       (engine: population, firms, prices, wages, transport node)
   zone FRA-COR
```

- **Province IDs.** These are `<ISO3>-<code>`. Codes follow the official statistical region where one exists (§5, D2), for example the NUTS or ITL code, or a US Census division. Province IDs never collide with country IDs, as the integration layer requires.
- **Crosswalk.** A data file lists, for each province, its admin-1 members. A validator checks:
  - every admin-1 unit of a playable country is in exactly one province;
  - every province is non-empty;
  - adjacency is symmetric.

  Units Natural Earth flags as fragments or stand-ins are attached to the nearest province by an explicit rule, never silently dropped.
- **Province geometry.** At build time, admin-1 polygons are **dissolved** into province outlines: one asset per playable country. The globe keeps admin-1 tap targets for inspection; the region sheet shows the province. Natural Earth's own geometry and IDs are unchanged.
- **Adjacency.** Computed at build time from shared admin-1 boundaries, with a tolerance, because some admin-1 coasts differ from the admin-0 outline. Sea links come from a curated list. The result is reviewed by hand and stored in the package. It is not computed at run time.
- **Granularity target** (decision D3): **5–8 provinces per playable country**, about 30–48 zones in total.
  - Larger or very regional countries, such as the US, Brazil and Turkey, go to the upper end.
  - Countries with weak regional data go to the lower end.
  - Overseas and non-contiguous areas (Alaska, Hawaii, French overseas regions, Canary Islands and others) are either their own small provinces connected by sea lanes, or excluded from the playable territory and shown as passive (decision D6).

### 3.2 Population and economic production

For each province (zone), the package provides:

| Field | Meaning in the engine | Derived from |
|---|---|---|
| `population` | zone population (millions) | official regional population (§5 D3) |
| `technology` | productivity relative to the reference economy | regional GDP or GVA per worker relative to a reference. It is **fitted** so that the calibrated starting zone GDP matches the data within a tolerance (§7) |
| `advantage` (6 broad groups) | relative strength in food, energy, materials, industrial, consumer, military goods | regional GVA by sector (NACE/NAICS A*10 or similar), mapped to the engine's six groups; resource production for energy and materials |
| `resourceHeadroom` | room to expand resource sectors | resource-production data and reserves; default if no data (marked as an estimate) |
| `populationGrowth` | yearly growth | official projections (UN WPP nationally; regional where available) |

**Money units.** The engine uses one shared illustrative unit, with no national currencies (R36 is not implemented). The package needs a stated scale. The proposal is that one engine unit equals a fixed amount of **PPP-adjusted or market-rate US dollars per week** (decision D9). The scale only affects display labels; the simulation is scale-free.

### 3.3 Public finances and debt

Each country gets these starting values. The engine already has the fields (`CountrySpec`); the integration layer must pass them (§6.4).

| Engine field | Data |
|---|---|
| `taxIncome`, `taxConsumption`, `taxCorporate` | **Effective** rates: revenue from that tax divided by its base, from OECD Revenue Statistics or Eurostat tax data. The engine's rates are effective rates, not statutory ones. |
| `spendAdministration`, `spendSocial`, `spendMilitary`, `spendInfrastructure` (shares of GDP) | General-government expenditure by function (COFOG): social protection, health and education → social; defence → military; economic affairs/transport (gross fixed capital formation) → infrastructure; the rest → administration. The mapping is documented and approved (decision D10). |
| `debtToGdp` | general-government gross debt (IMF WEO or Eurostat) |
| `stability` | **not data.** A neutral common start (for example the engine default) unless the owner approves a source and method (D11). Using real political indices would be a design choice, not a measurement. |

Central-bank policy rates start from the engine's rule, not from real rates (no new mechanic).

### 3.4 Sectors and resources

- The engine's **10 sectors and 31 goods** stay as they are (`GAME_DESIGN.md` §17 item 1 leaves the catalogue open; no change is proposed).
- Regional sector shares (GVA by industry) set the zone's `advantage`. National resource output, by commodity (oil, gas, coal, metals, food crops), is split across provinces by the regional production data where they exist, otherwise by sector GVA. The split method is recorded.
- Strategic reserves start at the engine default (zero target), not at real stockpiles, which are rarely public.

### 3.5 Trade and transport infrastructure

**Land lanes.** One lane per adjacent province pair.
- **Distance:** the great-circle distance between province **population-weighted centroids**, or geometric centroids if population grids are not used, converted to engine units by one documented scale.
- **Capacity class:** from road and rail density (Eurostat regional transport for Europe, national sources elsewhere). The first playable version may use distance only, as the fictional scenario does today (decision D8).

**Sea lanes and waypoints.** The engine already supports waypoints.
- **Waypoints:** a small curated set of sea junctions and chokepoints relevant to the roster. Examples: Dover Strait, Gibraltar, the Turkish Straits and Suez for roster A; Panama and the Caribbean for roster B.
- **Lanes:** coastal provinces with a major port connect to the nearest waypoint.
- **Port presence:** taken from the World Port Index.

**Trade calibration.** The engine creates trade from prices and transport costs; nothing scripts it. Bilateral trade data (BACI) are used only to **check** the calibrated starting trade pattern: who buys energy from whom, and the openness ratio. They are not imposed.

**Strategic points** (cities, ports, airports; `GAME_DESIGN.md` §4) come later, as point layers from Natural Earth populated places, the World Port Index and OurAirports. That fills the toolbar's disabled layers; no new mechanic is needed for display.

### 3.6 Military forces

The game's military model is deliberately abstract (T07: divisions with manpower; `GAME_DESIGN.md` §17 item 3 leaves force sizes and the combat model open). The proposal:
- **Starting forces per country** use **abstract divisions**. Their number and total manpower scale from public figures for active armed-forces personnel, and optionally from military expenditure, using a formula the owner approves (decision D12). Divisions are placed in provinces by a simple rule, for example near the capital and border provinces, and labelled **illustrative**.
- **No real orders of battle and no real base locations.** The detailed sources (IISS *Military Balance*) are proprietary, and the game's force model is not ready for them.
- **Military spending** comes from the fiscal data above (SIPRI or COFOG defence). It already drives the engine's arms stock and procurement.
- **Neutral start without active wars,** as `GAME_DESIGN.md` §2 requires. No current conflict is reproduced.

### 3.7 Diplomatic relationships

`GAME_DESIGN.md` §2 says initial relations are "simplified". Options for decision D13:

1. **All neutral** (0), as in the fictional scenario. Simplest, and makes no political statements.
2. **Neutral, plus a small positive score between members of the same alliance or union** (NATO, the EU, USMCA, Mercosur), from published membership lists. The membership lists are facts; the score values are a design choice.

Option 2 requires the owner to approve each grouping and value. I recommend option 1 for the first playable milestone.

### 3.8 Disputed territories

Natural Earth uses a **de facto** default viewpoint. For example, its admin-1 records for Crimea and Sevastopol reference `RUS`. Taiwan, Kosovo, Northern Cyprus, Western Sahara and others carry their own source classifications. A real scenario **must not** silently settle these, under both `GAME_DESIGN.md` §2 and T27. Decision D5 needs a written policy. Options:
- keep Natural Earth's de facto assignment;
- mark disputed units as neutral and passive (unowned, not playable);
- exclude them from the playable area.

The choice of roster changes how many disputes are involved (§4).

---

## 4. Initial six-country roster

### 4.1 Selection criteria

| Criterion | Why it matters |
|---|---|
| **Geographic proximity** | Countries must share land or short sea borders for trade, diplomacy and, later, military interaction to matter. |
| **Economic diversity** | Different sector structures (energy, food, industry, services) give real trade dependencies in the engine's regional markets. |
| **Military diversity** | Different force sizes and spending levels make military choices meaningful later. |
| **Trade dependencies** | Imports of energy, food or industrial goods create leverage and vulnerability. |
| **Diplomatic choices** | Alliances, rivalries and neutral players. |
| **Data availability and licence** | Official regional statistics (sector GVA, population, public finance) under reusable licences. |
| **Disputes and sensitivity** | Fewer contested borders and active conflicts make a neutral start easier to defend. |
| **iPhone performance** | Admin-1 detail, number of provinces, and the number of simulated neighbours needed around the roster. |

### 4.2 Roster A — Europe and Mediterranean: France, Germany, United Kingdom, Italy, Poland, Turkey

| Aspect | Assessment |
|---|---|
| **Geography** | One connected theatre: land borders (FR–DE, FR–IT, DE–PL) plus short sea links (UK across the Channel; Turkey across the Mediterranean and Aegean, with Greece and Bulgaria as simulated neighbours). |
| **Economic diversity** | Large industrial economies (DE, IT), agriculture and services (FR), finance and services (UK), manufacturing in transition (PL), and an emerging industrial economy at an energy transit crossroads (TR). Weak point: **no large energy exporter in the roster.** Energy then comes from simulated countries or rest-of-world blocs (Norway, Russia, Middle East, North Africa), which itself creates a meaningful external dependency. |
| **Military diversity** | Two nuclear-armed powers with global reach (FR, UK), a large land army (TR), a fast-growing army (PL), and two economies with modest forces (DE, IT). Most are alliance partners, which makes a neutral start credible but war scenarios less natural. |
| **Diplomacy** | A mix of EU members (FR, DE, IT, PL), a former member (UK) and a candidate with its own regional agenda (TR). |
| **Data** | **Best available.** Eurostat regional accounts (NUTS) cover FR, DE, IT and PL. ONS (ITL regions) covers the UK, and is not in Eurostat after its EU exit. TurkStat publishes regional (İBBS/NUTS-equivalent) accounts. OECD regional data cover all six. All reusable with attribution (verify each, §5). |
| **Provinces** | Natural Earth admin-1 is fine-grained (FR 101, UK 232, IT 110, TR 81), but the `region` attribute and NUTS-1 groupings give natural provinces: FR 13 metropolitan, IT 5 macro-regions or 20 regions, UK 12 ITL1 regions, DE 16 Länder, PL 7 macroregions, TR 12 NUTS-1 regions. **About 36–45 zones** after grouping, plus about 8–12 simulated neighbours (Spain, Benelux, Switzerland, Austria, Czechia, the Nordics, Greece, Bulgaria, Romania, Ukraine, Russia, the Middle East and North Africa). |
| **Disputes** | Few inside the roster. Turkey involves Cyprus and Northern Cyprus, and Aegean questions with Greece (simulated). Ukraine and Russia as simulated neighbours bring the Crimea question into the scenario (D5). |
| **Risks** | Turkey's eastern neighbours (Syria, Iraq, Iran) are in active or recent conflict; as simulated or passive entities they need careful neutral treatment. The roster contains no major hydrocarbon producer. |

### 4.3 Roster B — Americas: United States, Canada, Mexico, Brazil, Argentina, Colombia

| Aspect | Assessment |
|---|---|
| **Geography** | Two land clusters joined by sea lanes (Caribbean, Panama): North America (US–CA–MX, contiguous) and South America (BR–AR, BR–CO). |
| **Economic diversity** | **Excellent.** A large advanced economy (US); resources and energy (CA); manufacturing integrated with the US (MX); agriculture and mining (BR); agriculture and shale energy (AR); oil and agricultural exports (CO). |
| **Military diversity** | **Very unequal.** The US dominates. `GAME_DESIGN.md` §2 allows unequal starts with an informational warning. The other five have regionally significant but much smaller forces. |
| **Diplomacy** | USMCA in the north and Mercosur in the south (BR, AR; CO is an associate). Few hostile relationships, so interesting choices come from trade and resources rather than security. |
| **Data** | **Very good and mostly public domain or open.** US BEA and Census are public domain. Statistics Canada uses the Statistics Canada Open Licence. INEGI (Mexico), IBGE (Brazil), INDEC (Argentina) and DANE (Colombia) all publish regional accounts; their licences need verifying. |
| **Provinces** | US 9 Census divisions (from 51 states), Canada about 5–6 (Atlantic, Quebec, Ontario, Prairies, BC, North), Mexico about 5–6 macro-regions, Brazil 5 official macro-regions, Argentina about 5–6, Colombia about 5–6. **About 35–40 zones**, plus a few simulated neighbours: Venezuela, Peru, Chile, Central America and the Caribbean bloc. |
| **Disputes** | Few. Falklands/Malvinas (UK-administered; passive in this roster; the Argentina–UK claim must be handled under D5). Some smaller maritime questions. |
| **Risks** | Geographically large: long lanes and two separate theatres reduce interaction between the clusters. The US's weight may dominate the gameplay. Natural Earth admin-1 counts are moderate (51, 13, 33, 27, 24, 34), which is convenient. |

### 4.4 Roster C (higher risk, for comparison) — Eastern Europe and Black Sea: Germany, Poland, Ukraine, Romania, Turkey, Russia

| Aspect | Assessment |
|---|---|
| **Strengths** | Strong strategic interaction: an energy exporter (RU), agriculture (UA, RO), industry (DE, PL), and a transit and maritime power (TR). Rich diplomatic choices. |
| **Why higher risk** | This is the region of a current war. A neutral start "without active wars" would contradict present reality and could read as a political statement. The disputed territories (Crimea, other occupied regions) are central, not peripheral. Recent Ukrainian regional data are incomplete because of the war, and Russian regional data have availability and licensing uncertainty. Russia's 86 admin-1 units and its size raise the province and performance burden. |
| **Recommendation** | Not for the first playable milestone. Possibly later, after the owner sets the disputed-territory policy. |

### 4.5 Comparison

| | A: Europe and Mediterranean | B: Americas | C: Eastern Europe and Black Sea |
|---|---|---|---|
| Interaction density | high, one theatre | medium, two theatres | very high |
| Economic diversity | good (energy external) | excellent | excellent |
| Military balance | balanced, mostly allies | dominated by the US | tense |
| Data quality and licences | best (Eurostat, ONS, OECD) | very good (US PD, CA open) | weak in places |
| Disputes and sensitivity | low inside, moderate around | low | high |
| Estimated zones (playable + simulated + blocs) | about 50–60 | about 45–50 | about 50–60 |
| Natural Earth province work | high (UK 232, IT 110, FR 101, TR 81) but well structured by the `region` attribute | moderate | moderate (RU 86) |

**Owner decision D1:** choose A, B, C or another set. Mixed rosters, such as a "transatlantic" set, are possible, but they spread the countries over two theatres.

---

## 5. Non-playable countries

| Tier | Who | Simulation | Map | Player interaction |
|---|---|---|---|---|
| **P: Playable** | the six chosen countries | full regional economy: 5–8 zones each, fiscal controls, divisions, diplomacy. AI-controlled when not chosen by the player. | provinces, region sheets, divisions | everything the game offers |
| **S: Simulated** | about 8–15 neighbours and major trading partners of the roster | **one economic zone each** (national aggregate), run by the engine's fiscal autopilot. A diplomatic relation with every country. No divisions, or one static "defence strength" figure for display only (D7) | country outline, a simple card with economic indicators from the simulation | trade (prices, tariffs and sanctions when exposed), diplomacy (statements, cooperation) |
| **R: Rest-of-world blocs** | 4–6 aggregates (for example "Rest of Europe", "Middle East and North Africa", "Sub-Saharan Africa", "Asia-Pacific", "Americas" or "Rest of the world", depending on the roster) | one zone each, representing the world market for trade. Fiscal autopilot. | not drawn as one shape: their member countries are passive entities on the globe | trade only, through prices |
| **G: Passive geographic entities** | all remaining Natural Earth entities (258 in total, less the above) | **none** | always visible on the globe with their real outline and name | an informational card with **static reference indicators** (population, GDP) from one cited snapshot (World Bank WDI), labelled with source and year and "not simulated in this scenario" |

So the world is never empty: every country on the globe is selectable and shows real reference data, but only about 20 entities are simulated.

**Promotion path.** A passive country can later become simulated (tier S) or playable (tier P) by adding its data to the package. Nothing in the architecture limits the roster to six.

**Engine representation of S and R.** Each is an engine country with one zone. Today the game requires every engine country to own a game region (§2.2). Two options for decision D7:
- **(a)** Give each a single game region equal to its whole territory: simple and consistent, but they appear as "countries with one region" in the game state.
- **(b)** Add an explicit "engine-only country" concept to the integration API: a small extension, approved separately.

---

## 6. Data architecture

### 6.1 Principles

- **No fabricated data.** Every number in the scenario package has a provenance record:
  - source, dataset and table code;
  - reference year and retrieval date;
  - licence and transformation.
- **Estimates are labelled.** An estimate records its method (for example "regional sector shares unavailable: national shares used"). Reports list every estimate, so the owner can see what is measured and what is assumed.
- **Small inputs.** Only aggregated tables are needed: dozens to hundreds of rows per country. No massive datasets are downloaded. Raw extracts stay out of the repository unless their licence allows redistribution. The package ships only derived figures with attribution.
- **One base year.** The whole scenario uses one reference year, the latest year complete for all six countries; for example 2023 (decision D4). It is a snapshot, not a live feed: no runtime fetching, which keeps the game offline-capable and deterministic.

### 6.2 Minimum datasets for a first playable real-world scenario

Licence notes reflect my current understanding. **Every licence must be verified against the publisher's terms before ingestion** (the first task of milestone W2). The status column says how confident I am.

| # | Dataset | Required fields | Geographic level | Candidate source(s) | Update frequency | Licence (status) | Known gaps | Calibration or estimation |
|---|---|---|---|---|---|---|---|---|
| **D-1** | Boundaries and IDs | admin-0 and admin-1 geometry, ISO and Wikidata codes | admin-0, admin-1 | **Natural Earth 5.1.1** (already in the repository, pinned commit) | rare (years) | Public domain (verified in MAP-01A) | Mixed admin levels; de facto viewpoint; Goiás geometry invalid; some coasts differ from admin-0 | none; dissolve into provinces at build time |
| **D-2** | Admin-1 → province crosswalk | admin-1 `ne_id` → province ID; province → official statistical code | admin-1 → province | Built from the Natural Earth `region` attribute, ISO 3166-2, **Wikidata** (statistical-region identifiers such as NUTS codes) and official definitions (Eurostat NUTS, ONS ITL, US Census regions and divisions, national macro-regions) | with each NUTS or official revision (about every 3 years) | Wikidata CC0 (high confidence); Eurostat reuse with acknowledgement (high); ONS Open Government Licence (high); US Census public domain (high) | Natural Earth fragments and stand-ins; NUTS boundaries may not align exactly with Natural Earth admin-1 (for example France's departments versus NUTS-3) | hand-reviewed table with a validator; every non-trivial assignment documented |
| **D-3** | Population | population by province; growth rate | province (admin-1 or statistical region) | Eurostat regional demography (NUTS-2/3); ONS; TurkStat; US Census; Statistics Canada; INEGI; IBGE; INDEC; DANE. Fallback: **UN WPP** national totals | yearly | Eurostat (high); ONS OGL (high); US Census public domain (high); StatCan Open Licence (high); UN WPP CC BY 3.0 IGO (high); national offices in Latin America and Turkey (**verify**) | Different reference dates between countries | sum statistical regions to provinces; no gridded-population download needed |
| **D-4** | Regional output and sector structure | GDP or GVA by province; GVA by about 10 industries; employment by industry (for productivity) | province | Eurostat regional accounts (GVA by NACE A*10, NUTS-2/3); ONS regional GVA (ITL); TurkStat regional GVA; US BEA GDP by state and industry; StatCan provincial GDP by industry; INEGI, IBGE, INDEC, DANE regional accounts; **OECD Regional Database** (TL2/TL3) as a cross-check | yearly, 1–2 year lag | Eurostat (high); BEA public domain (high); OECD CC BY 4.0 since 2024 (**verify**); others (**verify**) | Sector detail is sometimes suppressed for small regions; Latin American regional accounts are less granular; inconsistencies between national and regional totals | map industries to the engine's six broad groups (documented table). Fit `technology` and `advantage` so the calibrated week-1 economy matches regional GDP shares and sector mixes within tolerance (§7) |
| **D-5** | Public finance | general-government revenue by tax type, spending by function (COFOG), gross debt | country | **IMF WEO / GFS**; **Eurostat** government finance (by function); **OECD Revenue Statistics** (taxes by type) | yearly | IMF terms permit reuse with attribution (**verify**, including any commercial-use limit); Eurostat (high); OECD CC BY 4.0 (**verify**) | Effective tax rates must be derived; COFOG by function is less detailed outside the OECD and EU | effective rates = revenue / tax base; COFOG to engine categories (D10) |
| **D-6** | Resources and energy | production of oil, gas, coal, key metals and crops by country; regional split where available | country, then province | **US EIA** international data (public domain); **USGS** Mineral Commodity Summaries and Yearbooks (public domain); **FAOSTAT** crops; Eurostat regional agriculture | yearly | EIA and USGS public domain (high); FAOSTAT licence (**verify**: FAO database terms have changed over time) | Regional resource splits are often unavailable | split national output by regional sector GVA where no regional data exist (labelled estimate) |
| **D-7** | Trade (validation only) | bilateral trade by broad product group between roster countries, simulated countries and blocs | country pairs | **CEPII BACI** (HS-level, reconciled); alternative: OECD or WTO aggregates. **Avoid shipping UN Comtrade bulk data.** | yearly | BACI Etalab Open Licence 2.0 (**verify**); UN Comtrade terms restrict bulk redistribution (fairly confident, **verify**) | No data on trade between provinces | not imposed: used to check the calibrated trade pattern and openness |
| **D-8** | Transport | land adjacency; port presence; road and rail density (optional); sea junctions | province; points | Computed from D-1 geometry (adjacency, centroids); **NGA World Port Index** (public domain); **OurAirports** (public domain, later); Eurostat regional transport networks (road and rail length, NUTS-2); **OpenStreetMap** only if detailed networks are later needed | rare | WPI and OurAirports public domain (high); OSM **ODbL** (high confidence; share-alike applies to derived databases, so avoid unless approved) | Capacities are not directly measured anywhere | distances by a documented geodesic rule; capacities as a few classes from density (or uniform in the first version) |
| **D-9** | Military | active personnel, military expenditure | country | **SIPRI** Military Expenditure Database; **World Bank WDI** armed-forces personnel (originally from IISS) | yearly | SIPRI terms (**verify**: I believe free for non-commercial use with attribution); WDI CC BY 4.0 overall, but third-party indicators may carry the original source's restrictions (**verify**); IISS *Military Balance* is proprietary (**do not use**) | No public, licensable order-of-battle or base-location data | abstract divisions scaled by an approved formula (D12) |
| **D-10** | Diplomacy baseline | country pairs; optional alliance memberships | country pairs | none needed for option 1 (all neutral). For option 2: official membership lists (NATO, EU, USMCA, Mercosur), or Wikidata (CC0) | rare | factual lists (high) | — | owner-approved score values |
| **D-11** | Reference indicators for passive countries | population, GDP, GDP per head | country | **World Bank WDI** | yearly | CC BY 4.0 (high) | Missing values for some small territories (show "not available", never estimate) | none (display only, labelled with source and year) |
| **D-12** | Cities (later, for strategic points) | name, position, population class | point | Natural Earth populated places (public domain); GeoNames (CC BY 4.0) | rare | high | — | none |

### 6.3 Scenario package (proposed structure)

All data is static and built offline; the game loads it lazily:

```
public/scenarios/<scenario-id>/<version>/
  manifest.json            id, version, base year, Natural Earth pin, roster, tiers, licences, attributions
  provinces.json           provinces, admin-1 members, names, capital, coastal flag, adjacency, sea links
  provinces-<ISO3>.geojson dissolved province outlines (one per playable country)
  world.json               engine inputs: zones (population, technology, advantage, headroom),
                           countries (fiscal start, debt), lanes and waypoints
  game.json                game start state: countries, regions = provinces, relations, divisions
  week1.economy.json       pre-built week-1 economy (startEconomyFromSave), fingerprinted
  reference.json           tier-G reference indicators (WDI snapshot)
  provenance.json          source, table, year, licence and method for every value
  calibration-report.md    targets vs calibrated starting values, estimates listed
```

- **Build tool** (Node, offline, deterministic): validate inputs → build the world → calibrate → run checks → write the pre-built week-1 economy. A scenario version is **immutable** once published, so saved games can always find the data they were started with (§6.5).
- **Placement:** in `public/` (static assets, like the geography) or `economy-engine/scenarios/` (like today's starting save). Decision for W3.

### 6.4 Integration API extensions needed

These are small and additive, each needing approval in its milestone. No change to economic rules.

| Extension | Why | Where |
|---|---|---|
| Pass country fiscal starting values and debt (`CountrySpec` fields) from the scenario | real starting taxes, spending and debt | `worldSpecFromGame` (engine integration) |
| Pass lane distances, sea lanes and waypoints from the scenario | real geography of trade | `worldSpecFromGame` |
| Pass `resourceHeadroom` | resource-rich regions | `RegionProfile` |
| Engine-only countries (tiers S and R) **or** single-region countries | §5 option (b) or (a) | `validateGameWorld` (option b only) |
| Fingerprint includes the new inputs | saves bound to the exact scenario version | `worldFingerprint` |

### 6.5 Saves

- **SAVE-01 envelope.** Add `scenarioId` and `scenarioVersion` in a new **format 2** (Codex's area). Format-1 saves are the fictional scenario and keep loading (migration: implicit `scenarioId: 'fictional'`).
- **Restore.** Load the scenario manifest for `scenarioId@version`, rebuild the game-world reference used by the validation (today hard-coded to `createInitialState()`), then check the economy's world fingerprint against it. Corruption protection (SHA-256, single-transaction writes) is unchanged.
- **Data updates.** A new data version is a **new scenario version**. Old saves keep their version, because the assets are immutable and retained. Only an explicit, owner-approved migration may move an old save to new data. This follows the ECON-07 principle: no silent change to an existing player's economy.

---

## 7. Calibration

The engine's world builder already turns zone inputs into a resting-point economy: it calibrates wages, efficiencies and prices. For real data, the package adds one **fitting loop** at build time, offline:
1. **Targets:** zone GDP shares within each country, national GDP ratios between countries, zone sector mixes, and fiscal shares and debt.
2. **Adjust:** `technology` per zone and `advantage` per zone and group, then rebuild, until targets are met within a tolerance (proposal: ±5% for GDP shares, ±5 points for sector shares).
3. **Report:** each target, the calibrated value and the residual. Failures block the release.
4. **Check against the engine's behaviour:** the ECON-06 and ECON-07 strategy suite and the horizon checks (52/104/156 weeks) run on the real scenario before release, to catch scenario-specific instability.

Things calibration must **not** do: invent values to close gaps, or tune the engine's formulas. If a target can't be met, it is reported as a model limitation.

---

## 8. Performance

### 8.1 Measured today

| Item | Figure | Source |
|---|---|---|
| Fictional scenario, 6 zones: one week | about 1.5 ms (Node); about 9 ms at 6× CPU throttling | `reports/INTEGRATION_BENCHMARK.md` |
| Engine scaling (31 goods; 2 zones per country) | 11 zones: 3 ms per week; 30 zones: 11.6 ms; 60 zones: 36 ms; 120 zones: 139 ms. Building the world from scratch: 1.3 s / 3.8 s / 11 s / 39 s. Save: 565 KB / 1.0 MB / 1.9 MB / 3.8 MB | `reports/BENCHMARK.md` (Milestone 1 figures; **must be re-measured on the current engine**) |
| Where the time goes at 60 zones | 75% in market clearing (zone-to-zone trade), which grows about with the square of the zone count | `reports/BENCHMARK.md` |
| Globe start | the atlas makes no admin-1 or economy requests at start-up; region geometry is chunked (at most 4 chunks, 1.2 MB per view) | `docs/geography/ADMIN_REGIONS.md` |
| Starting from a pre-built save | about 1.6 ms (Node) / 7.5 ms (6× throttle) for the fictional save | `INTEGRATION_API.md` |

### 8.2 Estimates for a real scenario

These are **unverified extrapolations from Milestone-1 figures**, to be measured in W2:

| Item | Roster with about 50–60 zones |
|---|---|
| One weekly turn | about 30–40 ms in Node; about 0.2–0.3 s at 6× throttling. That is acceptable for a weekly turn, but it must be measured on a physical iPhone. |
| Building the world on the phone | 10+ s on desktop, so **not acceptable**. The pre-built week-1 save is mandatory. |
| Week-1 save size | about 2 MB raw (about 0.8 MB gzip), loaded lazily |
| Game save (SAVE-01) after 156 weeks | a few MB (history grows), in IndexedDB. SHA-256 and JSON on the phone are probably tens of ms (measure). |
| Province geometry | dissolved outlines for 6 countries; target below 1 MB in total |
| Scenario package total, lazily loaded | target below 4 MB raw |

### 8.3 Major risks and mitigations

| Risk | Mitigation |
|---|---|
| **Market clearing grows with zones²** | Cap the scenario at about 60 zones, set by measurement. Simulated countries are one zone each, and blocs aggregate the rest. If needed later, a separately approved engine optimisation could limit trade search to nearby zones plus blocs; that is an engine change, not part of this scenario work. |
| **World building cost** | pre-built immutable week-1 save per scenario version (as today) |
| **Save size and write time on iPhone** | measure; if needed, the engine's history tiers can be shortened through configuration; SAVE-01 writes stay one transaction |
| **Memory in Safari** | the engine's typed arrays scale with zones × goods (about 60 × 31 lines) and zones² (trade matrix 3,600 cells), which is small. Geometry stays chunked. Target a game heap well below 200 MB (measure). |
| **Startup regression** | real-world data loads only after "Start real-world game"; the globe's first screen stays unchanged (already tested in SAVE-01's checks) |
| **Offline and PWA** | all assets static and versioned under the existing base path, so they can be cached by a future service worker; no runtime fetch from data providers |
| **Determinism** | all inputs baked at build time; the engine is already deterministic and forbids non-portable math (hygiene test); fingerprints bind saves to scenario versions |
| **Calibration failures** | blocked at build time with a report, never patched with invented numbers |
| **Data licence surprises** | the licence check is the first task in W2; share-alike (ODbL) and non-commercial sources are avoided unless the owner approves |

---

## 9. Integration plan

| Area | Change | Owner |
|---|---|---|
| Scenario package and build tool | new (data plus a Node script) | Claude (`economy-engine` / scripts) |
| Engine integration extensions (§6.4) | small additive API changes | Claude |
| Province layer on the globe (dissolved outlines, region sheet by province, "Play as" for playable countries) | UI and geography | Codex |
| Game start from a scenario package (`game.json`), scenario chooser | game | Codex |
| SAVE format 2 (`scenarioId`, `scenarioVersion`), scenario-aware validation | game | Codex |
| Reference cards for passive countries (WDI snapshot) | UI | Codex |
| AI for simulated countries | existing fiscal autopilot (no change); game diplomacy AI extended to more countries (existing rules) | Codex / Claude |

The fictional scenario stays available as a test and tutorial world (decision D14).

---

## 10. Phased implementation roadmap

Each milestone is small, testable and separately approved. Every milestone also runs `npm test` and `npm run build`, includes a physical iPhone check where it has user-visible changes, and opens a review-only PR.

| # | Milestone | Delivers | Acceptance criteria |
|---|---|---|---|
| **W2** | Decisions, licences and measured budget (no game code) | Owner decisions D1–D14; licence verification of every chosen source; **re-benchmark** of the current engine at 30/45/60/75 zones in Node, at 6× throttle and on a physical iPhone; a draft admin-1 → province table for the chosen roster | Roster and disputed-territory policy approved in writing. Each source has its licence confirmed (quoted terms) or is replaced. Measured turn time is ≤ 0.5 s on the reference iPhone at the planned zone count, or the zone budget is lowered. |
| **W3** | Scenario package format, validator and build tool | Package schema; validator (crosswalk coverage, adjacency symmetry, provenance completeness, ID rules); deterministic offline build that produces a week-1 economy; a **test package** built from the fictional data to prove the pipeline | Re-running the build gives byte-identical output. The validator rejects each class of error (tested). The fictional test package reproduces today's starting economy fingerprint. No production code path changes. |
| **W4** | Real data ingestion and calibration (no UI) | Extracts and derived tables for the 6 playable, the simulated countries and the blocs; calibration loop; calibration report; provenance for every value; the ECON-06/07 strategy suite and 52/104/156-week horizon checks on the real scenario | Every value has provenance; estimates are listed. Calibration targets are met within the tolerance, or limitations are documented and approved. No conservation or determinism failure. No country collapses in a baseline run. Performance is within the W2 budget. |
| **W5** | **Choose a real country on the globe** (roadmap 1) | Province outlines for the six countries; the country card shows "Playable in *scenario*" or "Not playable in this scenario"; tier-G reference cards with the WDI snapshot | Globe start-up unchanged (no scenario request before the player chooses). Province outlines align with Natural Earth admin-1. Every passive country shows its card with source and year. Tested at 390×844 and 844×390, and on a physical iPhone. |
| **W6** | **Start a real-world scenario** and **view regions and economy** (roadmaps 2–3) | Scenario chooser; game state from `game.json`; economy from the scenario's pre-built save; region sheet shows a province's population, sectors and economy | The scenario starts in a target time measured in W2 (for example < 2 s on the reference iPhone). The world fingerprint matches. The dashboard shows only engine values. The fictional scenario still works. |
| **W7** | **Fiscal decisions** and **weekly turns** (roadmaps 4–5) | INT-02 fiscal controls, and GAME-UX-01's weekly report once merged, on the real scenario | Turn time is within budget; 52 consecutive turns on the iPhone; the economy and game stay on the same week; the ECON-07 calibration applies. |
| **W8** | **Saving and resuming** (roadmap 6) | SAVE format 2 with `scenarioId@version`; migration of format-1 (fictional) saves; scenario-aware validation | Fictional format-1 saves still resume. A real-world save resumes after 1, 52 and 104 turns, with a 20-turn deterministic continuation. A corrupted save is rejected. Write time is measured on the iPhone. |
| **W9** | **Economic and diplomatic interaction with neighbours** (roadmap 7) | Game UI for existing engine trade commands (tariffs, sanctions) if approved; diplomacy with all simulated countries; trade indicators by partner | Uses only existing commands and rules (no new mechanics without approval). Effects are visible in prices and trade; AI responses are deterministic. |
| **W10** | **Military operations** (roadmap 8) | Abstract divisions from the approved formula (D12); placement on provinces; existing move, attack and capture rules on the province graph; occupation in the engine | Neutral start (no active war). Capture → economic occupation as in INT-01. Combat is deterministic. Forces are clearly labelled illustrative. The later stages (strategic points, air, naval) remain separate tasks (T20–T23). |

---

## 11. Decisions requiring owner approval

| # | Decision | Options or recommendation |
|---|---|---|
| **D1** | Six-country roster | A (Europe and Mediterranean), B (Americas), C (Eastern Europe; higher risk), or another set. **No selection made.** |
| **D2** | Province definition rule | Recommended: official first-level statistical regions (NUTS-1/ITL1/Census divisions or national macro-regions), grouped to 5–8 per country |
| **D3** | Zone budget | Recommended: up to about 60 zones in total (to be confirmed by the W2 iPhone measurement) |
| **D4** | Base year of the snapshot | Recommended: the latest year complete for all six countries in all core datasets (likely 2023) |
| **D5** | **Disputed territories policy** (T27, `GAME_DESIGN.md` §2) | Keep Natural Earth's de facto assignment, mark as neutral and passive, or exclude; to be written per case for the chosen roster |
| **D6** | Overseas and non-contiguous territories | own small provinces linked by sea, or passive |
| **D7** | Simulated countries and blocs in the game | (a) single-region countries, or (b) engine-only countries (API extension); and whether simulated countries have any military representation |
| **D8** | Transport detail for the first version | distance-only lanes (as now) vs. capacity classes from network density |
| **D9** | Money unit scale and display | e.g. one engine unit = a fixed amount of PPP or market US dollars per week; labels only |
| **D10** | Mapping of real government spending (COFOG) to the four engine categories | the mapping table in §3.3, to approve or amend |
| **D11** | Starting political stability | neutral common start (recommended) vs. a sourced index |
| **D12** | Military starting forces | an abstract-division formula from personnel and spending; no real order of battle |
| **D13** | Initial diplomatic relations | all neutral (recommended for the first playable version) vs. alliance-based offsets |
| **D14** | Fictional scenario | keep as test and tutorial world (recommended) or retire |
| **D15** | Data licences | approve the verified list; whether share-alike (ODbL) or non-commercial sources are acceptable at all |
| **D16** | Engine scaling work | if W2 measurements exceed the budget: fewer zones (preferred) or a separately approved engine optimisation |

---

## 12. What this document did not do

- **No production code, data files or assets changed.** No dataset was downloaded. The only data read were the existing Natural Earth region indexes in the repository, used to count admin-1 units, and existing benchmark reports.
- **No economic or political figure for any real country is stated** beyond the source availability above. Qualitative descriptions of country characteristics are for roster discussion only and must be confirmed by the data in W4.
- **Licence statements marked "verify" are unconfirmed.** They are not legal advice and must be checked against each publisher's current terms.
- **ECON-07 (PR #29) and Codex's GAME-UX-01 work were not touched.**

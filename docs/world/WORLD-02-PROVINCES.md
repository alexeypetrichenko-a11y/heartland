# WORLD-02 — Province structure, simulated neighbours and rest-of-world blocs

| | |
|---|---|
| **Status** | Draft for owner review, updated after owner decisions D1–D3. No scenario asset. All figures shown are for sizing only. |
| **Machine-readable drafts** | [`data/world02-provinces.json`](data/world02-provinces.json): provinces. [`data/world02-admin1-to-province.csv`](data/world02-admin1-to-province.csv): every Natural Earth admin-1 unit, its statistical region and province, with flags. [`data/world02-province-adjacency.json`](data/world02-province-adjacency.json): land adjacency. [`data/world02-sea-links.json`](data/world02-sea-links.json): curated sea and fixed links. [`data/world02-economic-membership.csv`](data/world02-economic-membership.csv): every globe entity's economic representation. |
| **Reproduce** | `python3 docs/world/tools/world02_provinces.py`, `python3 docs/world/tools/world02_membership.py`, then check with `python3 docs/world/tools/world02_validate.py` (standard library only). They read the repository's Natural Earth files and two small extracts: Eurostat population 2025 (`data/world02-eurostat-nuts-population-2025.json`) and ONS mid-2025 population (`data/world02-ons-itl1-population-mid2025.json`). |

---

## 1. Recommendation (updated after owner decision D1: Corsica is its own province)

| | Provinces / zones |
|---|---:|
| France | **9** (Corsica separate; plus overseas departments, not simulated) |
| Germany | 7 |
| United Kingdom | 8 |
| Italy | 6 |
| Poland | 7 |
| Türkiye | 9 |
| **Playable provinces** | **46** |
| Simulated neighbours (one zone each) | **10** |
| Rest-of-world blocs (one zone each) | **5** |
| **Total economic zones (option A)** | **61** |

**Zone budget: options compared** (measured in `WORLD-02-PERFORMANCE.md` §2.3):

| Option | Zones | What is given up | Strategic coverage lost |
|---|---:|---|---|
| **A (recommended)** | **61** = 46 + 10 + 5 | Nothing | None |
| B1 | 60 = 46 + 9 + 5 | Norway becomes part of bloc EUR | Norway is the only neighbour without a land border with the roster. Its economy stays in the world (inside EUR), but it is no longer a diplomatic actor, and its North Sea energy role is merged with the rest of Europe's |
| B2 | 60 = 46 + 10 + 4 | Blocs AME (Americas) and APA (Asia-Pacific) merge into one "overseas" bloc | Tariffs and sanctions could no longer target the Americas and Asia separately (for example the United States versus China). **Larger loss than B1** |
| C (fallback) | 50 = 35 + 10 + 5 | Province merges (§5); Corsica kept separate | Coarser provinces in all six countries |

**Why A.** In the repeated Node measurement:
- the 61-zone world costs the same as either 60-zone world, within run-to-run noise (median about 46 ms per week);
- one zone more or less changes the weekly time by about 1–2%, which is below the measurement noise.

Option B therefore gives up a strategic actor for no measurable saving. If the iPhone test fails, one zone will not fix it, so **go straight from A to C**.

**Rules used:**
- **A province is always a union of whole official statistical regions:** NUTS 2024 for France, Germany, Italy, Poland and Türkiye; ITL1 for the UK. Official data therefore add up exactly, with no splitting of regions.
- **Provinces are grouped by strategic geography:** borders, coasts, islands, capitals and industrial cores. Large, varied countries (Türkiye, France, the UK) get more provinces; Poland keeps its 7 official macroregions.
- **Every Natural Earth admin-1 unit of the six countries (556) is assigned to exactly one province.** None is unassigned and none is silently dropped; the CSV is the audit trail.

## 2. Coverage summary and flags

| Country | Admin-1 units | Matched to the finest official unit | Matched via region attribute | Flags |
|---|---:|---:|---:|---|
| France | 101 | 98 departments (NUTS-3 by name) | 3 | 5 overseas departments (FRY), kept as French territory but not simulated in version 1. 2 Natural Earth misspellings ("Seien-et-Marne", "Haute-Rhin"), assigned by region |
| Germany | 16 | 16 Länder (NUTS-1 by ISO 3166-2) | — | — |
| United Kingdom | 232 | — | 232 (80 by `geonunit`, 152 by `region`) | **Mixed administrative levels**: all 232 are lower-tier units (Natural Earth `gadm_level` 2). The region attribute uses pre-2021 NUTS names. Scotland, Wales and Northern Ireland are assigned by country (`geonunit`) so that "North Eastern" (Scotland) is not confused with "North East" (England) |
| Italy | 110 | 99 provinces (NUTS-3 by name) | 11 | Natural Earth predates the Sardinian province reforms (4 former provinces) and uses some foreign spellings ("Turin", "Aoste", "Bozen", "Crotene", "Oristrano"). Eurostat has 107 NUTS-3 units, Natural Earth 110 |
| Poland | 16 | 16 voivodeships (NUTS-2 by ISO 3166-2) | — | Mazowieckie is two NUTS-2 regions (PL91, PL92), both in NUTS-1 PL9 |
| Türkiye | 81 | 81 provinces (NUTS-3 by name; 3 via documented alias) | — | 3 Natural Earth misspellings ("Zinguldak", "Kinkkale", "K. Maras") |

**Population (sizing only, not scenario values):**
- **Eurostat countries:** population on 1 January 2025.
- **United Kingdom:** ONS mid-2025 estimate.

The scenario itself would use 2023 (`WORLD-02-DATA-SOURCES.md` §3).

**Connectivity** is computed from shared Natural Earth boundary vertices:
- **Every province is land-connected within its country** except four islands: Northern Ireland, Sicily, Sardinia and **Corsica** (its own province since decision D1). None of them inherits a land link. They are connected only by the explicit sea links in §2.1.
- **Land links between roster countries** that the geometry confirms:
  - France–Germany: Nord-Est with Mitte-West and Baden-Württemberg;
  - France–Italy: Auvergne-Rhône-Alpes and Provence-Alpes-Côte d'Azur with Nord-Ovest;
  - Germany–Poland: Nordost and Mitteldeutschland with the north-west and south-west macroregions.
- **Türkiye's land borders** are all with simulated or bloc countries: Greece and Bulgaria (simulated), and Georgia, Armenia, Azerbaijan, Iran, Iraq and Syria (blocs).
- **Validator.** `python3 docs/world/tools/world02_validate.py` re-checks the generated files independently. It confirms that:
  - every admin-1 unit and every official statistical unit is assigned exactly once;
  - every globe entity appears once in the membership partition;
  - Corsica has no land neighbour;
  - sea links do not duplicate land borders;
  - each country's land graph plus the proposed sea links is connected, and the whole scenario graph is connected.

  Last run: all checks passed. In total there are 74 land borders between provinces, 20 between neighbours and provinces, and 16 proposed sea or fixed links, plus 5 candidates.

### 2.1 Sea and fixed links (curated; [`data/world02-sea-links.json`](data/world02-sea-links.json))

Geometry gives land borders only, so sea links are a hand-made list. Each link records how it was checked:
- **"checked via search 2026-11":** operating routes found in operator and ferry-booking pages in November 2026. This is not a timetable audit.
- **"to verify":** general knowledge, to be checked against operator timetables before a scenario is built.

**v1** links are proposed for version 1. Candidates are documented but not proposed, mostly seasonal or secondary routes.

| A | B | Kind | Crossing | How checked | Proposal |
|---|---|---|---|---|---|
| `FRA-COR` | `FRA-SE` | ferry | Ajaccio/Bastia – Marseille, Toulon, Nice | operating 2026 (Corsica Linea, Corsica Ferries; checked via search 2026-11) | **v1** |
| `FRA-COR` | `ITA-SAR` | ferry | Bonifacio – Santa Teresa Gallura (Strait of Bonifacio) | operating 2026 (Moby / Ichnusa public-service route; checked via search 2026-11) | **v1** |
| `FRA-COR` | `ITA-CEN` | ferry | Bastia – Livorno (Tuscany) | operating 2026, year-round (Corsica Ferries, Moby; checked via search 2026-11) | **v1** |
| `FRA-COR` | `ITA-NO` | ferry | Bastia – Savona / Genoa (Liguria) | seasonal in 2026 (checked via search 2026-11) | candidate |
| `GBR-SE` | `FRA-NE` | fixed link | Channel Tunnel, Folkestone (Kent) – Coquelles (Pas-de-Calais) | fixed infrastructure | **v1** |
| `GBR-SE` | `FRA-OUE` | ferry | Portsmouth / Poole – Caen, Cherbourg, Le Havre, St-Malo | to verify | **v1** |
| `GBR-NIR` | `GBR-SCO` | ferry | Belfast / Larne – Cairnryan | operating 2026 (Stena Line, P&O; checked via search 2026-11) | **v1** |
| `GBR-NIR` | `GBR-NTH` | ferry | Belfast – Liverpool (North West England) | operating 2026 (Stena Line; checked via search 2026-11) | **v1** |
| `GBR-WLS` | `IRL` | ferry | Holyhead / Fishguard / Pembroke – Dublin / Rosslare | to verify | **v1** |
| `GBR-NTH` | `NLD` | ferry | Hull – Rotterdam | to verify | **v1** |
| `GBR-SE` | `NLD` | ferry | Harwich – Hook of Holland | to verify | candidate |
| `GBR-SCO` | `NOR` | sea lane | North Sea energy and shipping (no passenger ferry assumed) | to verify | **v1** |
| `ITA-SIC` | `ITA-SUD` | ferry | Messina – Villa San Giovanni (Strait of Messina) | to verify | **v1** |
| `ITA-SAR` | `ITA-CEN` | ferry | Olbia / Cagliari – Civitavecchia, Livorno | to verify | **v1** |
| `ITA-SAR` | `ITA-NO` | ferry | Olbia / Porto Torres – Genoa | to verify | **v1** |
| `ITA-SAR` | `ITA-SUD` | ferry | Cagliari – Naples | to verify | candidate |
| `ITA-SIC` | `ITA-CEN` | ferry | Palermo – Civitavecchia | to verify | candidate |
| `ITA-SUD` | `GRC` | ferry | Bari / Brindisi – Patras / Igoumenitsa | to verify | **v1** |
| `ITA-NO` | `ESP` | ferry | Genoa / Savona – Barcelona | to verify | candidate |
| `FRA-OUE` | `IRL` | ferry | Cherbourg / Roscoff – Rosslare / Cork | to verify | **v1** |
| `TUR-EGE` | `GRC` | ferry | Aegean coastal crossings (e.g. Çeşme – Chios) | to verify | **v1** |

**Corsica (D1), assessed links to Italy:**
- **Proposed:**
  - **Bonifacio – Santa Teresa Gallura** to Sardinia, a year-round public-service route;
  - **Bastia – Livorno** to Tuscany (`ITA-CEN`), year-round.
- **Candidate only:** **Bastia – Savona/Genoa** (`ITA-NO`). It is seasonal in 2026, and Corsica is already connected to Italy twice.

Corsica is therefore reachable from mainland France and from two Italian provinces. It has no land link to anything.

**Limitation found: a sea link is an army path in the current game.** The integration API turns every entry of a region's `adjacentRegionIds` into a road lane of fixed length 0.8, and that is the only way to give a zone trade links. The game's military rules (`src/game/military.ts`) also use `adjacentRegionIds` to allow move and attack orders. So with today's code:
- any sea link listed as adjacency lets divisions walk across the sea, just like a land border;
- it costs the same to trade over as a short road.

That is acceptable only if the owner accepts it as a version 1 simplification.

The smallest fix is an **additive, optional field** in the scenario input, for example `seaLinks: [{a, b, distance}]`:
- the engine would receive these as lanes with their own distance;
- the game would not treat them as army adjacency.

This is an integration-contract change (engine side) plus a game rule (Codex's side, whether and how sea moves are allowed). It needs approval and is proposed for WORLD-03 (decision S-1 in `WORLD-02-DECISIONS.md`). Nothing has been changed.

## 3. Province tables

### France: 9 provinces

| Province ID | Proposed name | Official statistical regions | Natural Earth admin-1 members | Population | Land / sea | Ambiguities and notes |
|---|---|---|---|---:|---|---|
| `FRA-IDF` | Île-de-France | FR1 Ile de France | 8: Essonne, Hauts-de-Seine, Paris, Seien-et-Marne, Seine-Saint-Denis, Val-d'Oise, Val-de-Marne, Yvelines | 12.55 M | land | Natural Earth spelling "Seien-et-Marne" (Seine-et-Marne), assigned by region. |
| `FRA-NE` | Nord-Est (Hauts-de-France, Grand Est) | FRE Hauts-de-France, FRF Grand Est | 15: Aisne, Ardennes, Aube, Bas-Rhin, Haute-Marne, Haute-Rhin, Marne, Meurthe-et-Moselle, Meuse, Moselle, Nord, Oise, Pas-de-Calais, Somme, Vosges | 11.52 M | land | Natural Earth spelling "Haute-Rhin" (Haut-Rhin), assigned by region. Land border with Belgium, Luxembourg and Switzerland too. Cross-border land neighbours in the roster: DEU-BW, DEU-MIT. |
| `FRA-OUE` | Ouest (Normandie, Bretagne, Pays de la Loire) | FRD Normandie, FRH Bretagne, FRG Pays de la Loire | 14: Calvados, Côtes-d'Armor, Eure, Finistère, Ille-et-Vilaine, Loire-Atlantique, Maine-et-Loire, Manche, Mayenne, Morbihan, Orne, Sarthe, Seine-Maritime, Vendée | 10.79 M | land |  |
| `FRA-CEN` | Centre (Centre-Val de Loire, Bourgogne-Franche-Comté) | FRB Centre — Val de Loire, FRC Bourgogne-Franche-Comté | 14: Cher, Côte-d'Or, Doubs, Eure-et-Loir, Haute-Saône, Indre, Indre-et-Loire, Jura, Loir-et-Cher, Loiret, Nièvre, Saône-et-Loire, Territoire de Belfort, Yonne | 5.39 M | land |  |
| `FRA-NAQ` | Nouvelle-Aquitaine | FRI Nouvelle-Aquitaine | 12: Charente, Charente-Maritime, Corrèze, Creuse, Deux-Sèvres, Dordogne, Gironde, Haute-Vienne, Landes, Lot-et-Garonne, Pyrénées-Atlantiques, Vienne | 6.21 M | land |  |
| `FRA-OCC` | Occitanie | FRJ Occitanie | 13: Ariège, Aude, Aveyron, Gard, Gers, Haute-Garonne, Hautes-Pyrénées, Hérault, Lot, Lozère, Pyrénées-Orientales, Tarn, Tarn-et-Garonne | 6.21 M | land |  |
| `FRA-ARA` | Auvergne-Rhône-Alpes | FRK Auvergne-Rhône-Alpes | 12: Ain, Allier, Ardèche, Cantal, Drôme, Haute-Loire, Haute-Savoie, Isère, Loire, Puy-de-Dôme, Rhône, Savoie | 8.27 M | land | Cross-border land neighbours in the roster: ITA-NO. |
| `FRA-SE` | Provence-Alpes-Côte d'Azur | FRL Provence-Alpes-Côte d’Azur | 6: Alpes-Maritimes, Alpes-de-Haute-Provence, Bouches-du-Rhône, Hautes-Alpes, Var, Vaucluse | 5.29 M | land | Cross-border land neighbours in the roster: ITA-NO. Sea link to Corsica (Marseille, Toulon, Nice). |
| `FRA-COR` | Corse | FRM Corse | 2: Corse-du-Sud, Haute-Corse | 0.36 M | **sea link** | **Owner decision D1:** its own province. Island: **no land neighbour** (checked by the validator). Proposed sea links: FRA-SE, ITA-SAR (Strait of Bonifacio), ITA-CEN (Livorno); ITA-NO (Savona/Genoa, seasonal) listed as a candidate only (§2.1). The smallest zone in the scenario (0.5% of France's population). |
| `FRA-OM` | Overseas departments (not simulated in v1) | FRY RUP FR — Régions Ultrapériphériques Françaises | 5: Guadeloupe, Guyane française, La Réunion, Martinique, Mayotte | 2.30 M | not simulated | Five overseas departments: Guadeloupe, Martinique, Guyane, La Réunion, Mayotte. Not simulated in version 1; shown as French territory. Mayotte is claimed by the Comoros (see territories). |

### Germany: 7 provinces

| Province ID | Proposed name | Official statistical regions | Natural Earth admin-1 members | Population | Land / sea | Ambiguities and notes |
|---|---|---|---|---:|---|---|
| `DEU-NOR` | Norddeutschland (Schleswig-Holstein, Hamburg, Bremen, Niedersachsen) | DEF Schleswig-Holstein, DE6 Hamburg, DE5 Bremen, DE9 Niedersachsen | 4: Bremen, Hamburg, Niedersachsen, Schleswig-Holstein | 13.53 M | land |  |
| `DEU-NRW` | Nordrhein-Westfalen | DEA Nordrhein-Westfalen | 1: Nordrhein-Westfalen | 18.03 M | land |  |
| `DEU-MIT` | Mitte-West (Hessen, Rheinland-Pfalz, Saarland) | DE7 Hessen, DEB Rheinland-Pfalz, DEC Saarland | 3: Hessen, Rheinland-Pfalz, Saarland | 11.42 M | land | Cross-border land neighbours in the roster: FRA-NE. |
| `DEU-BW` | Baden-Württemberg | DE1 Baden-Württemberg | 1: Baden-Württemberg | 11.25 M | land | Cross-border land neighbours in the roster: FRA-NE. |
| `DEU-BY` | Bayern | DE2 Bayern | 1: Bayern | 13.25 M | land |  |
| `DEU-NO` | Nordost (Berlin, Brandenburg, Mecklenburg-Vorpommern) | DE3 Berlin, DE4 Brandenburg, DE8 Mecklenburg-Vorpommern | 3: Berlin, Brandenburg, Mecklenburg-Vorpommern | 7.82 M | land | Cross-border land neighbours in the roster: POL-PZA. |
| `DEU-MO` | Mitteldeutschland (Sachsen, Sachsen-Anhalt, Thüringen) | DED Sachsen, DEE Sachsen-Anhalt, DEG Thüringen | 3: Sachsen, Sachsen-Anhalt, Thüringen | 8.28 M | land | Cross-border land neighbours in the roster: POL-PDZ, POL-PZA. |

### United Kingdom: 8 provinces

| Province ID | Proposed name | Official statistical regions | Natural Earth admin-1 members | Population | Land / sea | Ambiguities and notes |
|---|---|---|---|---:|---|---|
| `GBR-SCO` | Scotland | TLM Scotland | 32 units (see CSV) | 5.55 M | land | Natural Earth uses older NUTS-2 names (Highlands and Islands, North Eastern, Eastern, South Western); assigned by the geonunit field. |
| `GBR-NIR` | Northern Ireland | TLN Northern Ireland | 26 units (see CSV) | 1.93 M | **sea link** | No land link to Great Britain. Proposed sea links: GBR-SCO (Cairnryan), GBR-NTH (Liverpool). Land border with Ireland. |
| `GBR-WLS` | Wales | TLL Wales | 22 units (see CSV) | 3.18 M | land | Natural Earth uses East Wales and West Wales and the Valleys (older NUTS-2). |
| `GBR-NTH` | North of England (North East, North West, Yorkshire and the Humber) | TLC North East, TLD North West, TLE Yorkshire and The Humber | 50 units (see CSV) | 16.21 M | land |  |
| `GBR-MID` | Midlands (East Midlands, West Midlands) | TLF East Midlands, TLG West Midlands | 23 units (see CSV) | 11.29 M | land |  |
| `GBR-LON` | London | TLI London | 33 units (see CSV) | 9.12 M | land | 33 Natural Earth units (the London boroughs). |
| `GBR-SE` | South East and East of England | TLJ South East, TLH East of England | 30 units (see CSV) | 16.31 M | land | Channel Tunnel to France (FRA-NE): proposed fixed link. |
| `GBR-SW` | South West | TLK South West | 16: Bath and North East Somerset, Bournemouth, Bristol, Cornwall, Devon, Dorset, Gloucestershire, Isles of Scilly, North Somerset, Plymouth, Poole, Somerset, South Gloucestershire, Swindon, Torbay, Wiltshire | 5.91 M | land |  |

### Italy: 6 provinces

| Province ID | Proposed name | Official statistical regions | Natural Earth admin-1 members | Population | Land / sea | Ambiguities and notes |
|---|---|---|---|---:|---|---|
| `ITA-NO` | Nord-Ovest | ITC Nord-Ovest | 25 units (see CSV) | 15.92 M | land | Natural Earth spellings "Turin" and "Aoste", assigned by region. Cross-border land neighbours in the roster: FRA-ARA, FRA-SE. |
| `ITA-NE` | Nord-Est | ITH Nord-Est | 22 units (see CSV) | 11.60 M | land | Trentino-Alto Adige is two NUTS-2 regions (ITH1, ITH2); Natural Earth name "Bozen" assigned by region. |
| `ITA-CEN` | Centro | ITI Centro (IT) | 22 units (see CSV) | 11.70 M | land |  |
| `ITA-SUD` | Sud | ITF Sud | 24 units (see CSV) | 13.38 M | land | Natural Earth spelling "Crotene", assigned by region. |
| `ITA-SIC` | Sicilia | ITG1 Sicilia | 9: Agrigento, Caltanissetta, Catania, Enna, Messina, Palermo, Ragusa, Siracusa, Trapani | 4.79 M | **sea link** | Island. Proposed sea link: ITA-SUD (Strait of Messina); ITA-CEN (Palermo–Civitavecchia) as a candidate. |
| `ITA-SAR` | Sardegna | ITG2 Sardegna | 8: Cagliari, Carbonia-Iglesias, Medio Campidano, Nuoro, Ogliastra, Olbia-Tempio, Oristrano, Sassari | 1.56 M | **sea link** | Island. Proposed sea links: ITA-CEN, ITA-NO, FRA-COR; ITA-SUD (Cagliari–Naples) as a candidate. Natural Earth keeps former provinces (Carbonia-Iglesias, Medio Campidano, Olbia-Tempio, Ogliastra; "Oristrano"), assigned by region. |

### Poland: 7 provinces

| Province ID | Proposed name | Official statistical regions | Natural Earth admin-1 members | Population | Land / sea | Ambiguities and notes |
|---|---|---|---|---:|---|---|
| `POL-MAZ` | Makroregion województwo mazowieckie | PL9 Makroregion województwo mazowieckie | 1: Masovian | 5.48 M | land | Mazowieckie is one Natural Earth unit but two NUTS-2 regions (PL91 Warszawski stołeczny, PL92 Mazowiecki regionalny). |
| `POL-POL` | Makroregion południowy | PL2 Makroregion południowy | 2: Lesser Poland, Silesian | 7.51 M | land |  |
| `POL-PZA` | Makroregion północno-zachodni | PL4 Makroregion północno-zachodni | 3: Greater Poland, Lubusz, West Pomeranian | 5.95 M | land | Cross-border land neighbours in the roster: DEU-MO, DEU-NO. |
| `POL-PDZ` | Makroregion południowo-zachodni | PL5 Makroregion południowo-zachodni | 2: Lower Silesian, Opole | 3.68 M | land | Cross-border land neighbours in the roster: DEU-MO. |
| `POL-PN` | Makroregion północny | PL6 Makroregion północny | 3: Kuyavian-Pomeranian, Pomeranian, Warmian-Masurian | 5.50 M | land |  |
| `POL-CEN` | Makroregion centralny | PL7 Makroregion centralny | 2: Łódź, Świętokrzyskie | 3.43 M | land |  |
| `POL-WSC` | Makroregion wschodni | PL8 Makroregion wschodni | 3: Lublin, Podlachian, Subcarpathian | 4.94 M | land |  |

### Türkiye: 9 provinces

| Province ID | Proposed name | Official statistical regions | Natural Earth admin-1 members | Population | Land / sea | Ambiguities and notes |
|---|---|---|---|---:|---|---|
| `TUR-IST` | İstanbul | TR1 İstanbul | 1: Istanbul | 15.70 M | land | Spans Europe and Asia (Bosporus). |
| `TUR-MAR` | Marmara (Batı Marmara, Doğu Marmara) | TR2 Batı Marmara, TR4 Doğu Marmara | 13: Balikesir, Bilecik, Bolu, Bursa, Düzce, Edirne, Eskisehir, Kirklareli, Kocaeli, Sakarya, Tekirdag, Yalova, Çanakkale | 12.51 M | land | Includes Thrace (Edirne, Kırklareli, Tekirdağ): land border with Greece and Bulgaria. Spans the Dardanelles. |
| `TUR-EGE` | Ege | TR3 Ege | 8: Afyonkarahisar, Aydin, Denizli, Izmir, Kütahya, Manisa, Mugla, Usak | 10.97 M | land |  |
| `TUR-BAN` | Batı Anadolu | TR5 Batı Anadolu | 3: Ankara, Karaman, Konya | 8.46 M | land |  |
| `TUR-AKD` | Akdeniz | TR6 Akdeniz | 8: Adana, Antalya, Burdur, Hatay, Isparta, K. Maras, Mersin, Osmaniye | 10.94 M | land | Natural Earth spelling "K. Maras" (Kahramanmaraş), matched by alias. Contains Hatay (see territories). |
| `TUR-OAN` | Orta Anadolu | TR7 Orta Anadolu | 8: Aksaray, Kayseri, Kinkkale, Kirsehir, Nevsehir, Nigde, Sivas, Yozgat | 4.16 M | land | Natural Earth spelling "Kinkkale" (Kırıkkale), matched by alias. |
| `TUR-KAR` | Karadeniz (Batı Karadeniz, Doğu Karadeniz) | TR8 Batı Karadeniz, TR9 Doğu Karadeniz | 16: Amasya, Artvin, Bartın, Giresun, Gümüshane, Karabük, Kastamonu, Ordu, Rize, Samsun, Sinop, Tokat, Trabzon, Zinguldak, Çankiri, Çorum | 7.42 M | land | Natural Earth spelling "Zinguldak" (Zonguldak), matched by alias. |
| `TUR-DOG` | Doğu Anadolu (Kuzeydoğu, Ortadoğu Anadolu) | TRA Kuzeydoğu Anadolu, TRB Ortadoğu Anadolu | 15: Agri, Ardahan, Bayburt, Bingöl, Bitlis, Elazig, Erzincan, Erzurum, Hakkari, Iğdir, Kars, Malatya, Mus, Tunceli, Van | 6.02 M | land | Land border with Georgia, Armenia, Azerbaijan (Nakhchivan) and Iran. |
| `TUR-GDA` | Güneydoğu Anadolu | TRC Güneydoğu Anadolu | 9: Adiyaman, Batman, Diyarbakir, Gaziantep, Kilis, Mardin, Sanliurfa, Siirt, Sirnak | 9.49 M | land | Land border with Syria and Iraq. |

## 4. Simulated neighbours and rest-of-world blocs

### 4.1 Selected simplified countries (10)

| Country | Why | Links to the roster |
|---|---|---|
| **Ireland** | Only land border of the UK (Northern Ireland); close trade with the UK | GBR-NIR (land), GBR (sea) |
| **Spain** | Large economy; France's south-western border; Mediterranean trade with Italy | FRA-NAQ, FRA-OCC (land); ITA (sea) |
| **Netherlands** | Germany's and the UK's major trading partner; port of entry for Europe | DEU-NRW, DEU-NOR (land); GBR (sea) |
| **Belgium** | France–Germany corridor; port and logistics hub | FRA-NE (land); DEU-NRW, DEU-MIT (land) |
| **Switzerland** | Neighbour of France, Germany and Italy; strong trade links | FRA-ARA, FRA-NE, DEU-BW, ITA-NO (land) |
| **Austria** | Neighbour of Germany and Italy; Alpine transit | DEU-BY (land), ITA-NE (land) |
| **Czechia** | Neighbour of Germany and Poland; integrated manufacturing | DEU-BY, DEU-MO, POL-PDZ, POL-POL (land) |
| **Norway** | Major energy supplier to the UK and continental Europe | GBR, DEU (sea) |
| **Greece** | Türkiye's land neighbour in Thrace and across the Aegean | TUR-MAR (land), TUR-EGE (sea), ITA (sea) |
| **Bulgaria** | Türkiye's land neighbour in Thrace; Black Sea | TUR-MAR (land) |

**Next candidates if the budget allows:**
- **Denmark:** Germany's northern border.
- **Romania:** Black Sea, trade with Poland and Türkiye.
- **Sweden:** Baltic.

Each would add one zone. **Considered but not recommended as simulated countries:** Russia and Ukraine, Poland's and Türkiye's neighbours across the Black Sea. Their representation is tied to a current war and contested territories (`WORLD-02-TERRITORIES.md`). Both are placed in the Eastern Europe and Central Asia bloc, which carries no diplomacy and no military.

### 4.2 Rest-of-world blocs (5)

| Bloc | Members (Natural Earth entities; full list in the membership CSV) |
|---|---|
| **EUR — Rest of Europe** | 37 entities: Portugal, Luxembourg, Denmark, Sweden, Finland, Iceland, the Baltic states, Slovakia, Hungary, Slovenia, Croatia, Romania, the Western Balkans (including Kosovo), Malta, Cyprus and Northern Cyprus, the micro-states, the Crown dependencies, Gibraltar, the UK Sovereign Base Areas, the Faroe Islands, Åland, Greenland |
| **EEC — Eastern Europe and Central Asia** | 13: Russia, Ukraine, Belarus, Moldova, Georgia, Armenia, Azerbaijan, Kazakhstan (including the Baikonur lease area), Uzbekistan, Turkmenistan, Kyrgyzstan, Tajikistan |
| **MEA — Middle East and Africa** | 71: the Middle East (including Iran, Iraq, Syria, Israel, Palestine, the Gulf states) and all of Africa (including Western Sahara and Somaliland as separate Natural Earth entities) |
| **AME — Americas** | 52: North, Central and South America and the Caribbean, including the Falkland Islands and the French and Dutch Caribbean territories |
| **APA — Asia-Pacific** | 51: East, South and South-East Asia (except Iran), Oceania, including New Caledonia, French Polynesia and Wallis and Futuna |
| *no economy* | 18 entities: Antarctica, French Southern and Antarctic Lands, British Indian Ocean Territory, South Georgia, Heard Island, Clipperton, the uninhabited or disputed reefs and banks, the Cyprus UN buffer zone, Siachen, Guantanamo Bay base, and others |

### 4.3 How they work, and what they cannot do

| | Simulated country | Bloc |
|---|---|---|
| **Economic representation** | One engine zone with national data (population, GVA by group, taxes, spending, debt), run by the existing fiscal autopilot | One engine zone with data aggregated over its members (World Bank WDI, CC BY 4.0, plus national accounts where open), run by the autopilot. It stands for "the world market" in that direction |
| **Trade** | Trades through land lanes with its neighbours and sea lanes, at engine prices; tariffs and sanctions (existing engine commands) can target it | Trades by sea lanes with coastal provinces and other blocs; existing tariff and sanction commands can target it |
| **Diplomacy** | Existing game diplomacy (statements, cooperation offers), if represented as a game country (decision D-Z2) | **None.** Not a diplomatic actor |
| **Military** | **None in version 1.** No divisions; its territory cannot be attacked or occupied (needs a game rule, decision D-Z2) | **None** |
| **Map** | Real outline and name; card with simulated economic indicators | Members keep their real outline and name; cards show static reference indicators (WDI, with year and source) and "economy represented by bloc X" |

**Avoiding double counting.** `world02-economic-membership.csv` is a **partition**: every one of the 258 Natural Earth entities appears exactly once, as playable, simulated, bloc member or no economy. The membership script checks this. Bloc aggregates are summed only over their listed members. Special cases:
- **French overseas departments.** They are inside France's Natural Earth outline and in Eurostat's French totals. They are excluded from France's simulated provinces, so France's economic totals must be the **sum of its 9 metropolitan provinces** (NUTS FR1–FRM), never the national total including FRY. Their economy is omitted in version 1 and labelled as such.
- **UK Crown dependencies, overseas territories and Sovereign Base Areas.** These are separate Natural Earth entities and are not in ITL statistics, so there is no overlap with UK provinces. Each is in exactly one bloc, or has no economy.
- **Greenland, Faroe Islands and Åland.** These are separate entities from Denmark and Finland. Each is listed once (bloc EUR).

**Engine API.** These are additive extensions, not implemented here:
1. **Country starting fiscal values and debt** (`CountrySpec` fields already exist in the engine; the integration layer must pass them).
2. **Lane distances and sea waypoints** from the scenario, instead of the fixed 0.8.
3. **Option (b) only: engine-only countries.** With option (a), simulated countries and blocs are ordinary game countries with one region each, and the current API already supports them.

Whether a country can be attacked or engage in diplomacy is a game-side rule (Codex's area), not an engine change.

## 5. Fallback if the iPhone measurement fails: 50 zones (option C)

These are merges of the provinces above, still unions of whole official regions. **Corsica stays separate** (decision D1), so the earlier 49-zone fallback becomes 50:

| Country | Option A | Option C (fallback) |
|---|---|---|
| France | 9 | 7: CEN merged into OUE; NAQ and OCC merged as "Sud-Ouest"; Corsica kept |
| Germany | 7 | 5: NO and MO merged as "Ost"; MIT merged with NRW as "West" |
| United Kingdom | 8 | 6: SW merged into SE; MID merged into NTH |
| Italy | 6 | 5: SIC and SAR as "Isole" (NUTS-1 ITG) |
| Poland | 7 | 5: CEN merged into MAZ; PDZ merged into PZA |
| Türkiye | 9 | 7: OAN merged into BAN; DOG merged with GDA as "Doğu ve Güneydoğu" |
| Simulated / blocs | 10 / 5 | 10 / 5 |
| **Total** | **61** | **50** |

Note: merging Sicily and Sardinia as "Isole" puts two islands in one zone. That is allowed (one NUTS-1 region), but they would have no land link to each other, and the sea links of both would attach to the merged zone.

`WORLD-02-PERFORMANCE.md` §2.3 shows what option C costs (measured).

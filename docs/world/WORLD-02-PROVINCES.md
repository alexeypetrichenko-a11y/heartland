# WORLD-02 — Province structure, simulated neighbours and rest-of-world blocs

| | |
|---|---|
| **Status** | Draft for owner review. No scenario asset. All figures shown are for sizing only. |
| **Machine-readable drafts** | [`data/world02-provinces.json`](data/world02-provinces.json): provinces. [`data/world02-admin1-to-province.csv`](data/world02-admin1-to-province.csv): every Natural Earth admin-1 unit, its statistical region and province, with flags. [`data/world02-province-adjacency.json`](data/world02-province-adjacency.json): land adjacency. [`data/world02-economic-membership.csv`](data/world02-economic-membership.csv): every globe entity's economic representation. |
| **Reproduce** | `python3 docs/world/tools/world02_provinces.py` and `python3 docs/world/tools/world02_membership.py` (standard library only). They read the repository's Natural Earth files and two small extracts: Eurostat population 2025 (`data/world02-eurostat-nuts-population-2025.json`) and ONS mid-2025 population (`data/world02-ons-itl1-population-mid2025.json`). |

---

## 1. Recommendation

| | Provinces / zones |
|---|---:|
| France | 8 (plus overseas departments, not simulated) |
| Germany | 7 |
| United Kingdom | 8 |
| Italy | 6 |
| Poland | 7 |
| Türkiye | 9 |
| **Playable provinces** | **45** |
| Simulated neighbours (one zone each) | **10** |
| Rest-of-world blocs (one zone each) | **5** |
| **Total economic zones** | **60** |

**Why 60.** The current engine runs a 60-zone world at a median of 45 ms per week in Node, and 142 ms with the CPU slowed 6× in Chromium (95th percentile 212 ms). That is inside the provisional 0.5 s budget with room to spare (`WORLD-02-PERFORMANCE.md`). It still has to be confirmed on a physical iPhone. If that fails, §5 gives a 49-zone fallback.

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
- **Every province is land-connected within its country** except Northern Ireland, Sicily and Sardinia, which need sea links. Corsica is an island inside the `FRA-SE` province.
- **Land links between roster countries** that the geometry confirms:
  - France–Germany: Nord-Est with Mitte-West and Baden-Württemberg;
  - France–Italy: Auvergne-Rhône-Alpes and Sud-Est with Nord-Ovest;
  - Germany–Poland: Nordost and Mitteldeutschland with the north-west and south-west macroregions.
- **Fixed link:** the Channel Tunnel (`GBR-SE`–`FRA-NE`) is proposed as one.
- **Türkiye's land borders** are all with simulated or bloc countries: Greece and Bulgaria (simulated), and Georgia, Armenia, Azerbaijan, Iran, Iraq and Syria (blocs).

## 3. Province tables

### France: 8 provinces

| Province ID | Proposed name | Official statistical regions | Natural Earth admin-1 members | Population | Land / sea | Ambiguities and notes |
|---|---|---|---|---:|---|---|
| `FRA-IDF` | Île-de-France | FR1 Ile de France | 8: Essonne, Hauts-de-Seine, Paris, Seien-et-Marne, Seine-Saint-Denis, Val-d'Oise, Val-de-Marne, Yvelines | 12.55 M | land | Natural Earth spelling "Seien-et-Marne" (Seine-et-Marne), assigned by region. |
| `FRA-NE` | Nord-Est (Hauts-de-France, Grand Est) | FRE Hauts-de-France, FRF Grand Est | 15: Aisne, Ardennes, Aube, Bas-Rhin, Haute-Marne, Haute-Rhin, Marne, Meurthe-et-Moselle, Meuse, Moselle, Nord, Oise, Pas-de-Calais, Somme, Vosges | 11.52 M | land | Natural Earth spelling "Haute-Rhin" (Haut-Rhin), assigned by region. Land border with Belgium, Luxembourg and Switzerland too. Cross-border land neighbours in the roster: DEU-BW, DEU-MIT. |
| `FRA-OUE` | Ouest (Normandie, Bretagne, Pays de la Loire) | FRD Normandie, FRH Bretagne, FRG Pays de la Loire | 14: Calvados, Côtes-d'Armor, Eure, Finistère, Ille-et-Vilaine, Loire-Atlantique, Maine-et-Loire, Manche, Mayenne, Morbihan, Orne, Sarthe, Seine-Maritime, Vendée | 10.79 M | land |  |
| `FRA-CEN` | Centre (Centre-Val de Loire, Bourgogne-Franche-Comté) | FRB Centre — Val de Loire, FRC Bourgogne-Franche-Comté | 14: Cher, Côte-d'Or, Doubs, Eure-et-Loir, Haute-Saône, Indre, Indre-et-Loire, Jura, Loir-et-Cher, Loiret, Nièvre, Saône-et-Loire, Territoire de Belfort, Yonne | 5.39 M | land |  |
| `FRA-NAQ` | Nouvelle-Aquitaine | FRI Nouvelle-Aquitaine | 12: Charente, Charente-Maritime, Corrèze, Creuse, Deux-Sèvres, Dordogne, Gironde, Haute-Vienne, Landes, Lot-et-Garonne, Pyrénées-Atlantiques, Vienne | 6.21 M | land |  |
| `FRA-OCC` | Occitanie | FRJ Occitanie | 13: Ariège, Aude, Aveyron, Gard, Gers, Haute-Garonne, Hautes-Pyrénées, Hérault, Lot, Lozère, Pyrénées-Orientales, Tarn, Tarn-et-Garonne | 6.21 M | land |  |
| `FRA-ARA` | Auvergne-Rhône-Alpes | FRK Auvergne-Rhône-Alpes | 12: Ain, Allier, Ardèche, Cantal, Drôme, Haute-Loire, Haute-Savoie, Isère, Loire, Puy-de-Dôme, Rhône, Savoie | 8.27 M | land | Cross-border land neighbours in the roster: ITA-NO. |
| `FRA-SE` | Sud-Est (Provence-Alpes-Côte d'Azur, Corse) | FRL Provence-Alpes-Côte d’Azur, FRM Corse | 8: Alpes-Maritimes, Alpes-de-Haute-Provence, Bouches-du-Rhône, Corse-du-Sud, Haute-Corse, Hautes-Alpes, Var, Vaucluse | 5.65 M | land | Includes Corsica (FRM), an island: sea crossing inside the province. Cross-border land neighbours in the roster: ITA-NO. |
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
| `GBR-NIR` | Northern Ireland | TLN Northern Ireland | 26 units (see CSV) | 1.93 M | **sea link** | No land link to Great Britain: **sea link required**. Land border with Ireland. |
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
| `ITA-SIC` | Sicilia | ITG1 Sicilia | 9: Agrigento, Caltanissetta, Catania, Enna, Messina, Palermo, Ragusa, Siracusa, Trapani | 4.79 M | **sea link** | Island: **sea link required** (Strait of Messina). |
| `ITA-SAR` | Sardegna | ITG2 Sardegna | 8: Cagliari, Carbonia-Iglesias, Medio Campidano, Nuoro, Ogliastra, Olbia-Tempio, Oristrano, Sassari | 1.56 M | **sea link** | Island: **sea link required**. Natural Earth keeps former provinces (Carbonia-Iglesias, Medio Campidano, Olbia-Tempio, Ogliastra; "Oristrano"), assigned by region. |

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
- **French overseas departments.** They are inside France's Natural Earth outline and in Eurostat's French totals. They are excluded from France's simulated provinces, so France's economic totals must be the **sum of its 8 metropolitan provinces** (NUTS FR1–FRM), never the national total including FRY. Their economy is omitted in version 1 and labelled as such.
- **UK Crown dependencies, overseas territories and Sovereign Base Areas.** These are separate Natural Earth entities and are not in ITL statistics, so there is no overlap with UK provinces. Each is in exactly one bloc, or has no economy.
- **Greenland, Faroe Islands and Åland.** These are separate entities from Denmark and Finland. Each is listed once (bloc EUR).

**Engine API.** These are additive extensions, not implemented here:
1. **Country starting fiscal values and debt** (`CountrySpec` fields already exist in the engine; the integration layer must pass them).
2. **Lane distances and sea waypoints** from the scenario, instead of the fixed 0.8.
3. **Option (b) only: engine-only countries.** With option (a), simulated countries and blocs are ordinary game countries with one region each, and the current API already supports them.

Whether a country can be attacked or engage in diplomacy is a game-side rule (Codex's area), not an engine change.

## 5. Fallback if the iPhone measurement fails: 49 zones

These are merges of the provinces above, still unions of whole official regions:

| Country | 60-zone version | 49-zone version |
|---|---|---|
| France | 8 | 6: CEN merged into OUE; NAQ and OCC merged as "Sud-Ouest" |
| Germany | 7 | 5: NO and MO merged as "Ost"; MIT merged with NRW as "West" |
| United Kingdom | 8 | 6: SW merged into SE; MID merged into NTH |
| Italy | 6 | 5: SIC and SAR as "Isole" (NUTS-1 ITG) |
| Poland | 7 | 5: CEN merged into MAZ; PDZ merged into PZA |
| Türkiye | 9 | 7: OAN merged into BAN; DOG merged with GDA as "Doğu ve Güneydoğu" |
| Simulated / blocs | 10 / 5 | 10 / 5 |
| **Total** | **60** | **49** |

The 45-zone measurements (median 90 ms per week at 6× slowdown in Chromium) show what this fallback would cost.

# WORLD-02 draft data

These are review drafts, not scenario assets. Nothing here is loaded by the game or the engine.

| File | Content | Produced by | Sources and attribution |
|---|---|---|---|
| `world02-admin1-to-province.csv` | Every Natural Earth admin-1 unit of France, Germany, the UK, Italy, Poland and Türkiye (556), with its official statistical region, proposed province, match method and flags | `tools/world02_provinces.py` | Natural Earth 5.1.1 (public domain; "Made with Natural Earth"). Region codes and labels: Eurostat NUTS (source: Eurostat), ONS ITL1 |
| `world02-provinces.json` | 47 entries: 46 proposed provinces (Corsica separate, owner decision D1), plus French overseas departments marked not simulated. For each: statistical units, member count, population (sizing only), land connectivity, neighbours | `tools/world02_provinces.py` | As above, plus the population extracts below |
| `world02-province-adjacency.json` | Land adjacency between provinces, from shared Natural Earth boundary vertices (count of shared vertices) | `tools/world02_provinces.py` | Natural Earth 5.1.1 |
| `world02-sea-links.json` | 21 curated sea and fixed links (16 proposed for version 1, 5 candidates), with how each was checked | `tools/world02_provinces.py` (table `SEA_LINKS`) | Route facts from operator and ferry-booking pages (checked via search, November 2026) or marked "to verify" |
| `world02-economic-membership.csv` | Every one of the 258 Natural Earth admin-0 entities, assigned once to playable, simulated, a bloc or no economy | `tools/world02_membership.py` | Natural Earth 5.1.1 |
| `world02-eurostat-nuts-population-2025.json` | Population on 1 January 2025 by NUTS 1, 2 and 3 for FR, DE, IT, PL, TR (from Eurostat dataset `demo_r_pjanaggr3`, retrieved 22 November 2026) | Eurostat dissemination API | **Source: Eurostat** (`demo_r_pjanaggr3`). Reuse authorised with acknowledgement (Eurostat copyright notice). Data for EU members and the candidate country Türkiye only |
| `world02-ons-itl1-population-mid2025.json` | Population mid-2025 for the 12 UK ITL1 regions and the UK total | ONS `mye25tablesuk.xlsx`, sheet MYE2 – Persons | **Source: Office for National Statistics licensed under the Open Government Licence v.3.0** |
| `world02-ppp-fx-2023.json` | 2023 GDP (national currency, US$, PPP), PPP factors, exchange rates for the six; Eurostat PPPs, price level indices and annual exchange rates (raw API values, retrieved 22 November 2026) | World Bank API v2, Eurostat API | **World Bank WDI** (CC BY 4.0); `PA.NUS.FCRF` is IMF-sourced, kept for comparison only, not for bundling. **Source: Eurostat** (`prc_ppp_ind`, `ert_bil_eur_a`); Eurostat UK values are not for commercial reuse |
| `world02-defence-cofog-2023.json` | 2023 general-government defence spending (COFOG 02) by transaction for FR, DE, GB, IT, PL; whole-economy compensation of employees and employees | OECD SDMX API, Eurostat API | **OECD** (CC BY 4.0) Table 11 and national accounts tables 1 and 3; **Source: Eurostat** (`nama_10_gdp`, `nama_10_a10_e`) |
| `world02-bench-node.json`, `world02-bench-browser.json` | Engine benchmark results, first WORLD-02 run (synthetic worlds, 30–75 zones) | `economy-engine/sim/world02-bench.ts`, `world02-browser-bench.cjs` | — |
| `world02-bench-node-budget.json`, `world02-bench-browser-budget.json` | Zone-budget comparison (50, 60, 60, 61 zones and 61 on the real draft topology), repeated runs | same scripts with `--set budget --repeats N` | — |

Reproduce from the repository root:

```bash
python3 docs/world/tools/world02_provinces.py
```

```bash
python3 docs/world/tools/world02_membership.py
```

```bash
python3 docs/world/tools/world02_validate.py
```

```bash
python3 docs/world/tools/world02_ppp.py
```

```bash
python3 docs/world/tools/world02_military.py
```

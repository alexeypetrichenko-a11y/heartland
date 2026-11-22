# WORLD-02 draft data

These are review drafts, not scenario assets. Nothing here is loaded by the game or the engine.

| File | Content | Produced by | Sources and attribution |
|---|---|---|---|
| `world02-admin1-to-province.csv` | Every Natural Earth admin-1 unit of France, Germany, the UK, Italy, Poland and Türkiye (556), with its official statistical region, proposed province, match method and flags | `tools/world02_provinces.py` | Natural Earth 5.1.1 (public domain; "Made with Natural Earth"). Region codes and labels: Eurostat NUTS (source: Eurostat), ONS ITL1 |
| `world02-provinces.json` | 46 entries: 45 proposed provinces, plus French overseas departments marked not simulated. For each: statistical units, member count, population (sizing only), land connectivity, neighbours | `tools/world02_provinces.py` | As above, plus the population extracts below |
| `world02-province-adjacency.json` | Land adjacency between provinces, from shared Natural Earth boundary vertices (count of shared vertices) | `tools/world02_provinces.py` | Natural Earth 5.1.1 |
| `world02-economic-membership.csv` | Every one of the 258 Natural Earth admin-0 entities, assigned once to playable, simulated, a bloc or no economy | `tools/world02_membership.py` | Natural Earth 5.1.1 |
| `world02-eurostat-nuts-population-2025.json` | Population on 1 January 2025 by NUTS 1, 2 and 3 for FR, DE, IT, PL, TR (from Eurostat dataset `demo_r_pjanaggr3`, retrieved 22 November 2026) | Eurostat dissemination API | **Source: Eurostat** (`demo_r_pjanaggr3`). Reuse authorised with acknowledgement (Eurostat copyright notice). Data for EU members and the candidate country Türkiye only |
| `world02-ons-itl1-population-mid2025.json` | Population mid-2025 for the 12 UK ITL1 regions and the UK total | ONS `mye25tablesuk.xlsx`, sheet MYE2 – Persons | **Source: Office for National Statistics licensed under the Open Government Licence v.3.0** |
| `world02-bench-node.json`, `world02-bench-browser.json` | Engine benchmark results (synthetic worlds) | `economy-engine/sim/world02-bench.ts`, `world02-browser-bench.cjs` | — |

Reproduce from the repository root:

```bash
python3 docs/world/tools/world02_provinces.py
```

```bash
python3 docs/world/tools/world02_membership.py
```

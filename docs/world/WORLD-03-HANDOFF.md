# WORLD-03 — Integration handoff for Codex (not implemented)

| | |
|---|---|
| **Package** | `scenarios/europe-2023/1.0.0-draft.1/` (review draft; see `REPORT.md` there and `WORLD-03-REPORT.md`) |
| **Do not integrate yet** | Calibration is incomplete:<ul><li>debt and interest (W3-D1);</li><li>income tax in France, Belgium and Austria (W3-D2).</li></ul>Two API additions below also need owner approval. This document only describes how integration would work. |
| **Unchanged** | Engine formulas and parameters, the integration contract (1.0.0), SAVE-01, the fictional scenario and its saves |

## 1. What the package contains

| File | Content | Used by |
|---|---|---|
| `manifest.json` | Scenario ID `europe-2023`, version, status, `worldFingerprint` (16 hex), `week1EconomyHash`, `contentFingerprint` (SHA-256 over the file hashes), the file list with SHA-256 | Loader, SAVE-01 |
| `scenario.json` | `countries`, `regions`, `links`, `economy`, `startingRelations`, `military`, `territories`, `overseas` (§2) | Globe, game state, economy |
| `week1.session.json` | Calibrated week-1 economy in the integration session format (`SESSION_VERSION` 2), no player selected. Its world fingerprint is the scenario's, so today's `startEconomyFromSave` refuses it by design | Economy start |
| `world-spec.json` | The engine `WorldSpec` (without the goods config) that rebuilds the same economy | Audit and rebuilds only |
| `provenance.json` | Every input with sources, method and status; the issue list; source licences | Credits screen, audits |
| `calibration-report.json`, `REPORT.md`, `validation-report.json`, `benchmark-*.json` | Results | Review |

## 2. `scenario.json` fields

### `countries[]`

| Field | Values |
|---|---|
| `id`, `name` | Lowercase IDs: `fra`, `deu`, `gbr`, `ita`, `pol`, `tur`; neighbours `irl`, `esp`, `nld`, `bel`, `che`, `aut`, `cze`, `nor`, `grc`, `bgr`; blocs `bloc-eur`, `bloc-eec`, `bloc-mea`, `bloc-ame`, `bloc-apa` |
| `kind` | `playable`, `simulated` or `bloc` |
| `diplomacy`, `attackable`, `divisions` | Booleans from decision Z-2 |

### `regions[]`

61 regions. Region IDs never equal country IDs.

| Field | Values |
|---|---|
| `id`, `name`, `ownerId`, `kind` | Provinces are `fra-idf` and so on. Each neighbour and each bloc has one region (`irl-all`, `bloc-eur-all`) |
| `landAdjacentRegionIds` | Real land borders (from geometry) |
| `maritimeLinkedRegionIds` | Trade-only sea and fixed links |
| `movementAdjacentRegionIds` | Where divisions may move: land links between playable provinces only |
| `naturalEarth` | Provinces: `admin1` IDs (the WORLD-02 crosswalk). Neighbours: `admin0` code. Blocs: `admin0` member list |
| `statisticalUnits` | NUTS / ITL codes behind each province |

### `links`

The same three sets as lists, with lane IDs:

| Set | Lane IDs | Count |
|---|---|---:|
| `land` | `land-a\|b` | 132 |
| `maritime` | `sea-a\|b` | 180. Each carries `kind`, `crossing`, `status`, `rule` and `movement: false` |
| `movement` | — | 74 |

### Other fields

| Field | Content |
|---|---|
| `economy.regions` | Profiles: `population` (millions, 2023), `technology` (fitted), `populationGrowth` 0, `advantage` (6 groups) |
| `economy.countries` | Engine `CountrySpec` fiscal inputs, where data exist |
| `startingRelations` | Neutral: all 120 pairs of the 16 diplomatic countries at 0. Blocs have no diplomacy |
| `military` | Draft division counts (rule W) for France, Germany, the UK, Italy and Poland. Türkiye is **unresolved** and has no value. Placement is not set |
| `territories` | The T-1 rule and the (b) entries from `WORLD-02-TERRITORIES.md`. `noEconomy` lists the 18 entities without an economy |
| `overseas` | `fra-om`: French overseas departments, shown as French territory and not simulated |

## 3. Globe

- **Province outlines.** Draw each province as the union of its `naturalEarth.admin1` units. The geometry is already in `public/geography/natural-earth-5.1.1/`.
- **Neighbours and blocs.** Use their admin-0 outlines and real names. Bloc members are tinted by bloc.
- **French overseas departments** (`fra-om`, not a region) stay visible as French, with a "not simulated" label.
- **Territories in `territories.entries`** use the neutral "disputed" style and labels. That style is a rendering task, decision T-2. It includes Crimea and Sevastopol, which Natural Earth places inside Russia's admin-1 units.
- **Sea and fixed links** can be drawn as dashed lines. They are trade routes, not army paths.

## 4. Game state

| `GameState` | From the package |
|---|---|
| `countries` | `scenario.countries` (the game needs all 21, because every economic zone needs an owner) |
| `regions[].adjacentRegionIds` | **`movementAdjacentRegionIds`**. This list is used by `src/game/military.ts` for move and attack, so it must not contain maritime links (decision S-1) |
| `divisions` | From `scenario.military`, once decision M-2 is approved. Uniform manpower per division. Türkiye has none until M-3 is resolved; the game must not invent a value |
| `relations` | `startingRelations` (all 0) |
| Attack or occupation of neighbours and blocs | Not allowed in v1 (Z-2). This is a game rule on top of the movement graph, which already excludes them |

## 5. Economy: proposed additive API changes (need owner approval; nothing is implemented)

Today `GameWorldInput` has only IDs, names, owners and adjacency. `worldSpecFromGame` turns every adjacency into a road of length 0.8 and leaves every country at the engine's default fiscal policy. The scenario needs three **optional** additions. When they are absent, every input and the world fingerprint stay exactly as now, so fictional games and saves are unaffected.

| Proposal | Change | Fingerprint |
|---|---|---|
| **API-1: maritime trade links (S-1)** | Optional `GameWorldInput.maritimeLinks?: { a, b, distance }[]`. `worldSpecFromGame` adds a lane `sea-a\|b` for each. `adjacentRegionIds` keeps building road lanes only. Validation: both ends exist; not also an adjacency; symmetric | `worldFingerprint` includes the field only when present |
| **API-2: country policy** | Optional `CreateSessionOptions.countryPolicy?: Record<countryId, { taxIncome?, taxConsumption?, taxCorporate?, spendAdministration?, spendSocial?, spendMilitary?, spendInfrastructure?, debtToGdp? }>`, passed to the existing `CountrySpec` fields. They exist in the engine already; no formula change | Included in `worldFingerprint` only when present |
| **API-3: start from a scenario package** | `startEconomyFromScenario(sessionText, manifest)`. It checks:<ul><li>`loadEconomySession(sessionText).worldFingerprint === manifest.worldFingerprint`;</li><li>`economyFingerprint(session) === manifest.week1EconomyHash`;</li><li>`week === 1`.</li></ul>Then `withPlayerCountry`. Alternatively, `startEconomyFromSave` could accept an expected fingerprint | Uses the scenario's own fingerprint |

With API-1 and API-2, the game could rebuild the same economy with `createEconomySession`. It is slower (about 13 s on a desktop), so the pre-built `week1.session.json` is the intended path, exactly like the fictional week-1 save.

**Acceptance for these changes (when approved):**
- The fictional `worldFingerprint`, the week-1 save and the golden fingerprint `da69e1f5b0859ef6` are unchanged.
- A test rebuilds this package's week-1 economy through the new options, and its hash equals `week1EconomyHash`.

## 6. SAVE-01: compatibility and immutable versions

Today SAVE-01 validates every save against the fictional `createInitialState()`, in `src/game/saveFormat.ts` and `saveValidation.ts`. The proposal:

1. **Scenario identity in the save payload.** Add `scenario: { id, version, contentFingerprint }`. A save **without** the field is a fictional save and is validated exactly as now, so every existing save keeps loading.
2. **A scenario registry.** It maps `{id, version}` to the bundled package: manifest, `scenario.json` and the week-1 session. Loading a save looks up its exact version and checks the content fingerprint. A missing or mismatched version is **refused with a clear message**, never migrated silently.
3. **Immutable versions.** A data correction becomes a new version directory (`1.0.0-draft.2`, `1.0.0`, …). Old versions stay bundled while they are small (about 0.8 MB gzip each), or are retired with a release note naming the unsupported saves.
4. **Validation against the scenario.** The `saveValidation.ts` rules (fixed IDs, owners, adjacency) run against the chosen scenario's `scenario.json` instead of the fictional fixture.
5. **The SAVE-01 envelope** (format 1, SHA-256 checksum) is unchanged. The session text inside the economy part is the same format as today.

## 7. What not to do

- Do not put maritime links into `adjacentRegionIds`: that would make them army paths.
- Do not give Türkiye divisions, or fill any `unavailable` value, without an approved source or rule.
- Do not load the package through today's `startEconomyFromSave` by changing its fingerprint. Use API-3 once approved.
- Do not ship this draft. Its status says "calibration targets not all met", and the Turkish spending source has an unverified licence (W3-L1).

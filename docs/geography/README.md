# MAP-01A — Geographic data foundation

This is a separate, unused geographic reference module. The existing fictional three-country/six-region game, map, controls and simulation are unchanged. There is no real-world renderer, selection UI, political ownership mapping, unit positioning or transport simulation here.

## Sources verified before import

Publisher: [Natural Earth](https://www.naturalearthdata.com/). All selected layers' `VERSION.txt` files say **5.1.1**. Inputs are pinned to the publisher's [natural-earth-vector](https://github.com/nvkelso/natural-earth-vector) repository tag **v5.1.2**, immutable commit **f1890d9f152c896d250a77557a5751a93d494776**. Repository release and individual layer version are different identifiers.

| Selected dataset | Purpose | Actual source features |
| --- | --- | ---: |
| [1:110m Admin-0 countries](https://www.naturalearthdata.com/downloads/110m-cultural-vectors/110m-admin-0-countries/) | Small world overview, all continents | 177 |
| [1:50m Admin-0 countries](https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/) | Optional intermediate overview | 242 |
| [1:10m Admin-0 countries](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/) | Complete source country/territory registry and optional per-country detail | 258 |
| [1:10m Admin-1 states/provinces](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/) | Regional source records and geometry, loaded by country/chunk | 4,596 |

The official dataset pages link to the publisher's GitHub repository. Some website download links currently resolve to malformed `/http//...` URLs and failed when checked. Retrieval therefore uses the official repository's immutable raw component URLs, listed individually with byte sizes and SHA-256 hashes in [sources.lock.json](../../scripts/geography/sources.lock.json). All 26 locked component URLs were successfully retrieved and verified before processing: 24 components for the four selected datasets, plus two DBF attribute tables used only to investigate lower-detail Admin-1 coverage. The selected `.prj` files declare WGS84 and `.cpg` files declare UTF-8.

[Terms of use](https://www.naturalearthdata.com/about/terms-of-use/): Natural Earth's vector/raster data are public domain, including commercial use, modification and redistribution; permission and credit are not required. Voluntary credit: **Made with Natural Earth**. Natural Earth provides no accuracy guarantee. This statement concerns the data, not a new license for Heartland's application code.

### Detail-level investigation

The actual pinned Admin-1 files contain **51 features for the USA at 1:110m**, **294 features across nine countries at 1:50m**, and **4,596 across 251 Admin-0 parents at 1:10m**. The nine 50m parents are Australia, Brazil, Canada, China, Indonesia, India, Russia, USA and South Africa. The older [110m](https://www.naturalearthdata.com/downloads/110m-cultural-vectors/110m-admin-1-states-provinces/) and [50m](https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-1-states-provinces/) website descriptions do not fully describe current pinned-file coverage. File counts/attributes, rather than that older prose, govern this import. The 10m layer is the appropriate worldwide regional source; coarse Admin-1 geometry is not shipped.

Also investigated: [Admin-0 map units/subunits](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-details/). These distinguish additional cartographic groupings, including overseas and constituent units. They were not substituted for Admin-0 countries: the selected Admin-1 `adm0_a3` references join the country table directly. No additional map-unit entities were manufactured.

## Actual coverage and administrative limitations

- **258 country/territory/map entities**, not 258 playable sovereign states. Dependencies, leases, disputed entities and grouped overseas areas retain Natural Earth's identity/classification.
- **4,596 Admin-1 source records**, with exact source-parent references to **251** of those entities. This is not a claim that all are current legal first-level divisions. Natural Earth's layer includes mixed administrative levels, country/territory stand-ins and unclassified island fragments.
- **40 nonstandard source codes** such as `ATA+00?` and `RUS+99?` are retained verbatim in source metadata. **Seven records have no source name or English name**; names remain `null`. No replacement names or missing geometries are invented. The source `gadm_level` distribution is retained: -1: 8, 0: 545, 1: 3,488, 2: 555. These are source attributes, not a hierarchy imposed by Heartland.
- **Seven entities have no Admin-1 source features**: BJN — Bajo Nuevo Bank (Petrel Is.); BRI — Brazilian Island; BRT — Bir Tawil; CNM — Cyprus No Mans Area; SCR — Scarborough Reef; SER — Serranilla Bank; SPI — Southern Patagonian Ice Field. Their region-index reference is `null`. The loader returns missing data, not a synthetic region.
- The 110m overview has outlines for 177 of the 258 catalog entities; the 50m overview has 242. Tiny entities omitted at a scale remain in the 10m catalog/detail. Each country lists its available overview scales. No artificial dots or inflated substitute polygons are created.

Representative source counts:

| Entity | Admin-1 source features | 10m country multipolygon parts |
| --- | ---: | ---: |
| France | 101 | 21 |
| Germany | 16 | 22 |
| USA | 51 | 344 |
| Russia | 86 | 214 |
| China | 32 | 70 |
| Brazil | 27 | 43 |
| Australia | 11 | 94 |

For example, France is represented largely by departments rather than a freshly assembled set of today's top-level regions. Russia/China/Australia counts include source fragments or cartographic stand-ins. Do not translate these counts into political/game rules. Names, alternate/local/English names where present, source type/level, ISO/HASC/FIPS codes where present and NE identifiers are retained. Source numeric/statistical GDP/population fields are not imported into the game economy.

## Boundaries, disputes and overseas areas

[Natural Earth's policy](https://www.naturalearthdata.com/about/disputed-boundaries-policy/) uses **de facto** control as its default cartographic viewpoint, rather than a universal de jure settlement. It also supplies alternate viewpoint classifications and separate claims/dispute datasets. This import retains the default source geometry and available `FCLASS_*`, `ADM0_A3_*`, `NOTE_*`, `BRK_*`, sovereignty-group and geounit metadata. It does not apply a new viewpoint, dissolve/reassign territory, decide claims, or implement the alternate-claims boundary themes.

Concrete examples in the pinned source, recorded without endorsement or conversion to gameplay ownership:

- Taiwan has its own Admin-0 entity; its source `TYPE` and `FCLASS_ISO` classifications differ. These fields are kept as source claims/classifications, not interpreted as playable-sovereignty rules.
- Palestine has its own Admin-0 geometry; the source's sovereign grouping and classification are separately retained. A geographic parent/group is not a game owner.
- The source Admin-1 records for Crimea (`RUS-283`) and Sevastopol (`RUS-5482`) reference `RUS`. They are not silently moved to another parent or made into gameplay territory.
- Somaliland, Northern Cyprus, Western Sahara and other disputed/indeterminate entities retain source identifiers, notes and classification.
- Greenland is separate from Denmark at the selected source's country level. French metropolitan/overseas geometry and other dependencies follow Natural Earth's grouping; all source multipolygon parts survive. Some overseas areas are grouped under a country while others have separate Admin-0 records. A different map-unit/sovereignty presentation would require a separately approved dataset/viewpoint decision.

This is a versioned cartographic snapshot, **not a live 2026 border feed, legal boundary survey or approved initial political scenario**. The owner's eventual disputed-territory, neutral-start and playable-country decisions remain open. MAP-01A authorizes reference data preparation only; it does not authorize T27's replacement of the fictional scenario.

## Format and mobile loading

Assets: `public/geography/natural-earth-5.1.1/`. Standard compact GeoJSON uses **WGS84 longitude/latitude in degrees**, explicitly `OGC:CRS84` axis order. There is no screen-pixel coordinate system or simulation ownership in this module.

| Asset group | Files | Raw bytes | Measured gzip bytes |
| --- | ---: | ---: | ---: |
| Manifest | 1 | 1,704 | 904 |
| Country catalog | 1 | 440,943 | 86,983 |
| 110m overview | 1 | 259,773 | 102,187 |
| 50m overview | 1 | 2,276,382 | 826,232 |
| Per-country 10m geometry | 258 | 12,421,346 | 4,496,433 |
| Per-country regional indexes | 251 | 3,492,878 | 445,060 |
| Regional geometry chunks | 302 | 29,538,010 | 9,881,752 |
| Quality report | 1 | 4,932 | 1,531 |
| Asset inventory | 1 | 114,826 | 42,673 |
| **Total** | **817** | **48,550,794** | **15,883,755** |

No `.gz` duplicates are shipped and no GitHub Pages compression behavior is assumed: `gzipBytes` is a deterministic local measurement for comparison, not a promised network transfer size. Manifest `dataAssets` totals exclude manifest/inventory metadata and state that scope explicitly.

- Nothing imports or fetches this data in the current application. Its startup geographic transfer is **zero**; existing production JS/CSS hashes are unchanged.
- A future `loadOverview()` needs only the 1,704-byte manifest and 259,773-byte coarse geometry: **261,477 raw bytes**, without the country catalog or regional data. The optional 2.28 MB medium overview is a separate explicit request.
- Country metadata, each detailed country outline and regional indexes/chunks are separate requests. Regional chunks target **256 KiB**, grouping whole source features without splitting or flattening multipolygons.
- Three indivisible source-region features exceed that target and are explicitly listed in `quality.json`: Nunavut (885,091 bytes), Antarctica (486,759), Alaska (457,984). The largest country detail is Canada (1,573,819 bytes). These are requested only as detail, never as an automatic world download.
- The loader retains only the manifest/country catalog, one active regional index and one active geometry chunk. It does not accumulate a global high-resolution geometry cache or prefetch all countries.
- Bounding boxes may span the full longitude range for antimeridian-crossing multipolygons. MAP-01B must handle wrapping/projection/polar geometry appropriately; no projection or camera change is implemented here. Coordinate precision does not imply ground accuracy, and Natural Earth's 1:10m cartographic detail cannot support arbitrarily precise military geography.

### Identifiers and relationships

`ne:admin0:<ADM0_A3>` identifies a source country entity across overview/detail levels. `ne:admin1:<ne_id>` identifies a regional feature, including those with no usable official code/name. Raw Natural Earth codes/IDs remain in `source`. IDs do not use row numbers, mutable names or potentially missing/nonunique ISO codes. Stability is tied to this pinned source; a future source/version update requires explicit migration review.

`countries.json` contains each country's metadata, detailed geometry reference, available overview scales and nullable regional-index reference. A regional index contains region records, exact `countryId` references and geometry-chunk references. Every file descriptor records raw bytes, measured gzip bytes and SHA-256. `inventory.json` audits every data asset; `quality.json` lists coverage/precision/topology exceptions. None of these identities automatically creates a sovereign country, player seat or political owner.

## Processing and geometry quality

- **No extra shape simplification, dissolving, clipping, reprojecting, polygon/ring/vertex removal, island removal or political reassignment.** Source Polygon/MultiPolygon grouping and interior rings are preserved.
- Coordinates normally use six decimal places. If that rounding would damage a source-valid geometry, the importer retains more precision. The exceptions are the 110m USA (9 decimals) and Sudan (17). This is compact numeric encoding, not higher geographic accuracy.
- Ring vertex order is reversed where necessary for RFC 7946 exterior-CCW/interior-CW winding; the boundary vertices themselves are retained.
- Across all shipped geometry/LOD assets: **14,717 polygon parts, 14,860 rings and 1,954,057 coordinate positions**. Counts include multiple detail levels; they are not unique global administrative units.
- GDAL/GEOS found **two pre-existing self-intersections**: 10m Egypt, and Goiás (`BRA-1294`, `ne_id=1159309897`). They are retained, explicitly marked `geometryStatus: "source-invalid"` in the relevant catalogs and listed in `quality.json`. No automatic repair or unapproved boundary edit is hidden. Structural GeoJSON/range/winding checks pass for all assets; that is not a claim that these two source topologies are valid.
- All source-valid geometries must remain topology-valid after processing; a precision fallback is used instead of introducing a new invalid geometry. The importer fails if it cannot preserve ring structure, polygon/ring/vertex counts or coordinate validity. No missing features are quietly discarded.

Review the two upstream defects before relying on those detailed polygons for precise analysis or future rendering. Low/medium overview geometry is independently sourced; different scales are cartographically generalized and need not align perfectly with 10m regional coasts. No globally edge-shared topology, spatial tile index or exact regional-to-country area partition is promised.

## API ready for MAP-01B

`src/geography/types.ts` defines geographic IDs, longitude/latitude positions, bounds, polygon/multipolygon features, catalogs and assets independently of React and `src/game`. `loadGeography.ts` provides explicit, base-path-aware lazy reads; `geometry.ts` checks structural geometry integrity. Fetch errors and absent records are surfaced, not replaced with invented geography.

Future caller example (documentation only; not wired into the current game):

```ts
const geographicData = createGeographyLoader({ appBaseUrl: import.meta.env.BASE_URL });
const world = await geographicData.loadOverview('110m');
// Later, only when needed:
const country = await geographicData.loadCountryGeometry('ne:admin0:FRA');
const regions = await geographicData.loadRegionIndex('ne:admin0:FRA');
if (regions?.regions[0]) {
  const region = await geographicData.loadRegionGeometry('ne:admin0:FRA', regions.regions[0].id);
}
```

These shared geographic coordinates and source IDs can support future country/region selection and additional point/line datasets for cities, infrastructure, roads, railways, transport routes and military geography. No such objects, algorithms, interactions or simulation positions are implemented. MAP-01B rendering, MAP-01C selection, MIL-01, UI-01B.3 and political ownership decisions remain separate assignments.

## Reproduction and verification

Normal `npm test` and `npm run build` use committed assets offline and need no GIS package. There are no new application dependencies or map frameworks.

Regeneration needs Python with GDAL/OGR/GEOS bindings (verified here with **GDAL 3.10.3**, `/usr/bin/python3`). The lock file verifies every raw input before processing; the source cache stays outside public assets:

```sh
/usr/bin/python3 scripts/geography/build.py --source-dir work/natural-earth-raw --download
# With the same verified cache, no network is needed:
/usr/bin/python3 scripts/geography/build.py --source-dir work/natural-earth-raw
npm test
npm run build
```

The generator supports `--output-dir` for comparison. Two runs with the pinned inputs/tooling produced **817 byte-identical files**. Geographic tests cover source identity, IDs/references, geometry/rings/coordinates, all continents, source coverage/unknowns, representative countries, preservation of island parts, hashes/sizes/chunk budgets, lazy loading and the fictional scenario. Production HTTP loading at `/heartland/` was checked for all seven representative countries. Existing gameplay browser checks remain on the fictional scenario and observed **no geographic asset requests**.

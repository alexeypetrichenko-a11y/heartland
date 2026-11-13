# Physical reference layers — MAP-01B.2

The world atlas now combines stable political colors with **real Natural Earth shaded relief/land-cover imagery and river/lake geometry**. The Terrain button switches physical rendering independently. Political fills, physical imagery, hydrology, national outlines and labels share the WGS84 camera; national outlines are redrawn above terrain. No terrain bonuses, military positions, routes or simulation effects are implemented. The six-region scenario remains the default, with its existing map and game rules.

This PR depends on **MAP-01B.1 / PR #18**. Both PRs target `main`; review/merge #18 first only after owner approval, after which its changes disappear from this PR's diff. Neither PR is merged by Codex.

## Sources investigated and selected

Verified on 2026-11-13 before generating assets. Natural Earth licenses **all versions of its vector and raster data as public domain**: [terms](https://www.naturalearthdata.com/about/terms-of-use/). Attribution is voluntary; the interface credits Natural Earth. No external tile service is called at runtime.

| Source | Decision and limits |
| --- | --- |
| [Natural Earth I, 50m](https://www.naturalearthdata.com/downloads/50m-raster-data/50m-natural-earth-1/) / [source description](https://www.naturalearthdata.com/downloads/50m-natural-earth-1/50m-natural-earth-i-with-shaded-relief-and-water/) | Selected **NE1_50M_SR_W**, satellite-derived land-cover coloring plus precomputed relief and water. WGS84, 10,800×5,400 RGB, 1/30° pixels (about 3.7 km east/west at the equator before cartographic generalization). Its broad mountain/wooded/arid patterns come from source imagery, not random textures. It is a rendered reference image, not a DEM or classified biome dataset. |
| [Publisher's quick-start repository](https://github.com/nvkelso/natural-earth-quick-start/tree/856bd7ab3a3a10dbe604eadad843b81b29f627e2/50m_raster/NE1_50M_SR_W) | Selected, checksum-pinned raster delivery. **2012-01-22 repository snapshot**, commit `856bd7ab3a3a10dbe604eadad843b81b29f627e2`; TIFF metadata date **2009:09:19 10:01:31**. The commit describes mixed 1.3/1.4 files and has no per-file semantic version. We identify the file by snapshot and SHA-256, **not** as current raster 3.2.0. The current official page advertises 3.2.0, but its displayed download link is malformed and failed; direct S3 access is denied by this environment's network policy. This older publisher copy is explicitly a review choice, not a claim of current land cover. |
| [110m rivers](https://www.naturalearthdata.com/downloads/110m-physical-vectors/110m-rivers-lake-centerlines/), [50m rivers](https://www.naturalearthdata.com/downloads/50m-physical-vectors/50m-rivers-lake-centerlines/), [10m rivers](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-rivers-lake-centerlines/), [lakes](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-lakes/) | Selected basic rivers/lake centerlines and lakes at all three scales. Every selected `.VERSION.txt` is **5.0.0**, independently of the political boundary version. Publisher repository tag **v5.1.2**, commit `f1890d9f152c896d250a77557a5751a93d494776`. Mainly World Data Bank 2, with source manual smoothing/alignment to SRTM Plus relief; not a complete hydrographic or transport network. |
| [ESA WorldCover](https://esa-worldcover.org/en/data-access) | Investigated, not imported. 2020/v100 and 2021/v200, 10m classified land cover, CC BY 4.0 with mandatory attribution. Potential later source for explicit tree-cover/grassland/bare-land masks. Different algorithms complicate year-to-year comparisons; tree cover, bare land and grassland are not synonymous with forest ecology, climatic desert or geomorphological plains. A separate verified ingestion/generalization/alignment pipeline is needed; no classes are fabricated from raster RGB values here. |
| [GEBCO 2026](https://www.gebco.net/data-products/gridded-bathymetry-data) | Investigated, not imported. Public-domain global land/ocean terrain, 15 arc-second grid, approximately 4 GB compressed / 7.2 GB GeoTIFF. A possible future numerical elevation source. Precomputed Natural Earth relief avoids adding that global DEM or a runtime hillshade engine to this mobile prototype. |

`scripts/geography/terrain-sources.lock.json` records **40 exact source URLs, sizes and SHA-256 checksums**: 36 vector components and raster TIFF/world file/metadata/readme. Verified source input totals **201,339,495 bytes**, kept outside public assets. Raster TIFF SHA-256: `22a4d66193002df6d4f1fa59655196cde48eba232fd7f60ed2f3bba5004a65ee`. No source archive or full-resolution global raster is shipped.

## Actual physical coverage

| Resolution | River/centerline source records | Renderable river features | Lake features |
| --- | ---: | ---: | ---: |
| 110m | 13 | 13 | 24 |
| 50m | 478 | 477 | 412 |
| 10m | 1,473 | 1,473 | 1,355 |

- Coverage is worldwide for the **basic Natural Earth cartographic selection**, not every river or lake. Regional supplements, historic/pluvial lakes, minor channels and new reservoirs are not imported. The 50m/10m source documents omissions of intermittent rivers and suspect alignments in northeastern Russia and parts of the Amazon basin. Seasonal/modern water extent is not simulated.
- A **50m Loire record** (`NE_ID 1159129677`, FID 460) has no geometry. It is listed in manifest quality metadata and not drawn; other valid source Loire records remain. No replacement segment is invented.
- Some source NE_IDs repeat. Each physical feature keeps both NE_ID and its source record FID in a distinct layer/scale ID. These IDs are stable within the pinned snapshot, not an approved cross-version river identity or gameplay unit ID. Chunk duplication is deduplicated at rendering.
- Two source-invalid 10m lake geometries remain flagged and unchanged: unnamed Canadian lake `1159112221`, FID 412, and **Bratsk Reservoir** `1159125163`, FID 1186. Source validity limitations are not silently repaired or hidden.
- Lake polygon/ring/vertex structure and winding are preserved using MAP-01A's offline validation. Numeric coordinates use six decimals, with higher precision retained if needed for source-valid topology. River coordinates are exported at six decimals without extra line simplification or vertex removal. Raster and vector source versions/scales differ; common coordinate registration does not guarantee identical shorelines or exact ground alignment.

## Terrain that is and is not represented

The land-cover image supplies **broad physical patterns**, including major mountain relief, wooded-land coloring, arid-land coloring and transitions across lowlands. Country color remains the geographic identity color; a green country does not mean forest, and a purple country does not mean a biome. The image is blended at restrained opacity rather than replacing political identity. Relief is the publisher's precomputed shaded image, not a newly invented mountain surface.

**Not reliably represented as separate data classes:** precise forest boundaries/forest types, current deforestation, climatic desert boundaries, grassland versus cropland/shrubland, and plains as a geomorphological class. No categorical tree/desert/grass mask is derived by thresholding the image's blended colors. Flat-looking relief does not establish a plains class. Future classified land cover needs a vetted source such as WorldCover plus its own accuracy and alignment review. This limitation and the older raster snapshot are prominent in atlas help and require owner review. Physical terrain is purely visual.

## Processing, sizes and loading

`scripts/geography/build_terrain.py` verifies locked sources **before processing**, checks raster WGS84 registration against `[-180, 1/30, 0, 90, 0, -1/30]`, and checks vector structure. All raster levels resample the source directly with **bilinear** sampling; none upsample it. WebP **quality 82** introduces documented lossy color differences. Geography is not displaced or synthesized.

| Generated assets | Count | Actual bytes |
| --- | ---: | ---: |
| 1,024×512 world WebP | 1 | **38,356** |
| Detail WebP tiles (2,048×1,024; 4,096×2,048; 8,192×4,096 grids) | 168 | **3,148,742** |
| 110m hydrology JSON | 1 | **46,286** (18,033 gzip measurement) |
| 50m hydrology JSON | 1 | **1,270,290** (443,212 gzip measurement) |
| 10m hydrology viewport chunks | 46 | **12,365,805** (4,289,260 gzip measurement) |
| Manifest, quality, bounds and inventory | 1 | **82,679** |
| **Total** | **218** | **16,952,158** |

- The atlas's first world view uses only the compact raster, 110m hydrology and manifest for physical data: **167,321 bytes**. Together with political index/110m boundaries this is **493,812 bytes** before HTTP compression, plus the lazy atlas JS chunk (19.38 KB / 7.46 KB gzip in the verified build). Normal scenario play requests none of these assets. Measured gzip sizes are not a promise about GitHub Pages compression.
- Raster tiles have **512px cores** and **one source-level-pixel gutters** (512–514px actual dimensions) to avoid seams at fractional camera scaling. Their core and expanded image bounds are recorded separately. Maximum tile: **59,736 bytes**. The 8,192px level is approximately 4.9km east/west at the equator; deeper camera zoom enlarges this finite cartographic resolution.
- Only after zooming beyond the world view are visible tiles selected according to camera scale and capped device pixel ratio (2). Tile loading waits 240ms after gestures, uses two concurrent raster requests and a **24-raster URL cache**, retaining the compact fallback. URLs are revoked on eviction/disposal. Terrain hiding/tab changes cancel fetches. No full detailed terrain world is downloaded on initial load.
- Hydrology switches from 110m to 50m at 3× and to viewport-intersecting 10m chunks at 10×. Chunks use 30° cells and retain whole source features; long rivers or lakes can occur in multiple chunks and are deduplicated by ID. Largest chunk: **1,410,552 bytes**; features are not cut into invented network segments. Requests are sequential for high-detail hydrology; the cache holds up to ten collections. This is a current size/precision tradeoff for review, not an unlimited high-resolution network.
- Political boundaries and their cache/LOD policy remain independent. Terrain errors leave the political map and fictional gameplay available; retry is supported. No dependencies, mapping framework, deployment change, PWA, external runtime service, classified-biome rules or military effects were added.

## Verification and remaining review

- `npm test`: **96 passed**; `npm run build` and `git diff --check`: passed. Tests cover source pinning/license/version, every binary/JSON hash and inventory entry, actual WebP dimensions/budgets, complete tile coverage/gutters, source IDs/references, every coordinate/ring, major named rivers/lakes, source defects, world-view loading policy, cache/retry/base paths and the existing game/geographic tests.
- Exact coordinate-registration tests cover Alps, Himalaya, Rockies, Andes, Amazon, Congo, Sahara and Australian arid interior at all tile levels. Separate GDAL checks compared **32 registered 5×5 source/processed pixel patches**: maximum mean absolute RGB error **7.173/255**, consistent with lossy WebP; no coordinate shift was introduced. Rebuilding from locked inputs into a separate directory produced **218 byte-identical assets**.
- Production Chromium at **320×568, 390×844, 844×390, 1024×768 and 1440×900**, with device scale 2: world/Alps close views, progressive requests, terrain toggle independent of political colors/camera, deduplicated 10m water features, keyboard/pan/reset, portrait↔landscape resizing at 390px, fixed navigation/scenario/turns, no page overflow/runtime errors, physical-data failure and retry. MAP-01B.1 gesture checks were also repeated with terrain enabled, including two-contact pinch/one-finger pan. An extra **568×320** check passed after correcting horizontal-control CSS precedence; reset remains inside the frame, with no page overflow.
- Seven sampled neighboring pairs in a rendered, terrain-enabled European view retain **minimum actual median-color ΔE76 49.706**; all 344 source neighbors retain the political registry minimum **40.137**. The image sample is not a proof of every terrain/palette combination or color-vision condition. Borders and labels supplement color.
- Existing full gameplay checks were repeated for all three countries at **390×844 and 1440×900**, including economy, diplomacy/AI, combat/capture/movement, division overlays, turn/draft/title/reload behavior and insufficient-funds rollback/recovery. Normal gameplay still makes zero geographic requests. Earlier MAP-01B.1 verification also covers all three countries at five sizes.
- Physical iPhone Safari/VoiceOver, live Pages and older-device memory/frame rates remain unverified. Two Chromium 390px multi-continent explorations reported about **56–60 MB JS heap** without forcing garbage collection; this excludes a complete accounting of decoded browser image/GPU memory and is not an iPhone performance guarantee. Bounded caches and progressive loading need real-device owner playtesting.

Reproduce with GDAL installed outside app dependencies:

```sh
PYTHONDONTWRITEBYTECODE=1 /usr/bin/python3 scripts/geography/build_terrain.py \
  --source-dir /path/to/source-cache --download
npm test
npm run build
```

Review images: [world](images/map-01b2-world-390.png), [Alps](images/map-01b2-alps-390.png), [Himalaya](images/map-01b2-himalaya-390.png), [Amazon](images/map-01b2-amazon-390.png), [Sahara](images/map-01b2-sahara-390.png).

**Owner review:** accept or replace the older generalized raster snapshot, and decide whether a later classified-land-cover phase is needed before calling forest/desert/grassland areas quantitatively accurate. MAP-01C, military/geographic positioning, terrain gameplay effects, UI-01B.3, UI-01C, T09 and multiplayer remain deferred. Do not merge without owner approval.

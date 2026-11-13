# World atlas rendering — MAP-01B.1

The atlas is a **read-only geographic reference**, alongside the existing fictional scenario. Open the scenario menu → **Open world atlas**; **‹ Scenario** returns to the six-region map with its selection, camera and division-layer state retained. All five navigation sections and Next week remain available. The scenario and all simulation rules remain unchanged. Country/region selection is MAP-01C; this renderer creates no playable countries or political ownership.

## Political presentation

- Source geometry remains MAP-01A's [documented Natural Earth 5.1.1 assets](README.md), including its disputed/dependent territory treatment and source defects. No boundary coordinates were changed for rendering.
- `public/atlas/political.json` holds **258 unique RGB colors**, names, source-derived label positions and polygon-envelope coverage cells. This **66,718-byte** presentation index is separate from the immutable MAP-01A inventory. It is requested only when opening the atlas.
- `scripts/geography/build_atlas.py` deterministically derives **344 neighboring entity pairs** from intersections of the 10m source geometry, including point contacts and overlaps. Only the analysis copy of source-invalid EGY uses GDAL MakeValid; stored/displayed boundaries remain unchanged. Adjacency is cartographic, not a diplomatic relationship.
- A restrained, varied palette favors high perceptual separation between neighbors. Each RGB value is unique; the minimum checked neighboring **CIELAB ΔE76 is 40.137**. Colors are keyed by geographic identity, independent of resolution, game ownership, alliances and array order. Similar non-neighbor colors remain possible; 258 colors cannot all be equally perceptually distinct. Labels supplement color at closer zoom. This is not a guarantee of color-vision accessibility for every pair.
- National outlines remain visible at a constant screen stroke width. Compound paths use even-odd fill to preserve holes. Source islands/multipolygons remain separate parts; viewport culling does not change their coordinates. Labels use source-derived points inside country geometry and collision avoidance. Labels are not new city points or selection controls.

## Camera and detail loading

- **Equirectangular WGS84** projection, `x = longitude + 180`, `y = 90 − latitude`, independent of game coordinates. It includes all continents, Antarctica, ±180° and both poles without a Mercator cutoff. Polar shapes are stretched; areas/distances must not be measured from screen pixels. Date-line parts remain on their source sides. The view does not wrap.
- The atlas has its own **1×–128×** camera. Reset fits the whole world. Pinch, one-finger drag, wheel, mouse drag and keyboard (+/−, arrows, Shift+arrows, 0/Home) are supported. Pointer/pinch anchors are maintained until an edge/zoom limit applies. A bounded quarter-viewport margin improves pointer anchoring when leaving portrait letterboxing; the world cannot be panned entirely away. The fictional camera remains 1×–4× with its existing controls.
- First open requests the presentation index plus the **259,773-byte 110m overview** (177 entities). At **2.5×**, the **2,276,382-byte 50m overview** (242 entities) is requested. At **8×**, only source-coverage cells intersecting the viewport qualify for individual 10m country assets. Up to 12 visible countries, two requests at a time, a 220ms gesture debounce and a 12-country LRU bound detail loading/memory. Coarser boundaries remain available for countries beyond the cap or failed requests. Detail geometry is converted to paths and temporary coordinate arrays can be collected.
- Opening the normal scenario requests **no geographic assets**. Atlas code is a separate lazy JS chunk. Changing/closing the atlas cancels outstanding data requests. Failure messages and retry preserve the playable scenario. No map framework, server, runtime third-party tiles, dependency, PWA or deployment configuration was added.
- The full source has 258 entities, but small countries/territories absent at coarse scales appear only when their available detail is loaded. Zooming further cannot invent source accuracy. 128× is a navigation range, not a ground-precision promise. Admin-1 assets remain ready but unused until MAP-01C.

## Future physical presentation

MAP-01B is split into two independently reviewable PRs as authorized by the owner. **MAP-01B.1** provides this renderer and political palette; **MAP-01B.2** adds researched physical raster/hydrology overlays. Political fill, outline, labels and the geographic camera are explicit rendering stages. Future physical and point overlays must use the same lon/lat projection; they must not encode simulation ownership or terrain bonuses. No terrain objects or military positions are invented in MAP-01B.1.

## Verification

- `npm test`: **89 passed**; `npm run build`: passed. New tests cover every entity/color and neighbor pair, stable LOD identity, poles/date line/holes/multipolygon projection, world fit, 128× bounds, pointer/moving-pinch anchors, source-coverage culling, base path/lazy requests/cache bounds/failure retry. Existing geography and simulation tests remain included.
- Production-preview Chromium at `/heartland/`: **320×568, 390×844, 844×390, 1024×768, 1440×900**. Checked world/close view, consistent colors through LOD changes, wheel/mouse/keyboard navigation, reset, real browser two-contact pinch and one-finger pan at 390px, 44px controls, help, scenario return/selection, fixed navigation, turn progression, no document overflow or runtime errors.
- Existing gameplay regression: all three fictional countries at those five sizes, economy/tax policy, diplomacy/AI, staging/discarding, combat/capture, division updates, movement, retained map selection/camera, title/reload and insufficient-funds rollback/recovery. No atlas/geography requests during normal gameplay.
- These are automated Chromium viewport/touch checks, **not physical iPhone Safari/VoiceOver or live Pages verification**. Source coast/detail transitions and polar distortion remain visible. Browser tests do not establish performance on every iPhone model.

Review images: [390px world view](images/map-01b1-world-390.png), [390px close view](images/map-01b1-close-390.png).

Reproduce metadata after MAP-01A generation: `/usr/bin/python3 scripts/geography/build_atlas.py` (GDAL required only for offline processing). Do not merge without owner approval.

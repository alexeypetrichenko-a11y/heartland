# MAP-01B.3 — Spherical Earth and flat-map handoff

The optional World atlas now opens as a **genuine 3D Earth**, with drag rotation, pinch/wheel zoom and the existing +/−/reset controls. Country colors and terrain preference are shared with the detailed flat map. The fictional scenario remains the default World view; the scenario menu still opens the atlas. No gameplay, division overlay, economic engine, multiplayer, country selection or default-home change is included.

Baseline: MAP-01B.1 and MAP-01B.2 were merged by the owner in PRs #18 and #19 (`main` at `bb24387`). Their Natural Earth sources, political treatment and known data limitations remain unchanged. See [source data](README.md), [political rendering](RENDERING.md) and [terrain](TERRAIN.md).

## Rendering choice

Evaluated approaches:

- A clipped circular image would not be a 3D sphere and was rejected. Projecting individual SVG/Canvas polygons would require a separate robust horizon/polygon-hole clipping system and more CPU work while rotating.
- A large 3D/map framework would add another dependency and renderer lifecycle for a scene containing one sphere. It is unnecessary for this phase.
- **Selected: native WebGL 1**, using an actual 3D unit-sphere mesh, orthographic camera, depth testing, outward triangles and back-face culling. Only the near hemisphere is displayed. There is no new application dependency or backend.

The mesh has **6,305 vertices and 12,288 triangles**, approximately **200 KB** of vertex/index data generated locally. Longitude/latitude map to unit-sphere XYZ; quaternion rotation permits full rotations, crossing the date line and poles, including arbitrary orientation. Shading is a restrained fixed view-space light/rim effect, not a simulated day/night or gameplay system. This is an orthographic spherical Earth, not a perspective/oblate-Earth model.

Existing country paths are rasterized into a **2,048×1,024** geographic texture (1,024×512 on lower-capacity supported hardware), preserving even-odd polygon holes and source multipolygon/island parts. Existing political IDs/colors are unchanged. The overview physical image and basic rivers/lakes can be composed at the same geographic registration; national borders are painted above terrain. The texture is wrapped in longitude and clamped at the poles. Duplicated seam vertices prevent texture interpolation across the wrong side of Earth.

Artificial source-geometry cuts along ±180° and the pole edges are omitted from the presentation outline, avoiding a false national border across the globe. Fill geometry and stored coordinates are unchanged. Ordinary national borders and coastlines remain drawn. No claim/dispute or ownership reassignment occurs.

## Camera and transition

`src/geography/worldCamera.ts` is presentation-only math, independent of `src/game`. It stores zoom and a unit quaternion. Geographic focus is the Earth point facing the screen center; orientation includes the current bearing. Globe picking ignores the far hemisphere and sky. Picking is used for navigation anchors, **not** country/region selection.

- At global scale, one-finger/mouse drag uses a trackball rotation. Two-contact pinch includes a moving midpoint; wheel zoom anchors to the delivered pointer position. Keyboard +/− zoom, arrows navigate, Shift+arrows take larger steps, and 0/Home resets. Zoom remains bounded to 1×–128×. The displayed multiplier now belongs to the unified camera, rather than the previous flat-map fit scale.
- When the globe has expanded to a local view, it hands off to the existing SVG country/terrain renderer with a **220ms crossfade**. Return uses the same process. A threshold adapts to screen aspect ratio and latitude; an **18% hysteresis band** prevents repeated flips around one wheel/pinch value.
- Both views retain **the same geographic focus and bearing**. Flat north/south scale matches the sphere's local angular scale; east/west scale is corrected by cosine of focus latitude. This local equirectangular view matches the first-order scale/orientation at the focus. All political, physical and future point overlays must share that camera.
- The plane wraps across the date line using visible world copies. Requests cover both source sides; source IDs deduplicate water features within each copy. Country-detail priority now favors source coverage/label positions near the focus, keeping the existing 12-country/two-request budget. This fixes a case where many tiny Pacific entities could displace Fiji from its own view's detail budget.
- Near the poles (**80–82° focus latitude**) the globe remains active. A rotated viewport that would cross a pole also stays spherical. This avoids empty polar-cap areas from an equirectangular plane. Rotation and zoom still work there.
- Reduced-motion preference removes the animated fade. Map/terrain/source state survives projection changes and ordinary section/help navigation. Reset restores the global view without changing the Terrain preference or fictional game state.

This is deliberately **not a fully animated projection morph**. Focus and local scale agree, but features near viewport edges can change shape during the dissolve. A flat map retains the globe's bearing rather than snapping north-up. Polar views retain overview-level globe detail even at close zoom; they do not gain the SVG map's full country/terrain detail. These are explicit compromises for a reliable first version.

## Loading, GPU use and recovery

- **No new geographic/terrain assets** were added or regenerated. The initial globe uses the existing political catalog/110m overview and 38,356-byte physical overview plus manifest/basic water data: **493,812 geographic/physical bytes** before HTTP compression with Terrain enabled. No 10m world, detailed regional data or high-resolution terrain pyramid is preloaded. Normal fictional gameplay still makes no geographic requests.
- The 50m political overview loads after globe zoom reaches 2.5×. Country detail and detailed physical tiles/chunks remain progressive in the flat view, with the existing bounded caches and request limits. There is no persistent terrain cache, service worker, IndexedDB or MAP-01B.5 work.
- The verified lazy atlas JS chunk is about **34 KB / 13 KB gzip**, versus about 19 KB / 7.5 KB in MAP-01B.2. Main application JS remains about **278 KB**. These are build measurements, not claims about Pages compression or device performance.
- The globe uses one GPU texture: **8 MiB before mipmaps** at 2,048×1,024, plus one reusable CPU texture canvas, the mesh and framebuffer. Drawing density is capped at 2× device pixel ratio and about **two million framebuffer pixels**. Driver antialiasing/depth/image allocations add memory; this is not a complete measured GPU-memory budget.
- Input updates are coalesced per animation frame. Rendering happens on camera/size/material changes, with **no continuous render loop while idle**. The hidden globe pauses rendering. Texture composition occurs for source/terrain changes, not each rotation. Buffers, textures, programs and removed canvas contexts are released on teardown.
- Missing WebGL, insufficient texture capacity, shader/texture initialization failure or context loss produces a functioning flat-atlas fallback. Initial failure fits the old flat world. An explored focus/scale is retained where the bounded flat view allows it; limits/polar fallback can clamp the view. The game and navigation remain available. There is no automatic context-retry loop. Leaving the prototype and reopening it, or reloading the app, retries initialization; ordinary section/atlas navigation retains the fallback.

## Verification

- `npm test`: **112 passed**, including the previous 96 tests. New coverage checks true sphere geometry/winding/UV seams, unit rotations, globe/flat picking and gesture anchors, focus/scale/orientation agreement, threshold hysteresis, polar safeguards, date-line copies, zoom/GPU bounds, WebGL fallback math, real source polar/multipolygon outlines and focused detail prioritization. Existing scenario, simulation and every geographic/physical asset integrity test remain included.
- `npm run build` and `git diff --check`: passed. Protected game, dependency and deployment paths are unchanged. Claude's independent economy-engine directory is not part of this change.
- Production-preview Chromium at `/heartland/`, device scale 2: **320×568, 390×844, 844×390, 568×320, 1024×768 and 1440×900**. Checked global sphere, actual indexed WebGL drawing/depth/culling, idle rendering, rotation/wheel, keyboard, retained focus/scale and intermediate fade frames, repeated round trips, terrain preference, 44px controls, scenario/nav/turns and no document overflow/runtime errors.
- At 390px: real two-contact browser pinch followed by one-finger rotation; zoom into France; date-line globe and flat Fiji views, country-detail request and physical tiles on both sides, panning across ±180°; north-pole close zoom up to 128× and south-pole view; portrait/landscape resize.
- Seven **actual GPU center-pixel samples** with Terrain off verify geographic/color alignment for France, Germany, USA, Russia, China, Brazil and Australia. They match the existing palette within the small expected soft-light difference. Flat colors still use the identical ID registry. Terrain/source-registration tests remain included; globe and local terrain screenshots were visually inspected.
- WebGL deliberately unavailable, forced `WEBGL_lose_context` recovery with retained explored focus, injected GPU texture-allocation failure, and reduced-motion transitions all passed. Normal gameplay was repeated for all three countries at **390×844 and 1440×900**, including economy, diplomacy/AI, combat/capture/movement, division overlays, drafts, turns, title/reload and insufficient-funds rollback/recovery; zero geographic startup requests.
- Validation findings resolved: flat-ocean compositing initially differed from the globe because its backdrop was outside the isolated group; restored the geographic ocean backdrop. Focused-detail prioritization fixed the Fiji budget case. Browser assertions use actual delivered high-DPI wheel coordinates and wait for committed zoom limits before clicking again; those test-harness corrections do not change input behavior.

**Remaining limitations:** These are Chromium checks using software WebGL in the cloud, not physical iPhone/Safari/VoiceOver or mobile-GPU frame-rate/memory validation. WebKit launch was attempted, but this environment has no WebKit executable. Live Pages is unverified. The globe's finite 2K texture/overview geometry means tiny entities and close polar terrain can be soft or absent at overview scale; border widths scale with that texture until the SVG handoff. Existing old terrain snapshot, coarse/medium/detail shoreline differences, unsupported classified biomes and inherited source defects remain documented in [TERRAIN.md](TERRAIN.md). No new ground-precision claim is made.

## Reproduce browser checks

Use an existing external Playwright installation; no app dependency is required:

```sh
npm test
npm run build
npm run preview -- --host 0.0.0.0 --port 4173
# In another shell, with a prepared browser installation:
HEARTLAND_PLAYWRIGHT_MODULE=/path/to/playwright-core \
HEARTLAND_CHROMIUM=/path/to/chromium \
node --experimental-strip-types scripts/geography/check_globe.cjs
```

`HEARTLAND_TEST_URL` overrides the preview URL; `HEARTLAND_BROWSER_OUTPUT` chooses a capture directory (default: a new temporary directory). `HEARTLAND_VIEWPORTS` can restrict the viewport list, e.g. `'[[390,844]]'`. The test's SwiftShader flag is for headless Chromium verification, not shipped application behavior or evidence of physical GPU performance.

Review captures: [global globe](images/map-01b3-globe-390.png), [France flat view](images/map-01b3-france-390.png), [date-line globe](images/map-01b3-date-globe-390.png), [date-line flat map](images/map-01b3-date-flat-390.png), [south pole](images/map-01b3-south-pole-390.png), [WebGL fallback](images/map-01b3-fallback-390.png).

MAP-01B.4 (default home), MAP-01B.5 (persistent terrain cache), MAP-01C selection, military positioning, multiplayer and real-time simulation remain deferred. This task is delivered through PR [#21](https://github.com/alexeypetrichenko-a11y/heartland/pull/21) to `main`, unmerged pending owner approval.

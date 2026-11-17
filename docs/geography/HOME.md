# MAP-01B.4 — Globe as the opening screen

Heartland now opens directly on the existing interactive 3D Earth at `/heartland/`. There is no title-button, World-button or scenario-selection prerequisite. A simple **Loading Earth…** indicator covers initial code/geographic loading; the fictional map is never rendered first. This is an exploration screen, not real-world country selection or an automatically started game.

The owner authorized this entry change on 2026-11-16. It is part of the still-unmerged PR [#21](https://github.com/alexeypetrichenko-a11y/heartland/pull/21), branch `task/map-01b3-spherical-earth`. GitHub `main`, production Pages settings, the simulation, `economy-engine/` and Claude's PR #20 are unchanged.

## Navigation and retained state

- **Fictional game** is a secondary button in the header. Only that explicit action creates the existing unselected scenario state and loads its UI. The player must choose a country and press **Start local scenario**; no country, week or military/economic command is chosen automatically.
- Inside the game, Scenario menu → **Return to globe** opens exploration. The header then offers **Resume game**. The same game and atlas components stay mounted after first use, preserving game week/budget, pending economic/military/diplomatic drafts, unfinished forms, selected region, map/division-layer state, atlas camera and Terrain setting. Hidden views are not interactive or exposed to accessibility navigation.
- Refreshing the page starts on the globe and resets the in-memory fictional game, as before. No new save-game system is implemented. A restored document's `pageshow` event and a standalone/Home Screen web view becoming visible also return to exploration without clearing the retained game or camera. An ordinary browser-tab visibility change leaves the current screen alone.
- Terrain preference persists as the single boolean `heartland.atlas.terrain` in localStorage. This is UI preference storage, not a terrain cache. Denied storage/quota errors fall back safely to in-tab state; refresh defaults Terrain on when stored preferences cannot be read.
- The exploration header has no fictional-country HUD, week, Next week or game tabs. These remain available after explicit country setup inside the existing game. The compact navy/gold palette, safe areas, 44px controls and viewport-fitting globe remain.

## Architecture and loading

`src/app/App.tsx` owns the entry/navigation state and one lazily imported `AtlasMap`. The renderer was moved out of `PrototypePage`; it was not copied. `PrototypePage` is itself lazy and mounts only after explicit game access. Its existing simulation callbacks are unchanged. The previous title component is no longer an entry prerequisite.

The world camera, native WebGL sphere, north-up controls, vector borders, 220ms projection handoff, 280ms geometry fades, progressive country/physical detail, date-line/polar handling and WebGL fallback are unchanged. See [GLOBE.md](GLOBE.md). Inactive atlas views cancel requests and stop drawing.

Startup intentionally requests the existing bounded coarse atlas assets: **493,812 geographic/physical bytes before compression** with Terrain on. It does not preload 50m, country/Admin-1 detail or the high-resolution terrain pyramid. The build keeps separate atlas (**about 38.7 KB / 14.3 KB gzip**) and fictional-game UI (**38.8 KB / 11.9 KB gzip**) chunks; main JS is about **239 KB / 74.8 KB gzip**, down from about 278 KB before this entry change. No dependencies or production deployment configuration were added.

Slow geographic loads display a status indicator. Data failure retains a retry and access to the fictional game. Code-load failures are contained by a screen error boundary with a reload instruction; the secondary game button remains outside the atlas boundary. Interactive controls keep their focus rings; programmatic focus on the noninteractive main landmark does not paint a viewport-wide ring.

## Verification

- `npm test`: **123 passed**, including all previous 119 game/geographic/overlay/camera/border tests and four UI preference/storage-failure cases. `npm run build` and `git diff --check`: passed.
- Production Chromium at **320×568, 390×844, 844×390, 568×320, 1024×768 and 1440×900**: automatic globe without title/game setup, no auto-selected country/game HUD, default north-up camera, coarse-only startup, 44px targets and no viewport overflow/startup errors.
- Navigation checks at all six sizes: explicit setup with an empty country choice, returning/resuming with exact camera/Terrain, retained selected region, staged economy/military/diplomacy commands, an unfinished diplomatic form, week/budget and document-restoration behavior. Refresh opens the globe and retains the stored Terrain setting, with no fictional game until requested. The lazy game UI is not requested during initial exploration.
- Slow geographic startup, catalog failure/retry, atlas-code failure with game access, and denied localStorage checks passed. Startup, reload and visibility resume under emulated standalone flags passed with game state retained. Ordinary browser-tab visibility keeps the current screen. These are emulation checks, not physical Home Screen launches.
- Existing globe suite passed at all six sizes: rotation/touch pinch, wheel/keyboard/reset, globe/flat round trips, geographic focus/scale, real country colors, terrain, poles/date line, progressive borders/detail, 2,000 DOM drag/GPU north-up stress checks, reduced motion and WebGL/context/allocation fallbacks.
- Gameplay regression passed for all three countries at 390×844 and 1440×900: region/division layers, economy/policy, diplomacy/AI, military movement/combat/capture, drafts, turns, globe/resume, refresh and insufficient-funds recovery.

Optional browser reproduction uses the existing external Playwright installation, without adding an application dependency:

```sh
npm test
npm run build
npm run preview -- --host 0.0.0.0 --port 4173
# In another shell:
HEARTLAND_PLAYWRIGHT_MODULE=/path/to/playwright-core \
node scripts/geography/check_home.cjs
HEARTLAND_PLAYWRIGHT_MODULE=/path/to/playwright-core \
node --experimental-strip-types scripts/geography/check_globe.cjs
```

Both scripts accept `HEARTLAND_TEST_URL`, `HEARTLAND_CHROMIUM`, `HEARTLAND_BROWSER_OUTPUT` and `HEARTLAND_VIEWPORTS`. Chromium uses software WebGL in this environment; no mobile GPU frame-rate or memory guarantee is made.

Review captures: [portrait opening globe](images/map-home-390.png), [landscape opening globe](images/map-home-844.png), [loading indicator](images/map-home-loading-390.png).

## Physical iPhone validation and limits

Use the refreshed separate preview at **https://heartland-pr21-globe-preview.soundcookie8.chatgpt.site/heartland/**. Reload it in Safari. The Earth should open automatically; use **Fictional game** only to test the preserved scenario.

For a Home Screen check, open this exact preview URL in Safari → Share → **Add to Home Screen**, then launch that shortcut in portrait and landscape. Also test returning to a running page after switching apps. The app's URL always remains the root `/heartland/`; no game-only route is saved in the shortcut. Cold entry, document restoration and standalone visibility resume open exploration. Native cold/warm Home Screen behavior still needs a physical-device check.

**Physical iPhone/Safari/Home Screen launching and VoiceOver were not available here.** No PWA manifest, standalone installation promise, service worker or offline cache was added. The existing terrain/texture, polar, projection-periphery and near-polar pinch limits remain documented in GLOBE.md. Country selection (MAP-01C), persistent terrain caches (MAP-01B.5), new mechanics and multiplayer remain deferred. Do not merge without owner approval.

# MAP-01C · Country inspection

Tap a country on the opening globe or the flat map to see its name, Natural Earth identifier, geographic subregion, and playability status. Selected territory gains a gold tint and outline. Tap another country to switch. The close button dismisses the card and returns focus to the map. With keyboard focus on the map, arrows move the view, Enter or Space inspects the center, and Escape clears selection.

## Interaction and data

- The atlas owns one `GeographicCountryId`. The selected ID survives camera movement, projection changes, and visits to the fictional game within the current page. A refresh starts a fresh inspection session.
- The six-pixel drag threshold also separates taps from drags. Pinches and canceled pointers cannot select. A direct hit takes precedence. For a finger landing just off a coastline, the picker samples nearby visible polygons within six CSS pixels. Empty taps leave the current selection in place.
- Picking unprojects the tapped screen point into longitude and latitude. During a projection or detail fade it uses the visually dominant source. Bounding boxes narrow the search, and the browser tests the existing fill paths with the even-odd rule used by the renderer. The front hemisphere guard and date-line wrapping use the atlas camera. The last painted source feature takes precedence at overlapping boundaries.
- Name and full ID come from the atlas catalog. The first selection loads the existing 440,943-byte Natural Earth country catalog on demand and retains its subregion and continent labels in memory. Until those are available, the card shows the atlas's source-derived map point. That point represents a place inside the country geometry. The panel contains geographic fields only.
- Playability flags are keyed separately by geographic ID. All 258 records currently show **Playability undecided**. The owner will choose the initial six countries. Admin-1 inspection and the real-country game setup remain separate milestones.

## Rendering and mobile layout

The globe draws a single selected alpha mask on its existing sphere and adds the selected outline with the current border shader. At 2,048 × 1,024, the mask uses 2 MiB before mipmaps. Changing selection uploads only that mask and the selected outline. The temporary raster surface is released after upload. Moving the camera reuses both GPU resources. Clearing the selection reduces the mask to a placeholder pixel.

The flat renderer reuses the existing SVG paths across loaded detail stages and wrapped world copies. The panel floats inside the map so it cannot resize the camera. In short landscape viewports it moves to the side, leaving the center and zoom controls free. Dismissal has a 44px target. A WebGL fallback can still inspect and highlight the flat map.

The atlas uses Natural Earth's existing country and territory groupings, including separated and disputed areas. Tiny countries or islands omitted at a given source scale need closer zoom. At the globe limb, the low-resolution texture and projected geometry can differ slightly. Zoom toward a crowded area to make small targets easier to tap. [Geographic sources and limits](README.md)

## Verification and iPhone review

- `npm test` passed all 129 tests. New cases cover both inverse projections, the date line, tap tolerance, overlapping shapes, rejected sky/letterbox hits, undecided playability and lazy geographic metadata. `npm run build` passed.
- Production Chromium selection checks cover 320×568, 390×844, 844×390, 568×320 and 1440×900. They check real touch taps and mouse clicks, the rendered globe tint, SVG fill and outline, selection replacement and dismissal, keyboard access, camera and selection persistence, compact panels and viewport fit. Touch drags, pinches and canceled touches preserve the previous selection.
- Monaco is selectable at 10m detail. Lesotho is selectable inside South Africa. Fiji responds on both sides of the date line in both projections, and the flat highlight follows both world copies. The flat WebGL fallback also supports selection.
- Globe and opening-screen browser regressions cover six viewport sizes. The globe stress test includes 2,000 drags without accidental country selection. Gameplay regressions cover all three fictional countries at 390×844 and 1440×900, including turn progression, map selection, divisions, economy and diplomacy.
- Browser checks used Chromium with software WebGL. This revision still needs physical iPhone Safari testing. WebKit is unavailable in the workspace.

Run the selection checks against a production preview with an existing Playwright installation.

```sh
npm run build
npm run preview -- --host 0.0.0.0 --port 4173
# In another shell
HEARTLAND_PLAYWRIGHT_MODULE=/path/to/playwright-core \
node --experimental-strip-types scripts/geography/check_selection.cjs
```

For the device check, open the separate preview in Safari. Tap France or Germany, then drag and pinch through the handoff to the flat map. Check that the selection survives both gestures. Choose a new country, clear it, and repeat in landscape. For a small-country check, zoom into Monaco on the Mediterranean coast. [MAP-01C preview](https://heartland-map-01c-preview.soundcookie8.chatgpt.site/heartland/)

Review captures show [globe selection](images/map-01c-globe-390.png), [flat selection](images/map-01c-flat-390.png), [landscape layout](images/map-01c-globe-844.png), [Monaco at close zoom](images/map-01c-monaco-390.png), and [Fiji at the date line](images/map-01c-fiji-390.png).

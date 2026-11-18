# MAP-01D · Administrative regions

Tap a country on the globe, then zoom until the **Regions** button appears on the flat map. Tap an outlined region to view its name, parent country, Natural Earth ID and available source codes. Gold fill and outline mark the selected territory. Close the region card to return to its parent. Turn **Regions** off to inspect countries at the same zoom.

## Hierarchy and touch behavior

- The globe and the wider flat view use country selection. Regions appear when the flat transition and the existing country-detail zoom stage finish. The threshold is about 1.8 times the camera's handoff zoom and varies with latitude and screen shape. On devices using the flat fallback, regions can appear at 12×.
- The selected country takes precedence while its outline intersects the view. Otherwise the atlas uses the country under the settled map center. Tap land in a neighboring country to switch the country in focus. If a country has no usable records or geometry is still loading, its country card remains available.
- Pinching and dragging never select a region. Tap misses can search within six CSS pixels. A direct hit on a neighboring country takes precedence over nearby regions. With the map focused, Enter or Space picks the center and Escape clears the current card.
- Zooming out or turning Regions off shows the parent card. A region stays selected when you return to close zoom in that country, until you clear it or select elsewhere. The card floats inside the map, shifts to the side in short landscape views and has a 44px dismissal target.

## Geographic data and limits

The atlas uses the existing Natural Earth **5.1.1 Admin-1 states and provinces at 1:10m**. Its source records include 101 entries for France, primarily departments, 16 for Germany and 51 for the United States. The UI keeps the source's mixed levels, island fragments and parent relationships. For example, it can inspect Berlin, Hawaii and Singapore's five level-zero districts. The original coordinates and data files remain intact. [Source, public-domain license and boundary policy](README.md)

All 4,596 source records remain in the repository. Of these, 4,569 in 225 entities are eligible for the layer. Seven of the 258 entities have no region index, including Bir Tawil. Another 26 have a lone level-zero whole-country stand-in, including Monaco and Vatican City. Those entities retain country inspection. The app skips the one Admin-1 geometry flagged as invalid, Goiás in Brazil. Where a usable polygon has neither a source nor an English name, the card displays **Unnamed region** with the existing ID and available raw codes.

Natural Earth generalizes boundaries and follows its documented de facto viewpoint. The displayed parent is the source relationship. Some Admin-1 coasts differ from the currently displayed Admin-0 outline. The renderer and picker limit the presentation to that parent outline and respect its holes. Those constraints can leave parts of a border, coast or tiny island available only for country inspection. The camera keeps the spherical view near the poles, where country inspection remains available.

## Loading and interface

The coarse globe makes no Admin-1 requests. At close zoom, the atlas reads the active country's index, then plans chunks from the region bounds that overlap the wrapped viewport. It requests nearest chunks first, one at a time. A view retains at most four chunks and 1.2 MB of uncompressed geometry input and one country index. The largest existing index is 181,655 bytes. Bounds and chunk grouping can include some adjacent regions in a file. Zoom in further when the budget limits the number of visible chunks.

Requests settle after movement, cancel when the view changes and evict geometry outside the current plan. Loaded geometry can still be selected if another chunk fails, and a Retry button appears for the failed data. Wrapped SVG paths share the existing flat camera and sit above terrain and below country outlines. MAP-01D adds no global mesh, texture, source asset or dependency.

`GeographicRegion` remains the interface for geographic inspection. It joins a stable `ne:admin1:<ne_id>` to its `ne:admin0:<ADM0_A3>` parent and a source polygon in WGS84 longitude and latitude. Consumers can use `loadRegionIndex` and `loadRegionGeometry` without React. Gameplay region IDs and ownership remain separate.

## iPhone review

Open the separate preview in Safari. Tap France, pinch toward Paris and keep zooming until **Regions** appears. Tap a department and compare its highlight and card with those of the next department. Drag and pinch while a region is selected, then zoom back to the globe to see the parent country. Repeat in landscape and try turning **Regions** off while still zoomed in. [MAP-01D HTTPS preview](https://heartland-map-01d-preview.soundcookie8.chatgpt.site/heartland/)

The preview uses an isolated Sites project and the tested production build with the existing `/heartland/` base. It is available to anyone with the link and needs no GitHub Pages changes or new iPhone configuration. The project owner can remove public access after review.

## Verification

- `npm test` passed all 134 tests. The new tests cover source records, country references, wrapped viewport planning, request budgets, cancellation and projection. `npm run build` passed.
- Chromium production-preview checks passed at 320×568, 390×844, 844×390, 568×320 and 1440×900. They verified compact layout without viewport overflow, tap versus drag or pinch, the globe-to-flat handoff, selection restored at close zoom, the Regions toggle and return to the parent card.
- The browser cases selected Paris and Hauts-de-Seine, Berlin and surrounding Brandenburg, California, Hawaii, Central Singapore and an unnamed Anguilla island. Monaco and Bir Tawil retained country selection with no regional geometry download. Fiji's Northern region remained selectable on both sides of the date line. A simulated geometry failure verified that the country remained selectable and Retry restored the layer.
- Country selection and north-up globe regressions passed, including WebGL fallback. For each fictional country, mobile and desktop workflows passed economy, diplomacy, movement, combat, divisions, turns and returning to the atlas. Physical iPhone Safari validation is pending. Browser checks used Chromium with software WebGL.

To reproduce the regional browser checks, run the production preview and use an existing Playwright installation.

```sh
npm run build
npm run preview -- --host 0.0.0.0 --port 4173
# In another shell
HEARTLAND_CHECK_REGIONS_ONLY=1 HEARTLAND_PLAYWRIGHT_MODULE=/path/to/playwright-core \
node scripts/geography/check_selection.cjs
```

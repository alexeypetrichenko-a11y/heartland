# MAP-01D · Administrative regions

Tap a country on the globe and choose **Regions** in its card. The map fits its main territory in the space around the card and controls. Tap an outlined region to view its name, parent country, Natural Earth ID and available source codes. Gold fill and outline mark the selected territory. Close the region card to return to its parent. At close zoom, turn off the **Regions** layer control to inspect countries at the same scale.

## Hierarchy and touch behavior

- The country card offers **Regions** at every zoom. The shortcut centers and fits the main territory even when the initial tap lands on a distant holding. The automatic zoom caps at 64× for small countries. You can still navigate manually to distant holdings and use the existing zoom controls up to 128×.
- The fit uses the actual map rectangle and leaves space around the country card, map controls and safe-area layout. It recalculates when the map or card resizes. A drag, pinch, wheel or keyboard move hands control back to the player. Selecting a region also ends the automatic fitting.
- The camera uses the same north-up projections, smooth handoff and shortest longitude path across the date line. A fitted flat view opens the layer once there is enough room to read its boundaries. Broad views, such as the contiguous US or Russia, can stay on the globe and show **Zoom in for regions**. The map honors the reduced-motion preference.
- Manual zoom still reveals regions when the flat transition and the existing country-detail stage finish. The threshold is about 1.8 times the camera's handoff zoom and varies with latitude and screen shape. On devices using the flat fallback, regions can appear at 12×.
- The selected country takes precedence while its outline intersects the view. Otherwise the atlas uses the country under the settled map center. Tap land in a neighboring country to switch the country in focus. If a country has no usable records or geometry is still loading, its country card remains available.
- Pinching and dragging never select a region. Tap misses can search within six CSS pixels. A direct hit on a neighboring country takes precedence over nearby regions. With the map focused, Enter or Space picks the center and Escape clears the current card.
- Zooming out or turning Regions off shows the parent card. A region stays selected when you return to close zoom in that country, until you clear it or select elsewhere. The card floats inside the map, shifts to the side in short landscape views and has a 44px dismissal target.

## Geographic data and limits

The atlas uses the existing Natural Earth **5.1.1 Admin-1 states and provinces at 1:10m**. Its source records include 101 entries for France, primarily departments, 16 for Germany and 51 for the United States. The UI keeps the source's mixed levels, island fragments and parent relationships. For example, it can inspect Berlin, Hawaii and Singapore's five level-zero districts. The original coordinates and data files remain intact. [Source, public-domain license and boundary policy](README.md)

All 4,596 source records remain in the repository. Of these, 4,569 in 225 entities are eligible for the layer. Seven of the 258 entities have no region index, including Bir Tawil. Another 26 have a lone level-zero whole-country stand-in, including Monaco and Vatican City. Those entities retain country inspection. The app skips the one Admin-1 geometry flagged as invalid, Goiás in Brazil. Where a usable polygon has neither a source nor an English name, the card displays **Unnamed region** with the existing ID and available raw codes.

Natural Earth generalizes boundaries and follows its documented de facto viewpoint. The displayed parent is the source relationship. Some Admin-1 coasts differ from the currently displayed Admin-0 outline. The renderer and picker limit the presentation to that parent outline and respect its holes. Those constraints can leave parts of a border, coast or tiny island available only for country inspection. The camera keeps the spherical view near the poles, where country inspection remains available.

The atlas catalog derives a main territory extent from the 10m Admin-0 polygons. It starts with the largest landmass by latitude-adjusted area, groups nearby major parts and includes close coastal islands. It uses wider gaps between major islands for archipelagos. Parts that meet at the date line share the shortest wrapped longitude span. France therefore frames metropolitan France and Corsica, the US frames the contiguous states and Indonesia includes its major islands. This is a geometric grouping for the camera. The source borders and selection rules are preserved.

## Loading and interface

The coarse globe makes no Admin-1 requests. A coverage list in the atlas catalog lets the country card disable **Regions** for entities without usable source records. The compact main extents use the same catalog request and require no new geometry download. At regional scale, the atlas can load the fitted country's detailed outline ahead of its neighbors. Once the view settles, the region layer reads its index and requests nearest chunks first, one at a time. A view retains at most four chunks and 1.2 MB of uncompressed geometry input and one country index. The largest existing index is 181,655 bytes. Zoom in further when the budget limits the number of visible chunks.

Requests settle after movement, cancel when the view changes and evict geometry outside the current plan. Loaded geometry can still be selected if another chunk fails, and a Retry button appears for the failed data. Wrapped SVG paths share the existing flat camera and sit above terrain and below country outlines. MAP-01D adds no global mesh, texture, source asset or dependency.

`GeographicRegion` remains the interface for geographic inspection. It joins a stable `ne:admin1:<ne_id>` to its `ne:admin0:<ADM0_A3>` parent and a source polygon in WGS84 longitude and latitude. Consumers can use `loadRegionIndex` and `loadRegionGeometry` without React. Gameplay region IDs and ownership remain separate.

## iPhone review

Open the separate preview in Safari. Tap France on the opening globe and choose **Regions**. Rotate the phone before panning to see the map fit beside the card. Try the United States for a wide overview, then pinch toward a state to open its regional boundaries. [iPhone preview](https://heartland-map-01d-preview.soundcookie8.chatgpt.site/heartland/)

The preview uses an isolated Sites project and the tested production build with the existing `/heartland/` base. It is available to anyone with the link and needs no GitHub Pages changes or new iPhone configuration. The project owner can remove public access after review.

## Verification

- `npm test` passed all 140 tests and `npm run build` passed. Framing tests use the source extents and coast vertices of France, Germany, the US, Russia, Indonesia, Luxembourg and Fiji with portrait and landscape obstructions. They also check a taller card and the flat fallback.
- Chromium production-preview checks passed at 320×568, 390×844, 844×390, 568×320 and 1440×900. They verified compact layout without viewport overflow, tap versus drag or pinch, the globe-to-flat handoff, selection restored at close zoom, the Regions toggle and return to the parent card.
- Country framing checks also start from French Guiana and Hawaii, verify both sides of Fiji's date line, and test a taller inspection card and portrait-to-landscape rotation. A zoom gesture hands control back before the next resize. The US overview can zoom into and select Kansas.
- The browser cases selected Paris and Hauts-de-Seine, Berlin and surrounding Brandenburg, California, Hawaii, Central Singapore and an unnamed Anguilla island. Monaco and Bir Tawil retained country selection with no regional geometry download. Fiji's Northern region remained selectable on both sides of the date line. A simulated geometry failure verified that the country remained selectable and Retry restored the layer.
- Country selection and north-up globe regressions cover WebGL fallback. The owner confirmed the merged MAP-01D shortcut on physical iPhone Safari. The adaptive fit is ready for separate device review. Browser checks used Chromium with software WebGL.

To reproduce the regional browser checks, run the production preview and use an existing Playwright installation.

```sh
npm run build
npm run preview -- --host 0.0.0.0 --port 4173
# In another shell
HEARTLAND_CHECK_FRAMING_ONLY=1 HEARTLAND_PLAYWRIGHT_MODULE=/path/to/playwright-core \
node scripts/geography/check_selection.cjs
```

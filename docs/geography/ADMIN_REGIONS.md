# MAP-01D · Administrative regions

Tap a country on the globe and choose **Regions** in its card. The map fits its main territory in the space around the card and controls. Regions appear at that scale on the globe or flat map. Tap an outlined region to view its name, parent country, Natural Earth ID and available source codes. Gold fill and outline mark the selected territory. Close the region card to return to its parent. Turn off the **Regions** layer control to inspect countries at the same scale.

## Hierarchy and touch behavior

- The country card offers **Regions** at every zoom. The shortcut centers and fits the main territory even when the initial tap lands on a distant holding. The automatic zoom caps at 64× for small countries. You can still navigate manually to distant holdings and use the existing zoom controls up to 128×.
- The fit uses the actual map rectangle and leaves space around the country card, map controls and safe-area layout. It recalculates when the map or card resizes. A drag, pinch, wheel or keyboard move hands control back to the player. Selecting a region also ends the automatic fitting.
- The camera uses the same north-up projections, smooth handoff and shortest longitude path across the date line. Choosing **Regions** keeps the layer active at the fitted scale. Broad views, such as the contiguous US or Russia, can show and select regions on the globe. The map honors the reduced-motion preference.
- Manual zoom still reveals regions when the flat transition and the existing country-detail stage finish. The threshold is about 1.8 times the camera's handoff zoom and varies with latitude and screen shape. On devices using the flat fallback, regions can appear at 12×.
- After using the shortcut, the layer follows the chosen country until you clear it or select another country. With automatic close-zoom activation, the selected country takes precedence while its outline intersects the view. Otherwise the atlas uses the country under the settled map center. Tap land in a neighboring country to switch the country in focus. The country card stays available during loading and when source geometry is missing.
- Pinching and dragging never select a region. Tap misses can search within six CSS pixels. A direct hit on a neighboring country takes precedence over nearby regions. With the map focused, Enter or Space picks the center and Escape clears the current card.
- An explicit region selection persists through zoom and projection changes. In automatic mode, zooming out shows the parent card and returning to close zoom restores the region selection. Turning Regions off also shows the parent card. The card floats inside the map, shifts to the side in short landscape views and has a 44px dismissal target.

## Geographic data and limits

The atlas uses the existing Natural Earth **5.1.1 Admin-1 states and provinces at 1:10m**. Its source records include 101 entries for France, primarily departments, 16 for Germany and 51 for the United States. The UI keeps the source's mixed levels, island fragments and parent relationships. For example, it can inspect Berlin, Hawaii and Singapore's five level-zero districts. The original coordinates and data files remain intact. [Source, public-domain license and boundary policy](README.md)

All 4,596 source records remain in the repository. Of these, 4,569 in 225 entities are eligible for the layer. Seven of the 258 entities have no region index, including Bir Tawil. Another 26 have a lone level-zero whole-country stand-in, including Monaco and Vatican City. Those entities retain country inspection. The app skips the one Admin-1 geometry flagged as invalid, Goiás in Brazil. Where a usable polygon has neither a source nor an English name, the card displays **Unnamed region** with the existing ID and available raw codes.

Natural Earth generalizes boundaries and follows its documented de facto viewpoint. The displayed parent is the source relationship. Some Admin-1 coasts differ from the currently displayed Admin-0 outline. The renderers and picker limit the presentation to that parent outline and respect its holes. Those constraints can leave parts of a border, coast or tiny island available only for country inspection. The camera keeps the spherical view near the poles.

The atlas catalog derives a main territory extent from the 10m Admin-0 polygons. It starts with the largest landmass by latitude-adjusted area, groups nearby major parts and includes close coastal islands. It uses wider gaps between major islands for archipelagos. Parts that meet at the date line share the shortest wrapped longitude span. France therefore frames metropolitan France and Corsica, the US frames the contiguous states and Indonesia includes its major islands. This is a geometric grouping for the camera. The source borders and selection rules are preserved.

## Loading and interface

Opening the globe makes no Admin-1 requests. A coverage list in the atlas catalog lets the country card disable **Regions** for entities without usable source records. The compact main extents use the same catalog request. When you use the shortcut, the layer starts loading the chosen country's nearest chunks for the fitted destination during the camera move. A view retains at most four chunks and 1.2 MB of uncompressed geometry input and one country index. The largest existing index is 181,655 bytes.

Manual navigation waits for movement to settle before requesting more geometry. Requests cancel when the plan changes and the app evicts chunks outside the new plan. **Loading regions** stays visible while data arrives. **Partial regional coverage** means the budget limited the loaded area. Pan or zoom to inspect more. Missing source records and unavailable geometry have distinct messages. Loaded geometry can still be selected if another chunk fails, and a Retry button appears for the failed data.

Wrapped SVG paths use the existing flat camera. The globe draws the same source outlines with a regional WebGL line buffer and clips them to the visible hemisphere and parent country. Both projections use the same loaded chunks and geographic IDs. The globe releases the line buffer when the layer closes or the flat handoff finishes.

`GeographicRegion` remains the interface for geographic inspection. It joins a stable `ne:admin1:<ne_id>` to its `ne:admin0:<ADM0_A3>` parent and a source polygon in WGS84 longitude and latitude. Consumers can use `loadRegionIndex` and `loadRegionGeometry` without React. Gameplay region IDs and ownership remain separate.

## iPhone review

Open the separate preview in Safari. Tap France or the United States and choose **Regions**. Once the map settles and regions are loaded, tap a department or state at the fitted view. Rotate the phone before panning to see the map fit beside the card. [iPhone preview](https://heartland-map-01d-preview.soundcookie8.chatgpt.site/heartland/)

The preview uses an isolated Sites project and the tested production build with the existing `/heartland/` base. It is available to anyone with the link and needs no GitHub Pages changes or new iPhone configuration. The project owner can remove public access after review.

## Verification

- `npm test` passed all 141 tests and `npm run build` passed. Framing tests use the source extents and coast vertices of France, Germany, the US, Russia, Indonesia, Luxembourg and Fiji with portrait and landscape obstructions. A viewport query test covers visible points near the date line and both poles.
- Chromium production-preview checks passed at 320×568, 390×844, 844×390, 568×320 and 1440×900. They verified compact layout without viewport overflow, tap versus drag or pinch, the globe-to-flat handoff, selection restored at close zoom, the Regions toggle and return to the parent card.
- At both 390×844 and 844×390, the shortcut framed France, Germany, the US, Russia, China, Canada, Brazil, Australia, Indonesia, Japan, Luxembourg and Fiji. Each fitted view showed selectable regions before any manual zoom.
- Country framing checks start from French Guiana and Hawaii, verify both sides of Fiji's date line, and test a taller inspection card and portrait-to-landscape rotation. A zoom gesture hands control back before the next resize. The US case delays geometry to verify the loading status and checks that selection survives further zoom into the flat map. Brazil reports the unavailable source polygon separately from the loading budget.
- The browser cases selected Paris and Hauts-de-Seine, Berlin and surrounding Brandenburg, California, Hawaii, Central Singapore and an unnamed Anguilla island. Monaco and Bir Tawil retained country selection with no regional geometry download. Fiji's Northern region remained selectable on both sides of the date line. A simulated geometry failure verified that the country remained selectable and Retry restored the layer.
- Country selection and north-up globe regressions cover WebGL fallback. The fictional game passed its economy, military, diplomacy and turn progression checks. Browser checks used Chromium with software WebGL. Physical iPhone Safari review of this update is pending.

To reproduce the regional browser checks, run the production preview and use an existing Playwright installation.

```sh
npm run build
npm run preview -- --host 0.0.0.0 --port 4173
# In another shell
HEARTLAND_CHECK_FRAMING_ONLY=1 HEARTLAND_PLAYWRIGHT_MODULE=/path/to/playwright-core \
node scripts/geography/check_selection.cjs
```

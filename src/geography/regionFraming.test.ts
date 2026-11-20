import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { AtlasCatalog } from './atlas.ts';
import { MAX_REGION_FIT_ZOOM, regionCameraTarget, type ScreenRect } from './regionFraming.ts';
import type { GeographicBounds, GeographicFeature, GeographicPosition } from './types';
import { desiredProjection, projectWorld } from './worldCamera.ts';

const catalog = JSON.parse(readFileSync(new URL('../../public/atlas/political.json', import.meta.url), 'utf8')) as AtlasCatalog;
const country = (code: string) => catalog.countries.find(record => record.id === `ne:admin0:${code}`)!;
const portrait = { width: 356, height: 682 };
const landscape = { width: 810, height: 228 };
const portraitObstacles: ScreenRect[] = [
  { left: 8, top: 529, right: 348, bottom: 622 },
  { left: 304, top: 6, right: 350, bottom: 146 },
  { left: 8, top: 630, right: 266, bottom: 674 },
  { left: 282, top: 650, right: 344, bottom: 672 },
];
const landscapeObstacles: ScreenRect[] = [
  { left: 8, top: 78, right: 312, bottom: 168 },
  { left: 758, top: 6, right: 804, bottom: 146 },
  { left: 8, top: 176, right: 270, bottom: 220 },
  { left: 736, top: 194, right: 798, bottom: 218 },
];

function covers([west, south, east, north]: GeographicBounds, [lon, lat]: GeographicPosition) {
  return ((lon - west) % 360 + 360) % 360 <= east - west + 1e-7 && lat >= south && lat <= north;
}

test('main territory extents group source landmasses without distant overseas holdings', () => {
  for (const { mainBounds } of catalog.countries) {
    assert.ok(mainBounds, 'every country has a source-derived main territory extent');
    const [west, south, east, north] = mainBounds;
    assert.ok(west >= -180 && west < 180 && east > west && east - west <= 360 && south >= -90 && north <= 90 && north > south);
  }
  assert.ok(covers(country('FRA').mainBounds!, [9, 42.1]), 'metropolitan France includes Corsica');
  assert.ok(!covers(country('FRA').mainBounds!, [-53.23, 3.92]), 'French Guiana is outside the metropolitan extent');
  assert.ok(covers(country('USA').mainBounds!, [-80.2, 25.25]));
  assert.ok(!covers(country('USA').mainBounds!, [-149.9, 61.2]));
  assert.ok(!covers(country('USA').mainBounds!, [-155.45, 19.59]));
  assert.deepEqual(country('DEU').mainBounds, country('DEU').bbox);
  for (const island of [[101, 0], [113, -1], [110, -7.5], [121, -3], [139, -5]] as GeographicPosition[]) {
    assert.ok(covers(country('IDN').mainBounds!, island), `Indonesia includes the land near ${island}`);
  }
  const russia = country('RUS').mainBounds!;
  assert.ok(russia[2] > 180 && russia[2] - russia[0] < 180 && covers(russia, [-171, 65.9]), 'Russia includes its continental date-line fragment');
  const fiji = country('FJI').mainBounds!;
  assert.ok(fiji[2] > 180 && fiji[2] - fiji[0] < 6);
  assert.ok(covers(fiji, [177.99, -17.79]) && covers(fiji, [-179.93, -16.83]));
});

test('projection fits source land into the available map without forcing a uniform regional zoom', () => {
  const codes = ['FRA', 'DEU', 'USA', 'RUS', 'IDN', 'LUX', 'FJI'];
  const geography = new Map(codes.map(code => {
    const feature = JSON.parse(readFileSync(new URL(`../../public/geography/natural-earth-5.1.1/countries/${code}.geojson`, import.meta.url), 'utf8')) as GeographicFeature;
    const { geometry } = feature;
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    return [code, polygons.flatMap(polygon => polygon[0].filter(point => covers(country(code).mainBounds!, point)))];
  }));
  for (const [size, obstacles] of [[portrait, portraitObstacles], [landscape, landscapeObstacles]] as const) {
    const views = new Map(codes.map(code => [code, regionCameraTarget(false, size, country(code), obstacles)]));
    assert.ok(views.get('LUX')!.zoom > views.get('DEU')!.zoom);
    assert.ok(views.get('DEU')!.zoom > views.get('USA')!.zoom);
    assert.ok(views.get('FRA')!.zoom > views.get('IDN')!.zoom);
    assert.ok(views.get('USA')!.zoom > views.get('RUS')!.zoom);
    assert.equal(views.get('LUX')!.zoom, MAX_REGION_FIT_ZOOM);
    for (const [code, view] of views) {
      assert.equal(desiredProjection(view, size), view.projection, `${code} keeps its projection during manual navigation`);
      const points = geography.get(code)!;
      const visible = points.filter(point => {
        const p = projectWorld(view, size, point);
        return p && p.x > 4 && p.y > 4 && p.x < size.width - 4 && p.y < size.height - 4 &&
          !obstacles.some(box => p.x >= box.left && p.x <= box.right && p.y >= box.top && p.y <= box.bottom);
      });
      assert.ok(visible.length / points.length > .98, `${code} in ${size.width}×${size.height} shows ${visible.length}/${points.length} main coast vertices`);
    }
  }
});

test('changing the card size changes the fit and a WebGL fallback can still frame the country', () => {
  const france = country('FRA');
  const normal = regionCameraTarget(false, portrait, france, portraitObstacles);
  const tallerCard = [{ ...portraitObstacles[0], top: 290 }, ...portraitObstacles.slice(1)];
  const smallerArea = regionCameraTarget(false, portrait, france, tallerCard);
  assert.ok(smallerArea.zoom < normal.zoom);
  assert.notDeepEqual(smallerArea.focus, normal.focus);
  const flat = regionCameraTarget(true, portrait, france, portraitObstacles);
  assert.equal(flat.projection, 'flat');
  assert.ok(flat.zoom > 1);
  assert.ok(projectWorld(flat, portrait, [2.35, 48.86])!.y < portraitObstacles[0].top - 4);
  assert.equal(regionCameraTarget(false, landscape, france, landscapeObstacles).projection, 'flat',
    'space beside the bottom controls can admit a flat fit in landscape');
});

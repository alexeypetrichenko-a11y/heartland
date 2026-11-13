import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { atlasBounds, atlasScale, colorDeltaE, constrainAtlasView, countryInViewport, initialAtlasView, moveAtlasView,
  projectAtlasFeature, projectGeography, projectPolygonParts, unprojectGeography, type AtlasCatalog } from './atlas.ts';
import { createAtlasData } from './atlasData.ts';
import type { CountryCatalog, GeographicCollection, GeographicFeature } from './types';

const catalog = JSON.parse(readFileSync(new URL('../../public/atlas/political.json', import.meta.url), 'utf8')) as AtlasCatalog;
const read = <T>(path: string): T => JSON.parse(readFileSync(new URL(`../../public/geography/natural-earth-5.1.1/${path}`, import.meta.url), 'utf8'));

test('all 258 geographic entities have unique, stable colors with strongly separated neighbors', () => {
  const countries = read<CountryCatalog>('countries.json').countries;
  assert.deepEqual(catalog.countries.map(c => c.id), countries.map(c => c.id));
  const byId = new Map(catalog.countries.map(c => [c.id, c]));
  assert.equal(new Set(catalog.countries.map(c => c.color)).size, 258);
  const hueFamilies = new Set<string>();
  for (const c of catalog.countries) {
    assert.match(c.color, /^#[0-9a-f]{6}$/);
    const rgb = [1, 3, 5].map(i => parseInt(c.color.slice(i, i + 2), 16));
    assert.ok(Math.min(...rgb) >= 70 && Math.max(...rgb) >= 160, 'palette avoids almost-black countries');
    hueFamilies.add(rgb.map(v => Math.round(v / 60)).join(','));
  }
  assert.ok(hueFamilies.size >= 20, 'balanced palette across many color families');
  assert.equal(catalog.neighbors.length, 344);
  const distances = catalog.neighbors.map(([a, b]) => {
    assert.ok(byId.has(a) && byId.has(b) && a < b);
    return colorDeltaE(byId.get(a)!.color, byId.get(b)!.color);
  });
  assert.ok(Math.min(...distances) >= 30, `minimum neighbor Delta E: ${Math.min(...distances)}`);
  assert.ok(Math.abs(Math.min(...distances) - catalog.minimumNeighborDeltaE) < .001);
  for (const scale of ['110m', '50m']) for (const f of read<GeographicCollection>(`overview-${scale}.geojson`).features) {
    assert.ok(byId.get(f.properties.countryId), 'every LOD uses the same ID/color registry');
  }
  for (const [a, b] of [['FRA', 'DEU'], ['USA', 'CAN'], ['RUS', 'CHN'], ['BRA', 'ARG']]) {
    assert.ok(catalog.neighbors.some(pair => pair.includes(`ne:admin0:${a}`) && pair.includes(`ne:admin0:${b}`)));
  }
});

test('world projection preserves lon/lat positions, poles, date line, polygons, islands and holes', () => {
  assert.deepEqual(projectGeography([-180, 90]), { x: 0, y: 0 });
  assert.deepEqual(projectGeography([180, -90]), { x: 360, y: 180 });
  for (const p of [[2.35, 48.86], [-77, 39], [179.9, -22]] as [number, number][]) {
    const back = unprojectGeography(projectGeography(p));
    assert.ok(Math.abs(back[0] - p[0]) < 1e-10 && Math.abs(back[1] - p[1]) < 1e-10);
  }
  const geometry = { type: 'Polygon' as const, coordinates: [[[-5, 5], [5, 5], [5, -5], [-5, -5], [-5, 5]], [[-1, 1], [-1, -1], [1, -1], [1, 1], [-1, 1]]] as [number, number][][] };
  const [part] = projectPolygonParts(geometry);
  assert.equal(part.path.split('M').length - 1, 2);
  assert.equal(part.path.split('Z').length - 1, 2);
  assert.deepEqual(part.bbox, [-5, -5, 5, 5]);
  for (const code of ['FRA', 'USA', 'RUS', 'AUS', 'ATA']) {
    const f = read<GeographicFeature>(`countries/${code}.geojson`);
    const shape = projectAtlasFeature(f);
    assert.equal(shape.parts.length, f.geometry.type === 'Polygon' ? 1 : f.geometry.coordinates.length);
    assert.ok(shape.parts.every(p => !p.path.includes('NaN') && !p.path.includes('Infinity')));
  }
});

test('whole-world fit and pan limits work in portrait, landscape and desktop through 128x zoom', () => {
  for (const size of [{ width: 288, height: 340 }, { width: 720, height: 145 }, { width: 1000, height: 650 }]) {
    assert.deepEqual(atlasBounds(initialAtlasView(), size), [-180, -90, 180, 90]);
    for (const zoom of [.01, 1, 8, 128, 1000]) {
      const view = constrainAtlasView({ zoom, center: { x: -10000, y: 10000 } }, size);
      assert.ok(view.zoom >= 1 && view.zoom <= 128);
      const scale = atlasScale(view, size);
      if (360 * scale > size.width) assert.ok(view.center.x * scale >= size.width / 4 - 1e-8);
      if (180 * scale > size.height) assert.ok((180 - view.center.y) * scale >= size.height / 4 - 1e-8);
    }
    assert.deepEqual(moveAtlasView(initialAtlasView(), size, { x: 0, y: 0 }, { x: 500, y: -500 }), initialAtlasView());
  }
});

test('pointer and moving-pinch anchors stay fixed away from camera boundaries', () => {
  const size = { width: 390, height: 400 }, view = { zoom: 8, center: { x: 180, y: 90 } };
  const from = { x: 140, y: 120 }, to = { x: 160, y: 145 };
  const next = moveAtlasView(view, size, from, to, 12);
  for (const axis of ['x', 'y'] as const) {
    const half = size[axis === 'x' ? 'width' : 'height'] / 2;
    const before = view.center[axis] + (from[axis] - half) / atlasScale(view, size);
    const after = next.center[axis] + (to[axis] - half) / atlasScale(next, size);
    assert.ok(Math.abs(before - after) < 1e-10);
  }
});

test('detail culling uses source polygon coverage instead of spanning overseas-country envelopes', () => {
  const usa = catalog.countries.find(c => c.id === 'ne:admin0:USA')!;
  assert.ok(countryInViewport(usa, [-125, 30, -70, 45]));
  assert.ok(!countryInViewport(usa, [5, 45, 10, 50]), 'Europe does not request US detail');
  for (const c of catalog.countries) assert.ok(c.tiles.length && c.tiles.every(t => Number.isInteger(t) && t >= 0 && t < 648));
});

test('atlas data loads lazily under the Pages base and bounds the detail cache to 12 countries', async () => {
  const requests: string[] = [];
  const fetcher = (async (url: string | URL | Request) => {
    const path = String(url); requests.push(path);
    if (path.endsWith('political.json')) return new Response(JSON.stringify(catalog));
    if (path.endsWith('overview-110m.geojson')) return new Response(JSON.stringify(read('overview-110m.geojson')));
    const code = path.match(/countries\/([A-Z0-9]{3})\.geojson$/)![1];
    return new Response(JSON.stringify({ type: 'Feature', id: `ne:admin0:${code}`, properties: { countryId: `ne:admin0:${code}` },
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } }));
  }) as typeof fetch;
  const source = createAtlasData('/heartland/', fetcher);
  assert.equal(requests.length, 0);
  await source.loadCatalog(); await source.loadOverview('110m'); await source.loadOverview('110m');
  assert.equal(requests.length, 2);
  assert.ok(requests.every(p => p.startsWith('/heartland/')));
  const countries = catalog.countries.slice(0, 13);
  for (const c of countries) await source.loadDetail(c);
  const count = requests.length;
  await source.loadDetail(countries[12]); assert.equal(requests.length, count);
  await source.loadDetail(countries[0]); assert.equal(requests.length, count + 1);
  await assert.rejects(source.loadDetail({ ...countries[0], path: '../secret.json' }), /Invalid/);
});

test('failed atlas requests can be retried and mismatched country data is rejected', async () => {
  let fail = true;
  const source = createAtlasData('/heartland/', (async () => {
    if (fail) return new Response('', { status: 503 });
    return new Response(JSON.stringify(read('overview-110m.geojson')));
  }) as typeof fetch);
  await assert.rejects(source.loadOverview('110m'), /503/);
  fail = false;
  assert.equal((await source.loadOverview('110m')).length, 177);
  await assert.rejects(source.loadDetail(catalog.countries[0]), /reference mismatch/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { assertGeographicGeometry } from './geometry.ts';
import { createGeographyLoader } from './loadGeography.ts';
import type { CountryCatalog, GeographicAsset, GeographicCollection, GeographicBounds,
  GeographicFeature, GeographyManifest, RegionCatalog } from './types';
import { createInitialState } from '../game/initialState.ts';
import { selectCountry } from '../game/selectCountry.ts';
import { advanceTurn } from '../game/advanceTurn.ts';

const root = new URL('../../public/geography/natural-earth-5.1.1/', import.meta.url);
const read = <T,>(path: string): T => JSON.parse(readFileSync(new URL(path, root), 'utf8')) as T;
const manifest = read<GeographyManifest>('manifest.json');
const catalog = read<CountryCatalog>('countries.json');
const indexes = catalog.countries.filter(c => c.regionIndex).map(c => read<RegionCatalog>(c.regionIndex!.path));
const regions = indexes.flatMap(index => index.regions);
const regionById = new Map(regions.map(r => [r.id, r]));
const inventory = read<{ assets: GeographicAsset[] }>('inventory.json').assets;
const quality = read<{
  coverage: { countryCount: number; regionCount: number; countriesWithRegionFeatures: number; countriesWithoutRegionFeatures: string[];
    unnamedRegions: string[]; nonstandardRegionCodes: { id: string; sourceCode: string; name: string | null }[];
    regionSourceLevels: Record<string, number>; investigatedAdmin1: { scale: string; featureCount: number; countries: Record<string, number> }[];
    oversizedRegionFeatures: { id: string; asset: GeographicAsset }[] };
  geometry: { polygonCount: number; ringCount: number; coordinateCount: number;
    sourceTopologyIssues: { id: string; dataset: string; processedValid: boolean }[];
    precisionExceptions: { id: string; dataset: string; decimals: number }[] };
}>('quality.json');
const country = (code: string) => catalog.countries.find(c => c.id === `ne:admin0:${code}`)!;
function assertBounds(bounds: GeographicBounds) {
  assert.equal(bounds.length, 4);
  assert.ok(bounds.every(Number.isFinite));
  assert.ok(bounds[0] >= -180 && bounds[2] <= 180 && bounds[0] < bounds[2]);
  assert.ok(bounds[1] >= -90 && bounds[3] <= 90 && bounds[1] < bounds[3]);
}

test('source/version/license/projection are pinned independently of gameplay', () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.datasetId, 'natural-earth-5.1.1');
  assert.equal(manifest.source.datasetVersion, '5.1.1');
  assert.equal(manifest.source.repositoryTag, 'v5.1.2');
  assert.equal(manifest.source.repositoryCommit, 'f1890d9f152c896d250a77557a5751a93d494776');
  assert.equal(manifest.source.license, 'Public domain');
  assert.equal(manifest.crs, 'OGC:CRS84');
  assert.deepEqual(manifest.coordinateOrder, ['longitude', 'latitude']);
  assert.equal(manifest.processing.simplification, 'none');
  assert.equal(manifest.processing.polygonOrRingRemoval, 'none');
});

test('country/territory identifiers are unique source identifiers, not sovereign seats or ISO assumptions', () => {
  assert.equal(catalog.countries.length, 258);
  assert.equal(new Set(catalog.countries.map(c => c.id)).size, 258);
  for (const c of catalog.countries) {
    assert.match(c.id, /^ne:admin0:[A-Z0-9]{3}$/);
    assert.equal(c.id, `ne:admin0:${c.source.ADM0_A3}`);
    assert.ok(Number.isSafeInteger(c.source.NE_ID));
    assert.ok(c.name.length > 0);
    assertBounds(c.bbox);
    assert.ok(!('ownerId' in c) && !('controller' in c));
  }
  for (const continent of ['Africa', 'Antarctica', 'Asia', 'Europe', 'North America', 'South America', 'Oceania']) {
    assert.ok(catalog.countries.some(c => c.continent === continent));
  }
  for (const code of ['GRL', 'HKG', 'MAC', 'TWN', 'PSX', 'SAH', 'SOL', 'CYN', 'ATA']) assert.ok(country(code));
  assert.equal(country('HKG').source.SOVEREIGNT, 'China');
  assert.equal(country('FRA').source.SOV_A3, 'FR1');
  assert.notEqual(country('FRA').id, 'FR1');
});

test('every regional record has a valid exact source parent and a stable unique NE_ID', () => {
  assert.equal(indexes.length, 251);
  assert.equal(regions.length, 4596);
  assert.equal(new Set(regions.map(r => r.id)).size, 4596);
  for (const index of indexes) {
    const parent = catalog.countries.find(c => c.id === index.countryId)!;
    assert.ok(parent);
    assert.equal(index.regions.length, parent.regionCount);
    for (const r of index.regions) {
      assert.match(r.id, /^ne:admin1:\d+$/);
      assert.equal(r.id, `ne:admin1:${r.source.ne_id}`);
      assert.equal(r.countryId, index.countryId);
      assert.equal(r.source.adm0_a3, parent.source.ADM0_A3);
      assert.ok(r.name === null || typeof r.name === 'string');
      assertBounds(r.bbox);
    }
  }
  for (const c of catalog.countries) assert.equal(c.regionIndex === null, c.regionCount === 0);
});

test('all geographic assets preserve polygon/multipolygon rings, WGS84 coordinates and winding', () => {
  let polygonCount = 0, ringCount = 0, coordinateCount = 0, regionCount = 0;
  const regionIds = new Set<string>();
  const countryIds = new Set(catalog.countries.map(c => c.id));
  for (const asset of inventory.filter(a => a.path.endsWith('.geojson'))) {
    const value = read<GeographicFeature | GeographicCollection>(asset.path);
    const features = value.type === 'Feature' ? [value] : value.features;
    assert.ok(features.length > 0);
    for (const f of features) {
      assert.ok(countryIds.has(f.properties.countryId));
      assertGeographicGeometry(f.geometry);
      const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      polygonCount += polygons.length;
      for (const polygon of polygons) {
        ringCount += polygon.length;
        for (const ring of polygon) {
          assert.ok(new Set(ring.map(p => `${p[0]},${p[1]}`)).size >= 3);
          coordinateCount += ring.length;
        }
      }
      if (asset.path.startsWith('regions/')) {
        assert.match(f.id, /^ne:admin1:\d+$/);
        assert.ok(!regionIds.has(f.id));
        regionIds.add(f.id);
        regionCount++;
        const record = regionById.get(f.id as `ne:admin1:${string}`)!;
        assert.ok(record);
        assert.equal(record.countryId, f.properties.countryId);
        assert.equal(record.geometry.path, asset.path);
      }
    }
  }
  assert.equal(regionCount, 4596);
  assert.equal(polygonCount, quality.geometry.polygonCount);
  assert.equal(ringCount, quality.geometry.ringCount);
  assert.equal(coordinateCount, quality.geometry.coordinateCount);
  assert.ok(ringCount > polygonCount, 'source holes survive');
});

test('asset hashes/sizes and chunk exceptions match the complete generated inventory', () => {
  assert.equal(inventory.length, manifest.dataAssets.count);
  assert.equal(new Set(inventory.map(a => a.path)).size, inventory.length);
  const byPath = new Map(inventory.map(a => [a.path, a]));
  for (const ref of [manifest.countries.asset, manifest.quality, ...Object.values(manifest.overviews).map(o => o.asset),
    ...catalog.countries.flatMap(c => c.regionIndex ? [c.geometry, c.regionIndex] : [c.geometry]), ...regions.map(r => r.geometry)]) {
    assert.deepEqual(ref, byPath.get(ref.path), `asset reference: ${ref.path}`);
  }
  for (const ref of [...inventory, manifest.inventory]) {
    const bytes = readFileSync(new URL(ref.path, root));
    assert.equal(bytes.length, ref.bytes, ref.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), ref.sha256, ref.path);
  }
  assert.equal(inventory.reduce((sum, a) => sum + a.bytes, 0), manifest.dataAssets.bytes);
  assert.equal(inventory.reduce((sum, a) => sum + a.gzipBytes, 0), manifest.dataAssets.gzipBytes);
  const files = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter(p => statSync(new URL(p, root)).isFile());
  assert.equal(files.length, inventory.length + 2, 'no orphaned or untracked generated assets');
  const exceptions = new Set(quality.coverage.oversizedRegionFeatures.map(x => x.asset.path));
  for (const ref of inventory.filter(a => /^regions\/.*\.geojson$/.test(a.path))) {
    if (ref.bytes > manifest.processing.regionChunkTargetBytes) {
      assert.ok(exceptions.has(ref.path));
      assert.equal(read<GeographicCollection>(ref.path).features.length, 1, 'large source geometry is preserved whole');
    }
  }
  assert.equal(exceptions.size, 3);
  assert.ok(manifest.overviews['110m'].asset.bytes < 300_000);
  assert.ok(readFileSync(new URL('manifest.json', root)).length < 5000);
});

test('representative countries retain every high-detail source polygon including islands', () => {
  const expected = { FRA: [101, 21], DEU: [16, 22], USA: [51, 344], RUS: [86, 214], CHN: [32, 70], BRA: [27, 43], AUS: [11, 94] };
  for (const [code, [regionCount, parts]] of Object.entries(expected)) {
    const record = country(code);
    assert.equal(record.regionCount, regionCount);
    const feature = read<GeographicFeature>(record.geometry.path);
    assert.equal(feature.id, record.id);
    assert.equal(feature.geometry.type, 'MultiPolygon');
    assert.equal(feature.geometry.coordinates.length, parts);
  }
  for (const scale of ['110m', '50m'] as const) {
    const overview = read<GeographicCollection>(manifest.overviews[scale].asset.path);
    assert.equal(overview.features.length, scale === '110m' ? 177 : 242);
    const present = new Set(overview.features.map(f => f.id));
    for (const c of catalog.countries) assert.equal(c.availableOverviews.includes(scale), present.has(c.id));
    for (const continent of ['Africa', 'Antarctica', 'Asia', 'Europe', 'North America', 'South America', 'Oceania']) {
      assert.ok(catalog.countries.some(c => c.continent === continent && present.has(c.id)), `${scale}: ${continent}`);
    }
  }
});

test('missing, unnamed, nonstandard and upstream-invalid records are explicitly reported rather than invented or repaired', () => {
  assert.deepEqual(quality.coverage.countriesWithoutRegionFeatures, ['BJN', 'BRI', 'BRT', 'CNM', 'SCR', 'SER', 'SPI'].map(c => `ne:admin0:${c}`));
  assert.equal(quality.coverage.unnamedRegions.length, 7);
  assert.deepEqual(regions.filter(r => r.name === null).map(r => r.id).sort(), quality.coverage.unnamedRegions);
  assert.equal(quality.coverage.nonstandardRegionCodes.length, 40);
  assert.equal(quality.coverage.investigatedAdmin1[0].featureCount, 51);
  assert.equal(quality.coverage.investigatedAdmin1[1].featureCount, 294);
  assert.equal(Object.keys(quality.coverage.investigatedAdmin1[1].countries).length, 9);
  assert.deepEqual(quality.geometry.sourceTopologyIssues.map(x => x.id).sort(), ['ne:admin0:EGY', 'ne:admin1:1159309897']);
  assert.ok(quality.geometry.sourceTopologyIssues.every(x => x.processedValid === false));
  assert.equal(country('EGY').geometryStatus, 'source-invalid');
  assert.equal(regions.find(r => r.id === 'ne:admin1:1159309897')!.geometryStatus, 'source-invalid');
  assert.equal(quality.geometry.precisionExceptions.length, 2);
});

test('structural validation rejects malformed coordinates/rings/types instead of silently drawing them', () => {
  const valid = { type: 'Polygon', coordinates: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], [[1, 1], [1, 3], [3, 3], [3, 1], [1, 1]]] };
  assert.doesNotThrow(() => assertGeographicGeometry(valid));
  for (const invalid of [null, { type: 'Point', coordinates: [0, 0] }, { type: 'MultiPolygon', coordinates: [] },
    { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] },
    { type: 'Polygon', coordinates: [[[0, 0], [181, 0], [1, 1], [0, 0]]] },
    { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 91], [0, 0]]] },
    { type: 'Polygon', coordinates: [[[0, 0], [Infinity, 0], [1, 1], [0, 0]]] },
    { type: 'Polygon', coordinates: [[[0, 0], [1, 1], [2, 2], [0, 0]]] }]) assert.throws(() => assertGeographicGeometry(invalid));
});

function localFetcher() {
  const requests: string[] = [];
  const fetcher: typeof fetch = async input => {
    const url = String(input);
    requests.push(url);
    const prefix = '/heartland/geography/natural-earth-5.1.1/';
    assert.ok(url.startsWith(prefix));
    try { return new Response(readFileSync(new URL(url.slice(prefix.length), root), 'utf8')); }
    catch { return new Response('Missing asset', { status: 404 }); }
  };
  return { fetcher, requests };
}

test('the loader makes no eager requests and loads overview/country/regional detail independently under the Pages base', async () => {
  const { fetcher, requests } = localFetcher();
  const loader = createGeographyLoader({ appBaseUrl: '/heartland/', fetcher });
  assert.equal(requests.length, 0);
  assert.equal((await loader.loadOverview()).features.length, 177);
  assert.equal(requests.length, 2, 'manifest and coarse overview only');
  assert.ok(!requests.some(p => p.includes('countries.json') || p.includes('regions/')));
  assert.equal((await loader.loadCountryGeometry('ne:admin0:FRA')).id, 'ne:admin0:FRA');
  const index = (await loader.loadRegionIndex('ne:admin0:FRA'))!;
  const first = index.regions[0], another = index.regions.find(r => r.id !== first.id && r.geometry.path === first.geometry.path)!;
  assert.ok(another);
  const loaded = await loader.loadRegionGeometry(index.countryId, first.id);
  assert.equal(loaded.id, first.id);
  const count = requests.length;
  await loader.loadRegionGeometry(index.countryId, another.id);
  assert.equal(requests.length, count, 'reuse the active chunk without fetching every region');
  await loader.loadRegionIndex('ne:admin0:DEU');
  await loader.loadRegionIndex('ne:admin0:FRA');
  assert.equal(requests.filter(p => p.endsWith('FRA.index.json')).length, 2, 'detail cache is bounded to one country');
  assert.ok(requests.every(p => !p.includes('/countries/') || p.endsWith('/FRA.geojson')));
});

test('unknown/missing geographic references and HTTP errors never fabricate geometry or fall back to the test map', async () => {
  const { fetcher, requests } = localFetcher();
  const loader = createGeographyLoader({ appBaseUrl: '/heartland', fetcher });
  await loader.loadCountries();
  const count = requests.length;
  await assert.rejects(loader.loadCountryGeometry('ne:admin0:ZZZ'), /Unknown geographic country/);
  assert.equal(requests.length, count);
  assert.equal(await loader.loadRegionIndex('ne:admin0:BJN'), null);
  await assert.rejects(loader.loadRegionGeometry('ne:admin0:BJN', 'ne:admin1:123'), /Unknown geographic region/);
  await assert.rejects(loader.loadRegionGeometry('ne:admin0:FRA', 'ne:admin1:123'), /Unknown geographic region/);
  assert.ok(!requests.some(p => /\.geojson$/.test(p)));
  let first = true;
  const retry = createGeographyLoader({ appBaseUrl: '/heartland/', fetcher: async (...args) => {
    if (first) { first = false; return new Response('Unavailable', { status: 503 }); }
    return fetcher(...args);
  } });
  await assert.rejects(retry.loadManifest(), /503/);
  assert.equal((await retry.loadManifest()).schemaVersion, 1);
  const invalid = createGeographyLoader({ appBaseUrl: '/heartland/', fetcher: async () => new Response(JSON.stringify({ ...manifest, schemaVersion: 99 })) });
  await assert.rejects(invalid.loadManifest(), /Unsupported geography manifest/);
});

test('real-world data loading leaves the fictional three-country/six-region scenario and its weekly rules intact', async () => {
  const state = selectCountry(createInitialState(), 'alden');
  const before = structuredClone(state);
  const { fetcher } = localFetcher();
  await createGeographyLoader({ appBaseUrl: '/heartland/', fetcher }).loadOverview();
  assert.deepEqual(state, before);
  assert.deepEqual(state.countries.map(c => c.id), ['alden', 'belora', 'cyrin']);
  assert.equal(state.regions.length, 6);
  assert.ok(state.regions.every(r => !r.id.startsWith('ne:')));
  const next = advanceTurn(state, [
    { type: 'set-economic-policy', countryId: 'alden', policy: 'tax-relief' },
    { type: 'set-military-order', countryId: 'alden', divisionId: 'alden-first', order: { kind: 'move', targetRegionId: 'reed-coast' } },
  ]);
  assert.equal(next.week, 2);
  assert.equal(next.countries[0].economy.treasury, 98);
  assert.equal(next.divisions[0].regionId, 'reed-coast');
  assert.equal(next.regions.length, 6);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { planRegionChunks, projectRegionChunk, regionName, REGION_BYTE_LIMIT, REGION_CHUNK_LIMIT, usableRegions } from './atlasRegions.ts';
import type { AtlasCatalog } from './atlas.ts';
import { pickAtlasFeature } from './countrySelection.ts';
import { createGeographyLoader } from './loadGeography.ts';
import type { CountryCatalog, GeographicCollection, GeographicRegion, RegionCatalog } from './types';
import { initialWorldCamera, projectWorld } from './worldCamera.ts';

const read = <T>(path: string): T => JSON.parse(readFileSync(new URL(`../../public/geography/natural-earth-5.1.1/${path}`, import.meta.url), 'utf8'));
const index = (country: string) => read<RegionCatalog>(`regions/${country}.index.json`);
const atlas = JSON.parse(readFileSync(new URL('../../public/atlas/political.json', import.meta.url), 'utf8')) as AtlasCatalog;

test('the opening catalog identifies entities without usable regions using the same source policy as the layer', () => {
  const unavailable = read<CountryCatalog>('countries.json').countries.filter(country =>
    !country.regionIndex || !usableRegions(read<RegionCatalog>(country.regionIndex.path)).length).map(country => country.id);
  assert.equal(unavailable.length, 33);
  assert.deepEqual(atlas.countriesWithoutRegions, unavailable);
});

test('regional coverage preserves mixed source levels and omits sole country stand-ins and flagged geometry', () => {
  assert.deepEqual(usableRegions(null), []);
  assert.deepEqual(usableRegions(index('MCO')), []);
  assert.deepEqual(usableRegions(index('VAT')), []);
  assert.equal(usableRegions(index('FRA')).length, 101);
  assert.equal(usableRegions(index('DEU')).length, 16);
  assert.equal(usableRegions(index('USA')).length, 51);
  assert.equal(usableRegions(index('GBR')).length, 232, 'retain Natural Earth level-two records');
  assert.equal(usableRegions(index('SGP')).length, 5, 'retain distinct source divisions at level zero');
  const brazil = usableRegions(index('BRA'));
  assert.equal(brazil.length, 26);
  assert.ok(!brazil.some(region => region.source.adm1_code === 'BRA-1294'));
  const unnamed = usableRegions(index('AIA')).find(region => region.source.adm1_code === 'AIA+99?')!;
  assert.equal(regionName(unnamed), 'Unnamed region');
  assert.equal(unnamed.id, 'ne:admin1:1159315561');
});

test('viewport plans deduplicate overlapping chunk references and skip regions outside the view', () => {
  const usa = usableRegions(index('USA'));
  assert.equal(new Set(usa.map(region => region.geometry.path)).size, 5);
  const close = planRegionChunks(usa, [[-121.45, 36.65, -121.4, 36.72]], [-121.4, 36.7]);
  assert.deepEqual(close.assets.map(asset => asset.path), ['regions/USA-000.geojson']);
  assert.equal(close.limited, false);
  assert.deepEqual(planRegionChunks(usa, [[0, 40, 5, 47]], [2, 44]).assets, []);
  const france = usableRegions(index('FRA'));
  const paris = planRegionChunks(france, [[2.345, 48.854, 2.355, 48.858]], [2.35, 48.856]);
  assert.deepEqual(paris.assets.map(asset => asset.path), ['regions/FRA-001.geojson']);
});

test('regional file and byte budgets prioritize the visible focus, including across a wrapped edge', () => {
  const russia = usableRegions(index('RUS'));
  const broad = planRegionChunks(russia, [[-180, 0, 180, 89]], [40, 57]);
  assert.ok(broad.limited);
  assert.ok(broad.assets.length <= REGION_CHUNK_LIMIT);
  assert.ok(broad.assets.reduce((sum, asset) => sum + asset.bytes, 0) <= REGION_BYTE_LIMIT);
  const fiji = usableRegions(index('FJI'));
  for (const bounds of [[[178.9, -17, 180, -16.1]], [[-180, -17, -179.85, -16.1]]] as [number, number, number, number][][]) {
    assert.deepEqual(planRegionChunks(fiji, bounds, [179.95, -16.7]).assets.map(asset => asset.path), ['regions/FJI-000.geojson']);
  }
  const canada = usableRegions(index('CAN'));
  const nunavut = canada.find(region => region.name === 'Nunavut')!;
  const planned = planRegionChunks(canada, [[-95, 73, -93, 74]], [-94, 73.5]);
  assert.ok(planned.assets.some(asset => asset.path === nunavut.geometry.path), 'individual oversized source region fits the bounded budget');
});

test('projecting a real chunk preserves source reference, split parts and the geographic picker', () => {
  const fiji = usableRegions(index('FJI'));
  const asset = fiji[0].geometry.path;
  const chunk = read<GeographicCollection>(asset);
  const shapes = projectRegionChunk(chunk, fiji, asset);
  assert.equal(shapes.length, fiji.length);
  const northern = shapes.find(shape => shape.record.name === 'Northern')!;
  assert.equal(northern.id, 'ne:admin1:1159313293');
  assert.equal(northern.record.countryId, 'ne:admin0:FJI');
  assert.ok(northern.parts.some(part => part.bbox[0] === -180));
  assert.ok(northern.parts.some(part => part.bbox[2] === 180));
  const view = { ...initialWorldCamera(), projection: 'flat' as const, zoom: 16, focus: [179.6, -16.7] as [number, number] };
  const size = { width: 356, height: 610 };
  for (const longitude of [179.2, -179.93]) {
    const point = projectWorld(view, size, [longitude, -16.82])!;
    assert.equal(pickAtlasFeature(view, size, point, [northern], () => true, false), northern.id);
  }
  assert.deepEqual(projectRegionChunk(chunk, usableRegions(index('USA')), asset), []);
});

test('regional asset loading validates scope and passes cancellation to fetch without requesting a world index', async () => {
  const file = 'regions/FJI.index.json';
  const catalog = read<RegionCatalog>(file);
  const record: GeographicRegion = catalog.regions[0];
  const requests: string[] = [];
  const controller = new AbortController();
  const source = createGeographyLoader({ appBaseUrl: '/heartland/', fetcher: async (input, init) => {
    const path = String(input).replace('/heartland/geography/natural-earth-5.1.1/', '');
    requests.push(path);
    assert.equal(init?.signal, controller.signal);
    init?.signal?.throwIfAborted();
    return new Response(JSON.stringify(read(path)));
  } });
  assert.equal(await source.loadRegionIndexAsset(catalog.countryId, null, controller.signal), null);
  assert.equal(requests.length, 0);
  await assert.rejects(source.loadRegionIndexAsset('ne:admin0:USA', { ...record.geometry, path: file }, controller.signal), /Invalid region index path/);
  await assert.rejects(source.loadRegionChunk('ne:admin0:USA', record.geometry, controller.signal), /Invalid region chunk path/);
  const loaded = await source.loadRegionIndexAsset(catalog.countryId, { ...record.geometry, path: file }, controller.signal);
  assert.deepEqual(loaded, catalog);
  const geometry = await source.loadRegionChunk(catalog.countryId, record.geometry, controller.signal);
  assert.ok(geometry.features.every(feature => feature.properties.countryId === catalog.countryId));
  assert.deepEqual(requests, [file, record.geometry.path]);
  controller.abort();
  await assert.rejects(source.loadRegionChunk(catalog.countryId, record.geometry, controller.signal), { name: 'AbortError' });
});

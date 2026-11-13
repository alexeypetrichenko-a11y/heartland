import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import test from 'node:test';
import { assertGeographicGeometry } from './geometry.ts';
import { initialAtlasView, projectGeography } from './atlas.ts';
import { createTerrainData, projectHydrology, terrainImageRect, terrainLevel, visibleTerrainTiles,
  type HydrologyCollection, type HydrologyFeature, type TerrainManifest } from './terrain.ts';

const root = new URL('../../public/atlas/physical-v1/', import.meta.url);
const read = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const manifest = read<TerrainManifest>('manifest.json');

test('physical sources are explicitly pinned, public domain and versioned independently from political boundaries', () => {
  const lock = JSON.parse(readFileSync(new URL('../../scripts/geography/terrain-sources.lock.json', import.meta.url), 'utf8'));
  assert.equal(lock.files.length, 40);
  assert.equal(lock.vector.layerVersion, '5.0.0');
  assert.equal(lock.raster.commit, '856bd7ab3a3a10dbe604eadad843b81b29f627e2');
  assert.equal(lock.raster.snapshotDate, '2012-01-22');
  assert.match(lock.raster.version, /no per-file semantic version/);
  assert.equal(lock.license, 'Public domain');
  assert.equal(manifest.source.raster.commit, lock.raster.commit);
  assert.equal(manifest.source.vector.commit, lock.vector.commit);
  const tif = lock.files.find((f: { path: string }) => f.path === 'raster/NE1_50M_SR_W.tif');
  assert.equal(tif.sha256, '22a4d66193002df6d4f1fa59655196cde48eba232fd7f60ed2f3bba5004a65ee');
  assert.ok(lock.files.every((f: { url: string; sha256: string; bytes: number }) => f.url.startsWith('https://raw.githubusercontent.com/nvkelso/') && /^[a-f0-9]{64}$/.test(f.sha256) && f.bytes > 0));
  assert.ok(manifest.unsupported.includes('Plains as a geomorphological class'));
});

function webpSize(buffer: Buffer) {
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buffer.toString('ascii', 8, 12), 'WEBP');
  for (let offset = 12; offset < buffer.length; ) {
    const kind = buffer.toString('ascii', offset, offset + 4), length = buffer.readUInt32LE(offset + 4);
    if (kind === 'VP8 ') return [buffer.readUInt16LE(offset + 14) & 0x3fff, buffer.readUInt16LE(offset + 16) & 0x3fff];
    offset += 8 + length + (length % 2);
  }
  throw new Error('Missing WebP lossy frame');
}

test('every physical asset matches its hash, inventory, dimensions and mobile overview budget', () => {
  assert.equal(new Set(manifest.assets.map(a => a.path)).size, manifest.assets.length);
  for (const asset of manifest.assets) {
    const buffer = readFileSync(new URL(asset.path, root));
    assert.equal(buffer.length, asset.bytes);
    assert.equal(createHash('sha256').update(buffer).digest('hex'), asset.sha256);
  }
  const files = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter(p => statSync(new URL(p, root)).isFile());
  assert.equal(files.length, manifest.assets.length + 1);
  assert.equal(manifest.totalAssetBytes, manifest.assets.reduce((n, a) => n + a.bytes, 0));
  const world = manifest.raster.overview;
  assert.ok(world.bytes < 50_000);
  assert.ok(manifest.hydrology['110m'].bytes < 50_000);
  assert.deepEqual(webpSize(readFileSync(new URL(world.path, root))), [1024, 512]);
  for (const tile of manifest.raster.tiles) {
    assert.ok(tile.bytes < 100_000);
    assert.deepEqual(webpSize(readFileSync(new URL(tile.path, root))), [tile.width, tile.height]);
  }
});

test('raster pyramid covers the entire world exactly at each level with registered pixel gutters', () => {
  assert.deepEqual(manifest.bounds, [-180, -90, 180, 90]);
  assert.deepEqual([manifest.raster.sourceWidth, manifest.raster.sourceHeight], [10800, 5400]);
  const gt = manifest.raster.sourceGeoTransform;
  for (const [value, expected] of gt.map((v, i) => [v, [-180, 1 / 30, 0, 90, 0, -1 / 30][i]])) assert.ok(Math.abs(value - expected) < 1e-10);
  for (const level of [1, 2, 3]) {
    const tiles = manifest.raster.tiles.filter(t => t.level === level), columns = 2 ** (level + 1), rows = 2 ** level;
    assert.equal(tiles.length, columns * rows);
    let area = 0;
    for (const tile of tiles) {
      const [w, s, e, n] = tile.bounds;
      assert.deepEqual(tile.bounds, [tile.x * 360 / columns - 180, 90 - (tile.y + 1) * 180 / rows, (tile.x + 1) * 360 / columns - 180, 90 - tile.y * 180 / rows]);
      assert.ok(tile.imageBounds[0] <= w && tile.imageBounds[1] <= s && tile.imageBounds[2] >= e && tile.imageBounds[3] >= n);
      assert.ok(tile.width >= 512 && tile.width <= 514 && tile.height >= 512 && tile.height <= 514);
      area += (e - w) * (n - s);
    }
    assert.equal(area, 360 * 180);
  }
});

test('terrain and country coordinates share exact alignment at representative physical locations', () => {
  // Alps, Himalaya, Rockies, Andes, Amazon, Congo, Sahara, Australian arid interior.
  const points: [number, number][] = [[8, 46], [86, 28], [-110, 43], [-70, -25], [-62, -4], [23, 0], [10, 24], [134, -24]];
  for (const p of points) for (const level of [1, 2, 3]) {
    const tile = manifest.raster.tiles.find(t => t.level === level && t.bounds[0] <= p[0] && t.bounds[2] >= p[0] && t.bounds[1] <= p[1] && t.bounds[3] >= p[1])!;
    assert.ok(tile);
    const rect = terrainImageRect(tile.imageBounds), expected = projectGeography(p);
    const u = (p[0] - tile.imageBounds[0]) / (tile.imageBounds[2] - tile.imageBounds[0]);
    const v = (tile.imageBounds[3] - p[1]) / (tile.imageBounds[3] - tile.imageBounds[1]);
    assert.ok(Math.abs(rect.x + u * rect.width - expected.x) < 1e-9);
    assert.ok(Math.abs(rect.y + v * rect.height - expected.y) < 1e-9);
  }
});

const allFeatures = new Map<string, HydrologyFeature>();
for (const asset of [manifest.hydrology['110m'], manifest.hydrology['50m'], ...manifest.hydrology['10m']]) {
  for (const feature of read<HydrologyCollection>(asset.path).features) {
    const previous = allFeatures.get(feature.id);
    if (previous) assert.deepEqual(previous, feature, 'chunk duplicates retain identical source geometry');
    allFeatures.set(feature.id, feature);
  }
}
test('hydrology retains real source records, valid coordinates/rings and named major rivers/lakes', () => {
  assert.deepEqual(manifest.featureCounts, { '110m': { river: 13, lake: 24 }, '50m': { river: 477, lake: 412 }, '10m': { river: 1473, lake: 1355 } });
  for (const [scale, counts] of Object.entries(manifest.featureCounts)) for (const kind of ['river', 'lake'] as const) {
    assert.equal([...allFeatures.values()].filter(f => f.id.startsWith(`ne:physical:${scale}:${kind}:`)).length, counts[kind]);
  }
  for (const feature of allFeatures.values()) {
    assert.match(feature.id, /^ne:physical:(110m|50m|10m):(river|lake):\d+:\d+$/);
    const geometry = feature.geometry;
    if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') assertGeographicGeometry(geometry);
    else {
      const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
      assert.ok(lines.length > 0);
      for (const line of lines) {
        assert.ok(line.length >= 2);
        for (const [lon, lat] of line) assert.ok(Number.isFinite(lon) && Number.isFinite(lat) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90);
      }
    }
    assert.ok(projectHydrology(feature).startsWith('M'));
    assert.ok(!projectHydrology(feature).includes('NaN'));
  }
  for (const name of [/Nile/i, /Amazon/i, /Mississippi/i, /Superior/i, /Victoria/i, /Baikal/i]) assert.ok([...allFeatures.values()].some(f => name.test(f.name ?? '')), String(name));
  const quality = read<{ geometryQuality: { missingGeometry: { name: string }[]; sourceTopologyIssues: { processedValid: boolean }[] } }>('manifest.json').geometryQuality;
  assert.deepEqual(quality.missingGeometry.map(f => f.name), ['Loire']);
  assert.equal(quality.sourceTopologyIssues.length, 2);
  assert.ok(quality.sourceTopologyIssues.every(f => f.processedValid === false));
  assert.ok([...allFeatures.values()].filter(f => f.name === 'Loire').length > 0, 'other source Loire records remain');
});

test('world view never requests high-resolution raster tiles and close view selects only visible detail', () => {
  const size = { width: 390, height: 610 };
  assert.equal(terrainLevel(initialAtlasView(), size, 3), 0);
  assert.equal(visibleTerrainTiles(manifest, initialAtlasView(), size, 3).length, 0);
  const view = { zoom: 20, center: { x: 188, y: 44 } };
  const selected = visibleTerrainTiles(manifest, view, size, 2);
  assert.ok(selected.length > 0 && selected.length <= 8);
  assert.ok(selected.every(t => t.level === 3));
  assert.equal(terrainLevel({ ...view, zoom: 128 }, size, 100), 3, 'no invented resolution beyond processed source');
});

test('physical loader stays lazy, respects Pages paths, supports retries and bounds raster URLs', async () => {
  const paths: string[] = [];
  let fail = false;
  const source = createTerrainData('/heartland/', (async (url: string | URL | Request) => {
    const path = String(url); paths.push(path);
    if (fail) return new Response('', { status: 503 });
    if (path.endsWith('manifest.json')) return new Response(JSON.stringify(manifest));
    return new Response('image fixture', { headers: { 'Content-Type': 'image/webp' } });
  }) as typeof fetch);
  assert.equal(paths.length, 0);
  await source.loadManifest(); await source.loadManifest(); assert.equal(paths.length, 1);
  for (const tile of manifest.raster.tiles.slice(0, 25)) await source.loadRaster(tile);
  const count = paths.length;
  await source.loadRaster(manifest.raster.tiles[24]); assert.equal(paths.length, count);
  await source.loadRaster(manifest.raster.tiles[0]); assert.equal(paths.length, count + 1, '24-raster LRU evicts old URLs');
  assert.ok(paths.every(p => p.startsWith('/heartland/atlas/physical-v1/')));
  await assert.rejects(source.loadRaster({ path: '../secret.webp', bytes: 1, sha256: '' }), /Invalid/);
  fail = true; await assert.rejects(source.loadRaster(manifest.raster.tiles[26]), /503/);
  fail = false; await source.loadRaster(manifest.raster.tiles[26]);
  source.dispose();
});

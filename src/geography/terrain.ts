import { atlasBounds, atlasScale, intersectsGeography, projectPolygonParts, type AtlasSize, type AtlasView } from './atlas.ts';
import type { GeographicBounds, GeographicGeometry, GeographicPosition } from './types';

export type TerrainAsset = { path: string; bytes: number; sha256: string };
export type TerrainTile = TerrainAsset & { level: number; x: number; y: number; bounds: GeographicBounds;
  imageBounds: GeographicBounds; width: number; height: number };
export type HydrologyFeature = { id: string; sourceId: number; name: string | null; kind: 'river' | 'lake'; rank: number;
  bbox: GeographicBounds; geometryStatus: string; geometry: GeographicGeometry | { type: 'LineString'; coordinates: GeographicPosition[] }
    | { type: 'MultiLineString'; coordinates: GeographicPosition[][] } };
export type HydrologyCollection = { schemaVersion: 1; features: HydrologyFeature[] };
export type HydrologyChunk = TerrainAsset & { bounds: GeographicBounds; featureCount: number };
export type TerrainManifest = { schemaVersion: 1; datasetId: string; crs: string; bounds: GeographicBounds;
  source: { raster: { commit: string; snapshotDate: string }; vector: { commit: string; layerVersion: string }; license: string };
  raster: { sourceWidth: number; sourceHeight: number; sourceGeoTransform: number[];
    overview: TerrainAsset & { width: number; height: number; bounds: GeographicBounds }; tiles: TerrainTile[]; maximumLevel: number };
  hydrology: { '110m': TerrainAsset; '50m': TerrainAsset; '10m': HydrologyChunk[] };
  featureCounts: Record<string, { river: number; lake: number }>; assets: TerrainAsset[]; totalAssetBytes: number;
  unsupported: string[] };

export function terrainLevel(view: AtlasView, size: AtlasSize, pixelRatio: number): number {
  if (view.zoom < 2) return 0; // A world view always starts with only the compact overview.
  const worldPixels = atlasScale(view, size) * 360 * Math.max(1, Math.min(2, pixelRatio));
  return Math.max(0, Math.min(3, Math.ceil(Math.log2(worldPixels / 1024))));
}
export function visibleTerrainTiles(manifest: TerrainManifest, view: AtlasView, size: AtlasSize, pixelRatio: number) {
  const level = terrainLevel(view, size, pixelRatio), bounds = atlasBounds(view, size);
  return manifest.raster.tiles.filter(tile => tile.level === level && intersectsGeography(tile.bounds, bounds));
}
export function terrainImageRect([west, south, east, north]: GeographicBounds) {
  return { x: west + 180, y: 90 - north, width: east - west, height: north - south };
}
export function projectHydrology(feature: HydrologyFeature): string {
  const geometry = feature.geometry;
  if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') return projectPolygonParts(geometry).map(p => p.path).join('');
  const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  return lines.map(line => line.map(([lon, lat], i) => `${i ? 'L' : 'M'}${+(lon + 180).toFixed(6)},${+(90 - lat).toFixed(6)}`).join('')).join('');
}

/** Separate from political/game data. Bounded caches and revocable raster URLs. */
export function createTerrainData(base: string, fetcher: typeof fetch = globalThis.fetch) {
  const root = `${base.replace(/\/?$/, '/')}atlas/physical-v1/`;
  let manifest: TerrainManifest | undefined;
  const rasters = new Map<string, string>();
  const vectors = new Map<string, HydrologyCollection>();
  async function response(path: string, signal?: AbortSignal) {
    if (!/^[a-z0-9/.-]+\.(?:webp|json)$/.test(path) || path.includes('..') || path.startsWith('/')) throw new Error('Invalid terrain asset path');
    const result = await fetcher(`${root}${path}`, { signal });
    if (!result.ok) throw new Error(`Physical map unavailable (${result.status})`);
    return result;
  }
  async function loadManifest(signal?: AbortSignal) {
    if (manifest) return manifest;
    const value = await (await response('manifest.json', signal)).json() as TerrainManifest;
    if (value.schemaVersion !== 1 || value.datasetId !== 'natural-earth-physical-v1' || value.crs !== 'OGC:CRS84') throw new Error('Invalid physical map manifest');
    manifest = value;
    return value;
  }
  async function loadRaster(asset: TerrainAsset, signal?: AbortSignal) {
    const cached = rasters.get(asset.path);
    if (cached) { rasters.delete(asset.path); rasters.set(asset.path, cached); return cached; }
    const blob = await (await response(asset.path, signal)).blob();
    signal?.throwIfAborted();
    const url = URL.createObjectURL(blob);
    rasters.set(asset.path, url);
    while (rasters.size > 24) {
      // Keep the compact fallback alive while panning through detailed tiles.
      const key = [...rasters.keys()].find(path => path !== 'world.webp')!;
      URL.revokeObjectURL(rasters.get(key)!); rasters.delete(key);
    }
    return url;
  }
  async function loadHydrology(asset: TerrainAsset, signal?: AbortSignal) {
    const cached = vectors.get(asset.path);
    if (cached) { vectors.delete(asset.path); vectors.set(asset.path, cached); return cached; }
    const value = await (await response(asset.path, signal)).json() as HydrologyCollection;
    if (value.schemaVersion !== 1 || !Array.isArray(value.features)) throw new Error('Invalid hydrology');
    vectors.set(asset.path, value);
    // Two global levels + up to eight viewport chunks. Never cache the high-detail world.
    while (vectors.size > 10) vectors.delete(vectors.keys().next().value!);
    return value;
  }
  function dispose() { for (const url of rasters.values()) URL.revokeObjectURL(url); rasters.clear(); vectors.clear(); }
  return { loadManifest, loadRaster, loadHydrology, dispose };
}

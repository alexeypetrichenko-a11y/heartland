import { intersectsGeography, projectPolygonParts, type AtlasShape } from './atlas.ts';
import type { GeographicAsset, GeographicBounds, GeographicCollection, GeographicPosition, GeographicRegion, GeographicRegionId, RegionCatalog } from './types';
import { RADIANS } from './worldCamera.ts';

export const REGION_CHUNK_LIMIT = 4;
export const REGION_BYTE_LIMIT = 1_200_000;
export type AtlasRegion = AtlasShape<GeographicRegionId> & { record: GeographicRegion };

export function regionName(region: GeographicRegion): string {
  return region.name?.trim() || region.names.english?.trim() || 'Unnamed region';
}

/** Preserve mixed source levels. A sole +00? level-zero record repeats the country. */
export function usableRegions(index: RegionCatalog | null): GeographicRegion[] {
  if (!index) return [];
  return index.regions.filter(region => region.geometryStatus === 'valid' && !(
    index.regions.length === 1 && region.source.gadm_level === 0 &&
    region.source.adm1_code === `${index.countryId.slice('ne:admin0:'.length)}+00?`
  ));
}

function distanceToBounds([lon, lat]: GeographicPosition, [west, south, east, north]: GeographicBounds) {
  const dx = Math.min(...[lon - 360, lon, lon + 360].map(x => Math.max(0, west - x, x - east)));
  const dy = Math.max(0, south - lat, lat - north);
  return (dx * Math.cos(lat * RADIANS)) ** 2 + dy ** 2;
}

/** Request only chunks referenced by overlapping region records, nearest first. */
export function planRegionChunks(regions: readonly GeographicRegion[], bounds: readonly GeographicBounds[], focus: GeographicPosition) {
  const candidates = new Map<string, { asset: GeographicAsset; distance: number }>();
  for (const region of regions) {
    if (!bounds.some(box => intersectsGeography(region.bbox, box))) continue;
    const asset = region.geometry;
    const distance = distanceToBounds(focus, region.bbox);
    const prior = candidates.get(asset.path);
    if (!prior || distance < prior.distance) candidates.set(asset.path, { asset, distance });
  }
  const nearest = [...candidates.values()].sort((a, b) => a.distance - b.distance || a.asset.path.localeCompare(b.asset.path));
  const assets: GeographicAsset[] = [];
  let bytes = 0;
  for (const { asset } of nearest) {
    if (assets.length >= REGION_CHUNK_LIMIT) break;
    if (bytes + asset.bytes > REGION_BYTE_LIMIT) continue;
    assets.push(asset);
    bytes += asset.bytes;
  }
  return { assets, limited: assets.length < nearest.length };
}

export function projectRegionChunk(collection: GeographicCollection, records: readonly GeographicRegion[], path: string): AtlasRegion[] {
  const byId = new Map(records.filter(record => record.geometry.path === path).map(record => [record.id, record]));
  return collection.features.flatMap(feature => {
    const record = byId.get(feature.id as GeographicRegionId);
    if (!record || record.countryId !== feature.properties.countryId) return [];
    return [{ id: record.id, record, parts: projectPolygonParts(feature.geometry) }];
  });
}

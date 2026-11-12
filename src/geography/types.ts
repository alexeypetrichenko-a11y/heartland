// Geographic source identity only. Never a game CountryId, owner, seat or military position.
export type GeographicCountryId = `ne:admin0:${string}`;
export type GeographicRegionId = `ne:admin1:${string}`;
export type GeographicId = GeographicCountryId | GeographicRegionId;
/** WGS84 longitude, latitude in degrees (OGC:CRS84 order), independent of screen pixels. */
export type GeographicPosition = [longitude: number, latitude: number];
export type GeographicBounds = [west: number, south: number, east: number, north: number];
export type PolygonGeometry = { type: 'Polygon'; coordinates: GeographicPosition[][] };
export type MultiPolygonGeometry = { type: 'MultiPolygon'; coordinates: GeographicPosition[][][] };
export type GeographicGeometry = PolygonGeometry | MultiPolygonGeometry;
export type GeographicFeature = {
  type: 'Feature'; id: GeographicId;
  properties: { countryId: GeographicCountryId };
  geometry: GeographicGeometry;
};
export type GeographicCollection = { type: 'FeatureCollection'; features: GeographicFeature[] };
export type SourceProperties = Record<string, string | number | null>;
export type GeographicAsset = { path: string; bytes: number; gzipBytes: number; sha256: string };
export type OverviewScale = '110m' | '50m';
export type GeometryStatus = 'valid' | 'source-invalid';

export interface GeographicCountry {
  id: GeographicCountryId;
  name: string;
  names: { short: string | null; english: string | null; long: string | null };
  continent: string;
  regionUN: string;
  subregion: string;
  source: SourceProperties;
  bbox: GeographicBounds;
  geometryStatus: GeometryStatus;
  geometry: GeographicAsset;
  availableOverviews: OverviewScale[];
  regionCount: number;
  regionIndex: GeographicAsset | null;
}

/** A Natural Earth Admin-1 source record, including its documented stand-ins/unknowns. */
export interface GeographicRegion {
  id: GeographicRegionId;
  countryId: GeographicCountryId;
  name: string | null;
  names: { english: string | null; local: string | null; alternative: string | null };
  source: SourceProperties;
  bbox: GeographicBounds;
  geometryStatus: GeometryStatus;
  geometry: GeographicAsset;
}
export type CountryCatalog = { schemaVersion: 1; countries: GeographicCountry[] };
export type RegionCatalog = { schemaVersion: 1; countryId: GeographicCountryId; regions: GeographicRegion[] };
export interface GeographyManifest {
  schemaVersion: 1;
  datasetId: 'natural-earth-5.1.1';
  crs: 'OGC:CRS84';
  coordinateOrder: ['longitude', 'latitude'];
  source: { name: string; datasetVersion: string; repositoryTag: string; repositoryCommit: string;
    license: string; licenseUrl: string; boundaryPolicy: string; boundaryPolicyUrl: string };
  countries: { count: number; asset: GeographicAsset };
  regions: { count: number; countryIndexes: number };
  overviews: Record<OverviewScale, { featureCount: number; asset: GeographicAsset }>;
  quality: GeographicAsset;
  inventory: GeographicAsset;
  processing: { coordinateDecimals: number; precisionExceptionsInQualityReport: boolean; simplification: string;
    winding: string; polygonOrRingRemoval: string; regionChunkTargetBytes: number; oversizedSingleFeaturesInQualityReport: boolean };
  /** Excludes manifest/inventory metadata; gzip sizes are deterministic measurements, not server promises. */
  dataAssets: { count: number; bytes: number; gzipBytes: number };
}

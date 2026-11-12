import { assertGeographicGeometry } from './geometry.ts';
import type { CountryCatalog, GeographicAsset, GeographicCollection, GeographicCountryId, GeographicFeature,
  GeographicRegionId, GeographyManifest, OverviewScale, RegionCatalog } from './types';

/** Creating/importing a loader performs no requests. The caller explicitly chooses detail. */
export function createGeographyLoader({ appBaseUrl, fetcher = globalThis.fetch }: { appBaseUrl: string; fetcher?: typeof fetch }) {
  const base = `${appBaseUrl.replace(/\/?$/, '/')}geography/natural-earth-5.1.1/`;
  let manifestRequest: Promise<GeographyManifest> | undefined;
  let countriesRequest: Promise<CountryCatalog> | undefined;
  // Bound detail memory to one country index and one geometry chunk, not a world cache.
  let regionIndex: { id: GeographicCountryId; request: Promise<RegionCatalog | null> } | undefined;
  let geometryChunk: { path: string; request: Promise<GeographicCollection> } | undefined;

  async function read<T>(path: string): Promise<T> {
    if (!/^[A-Za-z0-9/.-]+\.(?:json|geojson)$/.test(path) || path.includes('..') || path.startsWith('/')) throw new Error('Invalid geography asset path');
    const response = await fetcher(`${base}${path}`);
    if (!response.ok) throw new Error(`Geography request failed (${response.status}): ${path}`);
    return await response.json() as T;
  }
  function loadManifest(): Promise<GeographyManifest> {
    return manifestRequest ??= read<GeographyManifest>('manifest.json').then(value => {
      if (value.schemaVersion !== 1 || value.datasetId !== 'natural-earth-5.1.1' || value.crs !== 'OGC:CRS84') throw new Error('Unsupported geography manifest');
      return value;
    }).catch(error => { manifestRequest = undefined; throw error; });
  }
  function loadCountries(): Promise<CountryCatalog> {
    return countriesRequest ??= loadManifest().then(m => read<CountryCatalog>(m.countries.asset.path)).then(value => {
      if (value.schemaVersion !== 1 || !Array.isArray(value.countries)) throw new Error('Invalid country catalog');
      return value;
    }).catch(error => { countriesRequest = undefined; throw error; });
  }
  async function country(id: GeographicCountryId) {
    const match = (await loadCountries()).countries.find(item => item.id === id);
    if (!match) throw new Error(`Unknown geographic country: ${id}`);
    return match;
  }
  function validateFeature(feature: GeographicFeature) {
    if (feature.type !== 'Feature' || !feature.id || !feature.properties?.countryId) throw new Error('Invalid geographic feature');
    assertGeographicGeometry(feature.geometry);
    return feature;
  }
  function validateCollection(value: GeographicCollection) {
    if (value.type !== 'FeatureCollection' || !Array.isArray(value.features)) throw new Error('Invalid geographic collection');
    value.features.forEach(validateFeature);
    return value;
  }
  async function loadOverview(scale: OverviewScale = '110m') {
    const descriptor = (await loadManifest()).overviews[scale];
    if (!descriptor) throw new Error(`Unavailable overview: ${scale}`);
    return validateCollection(await read<GeographicCollection>(descriptor.asset.path));
  }
  async function loadCountryGeometry(id: GeographicCountryId) {
    const record = await country(id);
    const feature = validateFeature(await read<GeographicFeature>(record.geometry.path));
    if (feature.id !== id || feature.properties.countryId !== id) throw new Error('Country geometry reference mismatch');
    return feature;
  }
  async function loadRegionIndex(id: GeographicCountryId): Promise<RegionCatalog | null> {
    if (regionIndex?.id === id) return regionIndex.request;
    const request = country(id).then(async record => {
      if (!record.regionIndex) return null; // Missing source data stays missing.
      const value = await read<RegionCatalog>(record.regionIndex.path);
      if (value.schemaVersion !== 1 || value.countryId !== id || !Array.isArray(value.regions) || value.regions.some(r => r.countryId !== id)) throw new Error('Region catalog reference mismatch');
      return value;
    }).catch(error => { if (regionIndex?.request === request) regionIndex = undefined; throw error; });
    regionIndex = { id, request };
    return request;
  }
  async function chunk(asset: GeographicAsset) {
    if (geometryChunk?.path === asset.path) return geometryChunk.request;
    const request = read<GeographicCollection>(asset.path).then(validateCollection).catch(error => {
      if (geometryChunk?.request === request) geometryChunk = undefined;
      throw error;
    });
    geometryChunk = { path: asset.path, request };
    return request;
  }
  async function loadRegionGeometry(countryId: GeographicCountryId, regionId: GeographicRegionId) {
    const record = (await loadRegionIndex(countryId))?.regions.find(item => item.id === regionId);
    if (!record) throw new Error(`Unknown geographic region in ${countryId}: ${regionId}`);
    const feature = (await chunk(record.geometry)).features.find(item => item.id === regionId);
    if (!feature || feature.properties.countryId !== countryId) throw new Error('Region geometry reference mismatch');
    return feature;
  }
  return { loadManifest, loadCountries, loadOverview, loadCountryGeometry, loadRegionIndex, loadRegionGeometry };
}

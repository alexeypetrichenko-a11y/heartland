import { assertGeographicGeometry } from './geometry.ts';
import { projectAtlasFeature, type AtlasCatalog, type AtlasCountry, type AtlasShape } from './atlas.ts';
import type { GeographicCollection, GeographicFeature } from './types';

/** Only the atlas calls this loader. No country/region or terrain preloading during gameplay. */
export function createAtlasData(base: string, fetcher: typeof fetch = globalThis.fetch) {
  const root = base.replace(/\/?$/, '/');
  const geography = `${root}geography/natural-earth-5.1.1/`;
  const overviews = new Map<string, AtlasShape[]>();
  const details = new Map<string, AtlasShape>();
  async function json<T>(url: string, signal?: AbortSignal): Promise<T> {
    const response = await fetcher(url, { signal });
    if (!response.ok) throw new Error(`Map data unavailable (${response.status})`);
    return await response.json() as T;
  }
  function shape(feature: GeographicFeature) {
    if (feature.type !== 'Feature' || feature.id !== feature.properties?.countryId) throw new Error('Invalid atlas country');
    assertGeographicGeometry(feature.geometry);
    return projectAtlasFeature(feature);
  }
  async function loadCatalog(signal?: AbortSignal) {
    const catalog = await json<AtlasCatalog>(`${root}atlas/political.json`, signal);
    if (catalog.schemaVersion !== 1 || catalog.datasetId !== 'natural-earth-5.1.1' || !Array.isArray(catalog.countries)) throw new Error('Invalid atlas catalog');
    return catalog;
  }
  async function loadOverview(scale: '110m' | '50m', signal?: AbortSignal) {
    if (overviews.has(scale)) return overviews.get(scale)!;
    const value = await json<GeographicCollection>(`${geography}overview-${scale}.geojson`, signal);
    if (value.type !== 'FeatureCollection' || !Array.isArray(value.features)) throw new Error('Invalid atlas overview');
    const shapes = value.features.map(shape);
    overviews.set(scale, shapes);
    return shapes;
  }
  async function loadDetail(country: AtlasCountry, signal?: AbortSignal) {
    if (!/^countries\/[A-Z0-9]{3}\.geojson$/.test(country.path)) throw new Error('Invalid country detail path');
    const cached = details.get(country.id);
    if (cached) { details.delete(country.id); details.set(country.id, cached); return cached; }
    const feature = await json<GeographicFeature>(`${geography}${country.path}`, signal);
    if (feature.id !== country.id) throw new Error('Country detail reference mismatch');
    const result = shape(feature);
    details.set(country.id, result);
    while (details.size > 12) details.delete(details.keys().next().value!);
    return result;
  }
  return { loadCatalog, loadOverview, loadDetail };
}

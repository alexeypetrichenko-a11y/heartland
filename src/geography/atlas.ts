import type { GeographicBounds, GeographicCountryId, GeographicFeature, GeographicGeometry, GeographicPosition } from './types';

/** Equirectangular presentation: WGS84 degrees, with all continents and poles visible. */
export const ATLAS_WIDTH = 360;
export const ATLAS_HEIGHT = 180;
export const ATLAS_MAX_ZOOM = 128;
export type AtlasPoint = { x: number; y: number };
export type AtlasSize = { width: number; height: number };
export type AtlasView = { zoom: number; center: AtlasPoint };
export type AtlasCountry = { id: GeographicCountryId; name: string; color: string; bbox: GeographicBounds;
  label: GeographicPosition; area: number; path: string; tiles: number[] };
export type AtlasCatalog = { schemaVersion: 1; datasetId: string; countries: AtlasCountry[];
  neighbors: [GeographicCountryId, GeographicCountryId][]; minimumNeighborDeltaE: number };
export type AtlasShape = { id: GeographicCountryId; parts: { path: string; bbox: GeographicBounds }[] };

export const initialAtlasView = (): AtlasView => ({ zoom: 1, center: { x: 180, y: 90 } });
export const projectGeography = ([longitude, latitude]: GeographicPosition): AtlasPoint => ({ x: longitude + 180, y: 90 - latitude });
export const unprojectGeography = ({ x, y }: AtlasPoint): GeographicPosition => [x - 180, 90 - y];
export const atlasScale = (view: AtlasView, size: AtlasSize) => Math.min(size.width / ATLAS_WIDTH, size.height / ATLAS_HEIGHT) * view.zoom;

export function constrainAtlasView(view: AtlasView, size: AtlasSize): AtlasView {
  const zoom = Math.max(1, Math.min(ATLAS_MAX_ZOOM, view.zoom));
  const scale = atlasScale({ ...view, zoom }, size);
  const center = (value: number, extent: number, pixels: number) => {
    if (zoom === 1) return extent / 2;
    // A quarter-viewport margin permits pointer anchoring from the portrait
    // letterbox. At most a quarter of an enlarged axis can pan beyond the world.
    const edge = Math.min(extent / 2, pixels / (2 * scale)) / 2;
    return Math.max(edge, Math.min(extent - edge, value));
  };
  return { zoom, center: { x: center(view.center.x, 360, size.width), y: center(view.center.y, 180, size.height) } };
}

export function moveAtlasView(view: AtlasView, size: AtlasSize, from: AtlasPoint, to: AtlasPoint, zoom = view.zoom): AtlasView {
  const next = { ...view, zoom: Math.max(1, Math.min(ATLAS_MAX_ZOOM, zoom)) };
  const oldScale = atlasScale(view, size), scale = atlasScale(next, size);
  return constrainAtlasView({ ...next, center: {
    x: view.center.x + (from.x - size.width / 2) / oldScale - (to.x - size.width / 2) / scale,
    y: view.center.y + (from.y - size.height / 2) / oldScale - (to.y - size.height / 2) / scale,
  } }, size);
}

export function atlasBounds(view: AtlasView, size: AtlasSize): GeographicBounds {
  const scale = atlasScale(view, size);
  return [Math.max(-180, view.center.x - size.width / (2 * scale) - 180),
    Math.max(-90, 90 - view.center.y - size.height / (2 * scale)),
    Math.min(180, view.center.x + size.width / (2 * scale) - 180),
    Math.min(90, 90 - view.center.y + size.height / (2 * scale))];
}
export const intersectsGeography = (a: GeographicBounds, b: GeographicBounds) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

export function countryInViewport(country: AtlasCountry, bounds: GeographicBounds): boolean {
  return intersectsGeography(country.bbox, bounds) && country.tiles.some(tile => {
    const x = tile % 36, y = Math.floor(tile / 36);
    return intersectsGeography([x * 10 - 180, 80 - y * 10, x * 10 - 170, 90 - y * 10], bounds);
  });
}

export function projectPolygonParts(geometry: GeographicGeometry): AtlasShape['parts'] {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.map(polygon => {
    const bbox: GeographicBounds = [180, 90, -180, -90];
    const path = polygon.map(ring => ring.map(([lon, lat], i) => {
      bbox[0] = Math.min(bbox[0], lon); bbox[1] = Math.min(bbox[1], lat);
      bbox[2] = Math.max(bbox[2], lon); bbox[3] = Math.max(bbox[3], lat);
      return `${i ? 'L' : 'M'}${+(lon + 180).toFixed(6)},${+(90 - lat).toFixed(6)}`;
    }).join('') + 'Z').join('');
    return { path, bbox };
  });
}
export const projectAtlasFeature = (feature: GeographicFeature): AtlasShape => ({ id: feature.properties.countryId, parts: projectPolygonParts(feature.geometry) });

/** Exact same color registry for every LOD. Colors carry no gameplay meaning. */
export function colorDeltaE(a: string, b: string): number {
  const lab = (hex: string) => {
    const [r, g, blue] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    const [x, y, z] = [(r * .4124564 + g * .3575761 + blue * .1804375) / .95047,
      r * .2126729 + g * .7151522 + blue * .0721750, (r * .0193339 + g * .1191920 + blue * .9503041) / 1.08883]
      .map(v => v > (6 / 29) ** 3 ? Math.cbrt(v) : v / (3 * (6 / 29) ** 2) + 4 / 29);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  };
  const aa = lab(a), bb = lab(b);
  return Math.hypot(...aa.map((v, i) => v - bb[i]));
}

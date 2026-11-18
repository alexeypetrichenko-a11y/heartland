import { projectGeography, type AtlasPoint, type AtlasShape, type AtlasSize } from './atlas.ts';
import { northScale, unprojectWorld, type WorldCamera } from './worldCamera.ts';
import type { GeographicCountry, GeographicCountryId, GeographicId, GeographicPosition } from './types';

export const COUNTRY_HIGHLIGHT = '#ffe19a';
export const COUNTRY_HIGHLIGHT_OPACITY = .30;
export type CountryGeography = Pick<GeographicCountry, 'continent' | 'subregion' | 'regionIndex'>;

// A separate, future roster can set a flag for a geographic ID. Missing flags
// remain undecided. Natural Earth data does not determine game eligibility.
export type CountryPlayability = 'undecided' | 'playable' | 'unavailable';
export type CountryPlayabilityFlags = Readonly<Partial<Record<GeographicCountryId, Exclude<CountryPlayability, 'undecided'>>>>;
const COUNTRY_PLAYABILITY: CountryPlayabilityFlags = {};

export function countryPlayability(id: GeographicCountryId): CountryPlayability {
  return COUNTRY_PLAYABILITY[id] ?? 'undecided';
}

type AtlasPart = AtlasShape['parts'][number];
export type ContainsAtlasPart = (part: AtlasPart, point: AtlasPoint) => boolean;

function findFeature<Id extends GeographicId>(shapes: readonly AtlasShape<Id>[], [longitude, latitude]: GeographicPosition, contains: ContainsAtlasPart) {
  // At the exact seam, either end of the source plane can own an edge.
  const longitudes = Math.abs(longitude + 180) < 1e-7 ? [-180, 180] : [longitude];
  for (const lon of longitudes) {
    const point = projectGeography([lon, latitude]);
    // The last painted source shape wins where the source geometries overlap.
    for (let i = shapes.length - 1; i >= 0; i--) {
      for (const part of shapes[i].parts) {
        const [west, south, east, north] = part.bbox;
        if (lon >= west && lon <= east && latitude >= south && latitude <= north && contains(part, point)) return shapes[i].id;
      }
    }
  }
  return null;
}

/** Use the displayed projection and source stage, with a small touch-only miss tolerance. */
export function pickAtlasFeature<Id extends GeographicId>(camera: WorldCamera, size: AtlasSize, position: AtlasPoint,
    shapes: readonly AtlasShape<Id>[], contains: ContainsAtlasPart, touch: boolean): Id | null {
  function geography(point: AtlasPoint) {
    if (point.x < 0 || point.x > size.width || point.y < 0 || point.y > size.height) return null;
    if (camera.flatOnly && camera.zoom === 1 && Math.abs(point.x - size.width / 2) > 180 * northScale(camera, size)) return null;
    return unprojectWorld(camera, size, point);
  }
  const exact = geography(position);
  if (!exact) return null;
  const hit = findFeature(shapes, exact, contains);
  if (hit || !touch) return hit;

  // A direct hit always wins. Probe up to 6 CSS pixels of nearby visible land,
  // never a point in the sky or a synthetic island.
  for (const radius of [2, 4, 6]) {
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const nearby = geography({ x: position.x + Math.cos(angle) * radius, y: position.y + Math.sin(angle) * radius });
      if (!nearby) continue;
      const match = findFeature(shapes, nearby, contains);
      if (match) return match;
    }
  }
  return null;
}

export const pickAtlasCountry = pickAtlasFeature<GeographicCountryId>;

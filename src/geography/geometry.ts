import type { GeographicGeometry, GeographicPosition } from './types';

export function geographicRingArea(ring: GeographicPosition[]): number {
  const [originX, originY] = ring[0];
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1];
    area += (a[0] - originX) * (b[1] - originY) - (b[0] - originX) * (a[1] - originY);
  }
  return area / 2;
}

/** Structural GeoJSON integrity, not a claim to repair/validate every planar topology. */
export function assertGeographicGeometry(value: unknown): asserts value is GeographicGeometry {
  const geometry = value as GeographicGeometry | null;
  if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type) || !Array.isArray(geometry.coordinates)) throw new Error('Expected geographic Polygon or MultiPolygon');
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  if (!polygons.length) throw new Error('Empty geographic geometry');
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length) throw new Error('Empty geographic polygon');
    for (const [index, ring] of polygon.entries()) {
      if (!Array.isArray(ring) || ring.length < 4) throw new Error('Geographic ring needs at least four coordinates');
      for (const p of ring) {
        if (!Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite) || p[0] < -180 || p[0] > 180 || p[1] < -90 || p[1] > 90) throw new Error('Invalid longitude/latitude coordinate');
      }
      const first = ring[0], last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) throw new Error('Open geographic ring');
      const area = geographicRingArea(ring);
      if (!area || (area > 0) !== (index === 0)) throw new Error('Degenerate geographic ring or incorrect winding');
    }
  }
}

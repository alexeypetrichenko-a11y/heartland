import type { AtlasCountry, AtlasPoint, AtlasSize } from './atlas';
import type { GeographicBounds, GeographicPosition } from './types';
import { desiredProjection, globeRadius, initialWorldCamera, placeWorldPoint, positionWorldCamera, projectWorld, wrapLongitude, type WorldCamera } from './worldCamera.ts';

export const MAX_REGION_FIT_ZOOM = 64;
export type ScreenRect = { left: number; top: number; right: number; bottom: number };

function clearRectangles(size: AtlasSize, obstacles: readonly ScreenRect[]) {
  const margin = Math.min(18, Math.max(8, Math.min(size.width, size.height) * .025));
  const inner = { left: margin, top: margin, right: size.width - margin, bottom: size.height - margin };
  let clear = [inner];
  for (const { left, top, right, bottom } of obstacles) {
    clear = clear.flatMap(box => {
      if (box.right <= left - margin || box.left >= right + margin || box.bottom <= top - margin || box.top >= bottom + margin) return [box];
      return [
        { ...box, right: left - margin },
        { ...box, left: right + margin },
        { ...box, bottom: top - margin },
        { ...box, top: bottom + margin },
      ].filter(rect => rect.right - rect.left >= 40 && rect.bottom - rect.top >= 40);
    });
  }
  return clear.length ? clear : [inner];
}

/** Sample the curved projection of the extent, including its horizontal edges. */
function extentPoints([west, south, east, north]: GeographicBounds): GeographicPosition[] {
  const points: GeographicPosition[] = [];
  const columns = Math.max(1, Math.ceil((east - west) / 5));
  const rows = Math.max(1, Math.ceil((north - south) / 5));
  for (let i = 0; i <= columns; i++) {
    const longitude = west + (east - west) * i / columns;
    points.push([longitude, south], [longitude, north]);
  }
  for (let i = 1; i < rows; i++) {
    const latitude = south + (north - south) * i / rows;
    points.push([west, latitude], [east, latitude]);
  }
  return points;
}

function fitProjection(flatOnly: boolean, projection: WorldCamera['projection'], size: AtlasSize, rect: ScreenRect,
    focus: GeographicPosition, points: readonly GeographicPosition[]) {
  const center = { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
  const start = { ...initialWorldCamera(flatOnly), projection, focus };
  function atZoom(zoom: number) {
    const view = { ...start, zoom };
    function fits(anchor: AtlasPoint) {
      const camera = placeWorldPoint(view, size, focus, anchor);
      if (projection === 'globe' && desiredProjection(camera, size) !== 'globe') return null;
      return points.every(point => {
        const p = projectWorld(camera, size, point);
        return p && p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom;
      }) ? camera : null;
    }
    if (projection === 'flat') return fits(center);
    // Near the world scale, a side column's center may lie off the sphere.
    // Try smaller shifts before ruling out a wide territory.
    const dx = center.x - size.width / 2, dy = center.y - size.height / 2;
    const shift = Math.min(1, .7 * globeRadius(view, size) / Math.hypot(dx, dy));
    for (const fraction of [1, .5, .25, 0]) {
      const scale = shift * fraction;
      const camera = fits({ x: size.width / 2 + dx * scale, y: size.height / 2 + dy * scale });
      if (camera) return camera;
    }
    return null;
  }

  let best = atZoom(MAX_REGION_FIT_ZOOM);
  if (!best) {
    // The fallback locks the entire world in place at exactly 1×.
    let lower = flatOnly ? 1.01 : 1, upper = MAX_REGION_FIT_ZOOM;
    best = atZoom(lower);
    for (let i = 0; i < 14; i++) {
      const zoom = (lower + upper) / 2;
      const candidate = atZoom(zoom);
      if (candidate) { best = candidate; lower = zoom; }
      else upper = zoom;
    }
  }
  // A flat target may enter through the existing hysteresis band. It stays
  // flat on subsequent gestures using the same projection rules.
  return best && desiredProjection(best, size) === projection ? best : null;
}

export function regionCameraTarget(flatOnly: boolean, size: AtlasSize, country: Pick<AtlasCountry, 'bbox' | 'mainBounds'>,
    obstacles: readonly ScreenRect[] = []): WorldCamera {
  const bounds = country.mainBounds ?? country.bbox;
  const [west, south, east, north] = bounds;
  const focus: GeographicPosition = [wrapLongitude((west + east) / 2), (south + north) / 2];
  const points = extentPoints(bounds);
  const rectangles = clearRectangles(size, obstacles);
  for (const projection of (flatOnly ? ['flat'] as const : ['flat', 'globe'] as const)) {
    let best: WorldCamera | null = null;
    for (const rect of rectangles) {
      const candidate = fitProjection(flatOnly, projection, size, rect, focus, points);
      if (candidate && (!best || candidate.zoom > best.zoom)) best = candidate;
    }
    if (best) return best;
  }
  return positionWorldCamera(initialWorldCamera(flatOnly), size, focus, 1);
}

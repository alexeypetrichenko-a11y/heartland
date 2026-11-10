// Presentation coordinates only. Camera changes never modify geography or game state.
export const MAP_WIDTH = 360;
export const MAP_HEIGHT = 332;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export type Point = { x: number; y: number };
export type MapSize = { width: number; height: number };
export type MapView = { zoom: number; center: Point };

export function initialMapView(): MapView {
  return { zoom: MIN_ZOOM, center: { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 } };
}

export function mapScale(view: MapView, size: MapSize): number {
  return Math.min(size.width / MAP_WIDTH, size.height / MAP_HEIGHT) * view.zoom;
}

export function constrainMapView(view: MapView, size: MapSize): MapView {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom));
  const scale = mapScale({ ...view, zoom }, size);
  function center(value: number, extent: number, viewport: number) {
    const half = viewport / (2 * scale);
    // Center an axis that fits; otherwise keep the world covering that axis.
    return half >= extent / 2 - 1e-9 ? extent / 2 : Math.max(half, Math.min(extent - half, value));
  }
  return { zoom, center: {
    x: center(view.center.x, MAP_WIDTH, size.width),
    y: center(view.center.y, MAP_HEIGHT, size.height),
  } };
}

// The world point under `from` follows `to`, including a moving pinch midpoint.
// Clamping takes precedence at the map edges and zoom limits.
export function moveMapView(view: MapView, size: MapSize, from: Point, to: Point, zoom = view.zoom): MapView {
  const oldScale = mapScale(view, size);
  const next = { zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)), center: { ...view.center } };
  const nextScale = mapScale(next, size);
  next.center.x += (from.x - size.width / 2) / oldScale - (to.x - size.width / 2) / nextScale;
  next.center.y += (from.y - size.height / 2) / oldScale - (to.y - size.height / 2) / nextScale;
  return constrainMapView(next, size);
}

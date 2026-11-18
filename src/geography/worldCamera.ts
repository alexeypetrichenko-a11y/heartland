import { ATLAS_MAX_ZOOM, constrainAtlasView, type AtlasPoint, type AtlasSize, type AtlasView } from './atlas.ts';
import type { GeographicBounds, GeographicPosition } from './types';

export type Vector3 = [number, number, number];
export type Quaternion = [number, number, number, number];
// Geographic focus is the entire orientation state. There is no accumulated roll.
export type WorldCamera = { zoom: number; focus: GeographicPosition; projection: 'globe' | 'flat'; flatOnly: boolean };
export const RADIANS = Math.PI / 180;
export const MAX_FOCUS_LATITUDE = 89.9;
export const wrapLongitude = (lon: number) => ((lon + 180) % 360 + 360) % 360 - 180;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const geographicFocus = ([lon, lat]: GeographicPosition): GeographicPosition => [wrapLongitude(lon), clamp(lat, -MAX_FOCUS_LATITUDE, MAX_FOCUS_LATITUDE)];
export const inverseRotation = ([x, y, z, w]: Quaternion): Quaternion => [-x, -y, -z, w];
export function rotateVector(q: Quaternion, v: Vector3): Vector3 {
  const [x, y, z, w] = q, [a, b, c] = v;
  const tx = 2 * (y * c - z * b), ty = 2 * (z * a - x * c), tz = 2 * (x * b - y * a);
  return [a + w * tx + y * tz - z * ty, b + w * ty + z * tx - x * tz, c + w * tz + x * ty - y * tx];
}
export function geographicVector([lon, lat]: GeographicPosition): Vector3 {
  const lambda = lon * RADIANS, phi = lat * RADIANS;
  return [Math.cos(phi) * Math.sin(lambda), Math.sin(phi), Math.cos(phi) * Math.cos(lambda)];
}
export function vectorGeography(v: Vector3): GeographicPosition {
  return [wrapLongitude(Math.atan2(v[0], v[2]) / RADIANS), Math.atan2(v[1], Math.hypot(v[0], v[2])) / RADIANS];
}
/** Derive north-up orientation afresh; never integrate a trackball quaternion. */
export function focusRotation([lon, lat]: GeographicPosition): Quaternion {
  const lambda = -lon * RADIANS / 2, phi = lat * RADIANS / 2;
  return [Math.sin(phi) * Math.cos(lambda), Math.cos(phi) * Math.sin(lambda), Math.sin(phi) * Math.sin(lambda), Math.cos(phi) * Math.cos(lambda)];
}
export const cameraFocus = (camera: WorldCamera): GeographicPosition => camera.focus;
export const cameraRotation = (camera: WorldCamera): Quaternion => focusRotation(camera.focus);
export const initialWorldCamera = (flatOnly = false): WorldCamera => ({ zoom: 1, focus: flatOnly ? [0, 0] : [12, 20], projection: flatOnly ? 'flat' : 'globe', flatOnly });
export const globeRadius = (camera: WorldCamera, size: AtlasSize) => Math.min(size.width, size.height) * .42 * camera.zoom;
const fitScale = (size: AtlasSize) => Math.min(size.width / 360, size.height / 180);
export const northScale = (camera: WorldCamera, size: AtlasSize) => camera.flatOnly ? fitScale(size) * camera.zoom : globeRadius(camera, size) * RADIANS;
const longitudeFactor = (camera: WorldCamera, latitude: number) => camera.flatOnly ? 1 : Math.max(.1, Math.cos(latitude * RADIANS));

export function transitionZoom(camera: WorldCamera, size: AtlasSize): number {
  const radius = Math.min(size.width, size.height) * .42;
  return Math.max(4.2, Math.max(size.width, size.height) / (.95 * radius)) / Math.max(.25, Math.cos(camera.focus[1] * RADIANS));
}
export function desiredProjection(camera: WorldCamera, size: AtlasSize): WorldCamera['projection'] {
  if (camera.flatOnly) return 'flat';
  const latitude = Math.abs(camera.focus[1]);
  if (latitude >= 82 || (camera.projection === 'globe' && latitude >= 80)) return 'globe';
  if (latitude + size.height / (2 * northScale(camera, size)) >= 89.5) return 'globe';
  return camera.zoom >= transitionZoom(camera, size) * (camera.projection === 'flat' ? .82 : 1) ? 'flat' : 'globe';
}
export function projectWorld(camera: WorldCamera, size: AtlasSize, point: GeographicPosition, projection = camera.projection): AtlasPoint | null {
  if (projection === 'globe') {
    const v = rotateVector(cameraRotation(camera), geographicVector(point));
    if (v[2] < -1e-8) return null;
    const radius = globeRadius(camera, size);
    return { x: size.width / 2 + v[0] * radius, y: size.height / 2 - v[1] * radius };
  }
  const [lon, lat] = camera.focus, scale = northScale(camera, size);
  return { x: size.width / 2 + wrapLongitude(point[0] - lon) * scale * longitudeFactor(camera, lat), y: size.height / 2 + (lat - point[1]) * scale };
}
export function unprojectWorld(camera: WorldCamera, size: AtlasSize, p: AtlasPoint): GeographicPosition | null {
  if (camera.projection === 'globe') {
    const radius = globeRadius(camera, size), x = (p.x - size.width / 2) / radius, y = (size.height / 2 - p.y) / radius;
    if (x * x + y * y > 1) return null;
    return vectorGeography(rotateVector(inverseRotation(cameraRotation(camera)), [x, y, Math.sqrt(Math.max(0, 1 - x * x - y * y))]));
  }
  const [lon, lat] = camera.focus, scale = northScale(camera, size);
  const latitude = lat - (p.y - size.height / 2) / scale;
  return latitude < -90 || latitude > 90 ? null : [wrapLongitude(lon + (p.x - size.width / 2) / (scale * longitudeFactor(camera, lat))), latitude];
}
function boundedFallback(camera: WorldCamera, size: AtlasSize): WorldCamera {
  if (!camera.flatOnly) return camera;
  const [lon, lat] = camera.focus;
  const bounded = constrainAtlasView({ zoom: camera.zoom, center: { x: lon + 180, y: 90 - lat } }, size);
  return { ...camera, focus: geographicFocus([bounded.center.x - 180, 90 - bounded.center.y]) };
}

export function positionWorldCamera(camera: WorldCamera, size: AtlasSize, focus: GeographicPosition, zoom: number): WorldCamera {
  const next = { ...camera, focus: geographicFocus(focus), zoom: clamp(zoom, 1, ATLAS_MAX_ZOOM) };
  return boundedFallback({ ...next, projection: desiredProjection(next, size) }, size);
}

/** Solve a north-up orthographic anchor. Prefer the nearest valid meridian branch. */
function globeAnchor(camera: WorldCamera, size: AtlasSize, anchor: GeographicPosition, to: AtlasPoint): GeographicPosition {
  const radius = globeRadius(camera, size), phi = anchor[1] * RADIANS, cosine = Math.cos(phi);
  // Constrained north-up navigation cannot place a near-polar anchor arbitrarily
  // sideways or beyond the limb. Use the nearest attainable surface position.
  const x = clamp((to.x - size.width / 2) / radius, -cosine, cosine);
  const delta = Math.asin(clamp(x / Math.max(1e-12, cosine), -1, 1));
  const length = Math.sqrt(Math.max(1e-12, 1 - x * x));
  const y = clamp((size.height / 2 - to.y) / radius, -length, length);
  const beta = Math.asin(clamp(y / length, -1, 1));
  const candidates = [delta, delta >= 0 ? Math.PI - delta : -Math.PI - delta].map(offset => {
    const latitude = (Math.atan2(Math.sin(phi), cosine * Math.cos(offset)) - beta) / RADIANS;
    const focus = geographicFocus([anchor[0] - offset / RADIANS, latitude]);
    const error = Math.abs(latitude - focus[1]) * 1000;
    const distance = Math.abs(wrapLongitude(focus[0] - camera.focus[0])) * Math.max(.1, Math.cos(camera.focus[1] * RADIANS)) + Math.abs(focus[1] - camera.focus[1]);
    return { focus, score: error + distance };
  });
  return candidates.sort((a, b) => a.score - b.score)[0].focus;
}
export function moveWorldCamera(camera: WorldCamera, size: AtlasSize, from: AtlasPoint, to: AtlasPoint, zoom = camera.zoom): WorldCamera {
  let anchor = unprojectWorld(camera, size, from);
  if (!anchor) { anchor = camera.focus; to = { x: size.width / 2, y: size.height / 2 }; }
  let next: WorldCamera = { ...camera, zoom: clamp(zoom, 1, ATLAS_MAX_ZOOM) };
  let projection = desiredProjection(next, size);
  for (let i = 0; i < 3; i++) {
    if (projection === 'flat') {
      const scale = northScale(next, size), lat = clamp(anchor[1] + (to.y - size.height / 2) / scale, -MAX_FOCUS_LATITUDE, MAX_FOCUS_LATITUDE);
      next.focus = geographicFocus([anchor[0] - (to.x - size.width / 2) / (scale * longitudeFactor(next, lat)), lat]);
    } else next.focus = globeAnchor(next, size, anchor, to);
    const candidate = desiredProjection({ ...next, projection: camera.projection }, size);
    if (candidate === projection) break;
    projection = candidate;
  }
  return boundedFallback({ ...next, projection }, size);
}
export function dragWorldCamera(camera: WorldCamera, size: AtlasSize, from: AtlasPoint, to: AtlasPoint): WorldCamera {
  const scale = northScale(camera, size), [lon, lat] = camera.focus;
  const focus = geographicFocus([lon - (to.x - from.x) / (scale * longitudeFactor(camera, lat)), lat + (to.y - from.y) / scale]);
  const next = { ...camera, focus };
  return boundedFallback({ ...next, projection: desiredProjection(next, size) }, size);
}
export function flatFallback(camera: WorldCamera, size: AtlasSize): WorldCamera {
  if (camera.zoom === 1) return initialWorldCamera(true);
  return boundedFallback({ ...camera, zoom: clamp(northScale(camera, size) / fitScale(size), 1, ATLAS_MAX_ZOOM), projection: 'flat', flatOnly: true }, size);
}

export function worldLayout(camera: WorldCamera, size: AtlasSize) {
  const focus = camera.focus, scale = northScale(camera, size), longitudeScale = longitudeFactor(camera, focus[1]);
  const loadSize = { width: size.width / longitudeScale, height: size.height };
  const view: AtlasView = { zoom: scale / fitScale(loadSize), center: { x: focus[0] + 180, y: 90 - focus[1] } };
  const west = focus[0] - loadSize.width / (2 * scale), east = focus[0] + loadSize.width / (2 * scale);
  const south = clamp(focus[1] - loadSize.height / (2 * scale), -90, 90), north = clamp(focus[1] + loadSize.height / (2 * scale), -90, 90);
  const bounds: GeographicBounds[] = [], offsets: number[] = [];
  for (const offset of [-360, 0, 360]) {
    if (camera.flatOnly && camera.zoom === 1 && offset !== 0) continue;
    const w = Math.max(-180, west - offset), e = Math.min(180, east - offset);
    if (w <= e) { bounds.push([w, south, e, north]); offsets.push(offset); }
  }
  return { focus, bearing: 0, scale, longitudeScale, view, loadSize, bounds, offsets,
    transform: 'translate(' + size.width / 2 + ' ' + size.height / 2 + ') scale(' + scale * longitudeScale + ' ' + scale + ') translate(' + -view.center.x + ' ' + -view.center.y + ')' };
}

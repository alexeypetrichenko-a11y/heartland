import { ATLAS_MAX_ZOOM, constrainAtlasView, type AtlasPoint, type AtlasSize, type AtlasView } from './atlas.ts';
import type { GeographicBounds, GeographicPosition } from './types';

export type Vector3 = [number, number, number];
export type Quaternion = [number, number, number, number];
export type WorldCamera = { zoom: number; rotation: Quaternion; projection: 'globe' | 'flat'; flatOnly: boolean };
export const RADIANS = Math.PI / 180;
export const wrapLongitude = (lon: number) => ((lon + 180) % 360 + 360) % 360 - 180;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const unit = (v: Vector3): Vector3 => { const length = Math.hypot(...v) || 1; return v.map(n => n / length) as Vector3; };
export const normalizeRotation = (q: Quaternion): Quaternion => { const length = Math.hypot(...q) || 1; return q.map(n => n / length) as Quaternion; };
export const inverseRotation = ([x, y, z, w]: Quaternion): Quaternion => [-x, -y, -z, w];
export function multiplyRotation(a: Quaternion, b: Quaternion): Quaternion {
  const [x, y, z, w] = a, [xx, yy, zz, ww] = b;
  return normalizeRotation([w * xx + x * ww + y * zz - z * yy, w * yy - x * zz + y * ww + z * xx,
    w * zz + x * yy - y * xx + z * ww, w * ww - x * xx - y * yy - z * zz]);
}
export function rotateVector(q: Quaternion, v: Vector3): Vector3 {
  const [x, y, z, w] = q, [a, b, c] = v;
  const tx = 2 * (y * c - z * b), ty = 2 * (z * a - x * c), tz = 2 * (x * b - y * a);
  return [a + w * tx + y * tz - z * ty, b + w * ty + z * tx - x * tz, c + w * tz + x * ty - y * tx];
}
export function rotationBetween(from: Vector3, to: Vector3): Quaternion {
  const a = unit(from), b = unit(to), dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (dot < -.999999) {
    const axis = Math.abs(a[0]) < .8 ? [0, a[2], -a[1]] : [-a[2], 0, a[0]];
    return [...unit(axis as Vector3), 0];
  }
  return normalizeRotation([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0], 1 + dot]);
}
export function geographicVector([lon, lat]: GeographicPosition): Vector3 {
  const lambda = lon * RADIANS, phi = lat * RADIANS;
  return [Math.cos(phi) * Math.sin(lambda), Math.sin(phi), Math.cos(phi) * Math.cos(lambda)];
}
export function vectorGeography(v: Vector3): GeographicPosition {
  return [wrapLongitude(Math.atan2(v[0], v[2]) / RADIANS), Math.atan2(v[1], Math.hypot(v[0], v[2])) / RADIANS];
}
export function focusRotation([lon, lat]: GeographicPosition, bearing = 0): Quaternion {
  const y: Quaternion = [0, Math.sin(-lon * RADIANS / 2), 0, Math.cos(lon * RADIANS / 2)];
  const x: Quaternion = [Math.sin(lat * RADIANS / 2), 0, 0, Math.cos(lat * RADIANS / 2)];
  const z: Quaternion = [0, 0, Math.sin(-bearing / 2), Math.cos(bearing / 2)];
  return multiplyRotation(z, multiplyRotation(x, y));
}
export const cameraFocus = (camera: WorldCamera): GeographicPosition => vectorGeography(rotateVector(inverseRotation(camera.rotation), [0, 0, 1]));
export function cameraBearing(camera: WorldCamera): number {
  const [lon, lat] = cameraFocus(camera).map(v => v * RADIANS);
  const north = rotateVector(camera.rotation, [-Math.sin(lat) * Math.sin(lon), Math.cos(lat), -Math.sin(lat) * Math.cos(lon)]);
  return Math.atan2(north[0], north[1]);
}
export const initialWorldCamera = (flatOnly = false): WorldCamera => ({ zoom: 1, rotation: focusRotation(flatOnly ? [0, 0] : [12, 20]), projection: flatOnly ? 'flat' : 'globe', flatOnly });
export const globeRadius = (camera: WorldCamera, size: AtlasSize) => Math.min(size.width, size.height) * .42 * camera.zoom;
const fitScale = (size: AtlasSize) => Math.min(size.width / 360, size.height / 180);
export const northScale = (camera: WorldCamera, size: AtlasSize) => camera.flatOnly ? fitScale(size) * camera.zoom : globeRadius(camera, size) * RADIANS;
const longitudeFactor = (camera: WorldCamera, latitude: number) => camera.flatOnly ? 1 : Math.max(.1, Math.cos(latitude * RADIANS));

/** Country-scale handoff; adapt to aspect ratio/latitude to keep curvature small. */
export function transitionZoom(camera: WorldCamera, size: AtlasSize): number {
  const latitude = cameraFocus(camera)[1];
  const radius = Math.min(size.width, size.height) * .42;
  return Math.max(4.2, Math.max(size.width, size.height) / (.95 * radius)) / Math.max(.25, Math.cos(latitude * RADIANS));
}
export function desiredProjection(camera: WorldCamera, size: AtlasSize): WorldCamera['projection'] {
  if (camera.flatOnly) return 'flat';
  const latitude = Math.abs(cameraFocus(camera)[1]);
  // Equirectangular caps cannot provide a continuous plane across a pole.
  if (latitude >= 82 || (camera.projection === 'globe' && latitude >= 80)) return 'globe';
  const bearing = cameraBearing(camera);
  const halfLatitude = (size.width * Math.abs(Math.sin(bearing)) + size.height * Math.abs(Math.cos(bearing))) / (2 * northScale(camera, size));
  if (latitude + halfLatitude >= 89.5) return 'globe';
  return camera.zoom >= transitionZoom(camera, size) * (camera.projection === 'flat' ? .82 : 1) ? 'flat' : 'globe';
}
function rotateScreen(p: AtlasPoint, angle: number): AtlasPoint {
  return { x: p.x * Math.cos(angle) - p.y * Math.sin(angle), y: p.x * Math.sin(angle) + p.y * Math.cos(angle) };
}
export function projectWorld(camera: WorldCamera, size: AtlasSize, point: GeographicPosition, projection = camera.projection): AtlasPoint | null {
  if (projection === 'globe') {
    const v = rotateVector(camera.rotation, geographicVector(point));
    if (v[2] < -1e-8) return null; // Only the visible hemisphere.
    const radius = globeRadius(camera, size);
    return { x: size.width / 2 + v[0] * radius, y: size.height / 2 - v[1] * radius };
  }
  const focus = cameraFocus(camera), scale = northScale(camera, size);
  const p = rotateScreen({ x: wrapLongitude(point[0] - focus[0]) * scale * longitudeFactor(camera, focus[1]), y: (focus[1] - point[1]) * scale }, cameraBearing(camera));
  return { x: size.width / 2 + p.x, y: size.height / 2 + p.y };
}
function spherePoint(p: AtlasPoint, camera: WorldCamera, size: AtlasSize, trackball = false): Vector3 | null {
  const radius = globeRadius(camera, size), x = (p.x - size.width / 2) / radius, y = (size.height / 2 - p.y) / radius;
  const length = Math.hypot(x, y);
  if (length > 1 && !trackball) return null;
  return length > 1 ? [x / length, y / length, 0] : [x, y, Math.sqrt(Math.max(0, 1 - x * x - y * y))];
}
export function unprojectWorld(camera: WorldCamera, size: AtlasSize, p: AtlasPoint): GeographicPosition | null {
  if (camera.projection === 'globe') {
    const v = spherePoint(p, camera, size);
    return v ? vectorGeography(rotateVector(inverseRotation(camera.rotation), v)) : null;
  }
  const focus = cameraFocus(camera), scale = northScale(camera, size);
  const local = rotateScreen({ x: p.x - size.width / 2, y: p.y - size.height / 2 }, -cameraBearing(camera));
  const lat = focus[1] - local.y / scale;
  return lat < -90 || lat > 90 ? null : [wrapLongitude(focus[0] + local.x / (scale * longitudeFactor(camera, focus[1]))), lat];
}
function boundedFallback(camera: WorldCamera, size: AtlasSize): WorldCamera {
  if (!camera.flatOnly) return camera;
  const focus = cameraFocus(camera);
  const bounded = constrainAtlasView({ zoom: camera.zoom, center: { x: focus[0] + 180, y: 90 - focus[1] } }, size);
  return { ...camera, rotation: focusRotation([bounded.center.x - 180, 90 - bounded.center.y], cameraBearing(camera)) };
}
export function moveWorldCamera(camera: WorldCamera, size: AtlasSize, from: AtlasPoint, to: AtlasPoint, zoom = camera.zoom): WorldCamera {
  let anchor = unprojectWorld(camera, size, from);
  if (!anchor) { anchor = cameraFocus(camera); to = { x: size.width / 2, y: size.height / 2 }; }
  let next: WorldCamera = { ...camera, zoom: clamp(zoom, 1, ATLAS_MAX_ZOOM) };
  let projection = desiredProjection(next, size);
  for (let i = 0; i < 2; i++) {
    if (projection === 'flat') {
      const scale = northScale(next, size), bearing = cameraBearing(camera);
      const local = rotateScreen({ x: to.x - size.width / 2, y: to.y - size.height / 2 }, -bearing);
      const lat = clamp(anchor[1] + local.y / scale, -90, 90);
      const lon = wrapLongitude(anchor[0] - local.x / (scale * longitudeFactor(next, lat)));
      next.rotation = focusRotation([lon, lat], bearing);
    } else {
      const target = spherePoint(to, next, size, true)!;
      const current = rotateVector(camera.rotation, geographicVector(anchor));
      next.rotation = multiplyRotation(rotationBetween(current, target), camera.rotation);
    }
    const candidate = desiredProjection({ ...next, projection: camera.projection }, size);
    if (candidate === projection) break;
    projection = candidate;
  }
  return boundedFallback({ ...next, projection }, size);
}
export function dragWorldCamera(camera: WorldCamera, size: AtlasSize, from: AtlasPoint, to: AtlasPoint): WorldCamera {
  if (camera.projection === 'flat') return moveWorldCamera(camera, size, from, to);
  const a = spherePoint(from, camera, size, true)!, b = spherePoint(to, camera, size, true)!;
  const next = { ...camera, rotation: multiplyRotation(rotationBetween(a, b), camera.rotation) };
  return { ...next, projection: desiredProjection(next, size) };
}
export function flatFallback(camera: WorldCamera, size: AtlasSize): WorldCamera {
  if (camera.zoom === 1) return initialWorldCamera(true);
  return boundedFallback({ ...camera, zoom: clamp(northScale(camera, size) / fitScale(size), 1, ATLAS_MAX_ZOOM), projection: 'flat', flatOnly: true }, size);
}

/** Reuse the existing lazy flat loaders with a bounding box that includes bearing/scale. */
export function worldLayout(camera: WorldCamera, size: AtlasSize) {
  const focus = cameraFocus(camera), bearing = cameraBearing(camera), scale = northScale(camera, size), longitudeScale = longitudeFactor(camera, focus[1]);
  const cosine = Math.abs(Math.cos(bearing)), sine = Math.abs(Math.sin(bearing));
  const loadSize = { width: (size.width * cosine + size.height * sine) / longitudeScale, height: size.width * sine + size.height * cosine };
  const view: AtlasView = { zoom: scale / fitScale(loadSize), center: { x: focus[0] + 180, y: 90 - focus[1] } };
  const west = focus[0] - loadSize.width / (2 * scale), east = focus[0] + loadSize.width / (2 * scale);
  const south = clamp(focus[1] - loadSize.height / (2 * scale), -90, 90), north = clamp(focus[1] + loadSize.height / (2 * scale), -90, 90);
  const bounds: GeographicBounds[] = [];
  const offsets: number[] = [];
  for (const offset of [-360, 0, 360]) {
    if (camera.flatOnly && camera.zoom === 1 && offset !== 0) continue;
    const w = Math.max(-180, west - offset), e = Math.min(180, east - offset);
    if (w <= e) { bounds.push([w, south, e, north]); offsets.push(offset); }
  }
  return { focus, bearing, scale, longitudeScale, view, loadSize, bounds, offsets,
    transform: `translate(${size.width / 2} ${size.height / 2}) rotate(${bearing / RADIANS}) scale(${scale * longitudeScale} ${scale}) translate(${-view.center.x} ${-view.center.y})` };
}

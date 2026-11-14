import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { projectPolygonParts } from './atlas.ts';
import { createGlobeMesh, globeRenderSize, globeRotationMatrix } from './globeMesh.ts';
import { cameraFocus, cameraRotation, MAX_FOCUS_LATITUDE, desiredProjection, dragWorldCamera, flatFallback, geographicVector,
  globeRadius, initialWorldCamera, moveWorldCamera, projectWorld, rotateVector, transitionZoom, unprojectWorld,
  vectorGeography, worldLayout, wrapLongitude, northScale, type WorldCamera } from './worldCamera.ts';
import type { GeographicFeature, GeographicPosition } from './types';

const size = { width: 356, height: 610 };
const center = { x: size.width / 2, y: size.height / 2 };
const close = (a: number, b: number, epsilon = 1e-7) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
function samePlace(a: GeographicPosition, b: GeographicPosition, epsilon = 1e-7) {
  close(wrapLongitude(a[0] - b[0]), 0, epsilon); close(a[1], b[1], epsilon);
}
function camera(focus: GeographicPosition, zoom: number, projection: WorldCamera['projection'] = 'globe'): WorldCamera {
  return { zoom, focus, projection, flatOnly: false };
}

test('sphere coordinates preserve geographic proportions, poles and the date line', () => {
  for (const p of [[0, 0], [179.9, 22], [-179.9, -40], [8, 46], [86, 28], [-62, -4], [134, -24]] as GeographicPosition[]) {
    const v = geographicVector(p); close(Math.hypot(...v), 1); samePlace(vectorGeography(v), p);
  }
  close(geographicVector([90, 0])[0], 1);
  close(geographicVector([30, 90])[1], 1); close(geographicVector([-60, -90])[1], -1);
  close(geographicVector([0, 60])[2], .5, 1e-12);
  const a = geographicVector([180, 25]), b = geographicVector([-180, 25]);
  for (let i = 0; i < 3; i++) close(a[i], b[i]);
});

test('sphere mesh has outward 3D triangles, unit radii and a duplicated, non-crossing UV seam', () => {
  const { vertices, indices } = createGlobeMesh();
  assert.equal(vertices.length / 5, 97 * 65); assert.equal(indices.length / 3, 96 * 64 * 2);
  for (let i = 0; i < vertices.length; i += 5) {
    close(Math.hypot(vertices[i], vertices[i + 1], vertices[i + 2]), 1, 1e-6);
    assert.ok(vertices[i + 3] >= 0 && vertices[i + 3] <= 1 && vertices[i + 4] >= 0 && vertices[i + 4] <= 1);
  }
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [...indices.slice(i, i + 3)].map(index => [...vertices.slice(index * 5, index * 5 + 5)]);
    const u = b.map((v, j) => v - a[j]), v = c.map((n, j) => n - a[j]);
    const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    assert.ok(normal.reduce((sum, n, j) => sum + n * a[j], 0) >= -1e-10, 'outward winding supports back-face culling');
    assert.ok(Math.max(a[3], b[3], c[3]) - Math.min(a[3], b[3], c[3]) < .011, 'no triangle stretches across the texture seam');
  }
  for (let row = 0; row <= 64; row++) {
    const first = row * 97 * 5, last = first + 96 * 5;
    for (let axis = 0; axis < 3; axis++) close(vertices[first + axis], vertices[last + axis]);
    assert.equal(vertices[first + 3], 0); assert.equal(vertices[last + 3], 1);
  }
});

test('global fit is a round sphere in portrait, landscape and desktop', () => {
  for (const viewport of [size, { width: 780, height: 170 }, { width: 1100, height: 650 }]) {
    const view = initialWorldCamera(), radius = globeRadius(view, viewport);
    assert.ok(2 * radius < viewport.width && 2 * radius < viewport.height);
    const focus = cameraFocus(view), facing = projectWorld(view, viewport, focus)!;
    close(facing.x, viewport.width / 2); close(facing.y, viewport.height / 2);
    assert.equal(projectWorld(view, viewport, [wrapLongitude(focus[0] + 180), -focus[1]]), null);
  }
});

test('globe picking and rotated orientations round-trip on the visible hemisphere', () => {
  for (const p of [[0, 0], [178, 33], [-145, -45], [20, 85]] as GeographicPosition[]) {
    const view = camera(p, 2);
    for (const delta of [{ x: 0, y: 0 }, { x: 30, y: -25 }, { x: -40, y: 20 }]) {
      const screen = { x: center.x + delta.x, y: center.y + delta.y };
      const geo = unprojectWorld(view, size, screen)!;
      const back = projectWorld(view, size, geo)!;
      close(back.x, screen.x); close(back.y, screen.y);
    }
  }
  assert.equal(unprojectWorld(initialWorldCamera(), size, { x: 0, y: 0 }), null, 'sky is not a geographic position');
});

function northUp(view: WorldCamera) {
  const [lon, lat] = cameraFocus(view).map(v => v * Math.PI / 180);
  const north = rotateVector(cameraRotation(view), [-Math.sin(lat) * Math.sin(lon), Math.cos(lat), -Math.sin(lat) * Math.cos(lon)]);
  close(north[0], 0, 1e-10); close(north[1], 1, 1e-10); close(north[2], 0, 1e-10);
  close(Math.hypot(...cameraRotation(view)), 1, 1e-10);
  assert.ok(cameraFocus(view).every(Number.isFinite));
  assert.ok(Math.abs(cameraFocus(view)[1]) <= MAX_FOCUS_LATITUDE);
}

test('10,000 geographic drags stay north-up; horizontal and vertical axes stay independent', () => {
  for (const viewport of [size, { width: 780, height: 170 }]) {
    let view = initialWorldCamera();
    const p = { x: viewport.width / 2, y: viewport.height / 2 };
    for (let i = 0; i < 10000; i++) {
      const axis = i % 2, before = cameraFocus(view);
      view = dragWorldCamera(view, viewport, p, { x: p.x + (axis ? 0 : 23), y: p.y + (axis ? Math.sin(i) * 17 : 0) });
      close(cameraFocus(view)[axis ? 0 : 1], before[axis ? 0 : 1]); northUp(view);
    }
  }
});

test('longitude rotates continuously through the date line and polar drags cannot invert Earth', () => {
  let view = camera([179, 83], 2);
  for (let i = 0; i < 2000; i++) {
    const before = cameraFocus(view);
    view = dragWorldCamera(view, size, center, { x: center.x - 5, y: center.y });
    assert.ok(wrapLongitude(cameraFocus(view)[0] - before[0]) > 0); northUp(view);
  }
  for (const dy of [100000, -200000, 100000]) {
    view = dragWorldCamera(view, size, center, { x: center.x, y: center.y + dy }); northUp(view);
    close(Math.abs(cameraFocus(view)[1]), MAX_FOCUS_LATITUDE);
  }
});

test('close Europe-to-Asia navigation preserves latitude and keeps Japan north-up', () => {
  let view = camera([12, 48], 4);
  for (let i = 0; i < 240; i++) {
    const degrees = Math.min(4, Math.max(-4, wrapLongitude(138 - view.focus[0])));
    view = dragWorldCamera(view, size, center, { x: center.x - degrees * northScale(view, size) * Math.cos(48 * Math.PI / 180), y: center.y });
    close(cameraFocus(view)[1], 48); northUp(view);
  }
  samePlace(cameraFocus(view), [138, 48]);
  assert.ok(projectWorld(view, size, [138, 37])!.y < projectWorld(view, size, [138, 35])!.y);
});

test('repeated zoom cycles retain geographic focus north-up through both projections and polar views', () => {
  for (const focus of [[2, 46], [138, 36], [179.9, -18], [-179.9, 75], [45, 89.9], [0, -89.9]] as GeographicPosition[]) {
    let view = camera(focus, 1);
    for (let cycle = 0; cycle < 40; cycle++) for (const zoom of [1.5, 4, 8, 16, 64, 128, 32, 8, 4, 1]) {
      view = moveWorldCamera(view, size, center, center, zoom);
      samePlace(cameraFocus(view), focus, 1e-9); northUp(view);
      assert.equal(worldLayout(view, size).bearing, 0);
    }
  }
});

test('wheel and a translating pinch preserve their geographic anchor on the sphere', () => {
  const view = camera([25, 30], 1.6);
  const from = { x: center.x - 45, y: center.y - 30 }, to = { x: from.x + 15, y: from.y + 10 };
  const anchor = unprojectWorld(view, size, from)!;
  const next = moveWorldCamera(view, size, from, to, 2.2);
  samePlace(unprojectWorld(next, size, to)!, anchor);
});

test('flat navigation preserves pointer/pinch anchors and bearing across the date line', () => {
  for (const lon of [-179, 15, 179]) {
    const view = camera([lon, 40], 20, 'flat');
    const from = { x: center.x - 40, y: center.y + 25 }, to = { x: center.x + 20, y: center.y + 35 };
    const anchor = unprojectWorld(view, size, from)!;
    const next = moveWorldCamera(view, size, from, to, 25);
    assert.equal(next.projection, 'flat'); samePlace(unprojectWorld(next, size, to)!, anchor);
    northUp(next);
  }
});

test('globe-to-flat and flat-to-globe handoffs retain focus and pointer location', () => {
  const original = camera([12, 35], 1), threshold = transitionZoom(original, size);
  const before = { ...original, zoom: threshold * .98 };
  const p = { x: center.x + 24, y: center.y - 18 };
  const anchor = unprojectWorld(before, size, p)!;
  const flat = moveWorldCamera(before, size, p, p, threshold * 1.08);
  assert.equal(flat.projection, 'flat'); samePlace(unprojectWorld(flat, size, p)!, anchor);
  const globe = moveWorldCamera(flat, size, center, center, threshold * .7);
  assert.equal(globe.projection, 'globe'); samePlace(cameraFocus(globe), cameraFocus(flat));
  const repeated = moveWorldCamera(globe, size, center, center, threshold * 1.1);
  assert.equal(repeated.projection, 'flat'); samePlace(cameraFocus(repeated), cameraFocus(globe));
});

test('local scale, orientation and focus agree in both projections at handoff', () => {
  for (const focus of [[8, 46], [86, 28], [-77, 39], [135, -25], [170, 72]] as GeographicPosition[]) for (const zoom of [4, 8, 16]) {
    const view = camera(focus, zoom);
    for (const p of [focus, [focus[0] + .0001, focus[1]], [focus[0], focus[1] + .0001]] as GeographicPosition[]) {
      const globe = projectWorld(view, size, p, 'globe')!, flat = projectWorld(view, size, p, 'flat')!;
      close(globe.x, flat.x, .0001); close(globe.y, flat.y, .0001);
    }
  }
});

test('handoff has hysteresis, adapts to viewport/latitude, and leaves polar caps spherical', () => {
  const globe = camera([12, 30], 1), threshold = transitionZoom(globe, size);
  assert.equal(desiredProjection({ ...globe, zoom: threshold * .99 }, size), 'globe');
  assert.equal(desiredProjection({ ...globe, zoom: threshold * 1.01 }, size), 'flat');
  assert.equal(desiredProjection({ ...globe, projection: 'flat', zoom: threshold * .9 }, size), 'flat');
  assert.ok(transitionZoom(globe, { width: 800, height: 150 }) > threshold);
  assert.ok(transitionZoom(camera([0, 72], 1), size) > threshold);
  for (const lat of [-90, -85, 85, 90]) assert.equal(desiredProjection(camera([0, lat], 128, 'flat'), size), 'globe');
});

test('date-line flat views load both source sides and draw continuous world copies', () => {
  for (const lon of [179, -179]) {
    const view = camera([lon, 20], 20, 'flat'), layout = worldLayout(view, size);
    assert.equal(layout.bounds.length, 2);
    assert.ok(layout.bounds.some(b => b[0] === -180) && layout.bounds.some(b => b[2] === 180));
    assert.ok(layout.offsets.includes(lon > 0 ? 360 : -360));
    const a = projectWorld(view, size, [179, 20])!, b = projectWorld(view, size, [-179, 20])!;
    assert.ok(Math.abs(a.x - b.x) < size.width);
  }
});

test('a north-up flat viewport never extends beyond a pole during normal WebGL navigation', () => {
  for (const lat of [60, 72, 78, 81]) for (const zoom of [4, 8, 16, 32]) {
    const view = camera([0, lat], zoom, 'flat');
    if (desiredProjection(view, size) === 'flat') {
      const layout = worldLayout(view, size);
      assert.ok(lat + layout.loadSize.height / (2 * layout.scale) < 89.5);
    }
  }
});

test('WebGL fallback fits the old flat world initially and preserves an explored focus', () => {
  const initial = flatFallback(initialWorldCamera(), size);
  assert.equal(initial.flatOnly, true); assert.equal(initial.projection, 'flat'); samePlace(cameraFocus(initial), [0, 0]);
  const view = camera([12, 25], 6), fallback = flatFallback(view, size);
  samePlace(cameraFocus(view), cameraFocus(fallback));
  close(worldLayout(view, size).scale, worldLayout(fallback, size).scale);
  assert.equal(worldLayout(initial, size).offsets.length, 1);
});

test('zoom limits, rotation matrices and GPU pixel budgets remain bounded', () => {
  for (const zoom of [.01, 1000]) {
    const next = moveWorldCamera(initialWorldCamera(), size, center, center, zoom);
    assert.ok(next.zoom >= 1 && next.zoom <= 128);
  }
  const view = camera([22, -45], 1), matrix = globeRotationMatrix(cameraRotation(view)), p = geographicVector([22, -45]);
  const actual = rotateVector(cameraRotation(view), p);
  for (let row = 0; row < 3; row++) close(matrix[row] * p[0] + matrix[row + 3] * p[1] + matrix[row + 6] * p[2], actual[row], 1e-6);
  for (const [width, height, dpr] of [[390, 610, 3], [1440, 900, 3], [780, 160, 2]]) {
    const render = globeRenderSize(width, height, dpr);
    assert.ok(render.width * render.height <= 2_003_000); assert.ok(render.width <= width * 2 && render.height <= height * 2);
  }
});

test('real date-line/polar multipolygons retain fills and holes without artificial border cuts', () => {
  for (const code of ['RUS', 'FJI', 'ATA']) {
    const f = JSON.parse(readFileSync(new URL(`../../public/geography/natural-earth-5.1.1/countries/${code}.geojson`, import.meta.url), 'utf8')) as GeographicFeature;
    const parts = projectPolygonParts(f.geometry);
    assert.equal(parts.length, f.geometry.type === 'Polygon' ? 1 : f.geometry.coordinates.length);
    assert.ok(parts.every(p => p.path.endsWith('Z') && !p.outline.includes('NaN')));
    for (const part of parts) {
      const points = [...part.outline.matchAll(/([ML])([\d.e+-]+),([\d.e+-]+)/g)];
      for (let i = 1; i < points.length; i++) if (points[i][1] === 'L') {
        const [x, y, xx, yy] = [points[i - 1][2], points[i - 1][3], points[i][2], points[i][3]].map(Number);
        assert.ok(!((x === 0 || x === 360) && x === xx), 'date-line cuts are not national borders');
        assert.ok(!((y === 0 || y === 180) && y === yy), 'pole cuts are not national borders');
      }
    }
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { projectAtlasFeature, type AtlasShape } from './atlas.ts';
import { borderStyle, countryDetailAmount, globeBorderVertices } from './borderRendering.ts';
import { initialWorldCamera, projectWorld, rotateVector, cameraRotation, transitionZoom, vectorGeography } from './worldCamera.ts';
import type { GeographicCollection } from './types';

const size = { width: 356, height: 610 };
function overview(scale: string): AtlasShape[] {
  const data = JSON.parse(readFileSync(new URL('../../public/geography/natural-earth-5.1.1/overview-' + scale + '.geojson', import.meta.url), 'utf8')) as GeographicCollection;
  return data.features.map(projectAtlasFeature);
}

test('globe/flat border weight and screen thickness agree throughout zoom and handoff', () => {
  for (const dpr of [1, 2, 3]) for (const viewport of [size, { width: 780, height: 170 }, { width: 1440, height: 900 }]) {
    let previous = 0;
    for (let zoom = 1; zoom <= 128; zoom += .25) {
      const camera = { ...initialWorldCamera(), zoom };
      const globe = borderStyle(camera, viewport, dpr), flat = borderStyle({ ...camera, projection: 'flat' }, viewport, dpr);
      assert.deepEqual(globe, flat);
      assert.ok(globe.width >= .49 && globe.width <= 1.01);
      assert.ok(globe.opacity >= previous && globe.opacity <= 1); previous = globe.opacity;
    }
  }
});

test('10m geometry is staged after the projection handoff and increases continuously', () => {
  for (const focus of [[2, 46], [138, 36], [179, -18]] as [number, number][]) {
    const view = { ...initialWorldCamera(), focus, projection: 'flat' as const };
    const threshold = transitionZoom(view, size);
    assert.equal(countryDetailAmount({ ...view, zoom: threshold * 1.1 }, size), 0);
    let previous = 0;
    for (let ratio = 1; ratio <= 2; ratio += .002) {
      const detail = countryDetailAmount({ ...view, zoom: threshold * ratio }, size);
      assert.ok(detail >= previous && detail - previous < .005); previous = detail;
    }
    assert.equal(countryDetailAmount({ ...view, zoom: threshold * 2 }, size), 1);
    assert.equal(countryDetailAmount({ ...view, zoom: 128, projection: 'globe' }, size), 0);
  }
});

test('source vector borders preserve real geometry, polar/date-line cuts and bounded GPU memory', () => {
  for (const scale of ['110m', '50m']) {
    const vertices = globeBorderVertices(overview(scale));
    assert.equal(vertices.length % 6, 0);
    assert.ok(vertices.length > 50000 && vertices.byteLength < 2_500_000);
    for (let i = 0; i < vertices.length; i += 6) {
      const a: [number, number, number] = [vertices[i], vertices[i + 1], vertices[i + 2]];
      const b: [number, number, number] = [vertices[i + 3], vertices[i + 4], vertices[i + 5]];
      assert.ok(Math.abs(Math.hypot(...a) - 1) < 1e-6 && Math.abs(Math.hypot(...b) - 1) < 1e-6);
      assert.ok(a.reduce((sum, v, axis) => sum + v * b[axis], 0) > .998, 'no border joins across the wrong side of Earth');
    }
  }
  const seamOnly: AtlasShape[] = [{ id: 'ne:admin0:FJI', parts: [{ path: '', outline: 'M360,80L360,85M0,80L0,85', bbox: [-180, 5, 180, 10] }] }];
  // Normal source extraction removes these cuts; disconnected M commands must
  // also never be linked into an unintended long line by the GPU conversion.
  assert.equal(globeBorderVertices(seamOnly).length, 36);
});

test('3D vector endpoints register with the same geographic source and visible hemisphere', () => {
  const source = overview('110m').filter(s => s.id === 'ne:admin0:FRA');
  const vertices = globeBorderVertices(source), camera = { ...initialWorldCamera(), focus: [2, 46] as [number, number], zoom: 8 };
  for (let i = 0; i < vertices.length; i += 3) {
    const v: [number, number, number] = [vertices[i], vertices[i + 1], vertices[i + 2]];
    const rotated = rotateVector(cameraRotation(camera), v), geo = vectorGeography(v);
    const projected = projectWorld(camera, size, geo);
    if (rotated[2] < 0) assert.equal(projected, null);
    else {
      assert.ok(projected);
      const radius = Math.min(size.width, size.height) * .42 * camera.zoom;
      assert.ok(Math.abs(projected.x - (size.width / 2 + rotated[0] * radius)) < .001);
      assert.ok(Math.abs(projected.y - (size.height / 2 - rotated[1] * radius)) < .001);
    }
  }
});

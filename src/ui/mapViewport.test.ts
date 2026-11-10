import test from 'node:test';
import assert from 'node:assert/strict';
import { constrainMapView, initialMapView, mapScale, moveMapView, type MapSize, type MapView, type Point } from './mapViewport.ts';

const size = { width: 360, height: 332 };
function worldPoint(view: MapView, viewport: MapSize, point: Point): Point {
  const scale = mapScale(view, viewport);
  return { x: view.center.x + (point.x - viewport.width / 2) / scale, y: view.center.y + (point.y - viewport.height / 2) / scale };
}
function close(actual: Point, expected: Point) {
  assert.ok(Math.abs(actual.x - expected.x) < 1e-9);
  assert.ok(Math.abs(actual.y - expected.y) < 1e-9);
}

test('fit centers the complete world in portrait and landscape and cannot pan away', () => {
  for (const viewport of [{ width: 280, height: 500 }, { width: 600, height: 200 }]) {
    const fitted = constrainMapView({ zoom: 0.1, center: { x: -1000, y: 1000 } }, viewport);
    assert.deepEqual(fitted, initialMapView());
    assert.ok(360 * mapScale(fitted, viewport) <= viewport.width + 1e-9);
    assert.ok(332 * mapScale(fitted, viewport) <= viewport.height + 1e-9);
    assert.deepEqual(moveMapView(fitted, viewport, { x: 0, y: 0 }, { x: 500, y: -900 }), fitted);
  }
});

test('pointer zoom preserves the geographic point under an off-center cursor', () => {
  const start = initialMapView();
  const pointer = { x: 220, y: 190 };
  const zoomed = moveMapView(start, size, pointer, pointer, 2.5);
  close(worldPoint(zoomed, size, pointer), worldPoint(start, size, pointer));
  assert.deepEqual(moveMapView(zoomed, size, pointer, pointer, 1), start);
});

test('a translating pinch keeps the starting world point under the moving midpoint', () => {
  const start = initialMapView();
  const from = { x: 180, y: 166 };
  const to = { x: 210, y: 180 };
  const zoomed = moveMapView(start, size, from, to, 2);
  close(worldPoint(zoomed, size, to), worldPoint(start, size, from));
});

test('extreme panning stops at every edge at all tested aspect ratios', () => {
  for (const viewport of [size, { width: 300, height: 700 }, { width: 600, height: 200 }]) {
    for (const x of [-10000, 10000]) for (const y of [-10000, 10000]) {
      const moved = moveMapView({ ...initialMapView(), zoom: 4 }, viewport, { x: 0, y: 0 }, { x, y });
      const scale = mapScale(moved, viewport);
      for (const [center, extent, length] of [[moved.center.x, 360, viewport.width], [moved.center.y, 332, viewport.height]]) {
        if (extent * scale <= length) assert.equal(center, extent / 2);
        else {
          assert.ok(length / 2 - center * scale <= 1e-9);
          assert.ok(length / 2 + (extent - center) * scale >= length - 1e-9);
        }
      }
    }
  }
});

test('zoom limits do not drift the camera during repeated wheel events', () => {
  const start = { zoom: 4, center: { x: 150, y: 180 } };
  const pointer = { x: 290, y: 220 };
  assert.deepEqual(moveMapView(start, size, pointer, pointer, 20), start);
  assert.deepEqual(moveMapView(start, size, pointer, pointer, 0.1), initialMapView());
});

test('resize keeps the world center when possible and clamps it when an axis fits', () => {
  const view = { zoom: 2, center: { x: 150, y: 180 } };
  assert.deepEqual(constrainMapView(view, { width: 720, height: 664 }), view);
  const resized = constrainMapView(view, { width: 1000, height: 200 });
  assert.equal(resized.center.x, 180);
  assert.equal(resized.zoom, 2);
  assert.equal(resized.center.y, 180);
  assert.deepEqual(view, { zoom: 2, center: { x: 150, y: 180 } });
});

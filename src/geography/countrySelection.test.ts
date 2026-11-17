import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { AtlasCatalog, AtlasShape } from './atlas';
import { countryPlayability, pickAtlasCountry } from './countrySelection.ts';
import type { GeographicBounds, GeographicCountryId, GeographicPosition } from './types';
import { flatFallback, initialWorldCamera, projectWorld, type WorldCamera } from './worldCamera.ts';

const size = { width: 356, height: 610 };
const center = { x: 178, y: 305 };
const globe = initialWorldCamera();
const flat = { ...globe, zoom: 20, projection: 'flat' as const };
const shape = (id: GeographicCountryId, bbox: GeographicBounds): AtlasShape => ({ id, parts: [{ path: '', outline: '', bbox }] });
// Rectangular fixtures fill their entire bounding boxes. Browser tests exercise
// native even-odd containment with the actual country polygons and holes.
const inside = () => true;

test('the same geographic country is picked in both projections', () => {
  const land = shape('ne:admin0:AUS', [120, -40, 150, -15]);
  for (const camera of [globe, flat]) {
    const view: WorldCamera = { ...camera, focus: [132, -23] };
    assert.equal(pickAtlasCountry(view, size, center, [land], inside, false), land.id);
  }
});

test('sky, far hemisphere and fallback map letterboxes do not select land', () => {
  const land = shape('ne:admin0:AUS', [120, -40, 150, -15]);
  assert.equal(projectWorld(globe, size, [132, -23]), null);
  assert.equal(pickAtlasCountry(globe, size, center, [land], inside, true), null);
  assert.equal(pickAtlasCountry(globe, size, { x: 5, y: 20 }, [land], inside, true), null);
  const fallback = flatFallback(globe, { width: 850, height: 120 });
  const world = shape('ne:admin0:ATA', [-180, -90, 180, 90]);
  assert.equal(pickAtlasCountry(fallback, { width: 850, height: 120 }, { x: 7, y: 60 }, [world], inside, true), null);
});

test('both split sides and the exact date line retain their source country ID', () => {
  const east = shape('ne:admin0:FJI', [179, -19, 180, -16]);
  const west = shape('ne:admin0:FJI', [-180, -19, -179, -16]);
  for (const projection of ['globe', 'flat'] as const) {
    const view = { ...flat, projection, focus: [179.8, -17] as GeographicPosition };
    for (const [longitude, shapes] of [[179.5, [east]], [-179.5, [west]], [180, [east]]] as [number, AtlasShape[]][]) {
      const position = projectWorld(view, size, [longitude, -17])!;
      assert.equal(pickAtlasCountry(view, size, position, shapes, inside, false), 'ne:admin0:FJI');
    }
  }
});

test('touch tolerance helps a narrow island while direct hits and dry pointer clicks take precedence', () => {
  const view = { ...flat, focus: [0, 0] as GeographicPosition };
  const island = shape('ne:admin0:SGP', [.045, -.025, .12, .025]);
  assert.equal(pickAtlasCountry(view, size, center, [island], inside, false), null);
  assert.equal(pickAtlasCountry(view, size, center, [island], inside, true), island.id);
  assert.equal(pickAtlasCountry(view, size, { x: center.x - 8, y: center.y }, [island], inside, true), null);
  const mainland = shape('ne:admin0:MYS', [-.05, -.025, .01, .025]);
  assert.equal(pickAtlasCountry(view, size, center, [mainland, island], inside, true), mainland.id);
});

test('overlapping boundaries use the painted order and undecided playability applies to all source IDs', () => {
  const first = shape('ne:admin0:SDN', [10, 19, 15, 21]);
  const last = shape('ne:admin0:EGY', [10, 19, 15, 21]);
  assert.equal(pickAtlasCountry(globe, size, center, [first, last], inside, false), last.id);
  const { countries } = JSON.parse(readFileSync(new URL('../../public/atlas/political.json', import.meta.url), 'utf8')) as AtlasCatalog;
  assert.equal(countries.length, 258);
  assert.ok(countries.every(country => countryPlayability(country.id) === 'undecided'));
});

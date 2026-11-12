import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../game/initialState.ts';
import { selectCountry } from '../game/selectCountry.ts';
import { advanceTurn } from '../game/advanceTurn.ts';
import { initialMapLayers, mapLayers, toggleMapLayer } from './mapLayers.ts';
import { illustrativeDivisionPosition, selectMapDivisions } from './mapDivisions.ts';
import { regionShapes } from './mapGeometry.ts';
import type { GameState } from '../game/models';

function attack() {
  return advanceTurn(selectCountry(createInitialState(), 'alden'), [{ type: 'set-military-order', countryId: 'alden', divisionId: 'alden-first', order: { kind: 'attack', targetRegionId: 'amber-plain' } }]);
}

test('layer flags start off and can coexist without changing another layer or the input', () => {
  const initial = Object.freeze(initialMapLayers());
  assert.equal(mapLayers.length, 7);
  assert.ok(Object.values(initial).every(value => value === false));
  const divisions = toggleMapLayer(initial, 'divisions');
  const both = toggleMapLayer(divisions, 'cities'); // State contract for future available renderers.
  assert.equal(both.divisions, true);
  assert.equal(both.cities, true);
  assert.deepEqual(toggleMapLayer(both, 'divisions'), { ...initial, cities: true });
  assert.ok(Object.values(initial).every(value => value === false));
  assert.equal(divisions.cities, false);
});

test('the initial overlay shows only real living player divisions for each country, without orders or mutation', () => {
  for (const country of ['alden', 'belora', 'cyrin']) {
    const state = selectCountry(createInitialState(), country);
    const before = JSON.stringify(state);
    const visible = selectMapDivisions(state);
    assert.equal(visible.length, 1);
    assert.equal(visible[0].id, `${country}-first`);
    assert.equal(visible[0].visibility, 'own');
    assert.equal(visible[0].visibility === 'own' && visible[0].manpower, 1000);
    assert.ok(!('order' in visible[0]));
    assert.equal(JSON.stringify(state), before);
  }
});

test('no selected or recognized viewer discloses no units', () => {
  assert.deepEqual(selectMapDivisions(createInitialState()), []);
  assert.deepEqual(selectMapDivisions({ ...attack(), playerCountryId: 'unknown' }), []);
});

test('only surviving defenders named in the player combat report are additionally shown, with strength redacted', () => {
  const state = attack();
  const visible = selectMapDivisions(state);
  assert.deepEqual(visible.map(unit => unit.id), ['alden-first', 'belora-first']);
  assert.equal(visible[0].visibility === 'own' && visible[0].manpower, 750);
  assert.equal(visible[1].visibility, 'combat-report');
  assert.equal(visible[1].regionId, 'amber-plain');
  assert.ok(!('manpower' in visible[1]));
  assert.ok(!('order' in visible[1]));
  assert.ok(!visible.some(unit => unit.id === 'cyrin-first'));
});

test('reported contacts are not permanent sightings and never track an unreported new location', () => {
  const state = attack();
  const quiet = advanceTurn(state, [{ type: 'set-military-order', countryId: 'alden', divisionId: 'alden-first', order: { kind: 'defend' } }]);
  assert.deepEqual(selectMapDivisions(quiet).map(unit => unit.id), ['alden-first']);
  const relocated = structuredClone(state);
  relocated.divisions[1].regionId = 'silver-hills';
  assert.deepEqual(selectMapDivisions(relocated).map(unit => unit.id), ['alden-first']);
  const otherCombat: GameState = { ...state, militaryResults: [{ kind: 'combat', divisionId: 'cyrin-first', targetRegionId: 'amber-plain', attackerCasualties: 250, defenderCasualties: [{ divisionId: 'belora-first', losses: 500 }], captured: false }] };
  assert.deepEqual(selectMapDivisions(otherCombat).map(unit => unit.id), ['alden-first']);
});

test('real moves and conquest update region anchors; destroyed units do not remain active markers', () => {
  const initial = selectCountry(createInitialState(), 'alden');
  const before = selectMapDivisions(initial)[0];
  const moved = advanceTurn(initial, [{ type: 'set-military-order', countryId: 'alden', divisionId: 'alden-first', order: { kind: 'move', targetRegionId: 'reed-coast' } }]);
  const movedMarker = selectMapDivisions(moved)[0];
  assert.equal(movedMarker.regionId, 'reed-coast');
  assert.deepEqual(movedMarker.position, illustrativeDivisionPosition('reed-coast'));
  assert.notDeepEqual(movedMarker.position, before.position);
  const captured = advanceTurn(advanceTurn(attack()));
  assert.equal(captured.regions.find(region => region.id === 'amber-plain')!.ownerId, 'alden');
  const visible = selectMapDivisions(captured);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].regionId, 'amber-plain');
  assert.deepEqual(visible[0].position, illustrativeDivisionPosition('amber-plain'));
  assert.equal(visible[0].visibility === 'own' && visible[0].manpower, 593);
});

test('dead units and missing map/country/region references cannot produce invented markers', () => {
  const state = selectCountry(createInitialState(), 'alden');
  state.divisions[0].manpower = 0;
  assert.deepEqual(selectMapDivisions(state), []);
  state.divisions[0].manpower = 1000;
  state.regions = state.regions.filter(region => region.id !== 'alden-vale');
  assert.deepEqual(selectMapDivisions(state), []);
  assert.equal(illustrativeDivisionPosition('unknown'), null);
});

test('illustrative anchors stay inside all six existing polygons and do not drift with personnel, ownership or array order', () => {
  for (const [id, shape] of Object.entries(regionShapes)) {
    const point = illustrativeDivisionPosition(id)!;
    const vertices = shape.points.split(' ').map(pair => pair.split(',').map(Number));
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const [xi, yi] = vertices[i], [xj, yj] = vertices[j];
      if ((yi > point.y) !== (yj > point.y) && point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi) inside = !inside;
    }
    assert.ok(inside, `${id} anchor is inside its polygon`);
  }
  const state = attack();
  const before = selectMapDivisions(state).map(unit => [unit.id, unit.position]);
  state.divisions.reverse();
  state.divisions.find(unit => unit.id === 'alden-first')!.manpower = 200;
  state.regions[0].ownerId = 'belora';
  for (const [id, position] of before) assert.deepEqual(selectMapDivisions(state).find(unit => unit.id === id)!.position, position);
});

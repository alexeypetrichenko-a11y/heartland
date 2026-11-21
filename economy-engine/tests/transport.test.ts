import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EconomyState, TurnInput, TurnReport } from '../src/index.ts';
import { advanceEconomyInPlace, autopilotCommands, cloneEconomy, getItinerary, listRequisitions } from '../src/index.ts';
import { expectedLaneLoad, laneCapacity } from '../src/core/transport.ts';
import { getRoutes } from '../src/core/routes.ts';
import { world, zoneIdx } from './helpers.ts';

/**
 * Milestone 4: transport capacity and military requisition by itinerary (R45, R46, R63).
 * The Norland rail link joins Norland Core and Norland Coast.
 */

function week(state: EconomyState, input: TurnInput = {}): TurnReport {
  return advanceEconomyInPlace(state, { effects: input.effects ?? [], commands: [...autopilotCommands(state), ...(input.commands ?? [])] },
    { audit: true, report: 'full' });
}

const requisition = (volume: number, countryId = 'norland', originZoneId = 'norland-core', destinationZoneId = 'norland-coast'): TurnInput =>
  ({ commands: [{ type: 'set-transport-requisition', countryId, originZoneId, destinationZoneId, volume }] });

function lane(report: TurnReport, id: string) {
  const found = report.transport.lanes.find(entry => entry.laneId === id);
  assert.ok(found, id);
  return found;
}

test('every lane gets a finite capacity at the start: at least twice its traffic, never below the floor', () => {
  const state = world();
  const p = state.config.params;
  const L = state.lanes.id.length;
  const load = expectedLaneLoad(state, getRoutes(state));
  let total = 0;
  for (let l = 0; l < L; l++) total += load[l];
  for (let l = 0; l < L; l++) {
    const capacity = state.lanes.capacity[l];
    assert.ok(capacity > 0 && Number.isFinite(capacity));
    assert.ok(capacity >= p.laneCapacityHeadroom * load[l] * (1 - 1e-12));
    assert.ok(capacity >= p.laneCapacityFloor * p.laneCapacityHeadroom * total / L * (1 - 1e-12));
  }
});

test('in a calm game no lane comes near saturation over ten years', () => {
  const state = world();
  let peak = 0;
  for (let k = 0; k < 520; k++) for (const entry of week(state).transport.lanes) peak = Math.max(peak, entry.utilization);
  assert.ok(peak < 0.8, `peak lane use ${peak}`);
  assert.equal(listRequisitions(state).length, 0);
});

test('the engine finds the itinerary through territory the country controls', () => {
  const state = world();
  assert.deepEqual(getItinerary(state, 'norland', 'norland-core', 'norland-coast')?.laneIds, ['norland-rail']);
  assert.equal(getItinerary(state, 'norland', 'norland-core', 'verdania'), null, 'Verdania is not Norland\'s');
  // An occupier reaches its occupied zone by sea: Ostmark - North Sea - Norland Coast.
  week(state, { effects: [{ type: 'occupy-zone', zoneId: 'norland-coast', occupierId: 'ostmark' }] });
  assert.deepEqual(getItinerary(state, 'ostmark', 'ostmark', 'norland-coast')?.laneIds, ['north-sea-ostmark', 'north-sea-norland']);
  // Norland can no longer requisition towards the coast; it can still cancel its order.
  assert.throws(() => advanceEconomyInPlace(cloneEconomy(state), requisition(10)), /not controlled/);
  advanceEconomyInPlace(cloneEconomy(state), requisition(0));
});

test('a requisition with no open route through controlled territory is refused', () => {
  const state = world();
  week(state, { effects: [{ type: 'set-lane', laneId: 'norland-rail', costMultiplier: 1, throughput: 0 }] });
  assert.equal(getItinerary(state, 'norland', 'norland-core', 'norland-coast'), null);
  assert.throws(() => advanceEconomyInPlace(cloneEconomy(state), requisition(10)), /No open route/);
  assert.throws(() => advanceEconomyInPlace(cloneEconomy(state), requisition(10, 'norland', 'norland-core', 'norland-core')), /two different zones/);
});

test('military priority on a saturated lane: the army gets its volume up to the physical capacity, civilians what is left', () => {
  const base = world();
  const capacity = getItinerary(base, 'norland', 'norland-core', 'norland-coast')!.capacity;
  for (const share of [0.5, 0.9, 2]) {
    const state = cloneEconomy(base);
    let report = week(state, requisition(share * capacity));
    for (let k = 0; k < 30; k++) {
      report = week(state);
      for (const entry of report.transport.lanes) {
        assert.ok(entry.military + entry.civilian <= entry.capacity * (1 + 1e-9), `${entry.laneId} over capacity`);
      }
      const rail = lane(report, 'norland-rail');
      const order = report.transport.requisitions[0];
      const expected = Math.min(share * capacity, rail.capacity);
      assert.ok(Math.abs(order.delivered - expected) <= 1e-9 * expected, `delivered ${order.delivered}, expected ${expected}`);
      assert.deepEqual(order.laneIds, ['norland-rail']);
      if (share > 1) assert.equal(order.bottleneckLaneId, 'norland-rail');
    }
    const rail = lane(report, 'norland-rail');
    if (share >= 0.9) assert.ok(rail.civilian < 0.15 * rail.capacity, `civilian freight squeezed to ${rail.civilian}`);
  }
});

test('requisition never raises physical transport capacity', () => {
  const control = world();
  const state = cloneEconomy(control);
  const capacity = getItinerary(state, 'norland', 'norland-core', 'norland-coast')!.capacity;
  week(state, requisition(0.9 * capacity));
  week(control);
  for (let k = 0; k < 80; k++) {
    week(state);
    week(control);
    for (let l = 0; l < state.lanes.id.length; l++) {
      assert.ok(laneCapacity(state, l) <= laneCapacity(control, l) * (1 + 1e-12), `${state.lanes.id[l]} week ${k}`);
    }
  }
  assert.deepEqual(state.lanes.capacity, control.lanes.capacity);
});

test('requisition causes civilian shortages and costs the state the normal freight rate, creating no money', () => {
  const control = world();
  const state = cloneEconomy(control);
  const capacity = getItinerary(state, 'norland', 'norland-core', 'norland-coast')!.capacity;
  const coast = zoneIdx(state, 'norland-coast');
  const G = state.config.goods.length;
  const shortage = (s: EconomyState) => s.zoneGood.shortage.slice(coast * G, coast * G + G).reduce((a, b) => a + b, 0);
  week(state, requisition(0.95 * capacity));
  week(control);
  let cost = 0, reported = 0, controlCivilian = 0, civilian = 0;
  for (let k = 0; k < 26; k++) {
    const report = week(state);
    const reference = week(control);
    cost += report.countries[0].budget.transportRequisition;
    reported += report.transport.requisitions[0].cost;
    civilian += lane(report, 'norland-rail').civilian;
    controlCivilian += lane(reference, 'norland-rail').civilian;
  }
  assert.ok(civilian < 0.2 * controlCivilian, 'civilian deliveries over the rail link fall');
  assert.ok(shortage(state) > shortage(control) + 0.05, `coast shortage ${shortage(control)} -> ${shortage(state)}`);
  assert.ok(cost > 0 && Math.abs(cost - reported) <= 1e-9 * cost, 'the cost is a budget line, equal to what the requisition reports');
});

test('a requisition can be cancelled, and civilian traffic comes back', () => {
  const state = world();
  const capacity = getItinerary(state, 'norland', 'norland-core', 'norland-coast')!.capacity;
  week(state, requisition(capacity));
  for (let k = 0; k < 10; k++) week(state);
  assert.equal(listRequisitions(state).length, 1);
  week(state, requisition(0));
  assert.equal(listRequisitions(state).length, 0);
  let report = week(state);
  for (let k = 0; k < 10; k++) report = week(state);
  assert.equal(lane(report, 'norland-rail').military, 0);
  assert.ok(lane(report, 'norland-rail').civilian > 0.2 * lane(report, 'norland-rail').capacity);
});

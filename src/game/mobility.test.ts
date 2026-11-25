import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as api from '../../economy-engine/src/integration/index.ts';
import { createInitialState } from './initialState.ts';
import { advanceTurn } from './advanceTurn.ts';
import { decodeGameSave } from './saveFormat.ts';
import { selectCountry } from './selectCountry.ts';
import type { TransportOrder } from './mobility/journeys.ts';
import { advanceSyntheticMobility, encodeSyntheticMobility, restoreSyntheticMobility, startSyntheticMobility } from './mobility/syntheticScenario.ts';

const runtime = { api };
const transport = (divisionId = 'alden-first', routeId = 'island-outbound'): TransportOrder => ({ kind: 'transport', divisionId, routeId });
const returnOrder: TransportOrder = { kind: 'return', divisionId: 'alden-first' };
const start = () => startSyntheticMobility(runtime);
const advance = (session: ReturnType<typeof start>, ...orders: TransportOrder[]) =>
  advanceSyntheticMobility(runtime, { ...session, transportDrafts: orders });

test('whole divisions travel by explicit route, use one slot, and preserve control and economy', () => {
  const initial = start();
  const plain = advance(initial);
  assert.deepEqual(initial.game.regions.find(region => region.id === 'reed-coast')!.adjacentRegionIds, []);
  assert.throws(() => advanceTurn(initial.game, [{
    type: 'set-military-order', divisionId: 'alden-first', countryId: 'alden', order: { kind: 'move', targetRegionId: 'reed-coast' },
  }]), /adjacent/);
  const outbound = advance(initial, transport('alden-second'), transport());
  const same = advance(initial, transport(), transport('alden-second'));
  assert.deepEqual(outbound, same);
  assert.deepEqual(outbound.mobility.results.map(result => result.kind), ['departed', 'refused']);
  assert.equal(outbound.mobility.journeys[0].dueWeek, 2);
  assert.equal(plain.economy.player.treasury, outbound.economy.player.treasury);
  assert.equal(api.economyFingerprint(plain.economy.session), api.economyFingerprint(outbound.economy.session));
  const arrived = advance(outbound);
  assert.equal(arrived.game.divisions.find(unit => unit.id === 'alden-first')!.regionId, 'reed-coast');
  assert.equal(arrived.game.divisions.find(unit => unit.id === 'alden-first')!.manpower, 25_000);
  assert.deepEqual(arrived.game.regions, initial.game.regions);
  assert.equal(arrived.game.week, arrived.economy.session.week);

  const inbound = advance(arrived, transport('alden-first', 'island-inbound'));
  assert.equal(inbound.mobility.journeys[0].dueWeek, 5);
  assert.equal(advance(inbound).mobility.journeys.length, 1);
  const returned = advance(advance(inbound));
  assert.equal(returned.game.divisions.find(unit => unit.id === 'alden-first')!.regionId, 'alden-vale');
});

test('an arriving division cannot execute a land order and interruption stays recoverable', () => {
  const departing = advance(start(), transport());
  assert.throws(() => advanceSyntheticMobility(runtime, departing, [{
    type: 'set-military-order', divisionId: 'alden-first', countryId: 'alden', order: { kind: 'defend' },
  }]), /transport action/);

  const closed = { ...departing, mobility: { ...departing.mobility, closedRouteIds: ['island-outbound'] } };
  const waiting = advance(closed, returnOrder);
  assert.equal(waiting.mobility.journeys[0].status, 'waiting');
  assert.equal(waiting.mobility.journeys[0].leg, 'return');
  let later = waiting;
  for (let i = 0; i < 4; i++) later = advance(later);
  assert.equal(later.mobility.journeys.length, 1);
  assert.equal(later.game.divisions.find(unit => unit.id === 'alden-first')!.manpower, 25_000);
  const reopened = advance({ ...later, mobility: { ...later.mobility, closedRouteIds: [] } });
  assert.equal(reopened.mobility.journeys.length, 0);
  assert.equal(reopened.mobility.results[0].kind, 'returned');
  assert.equal(reopened.game.divisions.find(unit => unit.id === 'alden-first')!.regionId, 'alden-vale');
});

test('loss of friendly destination prevents landing and ownership transfer', () => {
  const initial = start();
  const lostIsland = (session: ReturnType<typeof start>) => ({
    ...session, game: { ...session.game, regions: session.game.regions.map(region =>
      region.id === 'reed-coast' ? { ...region, ownerId: 'belora' } : region) },
  });
  const rejected = advance(lostIsland(initial), transport());
  assert.equal(rejected.mobility.results[0].kind, 'refused');
  const forcedReturn = advance(lostIsland(advance(initial, transport())));
  assert.equal(forcedReturn.mobility.results[0].kind, 'returning');
  assert.equal(forcedReturn.game.regions.find(region => region.id === 'reed-coast')!.ownerId, 'belora');
  assert.equal(advance(forcedReturn).mobility.results[0].kind, 'returned');
});

test('versioned synthetic checkpoints keep pending and traveling orders and replay exactly', async () => {
  const draft = { ...start(), transportDrafts: [transport()] };
  const draftRecord = await encodeSyntheticMobility(runtime, draft);
  const restored = await restoreSyntheticMobility(runtime, draftRecord);
  assert.deepEqual(restored.transportDrafts, draft.transportDrafts);
  const traveling = advanceSyntheticMobility(runtime, restored);
  const tripRecord = await encodeSyntheticMobility(runtime, traveling);
  const afterReload = await restoreSyntheticMobility(runtime, tripRecord);
  const replay = advance(afterReload);
  const direct = advance(traveling);
  assert.deepEqual(replay.game, direct.game);
  assert.deepEqual(replay.mobility, direct.mobility);
  assert.equal(api.economyFingerprint(replay.economy.session), api.economyFingerprint(direct.economy.session));
  await assert.rejects(restoreSyntheticMobility(runtime, tripRecord.replace('traveling', 'waiting')), /checkpoint/);
  const packed = JSON.parse(JSON.parse(tripRecord).payload);
  await assert.rejects(decodeGameSave(packed.gameSave), /different scenario/);
  assert.deepEqual(selectCountry(createInitialState(), 'alden').regions[1].adjacentRegionIds, ['alden-vale', 'silver-hills']);
});

test('invalid actor, duplicate orders and engine rejection preserve the last checkpoint', () => {
  const initial = { ...start(), transportDrafts: [transport()] };
  assert.throws(() => advance(initial, transport('belora-first')), /invalid/i);
  assert.throws(() => advance(initial, transport(), transport()), /duplicate/);
  const before = JSON.stringify(initial);
  assert.throws(() => advanceSyntheticMobility(runtime, initial, [], [
    { type: 'set-tax', countryId: 'alden', tax: 'income', rate: 3 },
  ]));
  assert.equal(JSON.stringify(initial), before);
});

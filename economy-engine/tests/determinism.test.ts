import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TurnInput } from '../src/index.ts';
import {
  advanceEconomy, advanceEconomyInPlace, autopilotCommands, cloneEconomy, createEconomy, createTestWorldSpec, deserializeEconomy,
  hashEconomy, serializeEconomy, STATE_VERSION, validateEconomy,
} from '../src/index.ts';
import { world } from './helpers.ts';

const SHOCKS = (week: number): TurnInput | undefined => {
  if (week === 20) return { effects: [{ type: 'production-shock', zoneId: 'verdania', goodId: 'food', factor: 0.5, recoveryWeeks: 60 }], commands: [{ type: 'set-sanction', countryId: 'khazir', targetId: 'norland', goodIds: ['energy'], imports: false, exports: true }] };
  if (week === 35) return { commands: [{ type: 'declare-default', countryId: 'norland' }] };
  return undefined;
};
function simulate(state: ReturnType<typeof world>, weeks: number, offset = 0) {
  for (let week = 1; week <= weeks; week++) {
    advanceEconomyInPlace(state, { commands: [...autopilotCommands(state), ...(SHOCKS(week + offset)?.commands ?? [])], effects: SHOCKS(week + offset)?.effects ?? [] }, { report: 'none' });
  }
}

test('the same seed and inputs give a bit-identical state', () => {
  const a = createEconomy(createTestWorldSpec(11)), b = createEconomy(createTestWorldSpec(11));
  assert.equal(hashEconomy(a), hashEconomy(b), 'world building is deterministic');
  simulate(a, 300); simulate(b, 300);
  assert.equal(serializeEconomy(a), serializeEconomy(b));
});

test('a different seed gives a different history (the seed is actually used)', () => {
  const a = createEconomy(createTestWorldSpec(11)), b = createEconomy(createTestWorldSpec(12));
  simulate(a, 200); simulate(b, 200);
  assert.notEqual(hashEconomy(a), hashEconomy(b));
});

test('pure and in-place stepping agree, and the pure version never touches its input', () => {
  const start = world();
  const frozenCopy = serializeEconomy(start);
  let pure = start;
  for (let week = 1; week <= 60; week++) pure = advanceEconomy(pure, SHOCKS(week), { audit: true }).state;
  assert.equal(serializeEconomy(start), frozenCopy, 'input state is unchanged');
  const inPlace = cloneEconomy(start);
  for (let week = 1; week <= 60; week++) advanceEconomyInPlace(inPlace, SHOCKS(week), { report: 'none' });
  assert.equal(hashEconomy(pure), hashEconomy(inPlace));
});

test('save and restore at any turn continues exactly like the uninterrupted run', () => {
  for (const cut of [0, 1, 19, 20, 36, 77, 160]) {
    const straight = world();
    simulate(straight, 220);
    const first = world();
    simulate(first, cut);
    const restored = deserializeEconomy(serializeEconomy(first));
    assert.equal(hashEconomy(restored), hashEconomy(first), `round trip at ${cut}`);
    simulate(restored, 220 - cut, cut);
    assert.equal(hashEconomy(restored), hashEconomy(straight), `continuation after restore at week ${cut}`);
  }
});

test('different run lengths between saves do not matter (restore every 7 weeks)', () => {
  const straight = world();
  simulate(straight, 140);
  let state = world();
  for (let done = 0; done < 140; done += 7) {
    simulate(state, 7, done);
    state = deserializeEconomy(serializeEconomy(state));
  }
  assert.equal(hashEconomy(state), hashEconomy(straight));
});

test('serialization is plain JSON with no hidden state', () => {
  const state = world();
  simulate(state, 30);
  const text = serializeEconomy(state);
  assert.deepEqual(JSON.parse(text), JSON.parse(JSON.stringify(state)));
  assert.ok(!/NaN|Infinity|undefined/.test(text));
  assert.equal(JSON.parse(text).version, STATE_VERSION);
});

test('damaged or foreign saves are rejected with a clear error', () => {
  const good = JSON.parse(serializeEconomy(world()));
  const bad = (mutate: (copy: any) => void) => { const copy = JSON.parse(JSON.stringify(good)); mutate(copy); return JSON.stringify(copy); };
  assert.throws(() => deserializeEconomy('not json'), /not valid JSON/);
  assert.throws(() => deserializeEconomy('[]'), /not an object/);
  assert.throws(() => deserializeEconomy(bad(s => { s.format = 'other'; })), /unknown format/);
  assert.throws(() => deserializeEconomy(bad(s => { s.version = 999; })), /version/);
  assert.throws(() => deserializeEconomy(bad(s => { s.turn = -1; })), /turn/);
  assert.throws(() => deserializeEconomy(bad(s => { s.zone.wage.pop(); })), /zone\.wage/);
  assert.throws(() => deserializeEconomy(bad(s => { s.zoneGood.price[3] = null; })), /finite/);
  assert.throws(() => deserializeEconomy(bad(s => { s.zone.owner[0] = 99; })), /out of range/);
  assert.throws(() => deserializeEconomy(bad(s => { s.sanctions.push({ imposer: 0, target: 99, good: 0, imports: true, exports: true }); })), /does not exist/);
  assert.throws(() => deserializeEconomy(bad(s => { s.history.tiers[0].length = 10_000; })), /history/);
  assert.throws(() => deserializeEconomy(bad(s => { s.config.params.consumeIncome = 2; })), /parameter|range|invalid/i);
  assert.throws(() => deserializeEconomy(bad(s => { s.zone.extra = [1]; })), /not a known field/);
  assert.doesNotThrow(() => validateEconomy(good));
});

test('a restored state cannot be corrupted through the shared static data', () => {
  const state = deserializeEconomy(serializeEconomy(world()));
  assert.ok(Object.isFrozen(state.config) && Object.isFrozen(state.config.params), 'configuration is frozen');
  assert.throws(() => { (state.config.params as { baseRate: number }).baseRate = 5; }, TypeError);
});

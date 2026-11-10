import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceTurn } from './advanceTurn.ts';
import { applyDiplomaticCommand, relationshipValue, visibleDiplomaticMessages } from './diplomacy.ts';
import { createInitialState } from './initialState.ts';
import { selectCountry } from './selectCountry.ts';
import type { DiplomaticCommand, GameState, TurnCommand } from './models.ts';

const start = () => selectCountry(createInitialState(), 'alden');
const declare = (stance: 'goodwill' | 'condemnation' = 'goodwill', countryId = 'alden', targetId = 'belora'): DiplomaticCommand => ({ type: 'declare', countryId, targetId, stance });
const offer = (countryId = 'alden', targetId = 'belora'): DiplomaticCommand => ({ type: 'offer-cooperation', countryId, targetId });
const reply = (offerId: string, response: 'accept' | 'reject', countryId = 'belora'): DiplomaticCommand => ({ type: 'respond-offer', countryId, offerId, response });
function freeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test('public declarations change only the shared bilateral score, in both directions', () => {
  const initial = freeze(start());
  const good = applyDiplomaticCommand(initial, freeze(declare()));
  assert.equal(relationshipValue(good, 'alden', 'belora'), 5);
  assert.equal(relationshipValue(good, 'belora', 'alden'), 5);
  assert.equal(relationshipValue(good, 'alden', 'cyrin'), 0);
  assert.equal(relationshipValue(good, 'belora', 'cyrin'), 0);
  const bad = applyDiplomaticCommand(good, declare('condemnation', 'belora', 'alden'));
  assert.equal(relationshipValue(bad, 'alden', 'belora'), -5);
  assert.deepEqual(bad.countries, initial.countries);
  assert.deepEqual(bad.divisions, initial.divisions);
  assert.deepEqual(initial, start());
});

test('every country sees public declarations but no unknown viewer receives a feed', () => {
  const state = applyDiplomaticCommand(start(), declare());
  for (const country of state.countries) assert.deepEqual(visibleDiplomaticMessages(state, country.id), state.diplomaticMessages);
  assert.deepEqual(visibleDiplomaticMessages(state, 'unknown'), []);
});

test('all three bilateral pairs retain private visibility before and after acceptance or rejection', () => {
  for (const [sender, recipient, outsider] of [['alden', 'belora', 'cyrin'], ['belora', 'cyrin', 'alden'], ['cyrin', 'alden', 'belora']]) {
    for (const response of ['accept', 'reject'] as const) {
      const state = applyDiplomaticCommand(start(), offer(sender, recipient));
      const message = state.diplomaticMessages[0];
      assert.equal(relationshipValue(state, sender, recipient), 0);
      const resolved = applyDiplomaticCommand(freeze(state), reply(message.id, response, recipient));
      for (const snapshot of [state, resolved]) {
        assert.equal(visibleDiplomaticMessages(snapshot, sender).length, 1);
        assert.equal(visibleDiplomaticMessages(snapshot, recipient).length, 1);
        assert.deepEqual(visibleDiplomaticMessages(snapshot, outsider), []);
      }
      assert.equal(relationshipValue(resolved, sender, recipient), response === 'accept' ? 10 : -5);
      const result = resolved.diplomaticMessages[0];
      assert.ok(result.visibility === 'private');
      assert.equal(result.status, response === 'accept' ? 'accepted' : 'rejected');
      assert.equal(result.resolvedWeek, 1);
      assert.throws(() => applyDiplomaticCommand(resolved, reply(message.id, response, recipient)), /Only the recipient/);
    }
  }
});

test('private offers persist, cannot be duplicated in either direction and only recipients can reply', () => {
  const state = applyDiplomaticCommand(start(), offer());
  const id = state.diplomaticMessages[0].id;
  for (const command of [offer(), offer('belora', 'alden')]) assert.throws(() => applyDiplomaticCommand(state, command), /already pending/);
  for (const sender of ['alden', 'cyrin', 'missing']) assert.throws(() => applyDiplomaticCommand(state, reply(id, 'accept', sender)));
  assert.throws(() => applyDiplomaticCommand(state, reply('missing', 'accept')), /Only the recipient/);
  const declaration = applyDiplomaticCommand(state, declare());
  assert.throws(() => applyDiplomaticCommand(declaration, reply(declaration.diplomaticMessages[1].id, 'accept')), /Only the recipient/);
  const incoming = applyDiplomaticCommand(start(), offer('belora', 'alden'));
  const after = advanceTurn(advanceTurn(incoming));
  assert.equal(after.diplomaticMessages[0].visibility === 'private' && after.diplomaticMessages[0].status, 'pending');
});

test('relationship limits clamp effects and record the actual change for declarations and replies', () => {
  for (const [value, stance, expected, delta] of [[98, 'goodwill', 100, 2], [-98, 'condemnation', -100, -2]] as const) {
    const state = start(); state.relations[0].value = value;
    const result = applyDiplomaticCommand(state, declare(stance));
    assert.equal(relationshipValue(result, 'alden', 'belora'), expected);
    assert.equal(result.diplomaticMessages[0].relationshipChange, delta);
  }
  for (const [value, response, expected] of [[99, 'accept', 100], [-99, 'reject', -100]] as const) {
    const state = start(); state.relations[0].value = value;
    const pending = applyDiplomaticCommand(state, offer());
    const result = applyDiplomaticCommand(pending, reply(pending.diplomaticMessages[0].id, response));
    assert.equal(relationshipValue(result, 'alden', 'belora'), expected);
    assert.equal(result.diplomaticMessages[0].relationshipChange, expected - value);
  }
  assert.throws(() => relationshipValue(start(), 'alden', 'alden'), /Invalid bilateral/);
  const invalid = start(); invalid.relations[0].value = NaN;
  assert.throws(() => applyDiplomaticCommand(invalid, declare()), /Invalid bilateral/);
});

test('malformed diplomacy, unknown/self targets and unauthorized commands reject atomically', () => {
  const state = freeze(start());
  const invalid: unknown[] = [
    { ...declare(), stance: 'war' }, { ...declare(), targetId: '' }, { ...declare(), countryId: 4 },
    { ...offer(), targetId: null }, { ...offer(), targetId: 'missing' }, { ...offer(), targetId: 'alden' },
    { ...declare(), targetId: 'missing' }, { ...declare(), targetId: 'alden' },
    { ...reply('x', 'accept'), response: 'maybe' }, { ...reply('x', 'accept'), offerId: ' ' },
    declare('goodwill', 'belora', 'alden'), declare('goodwill', 'missing', 'alden'),
  ];
  for (const command of invalid) {
    assert.throws(() => advanceTurn(state, [command] as TurnCommand[]));
    assert.deepEqual(state, start());
  }
  assert.throws(() => advanceTurn(state, [declare(), offer()]), /one diplomatic action/);
  const pending = applyDiplomaticCommand(start(), offer('belora', 'cyrin'));
  assert.throws(() => advanceTurn(pending, [reply(pending.diplomaticMessages[0].id, 'accept', 'alden')]), /Only the recipient/);
});

test('failed economy or military validation rolls back diplomacy, AI replies, policies and orders', () => {
  const state = start(); state.countries[0].economy.treasury = 0;
  const commands: TurnCommand[] = [declare(), { type: 'set-economic-policy', countryId: 'alden', policy: 'tax-relief' },
    { type: 'set-military-order', countryId: 'alden', divisionId: 'alden-first', order: { kind: 'move', targetRegionId: 'reed-coast' } }];
  const before = structuredClone(state);
  assert.throws(() => advanceTurn(freeze(state), freeze(commands)), /Insufficient funds/);
  assert.deepEqual(state, before);
  const badMilitary: TurnCommand = { type: 'set-military-order', countryId: 'alden', divisionId: 'alden-first', order: { kind: 'attack', targetRegionId: 'dawn-ridge' } };
  assert.throws(() => advanceTurn(state, [declare(), badMilitary]), /adjacent/);
  assert.deepEqual(state, before);
  const invalidCombat = structuredClone(before);
  invalidCombat.divisions[1].manpower = -1;
  const combatSnapshot = structuredClone(invalidCombat);
  assert.throws(() => advanceTurn(freeze(invalidCombat), [declare()]), /nonnegative safe integer/);
  assert.deepEqual(invalidCombat, combatSnapshot);
  assert.equal(advanceTurn(state, [declare()]).diplomaticMessages.length, 3);
});

test('player can accept or reject AI offers with visible private results and a single weekly settlement', () => {
  for (const response of ['accept', 'reject'] as const) {
    const state = advanceTurn(start());
    const incoming = visibleDiplomaticMessages(state, 'alden').find(message => message.visibility === 'private' && message.fromId === 'belora')!;
    const result = advanceTurn(state, [reply(incoming.id, response, 'alden')]);
    assert.equal(result.diplomaticMessages[0].visibility === 'private' && result.diplomaticMessages[0].status, response === 'accept' ? 'accepted' : 'rejected');
    assert.equal(visibleDiplomaticMessages(result, 'cyrin').some(message => message.id === incoming.id), false);
    assert.equal(result.countries[0].economy.treasury, 108);
  }
});

test('mixed diplomatic/economic/military replay is identical through JSON, failed turns and multiple seeds', () => {
  const replay = (seed: number, serialize: boolean) => {
    let state: GameState = start(); state.seed = seed;
    const history = [];
    const script: TurnCommand[][] = [
      [declare('condemnation'), { type: 'set-military-order', countryId: 'alden', divisionId: 'alden-first', order: { kind: 'attack', targetRegionId: 'amber-plain' } }],
      [offer()], [], [declare(), offer()], [declare()], [],
      [{ type: 'set-economic-policy', countryId: 'alden', policy: 'tax-relief' }], [],
    ];
    for (const commands of script) {
      if (serialize) state = JSON.parse(JSON.stringify(state));
      let error = '';
      try { state = advanceTurn(freeze(state), freeze(commands)); } catch (failure) { error = (failure as Error).message; }
      history.push({ state, error });
    }
    return history;
  };
  for (const seed of [0, 2401, 123456]) {
    const history = replay(seed, false);
    assert.deepEqual(replay(seed, false), history);
    assert.deepEqual(replay(seed, true), history);
    assert.ok(history.every(entry => entry.state.seed === seed));
    assert.match(history[3].error, /one diplomatic action/);
    assert.equal(history.at(-1)!.state.regions.find(region => region.id === 'amber-plain')!.ownerId, 'alden');
  }
});

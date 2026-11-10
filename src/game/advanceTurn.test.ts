import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceTurn } from './advanceTurn.ts';
import { createInitialState } from './initialState.ts';
import { selectCountry } from './selectCountry.ts';
import type { StandingOrder, TurnCommand } from './models.ts';

const order: StandingOrder = { id: 'demo-1', countryId: 'alden', kind: 'placeholder', label: 'Inert test order' };
const setOrder: TurnCommand = { type: 'set-standing-order', order };
const cancelOrder: TurnCommand = { type: 'cancel-standing-order', countryId: 'alden', orderId: order.id };
const start = () => selectCountry(createInitialState(), 'alden');

function freeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test('every completed turn advances exactly one week, preserving geography, military and base economics', () => {
  for (const country of createInitialState().countries) {
    const initial = freeze(selectCountry(createInitialState(), country.id));
    let state = initial;
    for (let week = 2; week <= 21; week++) {
      state = advanceTurn(state);
      assert.equal(state.week, week);
      assert.deepEqual({ ...state, week: initial.week, countries: initial.countries,
        relations: initial.relations, diplomaticMessages: initial.diplomaticMessages }, initial);
      assert.deepEqual(state.countries, initial.countries.map(country => ({
        ...country,
        economy: { ...country.economy, treasury: country.economy.treasury + (week - 1) * 4 },
      })));
    }
  }
});

test('cannot advance before selection or from an invalid/overflowing week', () => {
  assert.throws(() => advanceTurn(createInitialState()), /Select a player country/);
  const state = start();
  for (const week of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => advanceTurn({ ...state, week }), /Week must/);
  }
  const badController = createInitialState();
  badController.playerCountryId = 'alden';
  assert.throws(() => advanceTurn(badController), /Select a player country/);
  assert.equal(advanceTurn({ ...state, week: Number.MAX_SAFE_INTEGER - 1 }).week, Number.MAX_SAFE_INTEGER);
});

test('standing orders persist unchanged over multiple empty turns, without mutating state or commands', () => {
  const initial = freeze(start());
  const commands = freeze([structuredClone(setOrder)]);
  let state = advanceTurn(initial, commands);
  assert.deepEqual(state.standingOrders, [order]);
  assert.deepEqual(initial.standingOrders, []);
  assert.equal(initial.week, 1);
  for (let i = 0; i < 5; i++) {
    const previous = freeze(state);
    state = advanceTurn(previous);
    assert.deepEqual(state.standingOrders, [order]);
    assert.equal(previous.week + 1, state.week);
  }
  assert.deepEqual(commands, [setOrder]);
});

test('set replaces by ID, unrelated orders survive, cancellation persists, commands apply in supplied order', () => {
  const second: StandingOrder = { ...order, id: 'demo-2' };
  const updated: StandingOrder = { ...order, label: 'Changed inert label' };
  const first = advanceTurn(start(), [setOrder, { type: 'set-standing-order', order: second }]);
  const changed = advanceTurn(freeze(first), [{ type: 'set-standing-order', order: updated }]);
  assert.deepEqual(changed.standingOrders, [updated, second]);
  const cancelled = advanceTurn(changed, [cancelOrder]);
  assert.deepEqual(advanceTurn(cancelled).standingOrders, [second]);
  assert.deepEqual(advanceTurn(start(), [setOrder, cancelOrder]).standingOrders, []);
  const mutableCommands = [structuredClone(setOrder)];
  const result = advanceTurn(start(), mutableCommands);
  mutableCommands[0].order.label = 'Later external edit';
  assert.deepEqual(result.standingOrders, [order]);
});

test('reject malformed and unsupported commands at runtime, leaving the original state intact', () => {
  const state = freeze(start());
  const badInputs: unknown[] = [
    null, [], 1, 'next', {}, { type: 'attack' },
    { type: 'set-standing-order' }, { type: 'set-standing-order', order: null },
    ...['id', 'countryId', 'kind', 'label'].flatMap(key => [
      { type: 'set-standing-order', order: { ...order, [key]: '' } },
      { type: 'set-standing-order', order: { ...order, [key]: 123 } },
      { type: 'set-standing-order', order: { ...order, [key]: '   ' } },
    ]),
    { type: 'set-standing-order', order: { ...order, kind: 'move' } },
    { type: 'cancel-standing-order' },
    { ...cancelOrder, orderId: '' }, { ...cancelOrder, countryId: null },
  ];
  for (const input of badInputs) {
    assert.throws(() => advanceTurn(state, [input] as TurnCommand[]), /Invalid turn command/);
    assert.deepEqual(state, start());
  }
  for (const input of [null, {}, 'commands']) {
    assert.throws(() => advanceTurn(state, input as unknown as TurnCommand[]), /must be an array/);
  }
});

test('reject commands for unknown/AI countries, missing cancellations, and changes to another country’s order', () => {
  const state = freeze(start());
  for (const countryId of ['missing', 'belora', 'cyrin']) {
    assert.throws(() => advanceTurn(state, [{ type: 'set-standing-order', order: { ...order, countryId } }]), /selected player country/);
    assert.throws(() => advanceTurn(state, [{ ...cancelOrder, countryId }]), /selected player country/);
  }
  assert.throws(() => advanceTurn(state, [cancelOrder]), /does not exist/);
  const otherOrder = { ...state, standingOrders: [{ ...order, countryId: 'belora' }] };
  for (const command of [setOrder, cancelOrder]) {
    assert.throws(() => advanceTurn(otherOrder, [command]), /another country/);
  }
});

test('a rejected batch is atomic even when earlier commands were valid', () => {
  const state = freeze(start());
  const commands = freeze([setOrder, { ...cancelOrder, orderId: 'missing' }]);
  assert.throws(() => advanceTurn(state, commands), /does not exist/);
  assert.deepEqual(state, start());
  const existing = freeze(advanceTurn(state, [setOrder]));
  assert.throws(() => advanceTurn(existing, [cancelOrder, cancelOrder]), /does not exist/);
  assert.deepEqual(existing.standingOrders, [order]);
  assert.equal(existing.week, 2);
});

test('replaying the same command sequence reproduces every state including through JSON round trips', () => {
  const script: TurnCommand[][] = [[setOrder], [], [{ type: 'set-standing-order', order: { ...order, label: 'Updated' } }], [], [cancelOrder], []];
  const replay = (serialize: boolean) => {
    let state = start();
    return script.map(commands => {
      state = advanceTurn(serialize ? JSON.parse(JSON.stringify(state)) : state, commands);
      return state;
    });
  };
  const history = replay(false);
  assert.deepEqual(replay(false), history);
  assert.deepEqual(replay(true), history);
  assert.deepEqual(history.map(state => state.week), [2, 3, 4, 5, 6, 7]);
  assert.equal(history[0].standingOrders[0].label, 'Inert test order');
  assert.equal(history[2].standingOrders[0].label, 'Updated');
  assert.deepEqual(history[5].standingOrders, []);
});

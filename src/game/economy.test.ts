import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceTurn } from './advanceTurn.ts';
import { calculateWeeklyBudget, resolveWeeklyEconomy } from './economy.ts';
import { createInitialState } from './initialState.ts';
import { selectCountry } from './selectCountry.ts';
import type { EconomicPolicy, GameState, TurnCommand } from './models.ts';

const start = (id = 'alden') => selectCountry(createInitialState(), id);
const policy = (value: EconomicPolicy, countryId = 'alden'): TurnCommand => ({
  type: 'set-economic-policy', countryId, policy: value,
});

function freeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test('standard budgets settle once for every country without changing base income or expenses', () => {
  const initial = freeze(start());
  assert.ok(initial.countries.every(country => country.economicPolicy === 'standard'));
  const result = advanceTurn(initial);
  assert.deepEqual(result.countries.map(country => country.economy.treasury), [104, 94, 114]);
  for (const [index, country] of result.countries.entries()) {
    assert.equal(country.economy.weeklyIncome, initial.countries[index].economy.weeklyIncome);
    assert.equal(country.economy.weeklyExpenses, initial.countries[index].economy.weeklyExpenses);
    assert.notEqual(country.economy, initial.countries[index].economy);
  }
  assert.deepEqual(initial, start());
});

test('tax relief changes each selected country’s next weekly income and treasury by exactly six units', () => {
  for (const id of ['alden', 'belora', 'cyrin']) {
    const initial = start(id);
    const standard = advanceTurn(initial);
    const relief = advanceTurn(initial, [policy('tax-relief', id)]);
    for (let index = 0; index < initial.countries.length; index++) {
      const before = initial.countries[index];
      const after = relief.countries[index];
      if (before.id === id) {
        assert.equal(after.economicPolicy, 'tax-relief');
        assert.equal(after.economy.treasury, before.economy.treasury - 2);
        assert.equal(standard.countries[index].economy.treasury - after.economy.treasury, 6);
        assert.deepEqual(calculateWeeklyBudget(after.economy, after.economicPolicy), {
          income: before.economy.weeklyIncome - 6, expenses: before.economy.weeklyExpenses, balance: -2,
        });
      } else assert.deepEqual(after, standard.countries[index]);
    }
  }
});

test('policy persists through empty turns and JSON, does not compound, and can be restored', () => {
  const commands = freeze([policy('tax-relief')]);
  let state = advanceTurn(freeze(start()), commands);
  for (let elapsed = 1; elapsed <= 8; elapsed++) {
    assert.equal(state.countries[0].economicPolicy, 'tax-relief');
    assert.equal(state.countries[0].economy.treasury, 100 - 2 * elapsed);
    assert.equal(state.countries[0].economy.weeklyIncome, 12);
    state = advanceTurn(freeze(JSON.parse(JSON.stringify(state))));
  }
  const previousTreasury = state.countries[0].economy.treasury;
  state = advanceTurn(state, [policy('standard')]);
  assert.equal(state.countries[0].economicPolicy, 'standard');
  assert.equal(state.countries[0].economy.treasury, previousTreasury + 4);
  assert.equal(advanceTurn(state).countries[0].economy.treasury, previousTreasury + 8);
  assert.deepEqual(commands, [policy('tax-relief')]);
});

test('income cannot go below zero and current-week income can fund expenses', () => {
  const economy = freeze({ treasury: 0, weeklyIncome: 3, weeklyExpenses: 0 });
  assert.deepEqual(calculateWeeklyBudget(economy, 'tax-relief'), { income: 0, expenses: 0, balance: 0 });
  assert.equal(resolveWeeklyEconomy(economy, 'tax-relief').treasury, 0);
  assert.equal(resolveWeeklyEconomy({ treasury: 0, weeklyIncome: 8, weeklyExpenses: 8 }, 'standard').treasury, 0);
});

test('exactly exhausted treasury is valid; next deficit turn fails atomically and standard policy recovers', () => {
  let state = advanceTurn(start(), [policy('tax-relief')]);
  for (let elapsed = 1; elapsed < 50; elapsed++) state = advanceTurn(state);
  assert.equal(state.week, 51);
  assert.equal(state.countries[0].economy.treasury, 0);
  const exhausted = freeze(state);
  const snapshot = JSON.stringify(exhausted);
  assert.throws(() => advanceTurn(exhausted), /Alden: Insufficient funds: treasury 0 \+ income 6 cannot cover expenses 8 \(shortfall 2\).*Week not advanced/);
  assert.equal(JSON.stringify(exhausted), snapshot);
  const recovered = advanceTurn(exhausted, [policy('standard')]);
  assert.equal(recovered.week, 52);
  assert.equal(recovered.countries[0].economicPolicy, 'standard');
  assert.equal(recovered.countries[0].economy.treasury, 4);
});

test('a shortfall rejects pending policy and order commands and does not settle any country', () => {
  const state = start();
  state.countries[0].economy.treasury = 1;
  const snapshot = structuredClone(state);
  const commands: TurnCommand[] = [
    { type: 'set-standing-order', order: { id: 'demo', countryId: 'alden', kind: 'placeholder', label: 'Keep me' } },
    policy('tax-relief'),
  ];
  freeze(state);
  freeze(commands);
  assert.throws(() => advanceTurn(state, commands), /shortfall 1/);
  assert.deepEqual(state, snapshot);
  assert.equal(advanceTurn(state).countries[0].economy.treasury, 5);

  const foreignDeficit = start();
  foreignDeficit.countries[2].economy = { treasury: 0, weeklyIncome: 0, weeklyExpenses: 1 };
  const foreignSnapshot = structuredClone(foreignDeficit);
  assert.throws(() => advanceTurn(freeze(foreignDeficit), commands), /Cyrin: Insufficient funds/);
  assert.deepEqual(foreignDeficit, foreignSnapshot);
});

test('invalid economic amounts and unsafe treasury growth are rejected without mutation', () => {
  for (const field of ['treasury', 'weeklyIncome', 'weeklyExpenses'] as const) {
    for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      const state = start();
      state.countries[0].economy[field] = value;
      assert.throws(() => advanceTurn(freeze(state)), /nonnegative safe integers/);
      assert.equal(state.week, 1);
    }
  }
  const state = start();
  state.countries[0].economy.treasury = Number.MAX_SAFE_INTEGER;
  assert.throws(() => advanceTurn(freeze(state)), /Treasury exceeds/);
  assert.equal(resolveWeeklyEconomy({ treasury: Number.MAX_SAFE_INTEGER, weeklyIncome: 1, weeklyExpenses: 1 }, 'standard').treasury, Number.MAX_SAFE_INTEGER);
  assert.throws(() => calculateWeeklyBudget(state.countries[0].economy, 'unknown' as EconomicPolicy), /Invalid economic policy/);
});

test('policy commands validate runtime values and ownership and apply in array order', () => {
  const state = freeze(start());
  for (const value of [null, 123, '', 'unknown', {}, []]) {
    assert.throws(() => advanceTurn(state, [{ ...policy('standard'), policy: value }] as TurnCommand[]), /Invalid turn command/);
  }
  for (const countryId of ['belora', 'cyrin', 'missing']) {
    assert.throws(() => advanceTurn(state, [policy('tax-relief', countryId)]), /selected player country/);
  }
  assert.throws(() => advanceTurn(state, [{ type: 'set-economic-policy', policy: 'standard' }] as TurnCommand[]), /Invalid turn command/);
  const result = advanceTurn(state, [policy('tax-relief'), policy('standard')]);
  assert.equal(result.countries[0].economicPolicy, 'standard');
  assert.equal(result.countries[0].economy.treasury, 104);
  assert.deepEqual(result.standingOrders, []);
  assert.deepEqual(state, start());
});

test('economic replay reproduces every state, shortfall and recovery across JSON round trips', () => {
  const script: TurnCommand[][] = [
    [policy('tax-relief')], [], [], [policy('standard')], [], [policy('tax-relief')], [],
  ];
  const replay = (serialize: boolean) => {
    let state: GameState = start();
    state.countries[0].economy.treasury = 4;
    return script.map(commands => {
      if (serialize) state = JSON.parse(JSON.stringify(state));
      try {
        state = advanceTurn(state, commands);
        return { state, error: null };
      } catch (error) {
        return { state, error: (error as Error).message };
      }
    });
  };
  const history = replay(false);
  assert.deepEqual(replay(false), history);
  assert.deepEqual(replay(true), history);
  assert.deepEqual(history.map(entry => entry.state.countries[0].economy.treasury), [2, 0, 0, 4, 8, 6, 4]);
  assert.match(history[2].error!, /Insufficient funds/);
  assert.ok(history.every(entry => entry.state.seed === 2401));
});

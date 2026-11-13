import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceEconomy, advanceEconomyInPlace, hashEconomy } from '../src/index.ts';
import { once, world } from './helpers.ts';

const reject = (input: unknown, pattern: RegExp) => {
  const state = world();
  const before = hashEconomy(state);
  assert.throws(() => advanceEconomyInPlace(state, input as never, { report: 'none' }), pattern);
  assert.equal(hashEconomy(state), before, 'a rejected turn changes nothing');
  assert.throws(() => advanceEconomy(state, input as never), pattern);
};

test('unknown ids, bad numbers and malformed commands are rejected without side effects', () => {
  reject({ commands: [{ type: 'set-tax', countryId: 'atlantis', tax: 'income', rate: 0.1 }] }, /Unknown country/);
  reject({ commands: [{ type: 'set-tax', countryId: 'norland', tax: 'income', rate: -0.1 }] }, /Tax rate/);
  reject({ commands: [{ type: 'set-tax', countryId: 'norland', tax: 'income', rate: 0.99 }] }, /Tax rate/);
  reject({ commands: [{ type: 'set-tax', countryId: 'norland', tax: 'income', rate: NaN }] }, /Tax rate/);
  reject({ commands: [{ type: 'set-tax', countryId: 'norland', tax: 'wealth', rate: 0.1 }] }, /Unknown tax/);
  reject({ commands: [{ type: 'set-spending', countryId: 'norland', category: 'military', share: 0.9 }] }, /Spending share/);
  reject({ commands: [{ type: 'set-spending', countryId: 'norland', category: 'space', share: 0.1 }] }, /spending category/);
  reject({ commands: [{ type: 'set-tariff', countryId: 'norland', goodId: 'gold', rate: 0.1 }] }, /Unknown good/);
  reject({ commands: [{ type: 'set-tariff', countryId: 'norland', goodId: 'food', rate: 99 }] }, /Tariff/);
  reject({ commands: [{ type: 'set-tariff', countryId: 'norland', goodId: 'food', rate: 0.1, partnerId: 'norland' }] }, /another country/);
  reject({ commands: [{ type: 'set-sanction', countryId: 'norland', targetId: 'norland', goodIds: ['food'], imports: true, exports: true }] }, /itself/);
  reject({ commands: [{ type: 'set-sanction', countryId: 'norland', targetId: 'khazir', goodIds: ['services'], imports: true, exports: true }] }, /not traded/);
  reject({ commands: [{ type: 'set-sanction', countryId: 'norland', targetId: 'khazir', goodIds: [], imports: true, exports: true }] }, /at least one good/);
  reject({ commands: [{ type: 'set-sanction', countryId: 'norland', targetId: 'khazir', goodIds: ['food'], imports: 'yes', exports: true }] }, /true or false/);
  reject({ commands: [{ type: 'set-reserve', countryId: 'norland', goodId: 'services', targetWeeks: 4 }] }, /cannot be stored/);
  reject({ commands: [{ type: 'set-reserve', countryId: 'norland', goodId: 'food', targetWeeks: 4, mode: 'panic' }] }, /reserve mode/);
  reject({ commands: [{ type: 'set-reserve', countryId: 'norland', goodId: 'food', targetWeeks: 400 }] }, /Reserve target/);
  reject({ commands: [{ type: 'repay-debt', countryId: 'norland', amount: -5 }] }, /Repayment/);
  reject({ commands: [{ type: 'teleport', countryId: 'norland' }] }, /Unknown economy command/);
  reject({ commands: 'oops' }, /arrays/);
  reject({ commands: [null] }, /Invalid economy command/);
  reject('nope', /object/);
  reject({ effects: [{ type: 'production-shock', zoneId: 'nowhere', goodId: 'food', factor: 0.5, recoveryWeeks: 5 }] }, /Unknown zone/);
  reject({ effects: [{ type: 'production-shock', zoneId: 'verdania', goodId: 'food', factor: -1, recoveryWeeks: 5 }] }, /Shock factor/);
  reject({ effects: [{ type: 'destroy-capacity', zoneId: 'verdania', goodId: 'all', fraction: 1.5 }] }, /Fraction/);
  reject({ effects: [{ type: 'set-lane', laneId: 'no-such-lane', costMultiplier: 1, throughput: 1 }] }, /Unknown lane/);
  reject({ effects: [{ type: 'set-lane', laneId: 'kell-west', costMultiplier: 0, throughput: 1 }] }, /Cost multiplier/);
  reject({ effects: [{ type: 'set-lane', laneId: 'kell-west', costMultiplier: 1, throughput: 2 }] }, /Throughput/);
  reject({ effects: [{ type: 'transfer-zone', zoneId: 'verdania', ownerId: 'atlantis' }] }, /Unknown country/);
  reject({ effects: [{ type: 'transfer-funds', fromCountryId: 'norland', toCountryId: 'norland', amount: 5 }] }, /two different/);
  reject({ effects: [{ type: 'transfer-funds', fromCountryId: 'norland', toCountryId: 'khazir', amount: -5 }] }, /Amount/);
  reject({ effects: [{ type: 'set-mobilization', zoneId: 'verdania', personnel: -1 }] }, /Personnel/);
  reject({ effects: [{ type: 'stability-modifier', countryId: 'verdania', value: 500 }] }, /Stability modifier/);
});

test('a valid command followed by an invalid one changes nothing at all', () => {
  reject({ commands: [{ type: 'set-tax', countryId: 'norland', tax: 'income', rate: 0.4 }, { type: 'set-tax', countryId: 'norland', tax: 'income', rate: 5 }] }, /Tax rate/);
});

test('commands persist as standing policy until changed, and are visible in the state', () => {
  const state = world();
  once(state, { commands: [{ type: 'set-tax', countryId: 'norland', tax: 'corporate', rate: 0.33 }, { type: 'set-tariff', countryId: 'norland', goodId: 'food', rate: 0.4 },
    { type: 'set-tariff', countryId: 'norland', goodId: 'food', rate: 0.9, partnerId: 'verdania' }, { type: 'set-reserve', countryId: 'norland', goodId: 'food', targetWeeks: 7, mode: 'hold' }] });
  for (let i = 0; i < 5; i++) once(state);
  const c = state.countries.findIndex(country => country.id === 'norland'), g = state.config.goods.findIndex(good => good.id === 'food');
  assert.equal(state.country.taxCorporate[c], 0.33);
  assert.equal(state.countryGood.tariff[c * state.config.goods.length + g], 0.4);
  assert.equal(state.countryGood.reserveTargetWeeks[c * state.config.goods.length + g], 7);
  assert.equal(state.tariffOverrides.length, 1);
  once(state, { commands: [{ type: 'set-tariff', countryId: 'norland', goodId: 'food', rate: null, partnerId: 'verdania' }] });
  assert.equal(state.tariffOverrides.length, 0, 'an exception can be removed');
});

test('the engine refuses to run beyond the safe integer range but has no smaller limit', () => {
  const state = world();
  state.turn = Number.MAX_SAFE_INTEGER;
  assert.throws(() => advanceEconomyInPlace(state, undefined, { report: 'none' }), /Turn counter/);
  state.turn = 1_000_000_000;
  advanceEconomyInPlace(state, undefined, { report: 'none' });
  assert.equal(state.turn, 1_000_000_001);
});

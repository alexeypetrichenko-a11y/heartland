import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceEconomyInPlace, autopilotCommands, getCountryHistory, REBASE_FACTOR, rescaleMoney, ROLLOVER_MONEY } from '../src/index.ts';
import { allNumbers, world } from './helpers.ts';

function stepBoth(a: ReturnType<typeof world>, b: ReturnType<typeof world>, weeks: number) {
  for (let w = 0; w < weeks; w++) {
    advanceEconomyInPlace(a, { commands: autopilotCommands(a) }, { report: 'none', audit: true });
    advanceEconomyInPlace(b, { commands: autopilotCommands(b) }, { report: 'none', audit: true });
  }
}
const sameReal = (a: ReturnType<typeof world>, b: ReturnType<typeof world>) => {
  for (const key of ['capacity', 'stock', 'shortage', 'pressure', 'yieldFactor'] as const) assert.deepEqual(a.zoneGood[key], b.zoneGood[key], key);
  for (const key of ['population', 'technology', 'unemployment', 'deprivation', 'inflation'] as const) assert.deepEqual(a.zone[key], b.zone[key], key);
  for (const key of ['stability', 'marketRate', 'regime', 'unrestTier'] as const) assert.deepEqual(a.country[key], b.country[key], key);
};

test('money is a pure unit: rescaling every amount by a power of two changes no real variable, bit for bit', () => {
  for (const k of [40, -40]) {
    const a = world(), b = world();
    rescaleMoney(b, 2 ** k);
    stepBoth(a, b, 150);
    sameReal(a, b);
    for (let i = 0; i < a.country.treasury.length; i++) assert.equal(a.country.treasury[i] * 2 ** k, b.country.treasury[i]);
    for (let i = 0; i < a.bonds.length; i++) assert.equal(a.bonds[i] * 2 ** k, b.bonds[i]);
  }
});

test('automatic rebase: once money passes the rollover point amounts are divided by 2^30, nothing real changes', () => {
  const a = world(), b = world();
  rescaleMoney(b, 2 ** 70);
  assert.ok(b.world.baseMoney > ROLLOVER_MONEY);
  stepBoth(a, b, 120);
  assert.equal(b.world.rebases, 1);
  assert.ok(b.world.baseMoney <= ROLLOVER_MONEY);
  sameReal(a, b);
  const factor = 2 ** 70 / REBASE_FACTOR;
  for (let i = 0; i < a.country.debt.length; i++) assert.equal(a.country.debt[i] * factor, b.country.debt[i]);
});

test('stored history is rescaled consistently across a rebase (money columns scale, real columns do not)', () => {
  const a = world(), b = world();
  rescaleMoney(b, 2 ** 70);
  stepBoth(a, b, 60);
  const nominalA = getCountryHistory(a, 'norland', 'gdpNominal'), nominalB = getCountryHistory(b, 'norland', 'gdpNominal');
  const realA = getCountryHistory(a, 'norland', 'gdpReal'), realB = getCountryHistory(b, 'norland', 'gdpReal');
  assert.deepEqual(realA.values, realB.values);
  nominalA.values.forEach((v, i) => assert.equal(v * 2 ** 40, nominalB.values[i]));
  const priceA = getCountryHistory(a, 'norland', 'cpi', 'quarterly'), priceB = getCountryHistory(b, 'norland', 'cpi', 'quarterly');
  priceA.values.forEach((v, i) => assert.ok(Math.abs(v * 2 ** 40 / priceB.values[i] - 1) < 1e-12));
});

test('a state with absurdly large money amounts is brought back into range and keeps running', () => {
  const state = world();
  rescaleMoney(state, 2 ** 400);
  advanceEconomyInPlace(state, undefined, { report: 'none', audit: true });
  assert.ok(state.world.baseMoney <= ROLLOVER_MONEY * 1.01);
  assert.ok(state.world.rebases >= 10);
  for (let w = 0; w < 30; w++) advanceEconomyInPlace(state, undefined, { report: 'none', audit: true });
  assert.ok(allNumbers(state).every(Number.isFinite));
});

test('technology and population cannot grow without bound', () => {
  const state = world();
  for (let z = 0; z < state.zones.length; z++) {
    state.zone.technology[z] = state.config.params.techCeiling * 0.999;
    state.zone.populationGrowth[z] = 0.03;
    state.zone.population[z] = state.zone.populationCap[z] * 0.999;
  }
  const ceilingBefore = state.config.params.techCeiling;
  for (let w = 0; w < 2000; w++) advanceEconomyInPlace(state, undefined, { report: 'none' });
  for (let z = 0; z < state.zones.length; z++) {
    assert.ok(state.zone.technology[z] < ceilingBefore * 1.005, `technology ${state.zone.technology[z]}`);
    assert.ok(state.zone.population[z] <= state.zone.populationCap[z] * 1.002, `population ${state.zone.population[z]} cap ${state.zone.populationCap[z]}`);
  }
});

test('near-term growth is not noticeably slowed by the long-run ceilings', () => {
  const state = world();
  const z = 0, tech0 = state.zone.technology[z], pop0 = state.zone.population[z];
  for (let w = 0; w < 104; w++) advanceEconomyInPlace(state, undefined, { report: 'none' });
  assert.ok(state.zone.technology[z] / tech0 > 1.015, 'about 1% a year or more');
  assert.ok(state.zone.population[z] / pop0 > 1.003 && state.zone.population[z] / pop0 < 1.01);
});

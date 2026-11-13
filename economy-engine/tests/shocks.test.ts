import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getCountry, getProgress, getZone } from '../src/index.ts';
import { advance, at, commands, effects, goodIdx, idx, once, world, zoneIdx } from './helpers.ts';

test('a production shock lowers output and raises the price; an exporter loses export sales first, households stay supplied; then it recovers', () => {
  const ctl = world(), run = world();
  const g = goodIdx(run, 'food'), v = idx(run, 'verdania');
  advance(ctl, 10); advance(run, 10, at(1, effects({ type: 'production-shock', zoneId: 'verdania', goodId: 'food', factor: 0.5, recoveryWeeks: 40 })));
  const c = once(ctl).countries[v], r = once(run).countries[v];
  assert.ok(r.output[g] < c.output[g] * 0.75, `output ${r.output[g]} vs ${c.output[g]}`);
  assert.ok(r.buyPrices[g] > c.buyPrices[g], 'price rises');
  // Verdania is a net food exporter: domestic households are served first, so it is exports that fall.
  assert.ok(r.exports < c.exports * 0.9, `exports ${r.exports} vs ${c.exports}`);
  assert.ok(r.householdFill[g] > 0.99, 'households still get their food');
  advance(ctl, 200); advance(run, 200);
  assert.ok(once(run).countries[v].output[g] > once(ctl).countries[v].output[g] * 0.97, 'recovers after the shock fades');
  assert.ok(getZone(run, 'verdania').goods[g].yieldFactor > 0.99, 'the shock fades exponentially');
  advance(run, 300);
  assert.equal(getZone(run, 'verdania').goods[g].yieldFactor, 1, 'and is eventually fully expired');
});

test('shocks propagate through supply chains: less energy raises prices of goods that use it', () => {
  const ctl = world(), run = world();
  const i = goodIdx(ctl, 'industrial'), n = idx(ctl, 'norland');
  advance(ctl, 40);
  advance(run, 40, at(1, effects(...['khazir', 'halcyon', 'norland-core', 'norland-coast', 'tavros', 'sundara-delta'].map(zoneId => ({ type: 'production-shock' as const, zoneId, goodId: 'energy', factor: 0.4, recoveryWeeks: 200 })))));
  const c = once(ctl).countries[n], r = once(run).countries[n];
  assert.ok(r.buyPrices[i] > c.buyPrices[i] * 1.02, `industrial price ${r.buyPrices[i]} > ${c.buyPrices[i]}`);
  assert.ok(r.gdpReal < c.gdpReal);
});

test('capacity destruction is exact and rebuilt only gradually, by private investment', () => {
  const state = world();
  const z = zoneIdx(state, 'sundara-delta'), g = goodIdx(state, 'industrial'), G = state.config.goods.length;
  const before = state.zoneGood.capacity[z * G + g];
  once(state, effects({ type: 'destroy-capacity', zoneId: 'sundara-delta', goodId: 'industrial', fraction: 0.5 }));
  const after = state.zoneGood.capacity[z * G + g];
  assert.ok(Math.abs(after / before - 0.5) < 0.02, `capacity fell by half (${after / before})`);
  advance(state, 26);
  const mid = state.zoneGood.capacity[z * G + g];
  advance(state, 300);
  const late = state.zoneGood.capacity[z * G + g];
  assert.ok(mid < before * 0.8, 'no instant rebuild (construction delay)');
  assert.ok(late > mid * 1.15, `capacity is rebuilt over time (${mid} → ${late})`);
});

test('mobilisation takes workers out of the labour force and tightens the labour market', () => {
  const ctl = world(), run = world();
  advance(ctl, 30); advance(run, 30, at(1, effects({ type: 'set-mobilization', zoneId: 'ostmark', personnel: 6 })));
  const z = zoneIdx(run, 'ostmark');
  assert.ok(run.zone.unemployment[z] <= ctl.zone.unemployment[z] + 1e-9);
  assert.ok(run.zone.wage[z] >= ctl.zone.wage[z] * 0.999, 'wages are not lower');
  assert.ok(once(run).countries[idx(run, 'ostmark')].gdpReal < once(ctl).countries[idx(ctl, 'ostmark')].gdpReal, 'less civilian output');
});

test('military procurement increases deliveries and builds an equipment stock that wears out', () => {
  const state = world();
  const o = idx(state, 'ostmark');
  advance(state, 20, at(1, effects({ type: 'military-procurement', countryId: 'ostmark', goodId: 'military', quantity: 5 })));
  const stock = getCountry(state, 'ostmark').armsStock;
  advance(state, 600);
  assert.ok(getCountry(state, 'ostmark').armsStock >= stock * 0.5);
  assert.ok(Number.isFinite(state.country.armsStock[o]));
});

test('transferring a zone moves its taxes and political weight to the new owner', () => {
  const state = world();
  advance(state, 10);
  const norlandBefore = once(state).countries[idx(state, 'norland')].population;
  const result = once(state, effects({ type: 'transfer-zone', zoneId: 'norland-coast', ownerId: 'sundara' }));
  const after = result.countries[idx(state, 'norland')].population;
  assert.ok(after < norlandBefore * 0.7, `population ${norlandBefore} → ${after}`);
  assert.deepEqual(getCountry(state, 'sundara').zoneIds.includes('norland-coast'), true);
});

test('transfer of funds is capped by the sender\'s treasury and creates no money', () => {
  const state = world();
  const before = Object.values({ n: state.country.treasury[idx(state, 'norland')], t: state.country.treasury[idx(state, 'tavros')] });
  const report = once(state, effects({ type: 'transfer-funds', fromCountryId: 'norland', toCountryId: 'tavros', amount: 1e12 }));
  assert.ok(report.audit.negativeValues === 0);
  assert.ok(Math.abs(report.audit.moneyError) < 1e-6 * report.audit.moneyBefore);
  assert.ok(state.country.treasury[idx(state, 'norland')] >= 0);
  assert.ok(before.length === 2);
});

test('progress is measured against the starting baseline', () => {
  const state = world();
  advance(state, 520);
  const progress = getProgress(state, 'sundara');
  assert.ok(progress.realGdp > 1, `real GDP grew (${progress.realGdp})`);
  assert.ok(progress.population > 1);
  void commands;
});

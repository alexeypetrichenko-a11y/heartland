import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createConfig, createEconomy, createTestWorldSpec, getCountryHistory, getGoodHistory, getWorldHistory, serializeEconomy } from '../src/index.ts';
import { runSimulation, mean, minimum, maximum } from '../sim/runner.ts';
import { allNumbers, world } from './helpers.ts';

function flatWorld() {
  const spec = createTestWorldSpec();
  spec.zones.forEach(z => { z.populationGrowth = 0; });
  spec.config = createConfig({ techGrowthBase: 0, techCatchUp: 0, infraGrowthEffect: 0 });
  return createEconomy(spec);
}

test('stationary world: with no growth drivers, output stays flat for 40 years', () => {
  const r = runSimulation(flatWorld(), { turns: 2080, autopilot: true });
  const gdp = r.series.world.gdpReal;
  const start = mean(gdp, 0, 52), end = mean(gdp, gdp.length - 52);
  assert.ok(Math.abs(end / start - 1) < 0.04, `GDP ${start} → ${end}`);
  assert.ok(minimum(gdp) > start * 0.93 && maximum(gdp) < start * 1.07, 'no large swings');
  assert.equal(r.events.length, 0, 'no unrest, defaults or regime change');
  for (const c of Object.values(r.series.countries)) assert.ok(maximum(c.unemployment) < 0.15);
});

test('inflation follows the monetary target and prices do not run away', () => {
  const r = runSimulation(flatWorld(), { turns: 2080, autopilot: true });
  const inflation = mean(r.series.world.inflation);
  assert.ok(inflation > -0.005 && inflation < 0.035, `mean inflation ${inflation}`);
  for (const goodId of Object.keys(r.series.goods)) {
    const prices = r.series.goods[goodId].price;
    const ratio = prices[prices.length - 1] / prices[0];
    assert.ok(ratio > 1.0 && ratio < 4, `${goodId} price level ×${ratio} over 40 years of ~2% inflation`);
  }
});

test('growing world: GDP grows at a moderate trend with no explosion or collapse over 1,000 weeks', () => {
  const r = runSimulation(world(), { turns: 1000, autopilot: true });
  const growth = Math.pow(r.series.world.gdpReal[999] / r.series.world.gdpReal[0], 52 / 1000) - 1;
  assert.ok(growth > 0.005 && growth < 0.04, `growth ${growth}`);
  assert.ok(minimum(r.series.world.gdpReal) > 0.9 * r.series.world.gdpReal[0]);
  assert.ok(maximum(r.series.world.inflation) < 0.12 && minimum(r.series.world.inflation) > -0.1);
  for (const c of Object.values(r.series.countries)) {
    assert.ok(maximum(c.debtToGdp) < 1.5, 'debt stays bounded');
    assert.ok(minimum(c.stability) > 30);
  }
});

test('an economy hit by a very large shock recovers and settles instead of cycling forever', () => {
  const state = world();
  const zones = ['sundara-delta', 'sundara-inland'];
  const r = runSimulation(state, { turns: 1560, autopilot: true, script: w => w === 53 ? { effects: zones.map(zoneId => ({ type: 'destroy-capacity' as const, zoneId, goodId: 'all' as const, fraction: 0.35 })) } : undefined });
  const infl = r.series.world.inflation;
  const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
  const early = sd(infl.slice(53, 313)), late = sd(infl.slice(1300));
  assert.ok(late < early * 0.5, `inflation volatility falls from ${early} to ${late}`);
  assert.ok(late < 0.01, 'and ends small');
  const gdp = r.series.countries.sundara.gdpReal;
  assert.ok(mean(gdp, 1300) > 0.9 * mean(gdp, 40, 52), 'output returned to its prior level');
});

test('history uses fixed memory however long the game runs', () => {
  const state = world();
  const sizes: number[] = [];
  // The yearly tier (50 entries of 52 weeks) is full from week 2,600; after that memory must not grow at all.
  for (const target of [3000, 4500, 6000]) {
    runSimulation(state, { turns: target - state.turn, autopilot: true, record: false });
    sizes.push(serializeEconomy(state).length);
  }
  assert.ok(Math.abs(sizes[2] - sizes[0]) / sizes[0] < 0.02, `save size ${sizes.join(', ')} stays flat`);
  assert.ok(Math.abs(sizes[2] - sizes[1]) / sizes[1] < 0.02);
  const h = state.history;
  assert.equal(h.tiers[0].length, h.tiers[0].capacity);
  assert.ok(h.tiers.every(tier => tier.length <= tier.capacity));
  assert.ok(allNumbers(state).every(Number.isFinite));
});

test('history tiers keep recent detail and long-run summaries, readable oldest first', () => {
  const state = world();
  runSimulation(state, { turns: 3000, autopilot: true, record: false });
  const weekly = getCountryHistory(state, 'sundara', 'gdpReal', 'weekly');
  const quarterly = getCountryHistory(state, 'sundara', 'gdpReal', 'quarterly');
  const yearly = getCountryHistory(state, 'sundara', 'gdpReal', 'yearly');
  assert.equal(weekly.turns.length, state.config.params.historyWeekly);
  assert.equal(weekly.turns[weekly.turns.length - 1], 3000);
  assert.equal(weekly.turns[1] - weekly.turns[0], 1);
  assert.equal(quarterly.turns[1] - quarterly.turns[0], 13);
  assert.equal(yearly.turns[1] - yearly.turns[0], 52);
  assert.equal(yearly.turns.length, Math.min(state.config.params.historyYearly, Math.floor(3000 / 52)));
  assert.ok(yearly.values.every(v => Number.isFinite(v) && v > 0));
  assert.ok(getGoodHistory(state, 'food', 'price').values.length === weekly.values.length);
  assert.ok(getWorldHistory(state, 'gdpReal', 'yearly').values[0] < getWorldHistory(state, 'gdpReal', 'yearly').values.at(-1)!, 'growth visible in the yearly record');
  assert.deepEqual(getCountryHistory(state, 'nowhere', 'gdpReal').values, []);
});

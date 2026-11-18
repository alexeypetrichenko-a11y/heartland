import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EconomyState } from '../src/index.ts';
import { deserializeEconomy, hashEconomy, serializeEconomy, validateEconomy } from '../src/index.ts';
import { OWNERSHIP_COUNT, PUBLIC, TIER_COUNT } from '../src/core/model.ts';
import type { HorizonScenario, HorizonStats, WorldKind } from './horizon-scenarios.ts';
import { HORIZONS, SCENARIOS, freshWorld, newStats, play } from './horizon-scenarios.ts';
import { allNumbers } from './helpers.ts';

/**
 * Intended game lengths (Milestone 3 finalisation): 52, 104 and 156 weekly turns, in
 * the 7-good and the 31-good world, calm and under adverse shocks. At every horizon the
 * game must stay internally consistent (conservation, finite and valid state, exact
 * save/restore) and economically sane (bounded inflation, output and debt). The bounds
 * are deliberately loose for the adverse runs: they catch runaway or broken dynamics,
 * not calibration details.
 */

function saveAndRestore(state: EconomyState): EconomyState {
  const text = serializeEconomy(state);
  validateEconomy(JSON.parse(text));
  return deserializeEconomy(text);
}

function checkConsistent(state: EconomyState, stats: HorizonStats, label: string): void {
  assert.ok(stats.worstAuditError < 1e-9, `${label}: money, goods and bond ledgers conserved (worst error ${stats.worstAuditError})`);
  assert.equal(stats.negativeOrNonFinite, 0, `${label}: no negative or non-finite values`);
  assert.ok(allNumbers(state).every(Number.isFinite), `${label}: every stored number is finite`);
  validateEconomy(JSON.parse(serializeEconomy(state)));
}

function checkSane(scenario: HorizonScenario, stats: HorizonStats, label: string): void {
  assert.ok(stats.maxInflation < 0.35 && stats.minInflation > -0.1, `${label}: world inflation within -10%..35% (${stats.minInflation}..${stats.maxInflation})`);
  // A war-scale shock (35% of a large country's plant destroyed) lifts first-year inflation to 10-14%.
  assert.ok(Math.abs(stats.meanInflation) < 0.15, `${label}: mean inflation ${stats.meanInflation}`);
  assert.ok(stats.gdpLow > 0.75, `${label}: world output never below 75% of its start (${stats.gdpLow})`);
  assert.ok(stats.maxDebt < 1.5, `${label}: no country's debt beyond 150% of GDP (${stats.maxDebt})`);
  if (scenario.calm) {
    assert.ok(stats.gdpLow > 0.95, `${label}: calm output steady (${stats.gdpLow})`);
    // The 31-good world starts with a price adjustment (first-year mean about 6%, peak about 12%; it
    // was higher in Milestone 2) that fades by year 3; the 7-good world stays near 1-2%.
    assert.ok(stats.minInflation > -0.01 && stats.maxInflation < 0.15 && stats.meanInflation < 0.08, `${label}: calm inflation ${stats.minInflation}..${stats.maxInflation}, mean ${stats.meanInflation}`);
    assert.ok(stats.worstUnemployment < 0.15, `${label}: calm unemployment ${stats.worstUnemployment}`);
    assert.equal(stats.defaults + stats.regimeChanges + stats.bankruptcies, 0, `${label}: no default, regime change or bankruptcy in a calm game`);
  }
}

function publicCapacity(state: EconomyState, zoneId: string, sectorId: string): number {
  const z = state.zones.findIndex(zone => zone.id === zoneId);
  const G = state.config.goods.length;
  let total = 0;
  state.config.goods.forEach((good, g) => {
    if (good.sectorId !== sectorId) return;
    const base = ((z * G + g) * OWNERSHIP_COUNT + PUBLIC) * TIER_COUNT;
    for (let t = 0; t < TIER_COUNT; t++) total += state.firmLine.capacity[base + t];
  });
  return total;
}

for (const kind of ['7-good', '31-good'] as const satisfies readonly WorldKind[]) {
  for (const scenario of SCENARIOS) {
    test(`horizon ${kind}: ${scenario.name} stays consistent and stable at 52, 104 and 156 weeks`, () => {
      const state = freshWorld(kind);
      const stats = newStats();
      const start = { gdp: 0 };
      let week = 1;
      for (const horizon of HORIZONS) {
        play(state, kind, scenario, week, horizon, stats, start);
        week = horizon + 1;
        const label = `${kind}, ${scenario.name}, week ${horizon}`;
        checkConsistent(state, stats, label);
        checkSane(scenario, stats, label);
      }
      if (scenario.name.startsWith('capacity destruction')) assert.ok(stats.gdpRatio > stats.gdpLow + 0.02, `output recovers from its low (${stats.gdpLow} → ${stats.gdpRatio})`);
      if (scenario.name.startsWith('fiscal crisis')) assert.equal(stats.defaults, 2, 'both declared defaults happen');
      if (scenario.name.startsWith('energy shock') || scenario.name.startsWith('state intervention')) assert.equal(stats.defaults + stats.regimeChanges, 0, 'no default or regime change');
    });
  }
}

test('horizon: every 7-good scenario saved and restored at weeks 52 and 104 ends bit-identical to the uninterrupted game', () => {
  for (const scenario of SCENARIOS) {
    const straight = freshWorld('7-good');
    play(straight, '7-good', scenario, 1, 156);
    let restored = freshWorld('7-good');
    play(restored, '7-good', scenario, 1, 52);
    restored = saveAndRestore(restored);
    play(restored, '7-good', scenario, 53, 104);
    restored = saveAndRestore(restored);
    play(restored, '7-good', scenario, 105, 156);
    assert.equal(hashEconomy(restored), hashEconomy(straight), scenario.name);
  }
});

test('horizon: the combined 31-good game is deterministic and survives save/restore at weeks 52 and 104', () => {
  const scenario = SCENARIOS[SCENARIOS.length - 1];
  const first = freshWorld('31-good');
  play(first, '31-good', scenario, 1, 156);
  const second = freshWorld('31-good');
  play(second, '31-good', scenario, 1, 52);
  const restored = saveAndRestore(second);
  play(restored, '31-good', scenario, 53, 104);
  const restoredAgain = saveAndRestore(restored);
  play(restoredAgain, '31-good', scenario, 105, 156);
  assert.equal(hashEconomy(restoredAgain), hashEconomy(first));
});

test('horizon: in-game nationalisation and privatisation really change ownership, in both worlds', () => {
  const scenario = SCENARIOS.find(s => s.name.startsWith('state intervention'))!;
  for (const kind of ['7-good', '31-good'] as const) {
    const state = freshWorld(kind);
    play(state, kind, scenario, 1, 14);
    const before = publicCapacity(state, 'norland-core', 'heavy_industry');
    play(state, kind, scenario, 15, 15);
    const nationalised = publicCapacity(state, 'norland-core', 'heavy_industry');
    assert.ok(nationalised > before + 1e-6, `${kind}: public capacity rises (${before} → ${nationalised})`);
    play(state, kind, scenario, 16, 89);
    const beforeSale = publicCapacity(state, 'norland-core', 'heavy_industry');
    play(state, kind, scenario, 90, 90);
    const sold = publicCapacity(state, 'norland-core', 'heavy_industry');
    assert.ok(sold < beforeSale - 1e-6, `${kind}: public capacity falls after privatisation (${beforeSale} → ${sold})`);
  }
});

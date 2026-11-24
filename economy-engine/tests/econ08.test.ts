/**
 * ECON-08: opt-in starting balance sheet (WorldSpec.holdStartingDebt) and starting average rate
 * (CountrySpec.effectiveRate). Worlds that use neither build exactly as before.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceEconomyInPlace, AUDIT_TOLERANCE, autopilotCommands, createEconomy, createTestWorldSpec, hashEconomy } from '../src/index.ts';
import type { EconomyState, WorldSpec } from '../src/index.ts';
import { worldSpecFromGame, fictionalGameWorld } from '../src/integration/index.ts';

const ratio = (s: EconomyState, c: number) => (s.country.debt[c] + s.country.cbStateLoans[c]) / (52 * s.country.gdp[c]);
const bondsOf = (s: EconomyState, c: number) => {
  let total = 0;
  for (let z = 0; z < s.zones.length; z++) total += s.bonds[z * s.countries.length + c];
  return total;
};

test('without the ECON-08 options a world builds exactly as before (fictional and Meridian worlds)', () => {
  const fictional = worldSpecFromGame(fictionalGameWorld());
  assert.equal(hashEconomy(createEconomy({ ...fictional, holdStartingDebt: false })), hashEconomy(createEconomy(fictional)));
  const meridian = createTestWorldSpec();
  assert.equal(hashEconomy(createEconomy({ ...meridian, holdStartingDebt: false })), hashEconomy(createEconomy(meridian)));
});

test('the defect: without the hold, settling prices moves every starting debt ratio away from the one requested', () => {
  const spec = createTestWorldSpec();
  const s = createEconomy(spec);
  const moved = spec.countries.filter((c, i) => Math.abs(ratio(s, i) - (c.debtToGdp ?? 0.5)) > 0.01).length;
  assert.ok(moved >= spec.countries.length / 2, `${moved} of ${spec.countries.length} countries moved by more than 1 pp`);
});

test('holdStartingDebt: every state starts with exactly the requested debt ratio, bonds equal debt, money is conserved', () => {
  const spec: WorldSpec = { ...createTestWorldSpec(), holdStartingDebt: true };
  spec.countries[0].debtToGdp = 1.3;
  spec.countries[2].debtToGdp = 0.05;
  const s = createEconomy(spec);
  spec.countries.forEach((c, i) => {
    assert.ok(Math.abs(ratio(s, i) - (c.debtToGdp ?? 0.5)) < 1e-9, `${c.id}: ${ratio(s, i)} vs ${c.debtToGdp}`);
    assert.ok(Math.abs(bondsOf(s, i) - s.country.debt[i]) <= 1e-9 * Math.max(1, s.country.debt[i]), `${c.id}: bonds differ from debt`);
  });
  const all = s.countries.map(c => c.id);
  for (let week = 0; week < 8; week++) {
    const report = advanceEconomyInPlace(s, { commands: autopilotCommands(s, all), effects: [] }, { audit: true, report: 'none' });
    assert.ok(Math.abs(report.audit.moneyError) < AUDIT_TOLERANCE, `money error ${report.audit.moneyError}`);
    assert.ok(Math.abs(report.audit.bondError) < 1e-9, `bond error ${report.audit.bondError}`);
    // Money in circulation equals money issued by all central banks: the hold's transfers created or destroyed none.
    assert.ok(Math.abs(report.audit.issuedError) < 1e-9, `issued error ${report.audit.issuedError}`);
  }
});

test('effectiveRate sets the starting average rate on the stock; refinancing still moves it towards the market rate', () => {
  const spec: WorldSpec = { ...createTestWorldSpec(), holdStartingDebt: true };
  spec.countries[1].effectiveRate = 0.01;
  const s = createEconomy(spec);
  assert.ok(Math.abs(s.country.averageRate[1] - 0.01) < 1e-12);
  assert.ok(s.country.marketRate[1] > 0.02, 'the market rate on new debt is not the stock\'s rate');
  const all = s.countries.map(c => c.id);
  for (let week = 0; week < 52; week++) advanceEconomyInPlace(s, { commands: autopilotCommands(s, all), effects: [] }, { report: 'none' });
  assert.ok(s.country.averageRate[1] > 0.012 && s.country.averageRate[1] < s.country.marketRate[1], `average ${s.country.averageRate[1]}, market ${s.country.marketRate[1]}`);
});

test('invalid ECON-08 inputs are refused', () => {
  const negative = createTestWorldSpec();
  negative.countries[0].effectiveRate = -0.01;
  assert.throws(() => createEconomy(negative), /effectiveRate/);
  const tooHigh = createTestWorldSpec();
  tooHigh.countries[0].effectiveRate = 0.9;
  assert.throws(() => createEconomy(tooHigh), /effectiveRate/);
  assert.throws(() => createEconomy({ ...createTestWorldSpec(), holdStartingDebt: 'yes' as unknown as boolean }), /holdStartingDebt/);
});

test('market pressure remains: a highly indebted state that keeps running deficits loses market access', () => {
  const spec: WorldSpec = { ...createTestWorldSpec(), holdStartingDebt: true };
  spec.countries[0].debtToGdp = 1.45;
  const s = createEconomy(spec);
  const others = s.countries.map(c => c.id).filter(id => id !== 'norland');
  let lost = -1;
  for (let week = 1; week <= 156 && lost < 0; week++) {
    const commands = [...autopilotCommands(s, others), ...(week === 1 ? [
      { type: 'set-spending' as const, countryId: 'norland', category: 'social' as const, share: 0.35 },
      { type: 'set-tax' as const, countryId: 'norland', tax: 'income' as const, rate: 0.05 },
    ] : [])];
    const report = advanceEconomyInPlace(s, { commands, effects: [] }, { report: 'none' });
    if (report.events.some(e => e.type === 'market-access-lost' && e.countryId === 'norland')) lost = week;
  }
  assert.ok(lost > 0, 'access was never lost');
});

test('the hold is deterministic', () => {
  const spec: WorldSpec = { ...createTestWorldSpec(7), holdStartingDebt: true };
  spec.countries[3].effectiveRate = 0.02;
  assert.equal(hashEconomy(createEconomy(spec)), hashEconomy(createEconomy(JSON.parse(JSON.stringify(spec)))));
});

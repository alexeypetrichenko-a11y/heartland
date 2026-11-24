/**
 * WORLD-03-FINAL opt-in inputs: WorldSpec.maxStartingDebt, CountrySpec.economicAggregate and
 * CountrySpec.bankProfitToHouseholds. Worlds that use none of them build and play exactly as before.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceEconomyInPlace, AUDIT_TOLERANCE, autopilotCommands, createEconomy, createTestWorldSpec, deserializeEconomy, hashEconomy, serializeEconomy } from '../src/index.ts';
import type { EconomyCommand, EconomyState, WorldSpec } from '../src/index.ts';
import { fictionalGameWorld, worldSpecFromGame } from '../src/integration/index.ts';

const play = (s: EconomyState, weeks: number, extra: (week: number) => EconomyCommand[] = () => []) => {
  const all = s.countries.map(c => c.id);
  const reports = [];
  for (let week = 1; week <= weeks; week++) {
    reports.push(advanceEconomyInPlace(s, { commands: [...autopilotCommands(s, all), ...extra(week)], effects: [] }, { audit: true, report: 'full' }));
  }
  return reports;
};

test('without the new inputs (or with neutral values) worlds build and play exactly as before', () => {
  const fictional = worldSpecFromGame(fictionalGameWorld());
  assert.equal(hashEconomy(createEconomy(fictional)), hashEconomy(createEconomy({
    ...fictional, countries: fictional.countries.map(c => ({ ...c, economicAggregate: false, bankProfitToHouseholds: 0 })),
  })));
  const a = createEconomy(createTestWorldSpec()), b = createEconomy({ ...createTestWorldSpec(), maxStartingDebt: 1.5 });
  assert.equal(hashEconomy(a), hashEconomy(b));
  play(a, 6); play(b, 6);
  assert.equal(hashEconomy(a), hashEconomy(b));
});

test('maxStartingDebt: a world may start above the default limit only when it says so, within 1.5-3', () => {
  const spec = createTestWorldSpec();
  spec.countries[0].debtToGdp = 1.64;
  assert.throws(() => createEconomy(spec), /debtToGdp/);
  const s = createEconomy({ ...spec, maxStartingDebt: 2, holdStartingDebt: true });
  const ratio = (s.country.debt[0] + s.country.cbStateLoans[0]) / (52 * s.country.gdp[0]);
  assert.ok(Math.abs(ratio - 1.64) < 1e-9, `starting ratio ${ratio}`);
  assert.throws(() => createEconomy({ ...createTestWorldSpec(), maxStartingDebt: 3.5 }), /maxStartingDebt/);
  assert.throws(() => createEconomy({ ...createTestWorldSpec(), maxStartingDebt: 1.2 }), /maxStartingDebt/);
});

test('economicAggregate: a bloc keeps its economy but has no unrest, strikes or regime change; real countries keep theirs', () => {
  const spec: WorldSpec = createTestWorldSpec();
  spec.countries[0].economicAggregate = true;                  // norland: an aggregate
  const s = createEconomy(spec);
  const start = s.country.stability[0];
  // Crushing taxes in both the aggregate and a normal country (sundara).
  const squeeze = (week: number) => (week === 1 ? ['norland', 'sundara'].flatMap(id => [
    { type: 'set-tax' as const, countryId: id, tax: 'income' as const, rate: 0.7 },
    { type: 'set-tax' as const, countryId: id, tax: 'consumption' as const, rate: 0.6 },
    { type: 'set-spending' as const, countryId: id, category: 'social' as const, share: 0 },
  ]) : []);
  const reports = play(s, 80, squeeze);
  const events = reports.flatMap(r => r.events);
  assert.equal(s.country.stability[0], start, 'aggregate stability stays at its starting value');
  assert.ok(!events.some(e => (e.type === 'unrest-started' || e.type === 'regime-change') && e.countryId === 'norland'), 'no political events for the aggregate');
  assert.ok(reports.every(r => r.countries[0].unrestTier === 0));
  assert.ok(reports.at(-1)!.countries[0].gdpReal > 0, 'the aggregate still produces');
  assert.ok(events.some(e => e.type === 'unrest-started' && e.countryId === 'sundara') || s.country.stability[1] < 40, 'a normal country still feels the squeeze');
});

test('bankProfitToHouseholds: the bank payout goes to households (taxed like dividends); money is conserved', () => {
  const base = createTestWorldSpec();
  const routed: WorldSpec = { ...createTestWorldSpec(), countries: createTestWorldSpec().countries.map(c => ({ ...c, bankProfitToHouseholds: 1 })) };
  const a = createEconomy(base), b = createEconomy(routed);
  const ra = play(a, 20), rb = play(b, 20);
  const payoutA = ra.reduce((sum, r) => sum + r.countries.reduce((x, c) => x + c.budget.centralBankProfit, 0), 0);
  const payoutB = rb.reduce((sum, r) => sum + r.countries.reduce((x, c) => x + c.budget.centralBankProfit, 0), 0);
  assert.ok(payoutA > 0, 'the default world pays bank profit to treasuries');
  assert.equal(payoutB, 0, 'with share 1 treasuries receive no bank profit');
  for (const r of rb) {
    assert.ok(Math.abs(r.audit.moneyError) < AUDIT_TOLERANCE, `money ${r.audit.moneyError}`);
    assert.ok(Math.abs(r.audit.issuedError) < 1e-9, `issued ${r.audit.issuedError}`);
  }
});

test('the new country fields survive save and restore, and replay identically', () => {
  const spec: WorldSpec = createTestWorldSpec();
  spec.countries[2].economicAggregate = true;
  spec.countries[3].bankProfitToHouseholds = 0.5;
  const s = createEconomy(spec);
  play(s, 3);
  const copy = deserializeEconomy(serializeEconomy(s));
  assert.equal(copy.countries[2].aggregate, true);
  assert.equal(copy.countries[3].bankProfitToHouseholds, 0.5);
  play(s, 5); play(copy, 5);
  assert.equal(hashEconomy(copy), hashEconomy(s));
});

test('invalid inputs are refused', () => {
  const a = createTestWorldSpec(); a.countries[0].bankProfitToHouseholds = 1.5;
  assert.throws(() => createEconomy(a), /bankProfitToHouseholds/);
  const b = createTestWorldSpec(); (b.countries[0] as { economicAggregate?: unknown }).economicAggregate = 'yes';
  assert.throws(() => createEconomy(b), /economicAggregate/);
});

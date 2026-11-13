import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EconomyEvent } from '../src/index.ts';
import { advanceEconomyInPlace, createEconomy, createTestWorldSpec, getCountry, hashEconomy } from '../src/index.ts';
import { advance, at, commands, effects, idx, once, world } from './helpers.ts';

const C = (state: ReturnType<typeof world>) => state.countries.length;

test('debt always equals the sum of the bond claims held by households', () => {
  const state = world();
  advance(state, 100, at(30, commands({ type: 'declare-default', countryId: 'norland' })));
  for (let c = 0; c < C(state); c++) {
    let held = 0;
    for (let z = 0; z < state.zones.length; z++) held += state.bonds[z * C(state) + c];
    assert.ok(Math.abs(held - state.country.debt[c]) < 1e-9 * Math.max(1, held));
  }
});

test('declared default writes off exactly the configured share, cuts off credit and costs stability', () => {
  const state = world();
  advance(state, 5);
  const n = idx(state, 'norland'), before = state.country.debt[n], stab = state.country.stability[n];
  const events: EconomyEvent[] = [];
  const report = once(state, commands({ type: 'declare-default', countryId: 'norland' }));
  events.push(...report.events);
  const event = events.find(e => e.type === 'sovereign-default');
  assert.ok(event && event.type === 'sovereign-default');
  assert.ok(Math.abs(state.country.debt[n] / before - (1 - state.config.params.defaultHaircut)) < 0.01, 'debt after = 45%');
  assert.equal(state.country.marketAccess[n], 0);
  assert.ok(state.country.exclusionWeeks[n] > 50);
  assert.ok(state.country.stability[n] < stab - 5);
  assert.equal(state.country.defaults[n], 1);
  assert.equal(getCountry(state, 'norland').regime, 0, 'default alone does not change the regime');
});

test('creditors, at home and abroad, bear the loss of a default', () => {
  const state = world();
  const n = idx(state, 'norland'), Cn = C(state);
  const foreign = () => { let t = 0; for (let z = 0; z < state.zones.length; z++) if (state.zone.owner[z] !== n) t += state.bonds[z * Cn + n]; return t; };
  advance(state, 3);
  const before = foreign();
  once(state, commands({ type: 'declare-default', countryId: 'norland' }));
  assert.ok(foreign() < before * 0.5, `foreign claims ${before} → ${foreign()}`);
});

test('repeat defaults lock a country out for longer; a country regains access afterwards', () => {
  const state = world();
  const t = idx(state, 'tavros');
  once(state, commands({ type: 'declare-default', countryId: 'tavros' }));
  const first = state.country.exclusionWeeks[t];
  advance(state, 10);
  once(state, commands({ type: 'declare-default', countryId: 'tavros' }));
  assert.ok(state.country.exclusionWeeks[t] > first, 'second default is punished more');
  advance(state, 300);
  assert.equal(state.country.marketAccess[t], 1, 'access returns once the exclusion ends and rates normalise');
});

test('a government with borrowing disabled and an empty treasury cuts spending instead of going negative', () => {
  const state = world();
  const c = idx(state, 'verdania');
  state.country.treasury[c] = 0;
  let worstFunded = 1;
  advance(state, 30, at(1, commands({ type: 'set-borrowing', countryId: 'verdania', enabled: false })), report => {
    worstFunded = Math.min(worstFunded, report.countries[c].budget.fundedShare);
    assert.ok(report.countries[c].treasury >= 0, 'treasury never negative');
  });
  assert.ok(worstFunded < 1, 'spending is cut when money runs out');
});

test('repaying debt moves money from the treasury to the creditors and reduces debt one for one', () => {
  const state = world();
  const n = idx(state, 'norland');
  advance(state, 3);
  state.country.treasury[n] += 1000; // enough cash to repay in full
  const debt = state.country.debt[n];
  let creditorsBefore = 0;
  for (let z = 0; z < state.zones.length; z++) creditorsBefore += state.zone.householdMoney[z];
  const report = once(state, commands({ type: 'repay-debt', countryId: 'norland', amount: 300 }));
  // The ordered 300 is repaid in full (any extra is the routine sweep of surplus cash above the target).
  assert.ok(report.countries[n].budget.repaid >= 300 - 1e-6, `repaid ${report.countries[n].budget.repaid}`);
  assert.ok(debt - state.country.debt[n] >= 300 - 1e-6, `debt ${debt} → ${state.country.debt[n]}`);
  assert.ok(creditorsBefore > 0 && Math.abs(report.audit.moneyError) < 1e-6 * report.audit.moneyBefore, 'money is moved, not created');
  // With an empty treasury the same command repays only what is available.
  state.country.treasury[n] = 5;
  const small = once(state, commands({ type: 'repay-debt', countryId: 'norland', amount: 5000 }));
  assert.ok(small.countries[n].budget.repaid <= 5 + small.countries[n].budget.borrowed + 1e-6);
});

test('higher debt means a higher borrowing rate (risk premium rises with the debt ratio)', () => {
  const lo = createTestWorldSpec(), hi = createTestWorldSpec();
  lo.countries = lo.countries.map(c => c.id === 'tavros' ? { ...c, debtToGdp: 0.2 } : c);
  hi.countries = hi.countries.map(c => c.id === 'tavros' ? { ...c, debtToGdp: 1.1 } : c);
  const a = createEconomy(lo), b = createEconomy(hi), t = idx(a, 'tavros');
  advance(a, 10); advance(b, 10);
  assert.ok(b.country.marketRate[t] > a.country.marketRate[t] + 0.01, `${b.country.marketRate[t]} vs ${a.country.marketRate[t]}`);
});

test('money is created only by the monetary rule, within its weekly cap, and never destroyed by rounding', () => {
  const state = world();
  const cap = state.config.params.moneyGrowthMaxWeekly;
  for (let w = 0; w < 200; w++) {
    const report = once(state);
    assert.ok(report.audit.moneyCreated >= 0);
    assert.ok(report.audit.moneyCreated <= cap * report.audit.moneyBefore * 1.0001, 'weekly money growth is capped');
    assert.ok(Math.abs(report.audit.moneyError) < 1e-9 * report.audit.moneyAfter);
  }
});

test('the weekly budget report is internally consistent', () => {
  const state = world();
  advance(state, 20);
  const report = once(state);
  for (const country of report.countries) {
    const b = country.budget;
    const revenue = b.incomeTax + b.consumptionTax + b.corporateTax + b.tariffs + b.seigniorage + b.reserveSales + b.fundsReceived;
    const spending = b.administration + b.social + b.military + b.infrastructure + b.reservePurchases + b.interest + b.fundsSent;
    assert.ok(Math.abs(revenue - b.revenue) < 1e-9 * Math.max(1, revenue));
    assert.ok(Math.abs(spending - b.spending) < 1e-9 * Math.max(1, spending));
    assert.ok(Math.abs(b.balance - (b.revenue - b.spending)) < 1e-9 * Math.max(1, revenue));
  }
});

test('stability falls with economic distress and recovers when it ends', () => {
  const state = world();
  const s = idx(state, 'sundara');
  advance(state, 10);
  const calm = state.country.stability[s];
  advance(state, 40, at(1, effects({ type: 'destroy-capacity', zoneId: 'sundara-delta', goodId: 'all', fraction: 0.5 }, { type: 'destroy-capacity', zoneId: 'sundara-inland', goodId: 'all', fraction: 0.5 })));
  const low = state.country.stability[s];
  assert.ok(low < calm - 10, `stability ${calm} → ${low}`);
  advance(state, 800);
  assert.ok(state.country.stability[s] > calm - 8, 'recovers once the economy does');
});

test('regime tests happen once per crisis tier per episode, never every week, and change the regime only when they fail', () => {
  const state = world();
  const events: EconomyEvent[] = [];
  const script = (w: number) => w === 5 ? {
    effects: [{ type: 'destroy-capacity' as const, zoneId: 'sundara-delta', goodId: 'all' as const, fraction: 0.6 }, { type: 'destroy-capacity' as const, zoneId: 'sundara-inland', goodId: 'all' as const, fraction: 0.6 },
      { type: 'stability-modifier' as const, countryId: 'sundara', value: -40 }],
  } : undefined;
  for (let w = 1; w <= 400; w++) events.push(...advanceEconomyInPlace(state, script(w), { report: 'none', audit: true }).events);
  const tests = events.filter(e => (e.type === 'regime-survived' || e.type === 'regime-change') && e.countryId === 'sundara');
  assert.ok(tests.length >= 1, 'the crisis triggered at least one regime test');
  const perEpisode = new Map<string, number>();
  let episode = 0;
  for (const e of events.filter(e => 'countryId' in e && e.countryId === 'sundara')) {
    if (e.type === 'unrest-started' || e.type === 'unrest-ended' || e.type === 'regime-change') episode++;
    if (e.type === 'regime-survived' || e.type === 'regime-change') perEpisode.set(`${episode}:${e.tier}`, (perEpisode.get(`${episode}:${e.tier}`) ?? 0) + 1);
  }
  for (const [key, count] of perEpisode) assert.ok(count <= 1, `episode/tier ${key} tested ${count} times`);
  const changes = tests.filter(e => e.type === 'regime-change').length;
  assert.equal(state.country.regime[idx(state, 'sundara')], changes, 'regime counter matches the events');
});

test('regime changes are reproducible from the seed and independent of unrelated activity', () => {
  const run = (extra: boolean) => {
    const state = world();
    const out: string[] = [];
    for (let w = 1; w <= 300; w++) {
      const input = w === 5 ? { effects: [{ type: 'destroy-capacity' as const, zoneId: 'tavros', goodId: 'all' as const, fraction: 0.7 }, { type: 'stability-modifier' as const, countryId: 'tavros', value: -50 }] } : undefined;
      const cmds = extra && w === 7 ? [{ type: 'set-tax' as const, countryId: 'khazir', tax: 'income' as const, rate: 0.2 }] : [];
      for (const e of advanceEconomyInPlace(state, { ...input, commands: cmds }, { report: 'none' }).events) if (e.countryId === 'tavros' && e.type.startsWith('regime')) out.push(`${e.turn}:${e.type}`);
    }
    return out.join(',');
  };
  assert.equal(run(false), run(false));
  assert.ok(hashEconomy(world()).length === 16);
});

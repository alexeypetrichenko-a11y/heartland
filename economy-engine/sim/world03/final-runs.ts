/**
 * WORLD-03-FINAL: before/after budget reconciliation, baseline runs and stress runs on the europe-2023 package.
 *
 *   node --experimental-strip-types economy-engine/sim/world03/final-runs.ts
 *
 * AFTER  = scenarios/europe-2023/1.0.0-draft.2/week1.session.json (the package itself, loaded with loadEconomySession).
 * BEFORE = 1.0.0-draft.1 (week1.session.json) and the ECON-08 re-calibration (build-econ08/week1.economy.json).
 *
 * 1. Budget at week 2 (every country on the autopilot), as % of GDP: taxes, tariffs, bank profit, dividends, the four
 *    spending lines, interest and net lending on the national-accounts basis (financial and asset transactions out).
 * 2. Baselines: weeks 2-156 with every country on the autopilot; every country's debt, balance, rates, access,
 *    defaults, stability, unrest and regime at weeks 52/104/156, and every sovereign or political event. The draft.2
 *    baseline runs twice (determinism). The ECON-08 baseline runs once for the bloc comparison.
 * 3. Stress on draft.2 (the stressed country gets no autopilot): mismanagement, high taxes, austerity, a passive
 *    player, a deliberate default and repeated defaults, and reckless Greece/Italy over 312 weeks.
 * Writes docs/world/WORLD-03-FINAL-data/runs.json. Money and bond audits run every week.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { advanceEconomy, autopilotCommands, cloneEconomy, deserializeEconomy, hashEconomy } from '../../src/index.ts';
import type { EconomyCommand, EconomyState, TurnReport } from '../../src/index.ts';
import { loadEconomySession } from '../../src/integration/index.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const PKG = resolve(ROOT, 'scenarios/europe-2023');
const text = (p: string) => readFileSync(resolve(PKG, p), 'utf8');
const budgetDoc = JSON.parse(text('build/budget.json')).countries;
const REAL = Object.keys(budgetDoc);
const CHECKPOINTS = [52, 104, 156];

function load(which: 'draft.2' | 'draft.1' | 'econ08'): EconomyState {
  if (which === 'econ08') return deserializeEconomy(text('build-econ08/week1.economy.json'));
  return loadEconomySession(text(`1.0.0-${which}/week1.session.json`)).state;
}

type Step = { state: EconomyState; report: TurnReport };
const step = (s: EconomyState, commands: EconomyCommand[], full: boolean): Step =>
  advanceEconomy(s, { commands, effects: [] }, { audit: true, report: full ? 'full' : 'none' });

function budgetRow(s: EconomyState, report: TurnReport, id: string) {
  const c = s.countries.findIndex(x => x.id === id);
  const r = report.countries[c];
  const b = r.budget;
  const g = r.gdpNominal;
  const pct = (x: number) => +(100 * x / g).toFixed(2);
  const revenue = b.revenue - b.moneyCreation - b.reserveSales - b.ownershipSales;
  const spending = b.spending - b.reservePurchases - b.ownershipPurchases - b.centralBankCapital;
  return {
    taxes: pct(b.incomeTax + b.consumptionTax + b.corporateTax), tariffs: pct(b.tariffs), bankProfit: pct(b.centralBankProfit), dividends: pct(b.firmDividends),
    revenue: pct(revenue), administration: pct(b.administration), social: pct(b.social), military: pct(b.military), infrastructure: pct(b.infrastructure),
    interest: pct(b.interest), otherSpending: pct(spending - b.administration - b.social - b.military - b.infrastructure - b.interest), spending: pct(spending),
    netLending: pct(revenue - spending),
  };
}

function snap(s: EconomyState, report: TurnReport | null, id: string) {
  const c = s.countries.findIndex(x => x.id === id);
  const k = s.country;
  const r = report?.countries[c];
  return {
    debtToGdp: +((k.debt[c] + k.cbStateLoans[c]) / (52 * k.gdp[c])).toFixed(3), averageRate: +k.averageRate[c].toFixed(4), marketRate: +k.marketRate[c].toFixed(4),
    balanceToGdp: r ? +((r.budget.revenue - r.budget.spending) / r.gdpNominal).toFixed(3) : null, access: k.marketAccess[c], defaults: k.defaults[c],
    stability: +k.stability[c].toFixed(1), unrestTier: k.unrestTier[c], regime: k.regime[c], realGdpIndex: r ? +(r.gdpReal / s.baseline.realGdp[c]).toFixed(3) : null,
  };
}

type Plan = { name: string; country: string | null; weeks?: number; commands: (s: EconomyState, week: number, id: string) => EconomyCommand[] };
const shift = (s: EconomyState, id: string, changes: Record<string, number>): EconomyCommand[] => {
  const c = s.countries.findIndex(x => x.id === id);
  const k = s.country;
  const now: Record<string, number> = { income: k.taxIncome[c], consumption: k.taxConsumption[c], corporate: k.taxCorporate[c],
    social: k.spendSocial[c], administration: k.spendAdministration[c], infrastructure: k.spendInfrastructure[c], military: k.spendMilitary[c] };
  return Object.entries(changes).map(([key, delta]): EconomyCommand => {
    const value = Math.max(0, now[key] + delta);
    return ['income', 'consumption', 'corporate'].includes(key)
      ? { type: 'set-tax', countryId: id, tax: key as 'income', rate: Math.min(0.7, value) }
      : { type: 'set-spending', countryId: id, category: key as 'social', share: Math.min(0.5, value) };
  });
};
const PLANS: Plan[] = [
  { name: 'baseline', country: null, commands: () => [] },
  { name: 'baseline-repeat', country: null, commands: () => [] },
  { name: 'passive-tur', country: 'tur', commands: () => [] },
  { name: 'mismanage-ita', country: 'ita', commands: (s, w, id) => (w === 2 ? shift(s, id, { social: 0.08, administration: 0.04, income: -0.05 }) : []) },
  { name: 'mismanage-gbr', country: 'gbr', commands: (s, w, id) => (w === 2 ? shift(s, id, { social: 0.08, administration: 0.04, income: -0.05 }) : []) },
  { name: 'reckless-ita', country: 'ita', weeks: 312, commands: (s, w, id) => (w === 2 ? shift(s, id, { social: 0.15, administration: 0.10, income: -0.10 }) : []) },
  { name: 'reckless-grc', country: 'grc', weeks: 312, commands: (s, w, id) => (w === 2 ? shift(s, id, { social: 0.10, administration: 0.08, income: -0.08 }) : []) },
  { name: 'high-tax-fra', country: 'fra', commands: (s, w, id) => (w === 2 ? shift(s, id, { income: 0.15, consumption: 0.05 }) : []) },
  { name: 'high-tax-pol', country: 'pol', commands: (s, w, id) => (w === 2 ? shift(s, id, { income: 0.20, consumption: 0.08, corporate: 0.10 }) : []) },
  { name: 'austerity-grc', country: 'grc', commands: (s, w, id) => (w === 2 ? shift(s, id, { social: -0.06, administration: -0.06, infrastructure: -0.02 }) : []) },
  { name: 'default-ita', country: 'ita', commands: (_s, w, id) => (w === 10 ? [{ type: 'declare-default', countryId: id }] : []) },
  { name: 'default-grc', country: 'grc', commands: (_s, w, id) => (w === 10 ? [{ type: 'declare-default', countryId: id }] : []) },
  { name: 'repeat-ita', country: 'ita', commands: (_s, w, id) => ([10, 60, 110].includes(w) ? [{ type: 'declare-default', countryId: id }] : []) },
  { name: 'repeat-tur', country: 'tur', commands: (_s, w, id) => ([10, 60, 110].includes(w) ? [{ type: 'declare-default', countryId: id }] : []) },
];
const EVENT = /sovereign-default|market-access-lost|market-access-restored|regime-change|unrest-started/;

function run(first: EconomyState, plan: Plan, everyone: boolean) {
  let state = cloneEconomy(first);
  const all = state.countries.map(c => c.id);
  const horizon = plan.weeks ?? 156;
  const watch = everyone ? all : [plan.country!];
  const path: Record<string, Record<number, unknown>> = Object.fromEntries(watch.map(id => [id, { 1: snap(state, null, id) }]));
  const events: Record<string, Record<string, number[]>> = {};
  let worstMoney = 0, worstBond = 0, worstIssued = 0;
  const t0 = performance.now();
  for (let week = 2; week <= horizon; week++) {
    const steered = plan.country ? all.filter(x => x !== plan.country) : all;
    const id = plan.country ?? all[0];
    const full = CHECKPOINTS.includes(week) || week === horizon;
    const r = step(state, [...autopilotCommands(state, steered), ...plan.commands(state, week, id)], full);
    state = r.state;
    worstMoney = Math.max(worstMoney, Math.abs(r.report.audit.moneyError));
    worstBond = Math.max(worstBond, Math.abs(r.report.audit.bondError));
    worstIssued = Math.max(worstIssued, Math.abs(r.report.audit.issuedError));
    for (const e of r.report.events as unknown as { type: string; countryId?: string }[]) {
      if (EVENT.test(e.type)) ((events[e.type] ??= {})[e.countryId ?? '?'] ??= []).push(week);
    }
    if (full) for (const w of watch) path[w][week] = snap(state, r.report, w);
  }
  return { country: plan.country, weeks: horizon, seconds: +((performance.now() - t0) / 1000).toFixed(1), path, events,
           audit: { worstMoneyError: worstMoney, worstBondError: worstBond, worstIssuedError: worstIssued }, finalHash: hashEconomy(state) };
}

function main() {
  const out: Record<string, unknown> = {};
  // 1. Budget before / after at week 2.
  const budget: Record<string, Record<string, unknown>> = {};
  for (const which of ['draft.1', 'econ08', 'draft.2'] as const) {
    const s = load(which);
    const r = step(s, autopilotCommands(s, s.countries.map(c => c.id)), true);
    budget[which] = Object.fromEntries(REAL.map(id => [id, budgetRow(r.state, r.report, id)]));
  }
  budget.observed = Object.fromEntries(REAL.map(id => [id, {
    revenue: +(100 * budgetDoc[id].observed.revenue).toFixed(2), spending: +(100 * budgetDoc[id].observed.expenditure).toFixed(2),
    netLending: +(100 * budgetDoc[id].observed.net_lending).toFixed(2), taxes: +(100 * budgetDoc[id].observed.taxes_and_contributions).toFixed(2),
    dividends: +(100 * budgetDoc[id].observed.dividends_D42).toFixed(2), interest: +(100 * budgetDoc[id].observed.interest_paid).toFixed(2),
    tariffs: +(100 * budgetDoc[id].targets.tariff_revenue).toFixed(3),
  }]));
  out.budget = budget;
  for (const id of REAL) {
    const b = budget as Record<string, Record<string, { netLending: number; bankProfit?: number; dividends?: number; tariffs?: number }>>;
    console.log(`${id}: net lending observed ${b.observed[id].netLending} | draft.1 ${b['draft.1'][id].netLending} | ECON-08 ${b.econ08[id].netLending} | draft.2 ${b['draft.2'][id].netLending}`
      + ` | bank profit ${b.econ08[id].bankProfit} -> ${b['draft.2'][id].bankProfit} | dividends ${b.econ08[id].dividends} -> ${b['draft.2'][id].dividends} | tariffs ${b.econ08[id].tariffs} -> ${b['draft.2'][id].tariffs}`);
  }
  // 2-3. Runs.
  const after = load('draft.2');
  const runs: Record<string, unknown> = {};
  for (const plan of PLANS) {
    const result = run(after, plan, plan.country === null);
    runs[plan.name] = result;
    const ev = JSON.stringify(result.events);
    console.log(`${plan.name.padEnd(16)} ${result.seconds}s audit ${result.audit.worstMoneyError.toExponential(1)}/${result.audit.worstBondError.toExponential(1)}/${result.audit.worstIssuedError.toExponential(1)} events ${ev.slice(0, 400)}`);
    if (plan.country) {
      const p = result.path[plan.country][result.weeks] as ReturnType<typeof snap>;
      console.log(`   ${plan.country} week ${result.weeks}: debt ${p.debtToGdp} rate ${p.marketRate} access ${p.access} defaults ${p.defaults} regime ${p.regime} stability ${p.stability} gdp ${p.realGdpIndex}`);
    }
  }
  out.runs = runs;
  out.deterministic = (runs.baseline as { finalHash: string }).finalHash === (runs['baseline-repeat'] as { finalHash: string }).finalHash;
  const before = run(load('econ08'), { name: 'baseline-econ08', country: null, commands: () => [] }, true);
  out.baselineEcon08 = before;
  console.log(`deterministic ${out.deterministic}; ECON-08 baseline events ${JSON.stringify(before.events).slice(0, 400)}`);
  const OUT = resolve(ROOT, 'docs/world/WORLD-03-FINAL-data');
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, 'runs.json'), JSON.stringify(out, null, 1) + '\n');
}

main();

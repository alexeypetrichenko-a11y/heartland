/**
 * ECON-08: compare the alternatives on the European scenario (WORLD-03 1.0.0-draft.1 inputs).
 *
 *   node --experimental-strip-types economy-engine/sim/econ08/evaluate.ts [--policy <calibration-report.json>] [--out name]
 *
 * Variants (all on the same zone technology and country tax/spending inputs):
 *   base  the engine as in WORLD-03 (no option);
 *   A     scenario-specific sovereign financing from 2023 data: the spread parameters fitted to euro-area
 *         spreads (scenario config, no engine change) + CountrySpec.effectiveRate = interest paid / debt;
 *   B     WorldSpec.holdStartingDebt only;
 *   C     A + B.
 * For each: build, week 1 as createEconomySession resolves it (autopilot for every country), then 155 more weeks
 * with the autopilot for every country. Records week-1 debt, rates and interest against the 2023 data, the
 * sovereign events of 156 weeks, the debt path and the conservation audit of every week.
 * Writes docs/econ/ECON-08-data/<out>.json (default evaluate.json).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { advanceEconomy, autopilotCommands, createEconomy, hashEconomy } from '../../src/index.ts';
import type { EconomyState, WorldSpec } from '../../src/index.ts';
import { worldSpec } from '../world03/calibrate.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const args = process.argv.slice(2);
const option = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const calPath = resolve(ROOT, option('--policy') ?? 'scenarios/europe-2023/1.0.0-draft.1/calibration-report.json');
const outName = option('--out') ?? 'evaluate';
const only = option('--variants')?.split(',');
const financing = JSON.parse(readFileSync(resolve(ROOT, 'scenarios/europe-2023/build/financing.json'), 'utf8'));
const cal = JSON.parse(readFileSync(calPath, 'utf8'));
const technology: Record<string, number> = Object.fromEntries(cal.zones.map((z: { id: string; technology: number }) => [z.id, z.technology]));
const policy: Record<string, Record<string, number>> = {};
for (const f of cal.fiscal) {
  policy[f.id] = {};
  for (const r of f.rows) if (r.input !== null && r.input !== undefined) policy[f.id][r.field] = r.input;
}
const COUNTRIES = ['fra', 'deu', 'gbr', 'ita', 'pol', 'tur', 'irl', 'esp', 'nld', 'bel', 'che', 'aut', 'cze', 'nor', 'grc', 'bgr'];

export function financedSpec(technology: Record<string, number>, policy: Record<string, Record<string, number>>, a: boolean, b: boolean): WorldSpec {
  const pol: Record<string, Record<string, number>> = JSON.parse(JSON.stringify(policy));
  if (a) for (const [id, v] of Object.entries(financing.countries as Record<string, { effective_rate: number | null }>)) {
    if (v.effective_rate !== null && pol[id]) pol[id].effectiveRate = v.effective_rate;
  }
  const spec = worldSpec(technology, pol);
  if (a) spec.config = { ...spec.config!, params: { ...spec.config!.params, ...financing.fit.fitted_params } };
  if (b) spec.holdStartingDebt = true;
  return spec;
}

function view(s: EconomyState, report: ReturnType<typeof advanceEconomy>['report'] | null) {
  const out: Record<string, Record<string, number>> = {};
  for (const id of COUNTRIES) {
    const c = s.countries.findIndex(x => x.id === id);
    const k = s.country;
    const r = report?.countries[c];
    out[id] = {
      debtToGdp: (k.debt[c] + k.cbStateLoans[c]) / (52 * k.gdp[c]), averageRate: k.averageRate[c], marketRate: k.marketRate[c],
      interestToGdp: r ? r.budget.interest / r.gdpNominal : NaN, balanceToGdp: r ? (r.budget.revenue - r.budget.spending) / r.gdpNominal : NaN,
      marketAccess: k.marketAccess[c], stability: k.stability[c], defaults: k.defaults[c], regime: k.regime[c],
    };
  }
  return out;
}

function run(name: string, a: boolean, b: boolean) {
  const t0 = performance.now();
  let state = createEconomy(financedSpec(technology, policy, a, b));
  const buildSeconds = (performance.now() - t0) / 1000;
  const all = state.countries.map(c => c.id);
  const events: Record<string, Record<string, number[]>> = {};
  const checkpoints: Record<number, ReturnType<typeof view>> = { 0: view(state, null) };
  let worstMoney = 0, worstBond = 0, worstIssued = 0;
  for (let week = 1; week <= 156; week++) {
    const full = [1, 13, 26, 52, 104, 156].includes(week);
    const result = advanceEconomy(state, { commands: autopilotCommands(state, all), effects: [] }, { audit: true, report: full ? 'full' : 'none' });
    state = result.state;
    worstMoney = Math.max(worstMoney, Math.abs(result.report.audit.moneyError));
    worstBond = Math.max(worstBond, Math.abs(result.report.audit.bondError));
    worstIssued = Math.max(worstIssued, Math.abs(result.report.audit.issuedError));
    for (const e of result.report.events as unknown as { type: string; countryId?: string }[]) {
      if (!/sovereign-default|market-access-lost|regime-change|missed-payment/.test(e.type)) continue;
      ((events[e.type] ??= {})[e.countryId ?? '?'] ??= []).push(week);
    }
    if (full) checkpoints[week] = view(state, result.report);
  }
  const week1 = checkpoints[1];
  const comparison = COUNTRIES.map(id => {
    const f = financing.countries[id];
    const target = policy[id].debtToGdp ?? null;
    return {
      id, targetDebt: target, week1Debt: week1[id].debtToGdp, debtGapPoints: target === null ? null : (week1[id].debtToGdp - target) * 100,
      effectiveRate2023: f?.effective_rate ?? null, week1AverageRate: week1[id].averageRate,
      newIssueModel: week1[id].marketRate, observedNewIssueInEngineTerms: f?.euro_area ? week1.deu.marketRate + (f.yield_10y - financing.reference_yield) : null,
      interest2023: f?.interest_paid_pct_gdp ?? null, week1Interest: week1[id].interestToGdp, week1Access: week1[id].marketAccess,
    };
  });
  const summary = {
    name, a, b, buildSeconds,
    countriesWithDebtWithin1pp: comparison.filter(c => c.debtGapPoints !== null && Math.abs(c.debtGapPoints) <= 1).length,
    countriesWithDebtTarget: comparison.filter(c => c.debtGapPoints !== null).length,
    accessLostWeek1: comparison.filter(c => c.week1Access === 0).map(c => c.id),
    defaults: events['sovereign-default'] ?? {}, regimeChanges: events['regime-change'] ?? {}, accessLost: events['market-access-lost'] ?? {},
    audit: { worstMoneyError: worstMoney, worstBondError: worstBond, worstIssuedError: worstIssued },
    week1StateHash: null as string | null,
  };
  console.log(`${name}: debt within 1 pp ${summary.countriesWithDebtWithin1pp}/${summary.countriesWithDebtTarget} | access lost week 1 ${summary.accessLostWeek1.join(',') || 'none'} | `
    + `defaults ${JSON.stringify(summary.defaults)} | regime changes ${JSON.stringify(summary.regimeChanges)} | audit money ${worstMoney.toExponential(1)} bonds ${worstBond.toExponential(1)}`);
  void hashEconomy;
  return { summary, comparison, checkpoints };
}

if (process.argv[1]?.endsWith('evaluate.ts')) {
  const variants: [string, boolean, boolean][] = [['base', false, false], ['A', true, false], ['B', false, true], ['C', true, true]];
  const results = variants.filter(v => !only || only.includes(v[0])).map(([name, a, b]) => run(name, a, b));
  const OUT = resolve(ROOT, 'docs/econ/ECON-08-data');
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, `${outName}.json`), JSON.stringify({ policyFrom: calPath.replace(ROOT + '/', ''), financingFit: financing.fit, results }, null, 1) + '\n');
}

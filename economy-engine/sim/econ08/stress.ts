/**
 * ECON-08: baseline and stress simulations on the European scenario with the ECON-08 financing (variant C).
 *
 *   node --experimental-strip-types economy-engine/sim/econ08/stress.ts [--policy <calibration.json>]
 *
 * Builds once (WORLD-03 inputs re-calibrated under C: scenarios/europe-2023/build-econ08/calibration.json),
 * resolves week 1 as createEconomySession does, then plays weeks 2-156 for each run on a copy:
 *   baseline         every country on the autopilot (twice, to check determinism)
 *   passive-ita      Italy issues no commands (no autopilot), everyone else on the autopilot
 *   mismanage-ita    Italy from week 2: social +8 pp, administration +4 pp, income tax -5 pp (deficit-financed spending)
 *   reckless-ita     Italy from week 2: social +15 pp, administration +10 pp, income tax -10 pp (312 weeks)
 *   reckless-grc     Greece from week 2: social +10 pp, administration +8 pp, income tax -8 pp (312 weeks)
 *   high-tax-fra     France from week 2: income tax +15 pp, consumption tax +5 pp
 *   austerity-grc    Greece from week 2: social -6 pp, administration -6 pp, infrastructure -2 pp
 *   default-ita      Italy declares a default in week 10 while it can still pay (voluntary)
 *   repeat-ita       Italy declares defaults in weeks 10, 60 and 110
 * The stressed country is not steered by the autopilot. Records the stressed country's path at weeks
 * 1/13/26/52/104/156, all sovereign events and the worst audit errors. Writes docs/econ/ECON-08-data/stress.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { advanceEconomy, autopilotCommands, cloneEconomy, createEconomy, hashEconomy } from '../../src/index.ts';
import type { EconomyCommand, EconomyState } from '../../src/index.ts';
import { financedSpec } from './evaluate.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const args = process.argv.slice(2);
const calPath = resolve(ROOT, args.includes('--policy') ? args[args.indexOf('--policy') + 1] : 'scenarios/europe-2023/build-econ08/calibration.json');
const cal = JSON.parse(readFileSync(calPath, 'utf8'));
const technology: Record<string, number> = Object.fromEntries(cal.zones.map((z: { id: string; technology: number }) => [z.id, z.technology]));
const policy: Record<string, Record<string, number>> = {};
for (const f of cal.fiscal) {
  policy[f.id] = {};
  for (const r of f.rows) if (r.input !== null && r.input !== undefined) policy[f.id][r.field] = r.input;
}
const CHECKPOINTS = [1, 13, 26, 52, 104, 156];

type Plan = { name: string; country: string | null; weeks?: number; commands: (state: EconomyState, week: number, id: string) => EconomyCommand[] };
const shift = (state: EconomyState, id: string, changes: Record<string, number>): EconomyCommand[] => {
  const c = state.countries.findIndex(x => x.id === id);
  const k = state.country;
  const out: EconomyCommand[] = [];
  const now: Record<string, number> = { income: k.taxIncome[c], consumption: k.taxConsumption[c], corporate: k.taxCorporate[c],
    social: k.spendSocial[c], administration: k.spendAdministration[c], infrastructure: k.spendInfrastructure[c], military: k.spendMilitary[c] };
  for (const [key, delta] of Object.entries(changes)) {
    const value = Math.max(0, now[key] + delta);
    if (['income', 'consumption', 'corporate'].includes(key)) out.push({ type: 'set-tax', countryId: id, tax: key as 'income', rate: Math.min(0.7, value) });
    else out.push({ type: 'set-spending', countryId: id, category: key as 'social', share: Math.min(0.5, value) });
  }
  return out;
};
const PLANS: Plan[] = [
  { name: 'baseline', country: null, commands: () => [] },
  { name: 'baseline-repeat', country: null, commands: () => [] },
  { name: 'passive-ita', country: 'ita', commands: () => [] },
  { name: 'mismanage-ita', country: 'ita', commands: (s, w, id) => (w === 2 ? shift(s, id, { social: 0.08, administration: 0.04, income: -0.05 }) : []) },
  { name: 'reckless-ita', country: 'ita', weeks: 312, commands: (s, w, id) => (w === 2 ? shift(s, id, { social: 0.15, administration: 0.10, income: -0.10 }) : []) },
  { name: 'reckless-grc', country: 'grc', weeks: 312, commands: (s, w, id) => (w === 2 ? shift(s, id, { social: 0.10, administration: 0.08, income: -0.08 }) : []) },
  { name: 'high-tax-fra', country: 'fra', commands: (s, w, id) => (w === 2 ? shift(s, id, { income: 0.15, consumption: 0.05 }) : []) },
  { name: 'austerity-grc', country: 'grc', commands: (s, w, id) => (w === 2 ? shift(s, id, { social: -0.06, administration: -0.06, infrastructure: -0.02 }) : []) },
  { name: 'default-ita', country: 'ita', commands: (_s, w, id) => (w === 10 ? [{ type: 'declare-default', countryId: id }] : []) },
  { name: 'repeat-ita', country: 'ita', commands: (_s, w, id) => ([10, 60, 110].includes(w) ? [{ type: 'declare-default', countryId: id }] : []) },
];

function snap(s: EconomyState, report: ReturnType<typeof advanceEconomy>['report'], id: string) {
  const c = s.countries.findIndex(x => x.id === id);
  const k = s.country;
  const r = report.countries[c];
  return {
    debtToGdp: +((k.debt[c] + k.cbStateLoans[c]) / (52 * k.gdp[c])).toFixed(3), marketRate: +k.marketRate[c].toFixed(4), averageRate: +k.averageRate[c].toFixed(4),
    balanceToGdp: +((r.budget.revenue - r.budget.spending) / r.gdpNominal).toFixed(3), access: k.marketAccess[c], defaults: k.defaults[c],
    stability: +k.stability[c].toFixed(1), unrestTier: k.unrestTier[c], regime: k.regime[c], unemployment: +r.unemployment.toFixed(3),
    realGdpIndex: +(r.gdpReal / s.baseline.realGdp[c]).toFixed(3),
  };
}

function main() {
  const t0 = performance.now();
  const start = createEconomy(financedSpec(technology, policy, true, true));
  const all = start.countries.map(c => c.id);
  const first = advanceEconomy(start, { commands: autopilotCommands(start, all), effects: [] }, { audit: true, report: 'full' });
  console.log(`built and resolved week 1 in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  const runs: Record<string, unknown> = {};
  for (const plan of PLANS) {
    let state = cloneEconomy(first.state);
    const id = plan.country ?? 'ita';
    const path: Record<number, unknown> = { 1: snap(state, first.report, id) };
    const events: Record<string, Record<string, number[]>> = {};
    let worstMoney = 0, worstBond = 0;
    const horizon = plan.weeks ?? 156;
    for (let week = 2; week <= horizon; week++) {
      const steered = plan.country ? all.filter(x => x !== plan.country) : all;
      const commands = [...autopilotCommands(state, steered), ...plan.commands(state, week, id)];
      const full = CHECKPOINTS.includes(week) || week === horizon;
      const result = advanceEconomy(state, { commands, effects: [] }, { audit: true, report: full ? 'full' : 'none' });
      state = result.state;
      worstMoney = Math.max(worstMoney, Math.abs(result.report.audit.moneyError));
      worstBond = Math.max(worstBond, Math.abs(result.report.audit.bondError));
      for (const e of result.report.events as unknown as { type: string; countryId?: string }[]) {
        if (!/sovereign-default|market-access-lost|market-access-restored|regime-change/.test(e.type)) continue;
        ((events[e.type] ??= {})[e.countryId ?? '?'] ??= []).push(week);
      }
      if (full) path[week] = snap(state, result.report, id);
    }
    runs[plan.name] = { country: plan.country, path, events, audit: { worstMoneyError: worstMoney, worstBondError: worstBond }, finalHash: hashEconomy(state) };
    const p = path[horizon] as ReturnType<typeof snap>;
    console.log(`${plan.name.padEnd(16)} ${id}: debt 1->${horizon} ${(path[1] as ReturnType<typeof snap>).debtToGdp}->${p.debtToGdp} | rate ${(p.marketRate * 100).toFixed(1)}% | access ${p.access} | defaults ${p.defaults} | regime ${p.regime} | `
      + `stability ${p.stability} | events ${JSON.stringify(events)} | audit ${worstMoney.toExponential(1)}/${worstBond.toExponential(1)}`);
  }
  const deterministic = (runs.baseline as { finalHash: string }).finalHash === (runs['baseline-repeat'] as { finalHash: string }).finalHash;
  console.log(`deterministic: ${deterministic}`);
  const OUT = resolve(ROOT, 'docs/econ/ECON-08-data');
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, 'stress.json'), JSON.stringify({ policyFrom: calPath.replace(ROOT + '/', ''), deterministic, runs }, null, 1) + '\n');
}

main();

/**
 * ECON-08: why the Middle East and Africa bloc changes regime (variant C, recalibrated WORLD-03 inputs).
 *   node --experimental-strip-types economy-engine/sim/econ08/bloc-probe.ts
 * Prints, every 13 weeks to week 156, each bloc's stability, unrest tier, unemployment, deprivation, inflation,
 * fiscal balance, debt and market rate (all countries on the autopilot). Writes docs/econ/ECON-08-data/bloc-probe.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { advanceEconomy, autopilotCommands, createEconomy } from '../../src/index.ts';
import { financedSpec } from './evaluate.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const cal = JSON.parse(readFileSync(resolve(ROOT, 'scenarios/europe-2023/build-econ08/calibration.json'), 'utf8'));
const technology = Object.fromEntries(cal.zones.map((z: { id: string; technology: number }) => [z.id, z.technology]));
const policy: Record<string, Record<string, number>> = {};
for (const f of cal.fiscal) { policy[f.id] = {}; for (const r of f.rows) if (r.input !== null && r.input !== undefined) policy[f.id][r.field] = r.input; }
let state = createEconomy(financedSpec(technology, policy, true, true));
const all = state.countries.map(c => c.id);
const blocs = ['bloc-mea', 'bloc-apa', 'bloc-ame', 'bloc-eec', 'bloc-eur'];
const rows: unknown[] = [];
for (let week = 1; week <= 156; week++) {
  const full = week === 1 || week % 13 === 0;
  const r = advanceEconomy(state, { commands: autopilotCommands(state, all), effects: [] }, { audit: false, report: full ? 'full' : 'none' });
  state = r.state;
  if (!full) continue;
  for (const id of blocs) {
    const c = state.countries.findIndex(x => x.id === id);
    const v = r.report.countries[c];
    const row = { week, id, stability: +state.country.stability[c].toFixed(1), unrestTier: state.country.unrestTier[c], regime: state.country.regime[c],
      unemployment: +v.unemployment.toFixed(3), deprivation: +v.deprivation.toFixed(3), inflation: +v.inflation.toFixed(3),
      balanceToGdp: +((v.budget.revenue - v.budget.spending) / v.gdpNominal).toFixed(3), debtToGdp: +((state.country.debt[c] + state.country.cbStateLoans[c]) / (52 * state.country.gdp[c])).toFixed(2),
      marketRate: +state.country.marketRate[c].toFixed(3), fundedShare: +(v.budget as unknown as { fundedShare: number }).fundedShare?.toFixed?.(2) };
    rows.push(row);
    if (id === 'bloc-mea' || week === 156) console.log(JSON.stringify(row));
  }
}
mkdirSync(resolve(ROOT, 'docs/econ/ECON-08-data'), { recursive: true });
writeFileSync(resolve(ROOT, 'docs/econ/ECON-08-data/bloc-probe.json'), JSON.stringify(rows, null, 1) + '\n');

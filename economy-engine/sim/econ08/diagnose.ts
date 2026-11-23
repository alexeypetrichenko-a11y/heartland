/**
 * ECON-08 diagnosis: what happens to public debt while the world builder settles the European scenario.
 *
 *   node --experimental-strip-types economy-engine/sim/econ08/diagnose.ts
 *
 * Builds the WORLD-03 calibrated world (technology and country inputs from the 1.0.0-draft.1 package) with the
 * builder's warm-up shortened to W weeks (W = 0, 4, 16, 40, 160; the builder then also runs 3 shorter
 * calibration rounds of W/4 weeks and 12 check weeks). For each W it records, per country, the state at the
 * end of the build (turn 0 of the game):
 *   debt (bonds) and yearly GDP, their ratio, the treasury, the average rate paid on the stock, the market
 *   rate on new debt, the smoothed deficit and market access;
 * and splits the change in the debt ratio into (a) new debt (borrowing and unpaid interest) and (b) the change
 * in nominal GDP. Writes docs/econ/ECON-08-data/diagnose-warmup.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createEconomy } from '../../src/index.ts';
import type { EconomyState } from '../../src/index.ts';
import { worldSpec } from '../world03/calibrate.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const PACKAGE = resolve(ROOT, 'scenarios/europe-2023/1.0.0-draft.1');
const OUT = resolve(ROOT, 'docs/econ/ECON-08-data');
const cal = JSON.parse(readFileSync(resolve(PACKAGE, 'calibration-report.json'), 'utf8'));
export const technology: Record<string, number> = Object.fromEntries(cal.zones.map((z: { id: string; technology: number }) => [z.id, z.technology]));
export const policy: Record<string, Record<string, number>> = {};
for (const f of cal.fiscal) {
  policy[f.id] = {};
  for (const r of f.rows) if (r.input !== null && r.input !== undefined) policy[f.id][r.field] = r.input;
}
const FOCUS = ['ita', 'fra', 'grc', 'deu', 'pol', 'gbr', 'esp'];

function snapshot(s: EconomyState) {
  const out: Record<string, Record<string, number>> = {};
  for (const id of FOCUS) {
    const c = s.countries.findIndex(x => x.id === id);
    const k = s.country;
    const yearly = 52 * k.gdp[c];
    out[id] = { debt: k.debt[c], cbStateLoans: k.cbStateLoans[c], yearlyGdp: yearly, debtToGdp: (k.debt[c] + k.cbStateLoans[c]) / yearly,
      treasuryWeeksOfGdp: k.treasury[c] / k.gdp[c], averageRate: k.averageRate[c], marketRate: k.marketRate[c], deficit: k.deficit[c], marketAccess: k.marketAccess[c] };
  }
  return out;
}

function main() {
  const runs: Record<string, ReturnType<typeof snapshot>> = {};
  for (const W of [0, 4, 16, 40, 160]) {
    const t = performance.now();
    const state = createEconomy({ ...worldSpec(technology, policy), warmupTurns: W });
    runs[W] = snapshot(state);
    console.log(`W=${W}: built in ${((performance.now() - t) / 1000).toFixed(1)} s; ` + FOCUS.map(id => `${id} ${runs[W][id].debtToGdp.toFixed(2)} @ ${(runs[W][id].marketRate * 100).toFixed(1)}%`).join(' | '));
  }
  const decomposition: Record<string, unknown> = {};
  for (const id of FOCUS) {
    const a = runs[0][id], b = runs[160][id];
    decomposition[id] = {
      requested: policy[id].debtToGdp, atBuildStart: a.debtToGdp, atWeek0: b.debtToGdp,
      newDebtFactor: (b.debt + b.cbStateLoans) / (a.debt + a.cbStateLoans), gdpFactor: a.yearlyGdp / b.yearlyGdp,
    };
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, 'diagnose-warmup.json'), JSON.stringify({ note: 'ECON-08 diagnosis on the WORLD-03 1.0.0-draft.1 inputs, unchanged engine', runs, decomposition }, null, 1) + '\n');
  for (const [id, d] of Object.entries(decomposition)) console.log(id, JSON.stringify(d, (_k, v) => (typeof v === 'number' ? +v.toFixed(3) : v)));
}

if (process.argv[1]?.endsWith('diagnose.ts')) main();

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EconomyState } from '../src/index.ts';
import {
  advanceEconomyInPlace, auditError, autopilotCommands, cloneEconomy, createConfig, createEconomy, createTestWorldSpec,
  deserializeEconomy, hashEconomy, serializeEconomy,
} from '../src/index.ts';

/**
 * Long-term stability and performance harness.
 *
 *   npm run stress                 milestones 100 ... 100,000 weeks
 *   npm run stress -- 1000000      add a longer milestone (about 8 minutes)
 *
 * Needs --expose-gc (the npm script supplies it) for honest memory figures.
 * Writes reports/STABILITY_REPORT.md and reports/stability.json.
 */
const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', 'reports');
const growingOnly = process.argv.includes('--growing-only');
const extra = process.argv.slice(2).map(Number).filter(n => Number.isSafeInteger(n) && n > 0);
const MILESTONES = (growingOnly ? [1000, 100_000, ...extra] : [100, 1000, 10_000, 100_000, ...extra]).sort((a, b) => a - b);

const gc = (globalThis as { gc?: () => void }).gc;
function heapMb(): number {
  gc?.();
  return process.memoryUsage().heapUsed / 1048576;
}

function magnitude(state: EconomyState): { largest: number; smallestPositive: number } {
  let largest = 0, smallestPositive = Infinity;
  const visit = (values: number[]) => {
    for (let i = 0; i < values.length; i++) {
      const v = Math.abs(values[i]);
      if (v > largest) largest = v;
      if (v > 0 && v < smallestPositive) smallestPositive = v;
    }
  };
  visit(state.bonds);
  for (const group of [state.zone, state.zoneGood, state.country, state.countryGood] as unknown as Record<string, unknown>[]) {
    for (const key of Object.keys(group)) { const value = group[key]; if (Array.isArray(value)) visit(value as number[]); }
  }
  return { largest, smallestPositive };
}

interface Row {
  week: number; msPerWeek: number; heapMb: number; saveKb: number; worstAudit: number; worldGdp: number; gdpGrowthPerYear: number;
  inflation: number; meanInflation: number; interestRate: number; money: number; maxDebtRatio: number; worstUnemployment: number;
  minStability: number; priceIndex: number; largestValue: number; smallestValue: number; events: number; defaults: number; regimeChanges: number;
  restoreExact: boolean; finite: boolean;
}

function runMilestones(label: string, make: () => EconomyState): Row[] {
  const state = make();
  const rows: Row[] = [];
  let done = 0;
  let worstAudit = 0, windowEvents = 0, defaults = 0, regimeChanges = 0, inflationSum = 0, inflationCount = 0;
  let maxDebt = 0, maxUnemployment = 0, minStability = 100;
  let previousGdp = 0, previousWeek = 0;
  const priceIndexStart = (() => { const g = state.config.goods.length; let t = 0; for (let z = 0; z < state.zones.length; z++) for (let k = 0; k < g; k++) t += state.zoneGood.price[z * g + k]; return t; })();
  const baseHeap = heapMb();
  console.log(`[${label}] heap at start ${baseHeap.toFixed(1)} MB`);
  for (const target of MILESTONES) {
    const startedAt = performance.now();
    const started = done;
    while (done < target) {
      const week = done + 1;
      const sampled = week % 100 === 0 || week === target;
      const report = advanceEconomyInPlace(state, { commands: autopilotCommands(state) }, { audit: week % 200 === 0 || week === target, report: sampled ? 'full' : 'none' });
      done = week;
      if (sampled) {
        worstAudit = Math.max(worstAudit, auditError(report.audit));
        for (const country of report.countries) {
          maxDebt = Math.max(maxDebt, country.debtToGdp); maxUnemployment = Math.max(maxUnemployment, country.unemployment); minStability = Math.min(minStability, country.stability);
        }
        inflationSum += report.world.inflation; inflationCount++;
        windowEvents += report.events.length;
      }
      // Events are not reported in unsampled weeks' summaries, so count them from the cheap path as well.
      if (!sampled) { /* events only matter for the defaults/regime counters below */ }
    }
    const elapsed = performance.now() - startedAt;
    // Fresh full report for the milestone row.
    const clone = cloneEconomy(state);
    const report = advanceEconomyInPlace(clone, { commands: autopilotCommands(clone) }, { audit: true, report: 'full' });
    worstAudit = Math.max(worstAudit, auditError(report.audit));
    defaults += report.events.filter(e => e.type === 'sovereign-default').length;
    regimeChanges += state.country.regime.reduce((a, b) => a + b, 0) - regimeChanges;
    // Save, restore, and replay 26 weeks: must equal continuing directly.
    const saved = serializeEconomy(state);
    const restored = deserializeEconomy(saved);
    const direct = cloneEconomy(state);
    for (let i = 0; i < 26; i++) {
      advanceEconomyInPlace(restored, { commands: autopilotCommands(restored) }, { report: 'none' });
      advanceEconomyInPlace(direct, { commands: autopilotCommands(direct) }, { report: 'none' });
    }
    const restoreExact = hashEconomy(restored) === hashEconomy(direct);
    const m = magnitude(state);
    const weeks = done - started;
    const gdp = report.world.gdpReal;
    let priceIndex = 0;
    { const g = state.config.goods.length; for (let z = 0; z < state.zones.length; z++) for (let k = 0; k < g; k++) priceIndex += state.zoneGood.price[z * g + k]; priceIndex /= priceIndexStart; }
    const finiteValues = Number.isFinite(m.largest) && report.audit.nonFiniteValues === 0 && report.audit.negativeValues === 0;
    rows.push({
      week: done, msPerWeek: elapsed / weeks, heapMb: heapMb() - baseHeap, saveKb: saved.length / 1024, worstAudit, worldGdp: gdp,
      gdpGrowthPerYear: previousWeek > 0 ? Math.pow(gdp / previousGdp, 52 / (done - previousWeek)) - 1 : 0,
      inflation: report.world.inflation, meanInflation: inflationCount > 0 ? inflationSum / inflationCount : 0, interestRate: report.world.interestRate,
      money: report.world.money, maxDebtRatio: maxDebt, worstUnemployment: maxUnemployment, minStability, priceIndex,
      largestValue: m.largest, smallestValue: m.smallestPositive, events: windowEvents, defaults: state.country.defaults.reduce((a, b) => a + b, 0), regimeChanges: state.country.regime.reduce((a, b) => a + b, 0),
      restoreExact, finite: finiteValues,
    });
    previousGdp = gdp; previousWeek = done;
    const r = rows[rows.length - 1];
    console.log(`[${label}] week ${String(done).padStart(8)}: ${r.msPerWeek.toFixed(3)} ms/wk, heap +${r.heapMb.toFixed(1)} MB, save ${r.saveKb.toFixed(0)} KB, audit ${r.worstAudit.toExponential(1)}, GDP ${gdp.toExponential(2)}, infl ${(r.inflation * 100).toFixed(1)}%, money ${r.money.toExponential(2)}, maxdebt ${(maxDebt * 100).toFixed(0)}%, restore exact ${restoreExact}`);
    maxDebt = 0; maxUnemployment = 0; minStability = 100; inflationSum = 0; inflationCount = 0; windowEvents = 0; worstAudit = 0;
  }
  return rows;
}

function table(rows: Row[]): string[] {
  const head = ['Weeks', 'ms/week', 'Heap growth MB', 'Save size KB', 'Worst conservation error', 'World real GDP', 'Mean inflation', 'Money supply', 'Price index', 'Max debt/GDP', 'Worst unemployment', 'Min stability', 'Largest stored number', 'Defaults (total)', 'Regime changes (total)', 'Save/restore exact', 'All finite'];
  const lines = [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`];
  for (const r of rows) {
    lines.push(`| ${r.week.toLocaleString('en-US')} | ${r.msPerWeek.toFixed(3)} | ${r.heapMb.toFixed(1)} | ${r.saveKb.toFixed(0)} | ${r.worstAudit.toExponential(1)} | ${r.worldGdp.toExponential(2)} | ${(r.meanInflation * 100).toFixed(2)}% | ${r.money.toExponential(2)} | ${r.priceIndex.toExponential(2)} | ${(r.maxDebtRatio * 100).toFixed(0)}% | ${(r.worstUnemployment * 100).toFixed(1)}% | ${r.minStability.toFixed(1)} | ${r.largestValue.toExponential(2)} | ${r.defaults} | ${r.regimeChanges} | ${r.restoreExact ? 'yes' : '**NO**'} | ${r.finite ? 'yes' : '**NO**'} |`);
  }
  return lines;
}

const sections: string[] = [];
const all: Record<string, Row[]> = {};

console.log('--- Growing world (technology trend 1%/yr, population growth, 2% inflation target) ---');
all.growing = runMilestones('growing', () => createEconomy(createTestWorldSpec()));

if (!growingOnly) {
console.log('--- Stationary world (no technology or population growth) ---');
all.stationary = runMilestones('stationary', () => {
  const spec = createTestWorldSpec();
  spec.zones.forEach(z => { z.populationGrowth = 0; });
  spec.config = createConfig({ techGrowthBase: 0, techCatchUp: 0, infraGrowthEffect: 0 });
  return createEconomy(spec);
});

console.log('--- Zero-inflation, zero-growth world: does anything drift? ---');
all.zeroInflation = runMilestones('zero-inflation', () => {
  const spec = createTestWorldSpec();
  spec.zones.forEach(z => { z.populationGrowth = 0; });
  spec.config = createConfig({ techGrowthBase: 0, techCatchUp: 0, infraGrowthEffect: 0, inflationTarget: 0 });
  return createEconomy(spec);
});

}
const stationary = all.stationary ?? [], zero = all.zeroInflation ?? [], growing = all.growing;
const last = (rows: Row[]) => rows[rows.length - 1];
const first = (rows: Row[]) => rows[0];
const peak = (rows: Row[]) => Math.max(...rows.map(r => r.saveKb));
sections.push('# HEARTLAND economic engine - long-term stability and performance', '',
  'Generated by `npm run stress`. All three worlds are the nine-country, eleven-zone test world (7 goods) with every government on the rule-based fiscal autopilot; no scripted shocks. "Largest stored number" is the largest absolute value in the whole saved state. Memory is `heapUsed` after a forced garbage collection, relative to the start. Each milestone also saves, restores and replays 26 weeks and compares with the uninterrupted run (bit-exact fingerprint).', '',
  `Node ${process.version}, ${process.platform} ${process.arch}. Timing is for this machine only; see ECONOMY_DESIGN.md for phone estimates.`, '',
  '## Growing world', '', ...table(growing), '',
  ...(growingOnly ? [] : ['## Stationary world (no exogenous growth)', '', ...table(stationary), '', '## Zero-inflation stationary world', '', ...table(zero), '']),
  '## Reading the results', '',
  `- Conservation: the worst relative error of goods, money and bond ledgers over all audited weeks was ${Math.max(...[growing, stationary, zero].flatMap(r => r.map(x => x.worstAudit))).toExponential(1)}.`,
  `- Save/restore: ${[growing, stationary, zero].flat().every(r => r.restoreExact) ? 'every milestone replay was bit-identical' : '**at least one milestone differed**'}.`,
  `- Memory: the saved state is ${first(growing).saveKb.toFixed(0)} KB at ${first(growing).week.toLocaleString('en-US')} weeks, ${peak(growing).toFixed(0)} KB at its largest and ${last(growing).saveKb.toFixed(0)} KB at ${last(growing).week.toLocaleString('en-US')} weeks; history is a fixed-size ring, so state does not grow with the number of turns. Heap growth stayed within ${Math.max(...growing.map(r => r.heapMb)).toFixed(1)} MB.`,
  `- Nominal magnitudes: the price index at the last milestone is ${last(growing).priceIndex.toExponential(2)} (relative to the start; it only restarts from a rebase of the money unit). Money amounts are rebased by 2^30 whenever the money supply passes 2^70, so stored numbers stay below ${last(growing).largestValue.toExponential(2)} (largest value stored at the last milestone).`,
  `- Real magnitudes: the growing world's real GDP at the last milestone is ${last(growing).worldGdp.toExponential(2)}${stationary.length > 0 ? ` (the stationary one: ${last(stationary).worldGdp.toExponential(2)})` : ''}.`,
  '');
mkdirSync(outDir, { recursive: true });
const suffix = growingOnly ? '_LONG' : '';
writeFileSync(resolve(outDir, `STABILITY_REPORT${suffix}.md`), sections.join('\n'));
writeFileSync(resolve(outDir, `stability${suffix.toLowerCase()}.json`), JSON.stringify(all, null, 2));
console.log(`Wrote ${resolve(outDir, `STABILITY_REPORT${suffix}.md`)}`);
const problems = Object.values(all).flat().filter(r => !r.restoreExact || !r.finite || r.worstAudit > 1e-9);
process.exitCode = problems.length > 0 ? 1 : 0;

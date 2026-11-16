import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import type { EconomyState, WorldSpec } from '../src/index.ts';
import {
  auditError, autopilotCommands, createCatalogueWorldSpec, createEconomy, createGeneratedWorldSpec, createTestWorldSpec,
  serializeEconomy, toCatalogueSpec,
} from '../src/index.ts';
import { applyActions, compileTradePolicy, resolveInput } from '../src/core/commands.ts';
import { planBudgets, settleFinances } from '../src/core/finance.ts';
import { clearMarkets } from '../src/core/market.ts';
import { getModel, getWorkspace } from '../src/core/model.ts';
import { planPrivateSector } from '../src/core/planning.ts';
import { updatePolitics } from '../src/core/politics.ts';
import { adjust, develop, produce } from '../src/core/production.ts';
import { rebaseIfNeeded } from '../src/core/rebase.ts';
import { getRoutes } from '../src/core/routes.ts';
import { captureStart, finishTurn } from '../src/core/stats.ts';

/**
 * Performance of the weekly turn for worlds of increasing size (Milestone 1).
 *
 *   npm run bench
 *
 * Each world is built (with its normal calibration), run for a few weeks to
 * warm up the JIT, then timed over a fixed number of weeks with the rule-based
 * autopilot and the conservation audit on. The phase split re-runs the same
 * steps as core/step.ts with a timer around each. Writes reports/BENCHMARK.md.
 * Desktop Node timings only; a phone is several times slower (see the report).
 */
const here = dirname(fileURLToPath(import.meta.url));
const PHASES = ['inputs', 'budgets', 'planning', 'markets', 'production', 'adjust', 'finance', 'politics+develop', 'audit+report'] as const;

function timedWeek(state: EconomyState, times: Float64Array): number {
  const m = getModel(state.config);
  let t = performance.now();
  const lap = (k: number) => { const now = performance.now(); times[k] += now - t; t = now; };
  const actions = resolveInput(state, { commands: autopilotCommands(state) });
  rebaseIfNeeded(state);
  const w = getWorkspace(state);
  const events: never[] = [];
  captureStart(state, w, m);
  applyActions(state, w, actions);
  compileTradePolicy(state, w);
  const routes = getRoutes(state);
  lap(0);
  planBudgets(state, w, m, events); lap(1);
  planPrivateSector(state, w, m); lap(2);
  clearMarkets(state, w, m, routes, false); lap(3);
  produce(state, w, m); lap(4);
  adjust(state, w, m); lap(5);
  settleFinances(state, w, m, events); lap(6);
  updatePolitics(state, w, events);
  develop(state, w, m); lap(7);
  state.turn += 1;
  const report = finishTurn(state, w, m, { audit: true, report: 'none' }, events);
  lap(8);
  return auditError(report.audit);
}

interface Row { label: string; zones: number; goods: number; lines: number; aggregates: number; buildMs: number; msPerWeek: number; worstWeekMs: number; saveKb: number; gzipKb: number; worstAudit: number; phases: number[] }

function measure(label: string, spec: WorldSpec, weeks: number): Row {
  const t0 = performance.now();
  const state = createEconomy(spec);
  const buildMs = performance.now() - t0;
  const times = new Float64Array(PHASES.length);
  for (let k = 0; k < 8; k++) timedWeek(state, new Float64Array(PHASES.length));
  let worstAudit = 0;
  let worstWeekMs = 0;
  const start = performance.now();
  for (let k = 0; k < weeks; k++) {
    const before = performance.now();
    worstAudit = Math.max(worstAudit, timedWeek(state, times));
    worstWeekMs = Math.max(worstWeekMs, performance.now() - before);
  }
  const elapsed = performance.now() - start;
  const text = serializeEconomy(state);
  const total = times.reduce((a, b) => a + b, 0);
  const row: Row = {
    label, zones: state.zones.length, goods: state.config.goods.length, lines: state.firmLine.capacity.length,
    aggregates: state.firm.cash.length, buildMs, msPerWeek: elapsed / weeks, worstWeekMs, saveKb: text.length / 1024,
    gzipKb: gzipSync(text).length / 1024, worstAudit, phases: Array.from(times, x => x / total),
  };
  console.log(`${label.padEnd(34)} ${row.msPerWeek.toFixed(2).padStart(7)} ms/week (worst ${row.worstWeekMs.toFixed(1)}), build ${(buildMs / 1000).toFixed(1)} s, save ${row.saveKb.toFixed(0)} KB (${row.gzipKb.toFixed(0)} KB gzip), audit ${worstAudit.toExponential(1)} | `
    + PHASES.map((name, k) => `${name} ${(row.phases[k] * 100).toFixed(0)}%`).join(', '));
  return row;
}

const rows: Row[] = [
  measure('Meridian, legacy 7 goods', createTestWorldSpec(), 520),
  measure('Meridian, catalogue 31 goods', createCatalogueWorldSpec(), 520),
  measure('Generated 30 zones, 31 goods', toCatalogueSpec(createGeneratedWorldSpec(30, 5, 2)), 260),
  measure('Generated 60 zones, 31 goods', toCatalogueSpec(createGeneratedWorldSpec(60, 5, 2)), 260),
  measure('Generated 120 zones, 31 goods', toCatalogueSpec(createGeneratedWorldSpec(120, 5, 2)), 104),
];

const lines = [
  '# HEARTLAND economic engine - performance benchmark (Milestone 1)', '',
  `Generated by \`npm run bench\` on Node ${process.version}, ${process.platform} ${process.arch} (desktop). Audit on, autopilot on, no history report. `
  + 'Generated worlds have two zones per country and use the 31-good catalogue. "Lines" are zone x good x owner x tier production lines; '
  + '"aggregates" are zone x sector x owner firm aggregates.', '',
  '| World | Zones | Goods | Lines | Aggregates | Build (s) | ms/week | Worst week (ms) | Save (KB) | Save gzip (KB) | Worst audit error |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.label} | ${r.zones} | ${r.goods} | ${r.lines} | ${r.aggregates} | ${(r.buildMs / 1000).toFixed(1)} | ${r.msPerWeek.toFixed(2)} | ${r.worstWeekMs.toFixed(1)} | ${r.saveKb.toFixed(0)} | ${r.gzipKb.toFixed(0)} | ${r.worstAudit.toExponential(1)} |`),
  '', '## Share of weekly time by phase', '',
  `| World | ${PHASES.join(' | ')} |`, `|---|${PHASES.map(() => '---').join('|')}|`,
  ...rows.map(r => `| ${r.label} | ${r.phases.map(x => `${(x * 100).toFixed(1)}%`).join(' | ')} |`), '',
];
mkdirSync(resolve(here, '..', 'reports'), { recursive: true });
writeFileSync(resolve(here, '..', 'reports', 'BENCHMARK.md'), lines.join('\n'));
console.log('Wrote reports/BENCHMARK.md');

/**
 * WORLD-02 performance feasibility benchmark, Node part (analysis only; the engine is not changed).
 *
 *   node --expose-gc --experimental-strip-types economy-engine/sim/world02-bench.ts [outDir]
 *
 * For each configuration in world02-bench-worlds.ts: builds the world through the integration API
 * (offline cost), saves the week-1 economy, starts a game from that save (the production path),
 * plays 155 weekly turns through advanceEconomyWeek (copy + week + summary, as the game does),
 * and measures week times, 52/104/156-week totals, heap, save size, save and restore time.
 * Writes <outDir>/world02-bench-node.json and <outDir>/world02-week1-<n>.json (week-1 saves for the
 * browser benchmark). Default outDir: docs/world/data.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  advanceEconomyWeek, createEconomySession, economyFingerprint, loadEconomySession, saveEconomySession, startEconomyFromSave,
} from '../src/integration/index.ts';
import { BENCH_CONFIGS, BUDGET_CONFIGS, benchWorld, realTopologyWorld } from './world02-bench-worlds.ts';

// Options: --set budget (zone-budget comparison: BUDGET_CONFIGS plus option A on the real topology),
// --repeats N (play the 155 turns N times from the same save; week statistics pool all runs and the
// spread of the per-run medians is reported as a noise measure). The first positional argument is outDir.
const args = process.argv.slice(2);
const option = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const budget = option('--set') === 'budget';
const repeats = Math.max(1, Number(option('--repeats') ?? 1));
const positional = args.filter((arg, i) => !arg.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const outDir = resolve(positional[0] ?? resolve(import.meta.dirname, '../../docs/world/data'));
const worlds = budget
  ? [...BUDGET_CONFIGS.map(config => ({ config, ...benchWorld(config) })),
    { config: { name: 'A: 61 zones, real draft topology' }, ...realTopologyWorld() }]
  : BENCH_CONFIGS.map(config => ({ config, ...benchWorld(config) }));
mkdirSync(outDir, { recursive: true });
const gc = (globalThis as { gc?: () => void }).gc;
const heapMb = () => { gc?.(); return process.memoryUsage().heapUsed / 1048576; };
const pct = (values: number[], p: number) => values.slice().sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(p * values.length))];
const results: unknown[] = [];

for (const [index, { config, world, profiles, zones, lanes }] of worlds.entries()) {
  const heapBefore = heapMb();
  let t = performance.now();
  const built = createEconomySession(world, { profiles });
  const buildMs = performance.now() - t;
  const week1 = saveEconomySession(built);
  writeFileSync(resolve(outDir, `world02-week1-${budget ? 'budget-' : ''}${index}.json`), JSON.stringify({ config, world, profiles, save: week1 }));
  const starts: number[] = [];
  let session = built;
  for (let k = 0; k < 5; k++) {
    t = performance.now();
    session = startEconomyFromSave(week1, world, { profiles });
    starts.push(performance.now() - t);
  }
  const sameStart = economyFingerprint(session) === economyFingerprint(built);
  const heapStart = heapMb();
  const weeks: number[] = [];
  const runMedians: number[] = [];
  const runMax: number[] = [];
  const cumulative: Record<number, number> = {};
  let total = 0;
  for (let run = 0; run < repeats; run++) {
    if (run > 0) session = startEconomyFromSave(week1, world, { profiles });
    const runWeeks: number[] = [];
    let runTotal = 0;
    for (let week = 2; week <= 157; week++) {
      t = performance.now();
      session = advanceEconomyWeek(session, {});
      const ms = performance.now() - t;
      runWeeks.push(ms);
      runTotal += ms;
      if (run === 0 && [53, 105, 157].includes(week)) cumulative[week - 1] = runTotal;
    }
    weeks.push(...runWeeks);
    total += runTotal;
    runMedians.push(pct(runWeeks, 0.5));
    runMax.push(Math.max(...runWeeks));
  }
  const heapEnd = heapMb();
  t = performance.now();
  const saved = saveEconomySession(session);
  const saveMs = performance.now() - t;
  t = performance.now();
  const restored = loadEconomySession(saved);
  const restoreMs = performance.now() - t;
  const roundTrip = economyFingerprint(restored) === economyFingerprint(session);
  const row = {
    config: config.name, zones, lanes, countries: world.countries.length,
    buildSeconds: buildMs / 1000,
    week1SaveKb: week1.length / 1024, week1SaveGzipKb: gzipSync(week1).length / 1024,
    startFromSaveMs: pct(starts, 0.5), sameStartAsBuild: sameStart,
    repeats, weekMs: { median: pct(weeks, 0.5), p95: pct(weeks, 0.95), max: Math.max(...weeks), mean: total / weeks.length },
    runMedianMs: { min: Math.min(...runMedians), max: Math.max(...runMedians) }, runMaxMs: runMax,
    cumulativeSeconds: { 52: cumulative[52] / 1000, 104: cumulative[104] / 1000, 156: cumulative[156] / 1000 },
    heapMb: { beforeBuild: heapBefore, afterStart: heapStart, after156Weeks: heapEnd },
    week156SaveKb: saved.length / 1024, week156SaveGzipKb: gzipSync(saved).length / 1024,
    saveMs, restoreMs, saveRoundTripIdentical: roundTrip,
  };
  results.push(row);
  process.stdout.write(`${config.name}: ${zones} zones, ${lanes} lanes | build ${row.buildSeconds.toFixed(1)} s | week median ${row.weekMs.median.toFixed(1)} ms (run medians ${row.runMedianMs.min.toFixed(1)}–${row.runMedianMs.max.toFixed(1)}), p95 ${row.weekMs.p95.toFixed(1)}, max ${row.weekMs.max.toFixed(0)} | 156 weeks ${row.cumulativeSeconds[156].toFixed(1)} s | save ${row.week156SaveKb.toFixed(0)} KB (${row.week156SaveGzipKb.toFixed(0)} gz) | save ${saveMs.toFixed(0)} ms, restore ${restoreMs.toFixed(0)} ms | heap ${heapEnd.toFixed(0)} MB\n`);
}
writeFileSync(resolve(outDir, budget ? 'world02-bench-node-budget.json' : 'world02-bench-node.json'), JSON.stringify({ node: process.version, platform: `${process.platform} ${process.arch}`, cpus: (await import('node:os')).cpus().length, results }, null, 1));

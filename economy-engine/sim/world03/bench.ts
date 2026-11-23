/**
 * WORLD-03 performance and behaviour benchmark on the ACTUAL calibrated scenario package (Node).
 *
 *   node --expose-gc --experimental-strip-types economy-engine/sim/world03/bench.ts [package-dir] [--repeats N] [--player fra]
 *
 * Loads week1.session.json (loadEconomySession), selects a player country (withPlayerCountry), plays 155 weekly
 * turns through advanceEconomyWeek (the game's path, with the autopilot steering every other country and the
 * player issuing no commands), saves and restores. Records week times, heap, save sizes, load time, and the
 * fiscal trajectory of the six playable countries (debt/GDP, interest, unemployment, stability) at weeks
 * 1, 13, 26, 52, 104 and 156. Writes <package>/benchmark-node.json.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { advanceEconomyWeek, economyFingerprint, getCountryEconomy, loadEconomySession, saveEconomySession, withPlayerCountry } from '../../src/integration/index.ts';
import type { EconomySession } from '../../src/integration/index.ts';

const args = process.argv.slice(2);
const option = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const dir = resolve(positional[0] ?? resolve(import.meta.dirname, '../../../scenarios/europe-2023/1.0.0-draft.1'));
const repeats = Math.max(1, Number(option('--repeats') ?? 2));
const player = option('--player') ?? 'fra';
const gc = (globalThis as { gc?: () => void }).gc;
const heapMb = () => { gc?.(); return process.memoryUsage().heapUsed / 1048576; };
const pct = (v: number[], p: number) => v.slice().sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(p * v.length))];
const PLAYABLE = ['fra', 'deu', 'gbr', 'ita', 'pol', 'tur'];
const CHECKPOINTS = [1, 13, 26, 52, 104, 156];

const text = readFileSync(resolve(dir, 'week1.session.json'), 'utf8');
const loads: number[] = [];
let start!: EconomySession;
for (let k = 0; k < 5; k++) {
  const t = performance.now();
  start = withPlayerCountry(loadEconomySession(text), player);
  loads.push(performance.now() - t);
}
const heapStart = heapMb();
const trajectory: Record<string, Record<number, unknown>> = {};
const snap = (s: EconomySession, week: number) => {
  for (const id of PLAYABLE) {
    const v = getCountryEconomy(s, id);
    (trajectory[id] ??= {})[week] = {
      debtToGdp: +v.debtToGdp.toFixed(3), marketRate: +v.marketRate.toFixed(3), interestShareOfGdp: +(v.budget.interest / v.gdpNominal).toFixed(3),
      unemployment: +v.unemployment.toFixed(3), stability: +v.stability.toFixed(1), unrestTier: v.unrestTier, regime: v.regime, marketAccess: v.marketAccess,
    };
  }
};
const events: Record<string, Record<string, number[]>> = {};
const tally = (s: EconomySession, week: number) => {
  for (const e of s.summary.events as unknown as { type?: string; countryId?: string }[]) {
    if (!e.type || !/default|regime-change|market-access/.test(e.type)) continue;
    ((events[e.type] ??= {})[e.countryId ?? '?'] ??= []).push(week);
  }
};
const weeks: number[] = [];
const medians: number[] = [];
let session = start;
let final!: EconomySession;
for (let run = 0; run < repeats; run++) {
  session = start;
  if (run === 0) { snap(session, 1); tally(session, 1); }
  const runWeeks: number[] = [];
  for (let week = 2; week <= 156; week++) {
    const t = performance.now();
    session = advanceEconomyWeek(session, {});
    runWeeks.push(performance.now() - t);
    if (run === 0) tally(session, week);
    if (run === 0 && CHECKPOINTS.includes(week)) snap(session, week);
  }
  weeks.push(...runWeeks);
  medians.push(pct(runWeeks, 0.5));
  final = session;
}
const heapEnd = heapMb();
let t = performance.now();
const saved = saveEconomySession(final);
const saveMs = performance.now() - t;
t = performance.now();
const restored = loadEconomySession(saved);
const restoreMs = performance.now() - t;
const result = {
  scenario: dir.split('/').slice(-2).join('/'), node: process.version, platform: `${process.platform} ${process.arch}`, repeats, player,
  zones: start.state.zones.length, lanes: start.state.lanes.id.length,
  week1SaveKb: text.length / 1024, week1SaveGzipKb: gzipSync(text).length / 1024,
  loadMs: pct(loads, 0.5),
  weekMs: { median: pct(weeks, 0.5), p95: pct(weeks, 0.95), max: Math.max(...weeks), mean: weeks.reduce((a, b) => a + b, 0) / weeks.length, runMedians: medians },
  heapMb: { afterLoad: heapStart, after156Weeks: heapEnd },
  week156SaveKb: saved.length / 1024, week156SaveGzipKb: gzipSync(saved).length / 1024, saveMs, restoreMs,
  saveRoundTripIdentical: economyFingerprint(restored) === economyFingerprint(final),
  trajectory, events,
};
writeFileSync(resolve(dir, 'benchmark-node.json'), JSON.stringify(result, null, 1) + '\n');
console.log(`${result.zones} zones, ${result.lanes} lanes | load ${result.loadMs.toFixed(0)} ms | week median ${result.weekMs.median.toFixed(1)} ms (runs ${medians.map(m => m.toFixed(1)).join(', ')}), p95 ${result.weekMs.p95.toFixed(1)}, max ${result.weekMs.max.toFixed(0)} | `
  + `save ${result.week156SaveKb.toFixed(0)} KB (${result.week156SaveGzipKb.toFixed(0)} gz), ${saveMs.toFixed(0)}/${restoreMs.toFixed(0)} ms | heap ${heapEnd.toFixed(0)} MB | round trip ${result.saveRoundTripIdentical}`);
for (const [type, by] of Object.entries(events)) console.log(type, JSON.stringify(by));

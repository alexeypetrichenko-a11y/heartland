import { readFileSync, writeFileSync } from 'node:fs';
import type { EconomyState } from '../src/index.ts';
import {
  createEconomy, createGeneratedWorldSpec, createTestWorldSpec, deserializeEconomy, hashEconomy, serializeEconomy,
} from '../src/index.ts';
import { runSimulation } from './runner.ts';

/**
 * Standalone simulator. There is no maximum number of turns.
 *
 *   npm run sim -- --turns 5000
 *   npm run sim -- --turns 100000 --every 5200 --save /tmp/world.json
 *   npm run sim -- --load /tmp/world.json --turns 52 --audit
 *   npm run sim -- --world generated:60 --turns 1000
 *
 * Options
 *   --turns N        weeks to simulate (default 520); any whole number
 *   --seed N         random seed for a new world (default 2401)
 *   --world W        "meridian" (default test world) or "generated:<zones>"
 *   --load FILE      continue a saved simulation instead of creating a world
 *   --save FILE      write the final state (JSON) so it can be resumed
 *   --every N        print a summary line every N weeks (default: about 12 lines)
 *   --no-autopilot   leave all governments on their starting policies
 *   --audit          verify conservation after every week (slower)
 */
function parse(argv: string[]) {
  const options = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    if (key === 'no-autopilot' || key === 'audit' || key === 'help') flags.add(key);
    else {
      const value = argv[++i];
      if (value === undefined) throw new Error(`Option --${key} needs a value.`);
      options.set(key, value);
    }
  }
  return { options, flags };
}

function wholeNumber(text: string | undefined, fallback: number, label: string): number {
  if (text === undefined) return fallback;
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative whole number.`);
  return value;
}

function main() {
  const { options, flags } = parse(process.argv.slice(2));
  if (flags.has('help')) {
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].split('\n').slice(3).join('\n').replace(/^ \* ?/gm, ''));
    return;
  }
  const turns = wholeNumber(options.get('turns'), 520, '--turns');
  const seed = wholeNumber(options.get('seed'), 2401, '--seed');
  let state: EconomyState;
  const load = options.get('load');
  if (load) state = deserializeEconomy(readFileSync(load, 'utf8'));
  else {
    const world = options.get('world') ?? 'meridian';
    const spec = world === 'meridian' ? createTestWorldSpec(seed)
      : world.startsWith('generated:') ? createGeneratedWorldSpec(wholeNumber(world.slice(10), 20, 'generated zones'), seed)
        : (() => { throw new Error(`Unknown world: ${world}`); })();
    state = createEconomy(spec);
  }
  const every = Math.max(1, wholeNumber(options.get('every'), Math.max(1, Math.floor(turns / 12)), '--every'));
  const names = state.countries.map(country => country.id);
  console.log(`HEARTLAND economy simulator: ${state.countries.length} countries, ${state.zones.length} zones, ${state.config.goods.length} goods, starting at week ${state.turn}`);
  console.log('week | world GDP | infl | rate | public debt | max unemp | min stab | events');

  const started = performance.now();
  let done = 0;
  let worst = 0;
  let events = 0;
  while (done < turns) {
    // The last week of each block is run with a report so a summary line can be printed.
    const block = Math.min(every, turns - done);
    const autopilot = !flags.has('no-autopilot');
    const quiet = runSimulation(state, { turns: block - 1, autopilot, audit: flags.has('audit'), record: false });
    let line = '';
    let blockEvents = quiet.events.length;
    const last = runSimulation(state, {
      turns: 1, autopilot, audit: flags.has('audit'), record: false,
      onReport: report => {
        const unemployment = Math.max(...report.countries.map(c => c.unemployment));
        const stability = Math.min(...report.countries.map(c => c.stability));
        line = `${String(report.turn).padStart(7)} | ${report.world.gdpReal.toFixed(1).padStart(9)} | ${(report.world.inflation * 100).toFixed(1).padStart(4)}% | ${(report.world.interestRate * 100).toFixed(1).padStart(4)}% | ${report.world.debt.toFixed(0).padStart(11)} | ${(unemployment * 100).toFixed(1).padStart(8)}% | ${stability.toFixed(1).padStart(8)} | `;
      },
    });
    blockEvents += last.events.length;
    events += blockEvents;
    worst = Math.max(worst, quiet.worstAuditError, last.worstAuditError);
    done += block;
    console.log(line + blockEvents);
  }
  const elapsed = performance.now() - started;
  console.log(`done: ${done} weeks in ${(elapsed / 1000).toFixed(2)} s (${(elapsed / Math.max(1, done)).toFixed(3)} ms/week), ${events} events, worst conservation error ${worst.toExponential(1)} ${flags.has('audit') ? '' : '(audit off)'}`);
  console.log(`state fingerprint ${hashEconomy(state)}; countries: ${names.join(', ')}`);
  const save = options.get('save');
  if (save) {
    writeFileSync(save, serializeEconomy(state));
    console.log(`saved week ${state.turn} to ${save}`);
  }
}

try { main(); } catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

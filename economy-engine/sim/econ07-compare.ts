/**
 * ECON-07: comparative balance study of the three corrections (analysis only).
 *
 *   npm run econ07:compare                 all five configurations, then the tables (about 10 minutes on 4 cores)
 *   node --experimental-strip-types sim/econ07-compare.ts --config A     one configuration only
 *   node --experimental-strip-types sim/econ07-compare.ts --merge        tables from the saved configurations
 *
 * Every configuration runs the same engine code; only parameters differ, set on the week-1 economy:
 *   before  every ECON-07 parameter at its legacy value: the pre-ECON-07 engine (bit-identical, tested)
 *   A       only correction A (budget base, surplus return)
 *   B       only correction B (default costs)
 *   C       only correction C (social spending curve)
 *   all     the corrected engine as committed (the defaults)
 * Strategies are the ECON-06 set (sim/econ06-balance.ts) plus four that test the ECON-07 acceptance criteria.
 * Runs stop at the player's defeat, as in ECON-06. Writes reports/econ07/<config>.json and reports/ECON_07_DATA.md.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EconomySession } from '../src/integration/index.ts';
import {
  createEconomySession, fictionalGameWorld, fiscalCommands, loadEconomySession, saveEconomySession, startEconomyFromSave,
} from '../src/integration/index.ts';
import type { Run, Strategy } from './econ06-balance.ts';
import { STRATEGIES, play } from './econ06-balance.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../reports/econ07');
const COUNTRIES = ['alden', 'belora', 'cyrin'];
const SEEDS = [2401, 7, 99];
const SWEEP_SEEDS = Array.from({ length: 20 }, (_, i) => 1001 + i);

const LEGACY = {
  spendingBaseFall: 1 / 13, surplusReturnShare: 0, voluntaryDefaultWeight: 0, socialStabilityCap: 0,
  defaultOutputShock: 0.06, defaultShockRecoveryWeeks: 52, reputationDecayWeeks: 156,
};
const CONFIGS: Record<string, Record<string, number>> = {
  before: LEGACY,
  A: { ...LEGACY, spendingBaseFall: 1 / 104, surplusReturnShare: 0.1 },
  B: { ...LEGACY, voluntaryDefaultWeight: 0.5, defaultOutputShock: 0.08, defaultShockRecoveryWeeks: 78, reputationDecayWeeks: 260 },
  C: { ...LEGACY, socialStabilityCap: 8 },
  all: {},
};

const extra: Strategy[] = [
  { id: 'M03', group: 'variant', name: 'Moderate tax rise (income tax +5 points)', parameters: 'income tax +5 points; spending unchanged',
    plan: ({ country, week, start }) => (week === 2 ? fiscalCommands(country, { taxes: { income: start.taxes.income + 0.05 } }) : []) },
  { id: 'M05', group: 'variant', name: 'Broad tax rise (all taxes +5 points)', parameters: 'all three taxes +5 points; spending unchanged',
    plan: ({ country, week, start }) => (week === 2 ? fiscalCommands(country, { taxes: { income: start.taxes.income + 0.05, consumption: start.taxes.consumption + 0.05, corporate: start.taxes.corporate + 0.05 } }) : []) },
  { id: 'R04', group: 'recovery', name: 'High taxes for 26 weeks, then undo', parameters: 'B03 in weeks 2-26, starting settings from week 27',
    plan: ({ country, week, start }) => (week === 2 ? fiscalCommands(country, { taxes: { income: start.taxes.income + 0.1, consumption: start.taxes.consumption + 0.1, corporate: start.taxes.corporate + 0.1 } })
      : week === 27 ? fiscalCommands(country, { taxes: { ...start.taxes } }) : []) },
  { id: 'X10', group: 'variant', name: 'Welfare, then cut back', parameters: 'social 18% in weeks 2-103, back to 10% from week 104',
    plan: ({ country, week }) => (week === 2 ? fiscalCommands(country, { spending: { social: 0.18 } }) : week === 104 ? fiscalCommands(country, { spending: { social: 0.1 } }) : []) },
];
const ALL = [...STRATEGIES, ...extra];
const SWEEP = ['B01', 'B02', 'B03', 'M05', 'B05', 'B07', 'B08', 'B09', 'B10', 'B12', 'X01', 'X02', 'X03', 'X04', 'X05', 'X08', 'R01', 'R02', 'R03', 'R04', 'X10'];

function withParams(session: EconomySession, overrides: Record<string, number>): EconomySession {
  if (Object.keys(overrides).length === 0) return session;
  const data = JSON.parse(saveEconomySession(session));
  Object.assign(data.economy.config.params, overrides);
  return loadEconomySession(JSON.stringify(data));
}

/** What the tables need, to keep the saved data small: per checkpoint six indicators; for the sweep only the outcome. */
const KEPT = ['gdpReal', 'unemployment', 'debtToGdp', 'stability', 'consumptionPerCapita', 'cpiYoY'] as const;
type SlimCheckpoint = Pick<NonNullable<Run['checkpoints'][number]>, typeof KEPT[number]>;
interface Slim { strategy: string; country: string; seed: number; defeatWeek: number | null; checkpoints: (SlimCheckpoint | null)[] }
const slim = (run: Run, outcomeOnly = false): Slim => ({
  strategy: run.strategy, country: run.country, seed: run.seed, defeatWeek: run.defeatWeek,
  checkpoints: outcomeOnly ? [] : run.checkpoints.map(c => (c ? Object.fromEntries(KEPT.map(k => [k, c[k]])) as SlimCheckpoint : null)),
});

function runConfig(name: string): void {
  const overrides = CONFIGS[name];
  const save = readFileSync(resolve(here, '../scenarios/fictional-week1.economy.json'), 'utf8');
  const started = performance.now();
  const detailed: Slim[] = [];
  const sweep: Slim[] = [];
  const world = (seed: number) => ({ ...fictionalGameWorld(null), seed });
  const base = (seed: number) => withParams(seed === 2401 ? startEconomyFromSave(save, fictionalGameWorld(null)) : createEconomySession(world(seed)), overrides);
  for (const seed of SEEDS) {
    const session = base(seed);
    for (const country of COUNTRIES) {
      const baseline = play(session, STRATEGIES[0], country, seed, undefined, true);
      detailed.push(slim(baseline));
      for (const strategy of ALL.slice(1)) detailed.push(slim(play(session, strategy, country, seed, baseline)));
    }
  }
  for (const seed of SWEEP_SEEDS) {
    const session = base(seed);
    for (const country of COUNTRIES) {
      const baseline = play(session, STRATEGIES[0], country, seed, undefined, true);
      for (const id of SWEEP) sweep.push(slim(id === 'B01' ? baseline : play(session, ALL.find(s => s.id === id)!, country, seed, baseline), true));
    }
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, `${name}.json`), JSON.stringify({ config: name, overrides, detailed, sweep, seconds: (performance.now() - started) / 1000 },
    (_key, value) => (typeof value === 'number' ? Number(value.toPrecision(6)) : value)));
  process.stdout.write(`${name}: ${detailed.length + sweep.length} runs in ${((performance.now() - started) / 1000).toFixed(0)} s\n`);
}

// ------------------------------------------------------------------- tables
const pct = (x: number, d = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : '—');
const signed = (x: number, d = 1) => (Number.isFinite(x) ? `${x > 0 ? '+' : ''}${(x * 100).toFixed(d)}%` : '—');
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

function merge(): void {
  const data: Record<string, { detailed: Slim[]; sweep: Slim[]; seconds: number }> = {};
  for (const name of Object.keys(CONFIGS)) data[name] = JSON.parse(readFileSync(resolve(out, `${name}.json`), 'utf8'));
  const names = Object.keys(CONFIGS);
  const lines: string[] = ['# ECON-07 comparative data', '', 'Generated by `npm run econ07:compare` (`sim/econ07-compare.ts`). Do not edit by hand.', ''];
  lines.push('Configurations: **before** = every ECON-07 parameter at its legacy value (the pre-ECON-07 engine); **A**, **B**, **C** = one correction alone; **all** = the corrected engine.', '');
  lines.push('Means over the 9 runs (Alden, Belora, Cyrin × seeds 2401, 7, 99) still in office at that week; "vs base" compares with the baseline run (B01) of the same configuration, country and seed. Defeat rates come from 60 further games (20 seeds × 3 countries).', '');
  lines.push('## Strategies added for ECON-07', '', '| ID | Strategy | Parameters |', '|---|---|---|', ...extra.map(s => `| ${s.id} | ${s.name} | ${s.parameters} |`), '');

  const find = (cfg: string, id: string, c: string, seed: number) => data[cfg].detailed.find(r => r.strategy === id && r.country === c && r.seed === seed)!;
  const at = (cfg: string, id: string, k: number) => {
    const rows = data[cfg].detailed.filter(r => r.strategy === id);
    const alive = rows.filter(r => r.checkpoints[k]);
    const m = (f: (r: Slim) => number) => mean(alive.map(f));
    const cp = (r: Slim) => r.checkpoints[k]!;
    const b = (r: Slim) => find(cfg, 'B01', r.country, r.seed).checkpoints[k]!;
    return {
      alive: alive.length, n: rows.length,
      gdp: m(r => cp(r).gdpReal / b(r).gdpReal - 1), unemployment: m(r => cp(r).unemployment), debt: m(r => cp(r).debtToGdp),
      stability: m(r => cp(r).stability), consumption: m(r => cp(r).consumptionPerCapita / b(r).consumptionPerCapita - 1), cpi: m(r => cp(r).cpiYoY),
    };
  };
  const defeat = (cfg: string, id: string) => {
    const rows = data[cfg].sweep.filter(r => r.strategy === id);
    return { lost: rows.filter(r => r.defeatWeek !== null).length, n: rows.length };
  };

  lines.push('## Defeat probability (60 games per cell: 20 seeds × 3 countries, 156 weeks)', '');
  lines.push(`| ID | Strategy | ${names.join(' | ')} |`, `|---|---|${names.map(() => '---:').join('|')}|`);
  for (const id of SWEEP) {
    lines.push(`| ${id} | ${ALL.find(s => s.id === id)!.name} | ${names.map(cfg => { const d = defeat(cfg, id); return `${d.lost}/${d.n} (${Math.round(100 * d.lost / d.n)}%)`; }).join(' | ')} |`);
  }
  lines.push('');
  for (const [k, week] of [52, 104, 156].entries()) {
    lines.push(`## Week ${week}`, '');
    lines.push('Each cell: real GDP vs base · unemployment · debt/GDP · stability · consumption per head vs base · in office (of 9).', '');
    lines.push(`| ID | ${names.join(' | ')} |`, `|---|${names.map(() => '---').join('|')}|`);
    for (const strategy of ALL) {
      lines.push(`| ${strategy.id} | ${names.map(cfg => {
        const s = at(cfg, strategy.id, k);
        return s.alive === 0 ? `all defeated` : `${signed(s.gdp)} · ${pct(s.unemployment)} · ${pct(s.debt, 0)} · ${s.stability.toFixed(0)} · ${signed(s.consumption)} · ${s.alive}/${s.n}`;
      }).join(' | ')} |`);
    }
    lines.push('');
  }
  lines.push('## Run time per configuration', '', ...names.map(cfg => `- ${cfg}: ${data[cfg].seconds.toFixed(0)} s for ${data[cfg].detailed.length + data[cfg].sweep.length} runs`), '');
  writeFileSync(resolve(here, '../reports/ECON_07_DATA.md'), lines.join('\n'));
  process.stdout.write('wrote reports/ECON_07_DATA.md\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--config');
  if (index > 0) runConfig(process.argv[index + 1]);
  else if (process.argv.includes('--merge')) merge();
  else {
    // All configurations in parallel child processes (one per configuration), then the tables.
    await Promise.all(Object.keys(CONFIGS).map(name => new Promise<void>((done, fail) => {
      const child = spawn(process.execPath, ['--experimental-strip-types', fileURLToPath(import.meta.url), '--config', name], { stdio: 'inherit' });
      child.on('exit', code => (code === 0 ? done() : fail(new Error(`${name} failed (${code})`))));
    })));
    merge();
  }
}

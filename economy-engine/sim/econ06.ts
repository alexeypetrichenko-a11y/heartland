/**
 * ECON-06: economic gameplay validation on the fictional scenario (analysis only).
 *
 *   npm run econ06            (writes reports/ECON_06_DATA.md and reports/econ06.json)
 *
 * Plays ten player strategies (plus a few variants that probe specific exploit questions)
 * for each of the three fictional countries and three world seeds, 156 weeks each, through
 * the integration API, exactly as the game would: the player country follows the strategy,
 * the two others are steered by the engine's autopilot. Nothing in the engine is changed;
 * every number comes from the engine's own views, reports and history.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CountryEconomyView, EconomyCommand, EconomySession } from '../src/integration/index.ts';
import {
  advanceEconomyWeek, createEconomySession, fictionalGameWorld, fiscalCommands, getCountryEconomy, withPlayerCountry,
} from '../src/integration/index.ts';
import { getCountryHistory } from '../src/index.ts';

const COUNTRIES = ['alden', 'belora', 'cyrin'] as const;
const SEEDS = [2401, 7, 99];
const CHECKPOINTS = [52, 104, 156];

type Plan = (country: string, week: number, start: CountryEconomyView) => EconomyCommand[];
interface Strategy { id: string; name: string; plan: Plan; variant?: boolean }

const once = (week: number, at: number, commands: () => EconomyCommand[]) => (week === at ? commands() : []);
const fiscal = (changes: Parameters<typeof fiscalCommands>[1]): Plan => (country, week) => once(week, 2, () => fiscalCommands(country, changes));

export const STRATEGIES: Strategy[] = [
  { id: 'S1', name: 'Baseline (no intervention)', plan: () => [] },
  { id: 'S2', name: 'Low taxes, high spending', plan: fiscal({ taxes: { income: 0.05, consumption: 0.03, corporate: 0.05 }, spending: { administration: 0.15, social: 0.18, military: 0.04, infrastructure: 0.05 } }) },
  { id: 'S3', name: 'High taxes, restrained spending', plan: fiscal({ taxes: { income: 0.35, consumption: 0.2, corporate: 0.35 }, spending: { administration: 0.09, social: 0.08, military: 0.02, infrastructure: 0.02 } }) },
  { id: 'S4', name: 'Heavy infrastructure (10% of GDP)', plan: fiscal({ spending: { infrastructure: 0.1 } }) },
  { id: 'S5', name: 'Heavy military (10% of GDP)', plan: fiscal({ spending: { military: 0.1 } }) },
  { id: 'S6', name: 'High social spending (20% of GDP)', plan: fiscal({ spending: { social: 0.2 } }) },
  { id: 'S7', name: 'Maximum taxation (all taxes 70%)', plan: fiscal({ taxes: { income: 0.7, consumption: 0.7, corporate: 0.7 } }) },
  { id: 'S8', name: 'Maximum spending (all categories 50%)', plan: fiscal({ spending: { administration: 0.5, social: 0.5, military: 0.5, infrastructure: 0.5 } }) },
  { id: 'S9', name: 'Deliberate default (week 26)', plan: (country, week) => once(week, 26, () => [{ type: 'declare-default', countryId: country }]) },
  {
    id: 'S10', name: 'Balanced long-term (taxes +3 pts, infrastructure 4%)',
    plan: (country, week, start) => once(week, 2, () => fiscalCommands(country, {
      taxes: { income: start.fiscal.taxes.income + 0.03 },
      spending: { administration: 0.11, social: 0.11, infrastructure: 0.04 },
    })),
  },
  // Variants probing specific exploit questions.
  { id: 'V1', name: 'Borrow-and-default (S2, then default at week 52)', variant: true,
    plan: (country, week, start) => [...STRATEGIES[1].plan(country, week, start), ...once(week, 52, () => [{ type: 'declare-default', countryId: country }])] },
  { id: 'V2', name: 'Repeated default (weeks 26, 52, 78)', variant: true,
    plan: (country, week) => ([26, 52, 78].includes(week) ? [{ type: 'declare-default', countryId: country }] : []) },
  { id: 'V3', name: 'Tax cut only (all taxes 5%, spending unchanged)', variant: true, plan: fiscal({ taxes: { income: 0.05, consumption: 0.05, corporate: 0.05 } }) },
  { id: 'V4', name: 'Infrastructure 10% financed by +6 pts income tax', variant: true,
    plan: (country, week, start) => once(week, 2, () => fiscalCommands(country, { taxes: { income: start.fiscal.taxes.income + 0.06 }, spending: { infrastructure: 0.1 } })) },
  { id: 'V5', name: 'Austerity (all spending halved)', variant: true,
    plan: (country, week, start) => once(week, 2, () => fiscalCommands(country, { spending: {
      administration: start.fiscal.spending.administration / 2, social: start.fiscal.spending.social / 2,
      military: start.fiscal.spending.military / 2, infrastructure: start.fiscal.spending.infrastructure / 2 } })) },
  { id: 'V6', name: 'Spend then default (social 20%, default at week 104)', variant: true,
    plan: (country, week, start) => [...STRATEGIES[5].plan(country, week, start), ...once(week, 104, () => [{ type: 'declare-default', countryId: country }])] },
  { id: 'V7', name: 'Default then spend (default week 26, social 20% from week 27)', variant: true,
    plan: (country, week) => [...once(week, 26, () => [{ type: 'declare-default', countryId: country }]), ...once(week, 27, () => fiscalCommands(country, { spending: { social: 0.2 } }))] },
];

export interface Checkpoint {
  week: number; gdpReal: number; gdpGrowth: number | null; inflation: number; unemployment: number; revenue: number; expenditure: number;
  balance: number; fundedShare: number; treasury: number; debt: number; debtToGdp: number; marketAccess: boolean; marketRate: number;
  consumptionPerCapita: number; deprivation: number; worstShortage: number; stability: number; unrestTier: number; regime: number;
  policyRate: number;
}
export interface Run {
  strategy: string; country: string; seed: number; checkpoints: Checkpoint[];
  events: Record<string, number>; firstRegimeChangeWeek: number | null; minStability: number; maxUnemployment: number;
  minFundedShare: number; maxInflation: number; marketAccessLostWeeks: number; weeksToEffect: number | null;
}

function checkpoint(session: EconomySession, country: string): Checkpoint {
  const view = getCountryEconomy(session, country);
  const legal = session.summary.regions.filter(region => region.legalOwnerId === country);
  const people = legal.reduce((total, region) => total + region.population, 0);
  const consumption = getCountryHistory(session.state, country, 'consumptionPerCapita').values;
  return {
    week: session.week, gdpReal: view.gdpReal, gdpGrowth: view.gdpGrowth, inflation: view.inflation, unemployment: view.unemployment,
    revenue: view.budget.revenue, expenditure: view.budget.expenditure, balance: view.budget.balance, fundedShare: view.budget.fundedShare,
    treasury: view.treasury, debt: view.debt, debtToGdp: view.debtToGdp, marketAccess: view.marketAccess, marketRate: view.marketRate,
    consumptionPerCapita: consumption[consumption.length - 1] ?? 0,
    deprivation: people > 0 ? legal.reduce((total, region) => total + region.deprivation * region.population, 0) / people : 0,
    worstShortage: Math.max(...view.sectors.map(sector => sector.shortage)), stability: view.stability, unrestTier: view.unrestTier,
    regime: view.regime, policyRate: view.centralBank.policyRate,
  };
}

export function play(base: EconomySession, strategy: Strategy, country: string, seed: number, baseline?: Run): Run {
  let session = withPlayerCountry(base, country);
  const start = getCountryEconomy(session, country);
  const checkpoints: Checkpoint[] = [];
  const events: Record<string, number> = {};
  let firstRegimeChangeWeek: number | null = null;
  let minStability = Infinity, maxUnemployment = 0, minFundedShare = Infinity, maxInflation = -Infinity, marketAccessLostWeeks = 0;
  const gdpPath: number[] = [];
  for (let week = 2; week <= 156; week++) {
    session = advanceEconomyWeek(session, { playerCommands: strategy.plan(country, week, start) });
    const view = getCountryEconomy(session, country);
    gdpPath.push(view.gdpReal);
    minStability = Math.min(minStability, view.stability);
    maxUnemployment = Math.max(maxUnemployment, view.unemployment);
    minFundedShare = Math.min(minFundedShare, view.budget.fundedShare);
    maxInflation = Math.max(maxInflation, view.inflation);
    if (!view.marketAccess) marketAccessLostWeeks++;
    for (const event of session.summary.events) {
      if (event.countryId !== country) continue;
      events[event.type] = (events[event.type] ?? 0) + 1;
      if (event.type === 'regime-change' && firstRegimeChangeWeek === null) firstRegimeChangeWeek = session.week;
    }
    if (CHECKPOINTS.includes(session.week)) checkpoints.push(checkpoint(session, country));
  }
  // Weeks until real GDP first differs from the baseline run by more than 1% (how fast a strategy "shows").
  let weeksToEffect: number | null = null;
  if (baseline && (baseline as Run & { gdpPath?: number[] }).gdpPath) {
    const reference = (baseline as Run & { gdpPath: number[] }).gdpPath;
    for (let k = 0; k < gdpPath.length; k++) if (Math.abs(gdpPath[k] / reference[k] - 1) > 0.01) { weeksToEffect = k + 2; break; }
  }
  const run: Run & { gdpPath: number[] } = {
    strategy: strategy.id, country, seed, checkpoints, events, firstRegimeChangeWeek, minStability, maxUnemployment, minFundedShare, maxInflation,
    marketAccessLostWeeks, weeksToEffect, gdpPath,
  };
  return run;
}

// ---------------------------------------------------------------------------
const here = dirname(fileURLToPath(import.meta.url));
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const started = performance.now();
  const runs: (Run & { gdpPath?: number[] })[] = [];
  for (const seed of SEEDS) {
    const world = { ...fictionalGameWorld(null), seed };
    const base = createEconomySession(world);
    for (const country of COUNTRIES) {
      const baseline = play(base, STRATEGIES[0], country, seed);
      runs.push(baseline);
      for (const strategy of STRATEGIES.slice(1)) runs.push(play(base, strategy, country, seed, baseline));
    }
    console.log(`seed ${seed} done (${((performance.now() - started) / 1000).toFixed(1)} s)`);
  }
  const slim = runs.map(({ gdpPath, ...rest }) => { void gdpPath; return rest; });
  writeFileSync(resolve(here, '..', 'reports', 'econ06.json'), JSON.stringify({ strategies: STRATEGIES.map(s => ({ id: s.id, name: s.name, variant: !!s.variant })), runs: slim }, null, 1));
  writeFileSync(resolve(here, '..', 'reports', 'ECON_06_DATA.md'), renderTables(slim));
  console.log(`${runs.length} runs in ${((performance.now() - started) / 1000).toFixed(1)} s; wrote reports/ECON_06_DATA.md and reports/econ06.json`);
}

function renderTables(runs: Run[]): string {
  const pct = (x: number | null, d = 1) => (x === null || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(d)}%`);
  const num = (x: number, d = 1) => x.toFixed(d);
  const lines: string[] = ['# ECON-06 data tables', '',
    'Generated by `npm run econ06`. Fictional scenario, 156 weeks, the player country follows the strategy and the two others are run by the autopilot. Seed 2401 is the game\'s seed; seeds 7 and 99 repeat the study. Money in illustrative units; rates annualised; GDP is weekly real GDP of the regions the country controls.', ''];
  const at = (run: Run, week: number) => run.checkpoints.find(c => c.week === week)!;
  const find = (strategy: string, country: string, seed: number) => runs.find(r => r.strategy === strategy && r.country === country && r.seed === seed)!;
  const strategyIds = [...new Set(runs.map(r => r.strategy))];
  for (const seed of SEEDS) {
    for (const country of COUNTRIES) {
      lines.push(`## ${country[0].toUpperCase() + country.slice(1)}, seed ${seed}`, '');
      for (const week of CHECKPOINTS) {
        lines.push(`### Week ${week}`, '',
          '| Strategy | Real GDP (vs baseline) | Growth | Inflation | Unemployment | Revenue | Expenditure | Funded | Treasury | Debt / GDP | Market | Consumption / head (vs baseline) | Deprivation | Worst shortage | Stability | Unrest tier | Regime changes |',
          '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|');
        const baseline = at(find('S1', country, seed), week);
        for (const id of strategyIds) {
          const c = at(find(id, country, seed), week);
          lines.push(`| ${id} | ${num(c.gdpReal)} (${pct(c.gdpReal / baseline.gdpReal - 1)}) | ${pct(c.gdpGrowth)} | ${pct(c.inflation)} | ${pct(c.unemployment)} | ${num(c.revenue, 2)} | ${num(c.expenditure, 2)} | ${pct(c.fundedShare, 0)} | ${num(c.treasury)} | ${pct(c.debtToGdp, 0)} | ${c.marketAccess ? 'open' : 'closed'} (${pct(c.marketRate)}) | ${num(c.consumptionPerCapita, 3)} (${pct(c.consumptionPerCapita / baseline.consumptionPerCapita - 1)}) | ${pct(c.deprivation)} | ${pct(c.worstShortage, 0)} | ${num(c.stability, 0)} | ${c.unrestTier} | ${c.regime} |`);
        }
        lines.push('');
      }
      lines.push('#### Over the whole 156 weeks', '', '| Strategy | Defaults | Missed payments | Market access lost (weeks) | Regime changes (first) | Lowest stability | Highest unemployment | Highest inflation | Lowest funded share | Weeks until GDP differs >1% from baseline |', '|---|---:|---:|---:|---|---:|---:|---:|---:|---:|');
      for (const id of strategyIds) {
        const r = find(id, country, seed);
        lines.push(`| ${id} | ${r.events['sovereign-default'] ?? 0} | ${r.events['missed-payment'] ?? 0} | ${r.marketAccessLostWeeks} | ${r.events['regime-change'] ?? 0}${r.firstRegimeChangeWeek ? ` (week ${r.firstRegimeChangeWeek})` : ''} | ${num(r.minStability, 0)} | ${pct(r.maxUnemployment)} | ${pct(r.maxInflation)} | ${pct(r.minFundedShare, 0)} | ${r.weeksToEffect ?? '—'} |`);
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}

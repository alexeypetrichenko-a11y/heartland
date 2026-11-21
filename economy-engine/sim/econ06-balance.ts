/**
 * ECON-06: economic gameplay balance and strategy analysis (analysis only, nothing in the engine changes).
 *
 *   npm run econ06:balance
 *
 * Writes:
 *   reports/econ06_balance.json          every run: checkpoints at weeks 52/104/156, whole-run statistics,
 *                                        weekly series (seed 2401 only)
 *   reports/ECON_06_BALANCE_DATA.md      full tables per country and week, AI comparison, verification checks
 *   reports/econ06-charts/*.svg          line charts for Alden, seed 2401
 *
 * How a run is played:
 *   - The world starts exactly as the production game starts it: seed 2401 from the pre-built week-1 save
 *     (`startEconomyFromSave`, the path `src/game/economyBridge.ts` uses). Seeds 7 and 99 are built with
 *     `createEconomySession` (the save only exists for seed 2401; the two paths are verified identical below).
 *   - The player country follows the strategy through the public integration API (`fiscalCommands`,
 *     `declare-default`). The two other countries are steered by the engine's autopilot, as in the game.
 *   - Region control never changes (no military operations), so every difference comes from fiscal policy.
 *     The only random draws in these runs are the engine's seeded regime rolls and harvest noise.
 *   - Defeat: the first regime change of the player's country (`summary.playerRegimeFell`) is the human
 *     player's defeat (GAME_DESIGN.md section 6). The run stops there; later checkpoints are recorded as
 *     "defeated" and no further decisions are treated as gameplay.
 *   - "AI" runs: the same country with nobody's commands but the autopilot's (the player seat is given to
 *     another country that issues no commands), to compare the autopilot with a passive player.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CountryEconomyView, EconomyCommand, EconomySession } from '../src/integration/index.ts';
import {
  advanceEconomyWeek, createEconomySession, economyFingerprint, fictionalGameWorld, fiscalCommands, getCountryEconomy,
  startEconomyFromSave, withPlayerCountry,
} from '../src/integration/index.ts';
import { getCountryHistory } from '../src/index.ts';

const COUNTRIES = ['alden', 'belora', 'cyrin'] as const;
const SEEDS = [2401, 7, 99];
const CHECKPOINTS = [52, 104, 156];
const LAST_WEEK = 156;
const here = dirname(fileURLToPath(import.meta.url));
const reports = resolve(here, '../reports');

// --------------------------------------------------------------------------- strategies
type Fiscal = CountryEconomyView['fiscal'];
interface PlanContext { country: string; week: number; start: Fiscal; view: CountryEconomyView; memory: Record<string, number> }
type Plan = (context: PlanContext) => EconomyCommand[];
export interface Strategy { id: string; group: 'requested' | 'variant' | 'recovery' | 'ai'; name: string; parameters: string; plan: Plan }

const at = (week: number, target: number, commands: () => EconomyCommand[]) => (week === target ? commands() : []);
const fiscalAt = (week: number, build: (start: Fiscal) => Parameters<typeof fiscalCommands>[1]): Plan =>
  ({ country, week: now, start }) => at(now, week, () => fiscalCommands(country, build(start)));
const def = (country: string): EconomyCommand => ({ type: 'declare-default', countryId: country });
const restore = (start: Fiscal) => ({ taxes: { ...start.taxes }, spending: { ...start.spending } });
const combine = (...plans: Plan[]): Plan => context => plans.flatMap(plan => plan(context));

const lowTax = (s: Fiscal) => ({ taxes: { income: s.taxes.income / 2, consumption: s.taxes.consumption / 2, corporate: s.taxes.corporate / 2 } });
const highTax = (s: Fiscal) => ({ taxes: { income: s.taxes.income + 0.1, consumption: s.taxes.consumption + 0.1, corporate: s.taxes.corporate + 0.1 } });
const austerity = (s: Fiscal) => ({ spending: {
  administration: s.spending.administration * 0.7, social: s.spending.social * 0.7,
  military: s.spending.military * 0.7, infrastructure: s.spending.infrastructure * 0.7 } });
const expansion = (s: Fiscal) => ({ ...lowTax(s), spending: { administration: 0.14, social: 0.14, military: 0.03, infrastructure: 0.04 } });
const maxTax = () => ({ taxes: { income: 0.7, consumption: 0.7, corporate: 0.7 } });
const surplusTrap = () => ({ taxes: { income: 0.35, consumption: 0.2, corporate: 0.35 }, spending: { administration: 0.09, social: 0.08, military: 0.02, infrastructure: 0.02 } });

export const STRATEGIES: Strategy[] = [
  // The twelve requested strategies.
  { id: 'B01', group: 'requested', name: 'Baseline', parameters: 'no command: starting settings kept', plan: () => [] },
  { id: 'B02', group: 'requested', name: 'Low taxes', parameters: 'all three taxes halved; spending unchanged', plan: fiscalAt(2, lowTax) },
  { id: 'B03', group: 'requested', name: 'High taxes', parameters: 'all three taxes +10 points; spending unchanged', plan: fiscalAt(2, highTax) },
  { id: 'B04', group: 'requested', name: 'Infrastructure-led growth', parameters: 'infrastructure 6% of GDP (3x); rest unchanged', plan: fiscalAt(2, () => ({ spending: { infrastructure: 0.06 } })) },
  { id: 'B05', group: 'requested', name: 'Social welfare', parameters: 'social 18% of GDP (from 10%); rest unchanged', plan: fiscalAt(2, () => ({ spending: { social: 0.18 } })) },
  { id: 'B06', group: 'requested', name: 'Military-first', parameters: 'military 8% of GDP (4x); rest unchanged', plan: fiscalAt(2, () => ({ spending: { military: 0.08 } })) },
  { id: 'B07', group: 'requested', name: 'Austerity', parameters: 'all four spending categories cut by 30%; taxes unchanged (surpluses repay debt automatically)', plan: fiscalAt(2, austerity) },
  { id: 'B08', group: 'requested', name: 'Deficit-financed expansion', parameters: 'taxes halved; administration 14%, social 14%, military 3%, infrastructure 4%', plan: fiscalAt(2, expansion) },
  { id: 'B09', group: 'requested', name: 'Maximum taxation', parameters: 'all three taxes at the 70% limit', plan: fiscalAt(2, maxTax) },
  { id: 'B10', group: 'requested', name: 'Maximum spending', parameters: 'all four categories at the 50%-of-GDP limit', plan: fiscalAt(2, () => ({ spending: { administration: 0.5, social: 0.5, military: 0.5, infrastructure: 0.5 } })) },
  { id: 'B11', group: 'requested', name: 'Balanced growth', parameters: 'income tax +3 points; administration 11%, social 11%, infrastructure 4%',
    plan: fiscalAt(2, s => ({ taxes: { income: s.taxes.income + 0.03 }, spending: { administration: 0.11, social: 0.11, infrastructure: 0.04 } })) },
  { id: 'B12', group: 'requested', name: 'Borrow, then default', parameters: 'B08 until market access is lost (or week 52), then declare default and return to starting settings',
    plan: ({ country, week, start, view, memory }) => {
      if (week === 2) return fiscalCommands(country, expansion(start));
      if (!memory.defaulted && week > 2 && (!view.marketAccess || week === 52)) {
        memory.defaulted = week;
        return [def(country), ...fiscalCommands(country, restore(start))];
      }
      return [];
    } },
  // Variants that isolate a mechanism or an exploit.
  { id: 'X01', group: 'variant', name: 'Strategic default', parameters: 'declare default in week 26 from the baseline', plan: ({ country, week }) => at(week, 26, () => [def(country)]) },
  { id: 'X02', group: 'variant', name: 'Default, then welfare', parameters: 'default in week 26, social 18% from week 27',
    plan: ({ country, week }) => [...at(week, 26, () => [def(country)]), ...at(week, 27, () => fiscalCommands(country, { spending: { social: 0.18 } }))] },
  { id: 'X03', group: 'variant', name: 'Welfare, then default', parameters: 'B05, then default in week 104',
    plan: combine(fiscalAt(2, () => ({ spending: { social: 0.18 } })), ({ country, week }) => at(week, 104, () => [def(country)])) },
  { id: 'X04', group: 'variant', name: 'Repeated defaults', parameters: 'default in weeks 26, 52 and 78', plan: ({ country, week }) => ([26, 52, 78].includes(week) ? [def(country)] : []) },
  { id: 'X05', group: 'variant', name: 'High taxes with spending cuts', parameters: 'taxes 35% / 20% / 35%; administration 9%, social 8% (surplus test)', plan: fiscalAt(2, surplusTrap) },
  { id: 'X06', group: 'variant', name: 'Tax-financed infrastructure', parameters: 'infrastructure 6% and income tax +4 points',
    plan: fiscalAt(2, s => ({ taxes: { income: s.taxes.income + 0.04 }, spending: { infrastructure: 0.06 } })) },
  { id: 'X07', group: 'variant', name: 'Infrastructure at saturation', parameters: 'infrastructure 3.6% (the share that already reaches the engine\'s infrastructure ceiling)',
    plan: fiscalAt(2, () => ({ spending: { infrastructure: 0.036 } })) },
  { id: 'X08', group: 'variant', name: 'One category at the limit', parameters: 'social 50% of GDP; rest unchanged', plan: fiscalAt(2, () => ({ spending: { social: 0.5 } })) },
  { id: 'X09', group: 'variant', name: 'Tax cut with spending cut', parameters: 'taxes halved and all spending cut 30% (small-state)', plan: fiscalAt(2, s => ({ ...lowTax(s), ...austerity(s) })) },
  // Recovery from a bad decision.
  { id: 'R01', group: 'recovery', name: 'Maximum taxation for 8 weeks, then undo', parameters: 'B09 in weeks 2-9, starting settings from week 10',
    plan: combine(fiscalAt(2, maxTax), fiscalAt(10, restore)) },
  { id: 'R02', group: 'recovery', name: 'High taxes with spending cuts for 13 weeks, then undo', parameters: 'X05 in weeks 2-14, starting settings from week 15',
    plan: combine(fiscalAt(2, surplusTrap), fiscalAt(15, restore)) },
  { id: 'R03', group: 'recovery', name: 'Deficit expansion for a year, then undo', parameters: 'B08 in weeks 2-52, starting settings from week 53',
    plan: combine(fiscalAt(2, expansion), fiscalAt(53, restore)) },
];
const AI_RUN: Strategy = { id: 'AI', group: 'ai', name: 'Autopilot (AI-controlled)', parameters: 'the engine\'s fiscal autopilot steers this country; another country holds the passive player seat', plan: () => [] };

// --------------------------------------------------------------------------- measurement
export interface Checkpoint {
  week: number; gdpReal: number; gdpGrowth: number | null; cpiYoY: number; inflation: number; unemployment: number;
  revenue: number; expenditure: number; balance: number; interest: number; fundedShare: number; treasury: number; debt: number;
  debtToGdp: number; marketAccess: boolean; marketRate: number; policyRate: number;
  output: number; capacity: number; utilization: number; sectors: Record<string, number>; infrastructure: number; technology: number;
  worstShortage: number; sectorsShort: number; deprivation: number; consumptionPerCapita: number;
  stability: number; unrestTier: number; regime: number; fiscal: Fiscal;
}
export interface Run {
  strategy: string; country: string; seed: number; controller: 'player' | 'ai';
  checkpoints: (Checkpoint | null)[]; defeatWeek: number | null; weeksPlayed: number;
  events: Record<string, number>; declaredDefaults: number; forcedDefaults: number; debtWrittenOff: number;
  unrestWeeks: number; marketClosedWeeks: number; minStability: number; maxUnemployment: number; maxInflation: number;
  maxCpiYoY: number; minFundedShare: number; weeksToGdpEffect: number | null; weeksToStabilityEffect: number | null;
  firstMarketLossWeek: number | null; treasuryResidual: number; debtResidual: number;
  aiNeighbours: Record<string, { gdpReal: number; stability: number }>;
  series?: Record<string, number[]>;
}

const SERIES = ['gdpReal', 'stability', 'unemployment', 'debtToGdp', 'cpiYoY', 'marketRate'] as const;

function zoneMeans(session: EconomySession, country: string) {
  const state = session.state as unknown as { zones: { id: string }[]; zone: { infrastructure: Float64Array; technology: Float64Array; population: Float64Array } };
  const regions = session.summary.regions.filter(region => region.legalOwnerId === country).map(region => region.regionId);
  let people = 0, infrastructure = 0, technology = 0;
  state.zones.forEach((zone, z) => {
    if (!regions.includes(zone.id)) return;
    const weight = state.zone.population[z];
    people += weight; infrastructure += weight * state.zone.infrastructure[z]; technology += weight * state.zone.technology[z];
  });
  return { infrastructure: people > 0 ? infrastructure / people : 0, technology: people > 0 ? technology / people : 0 };
}

function lastValue(session: EconomySession, country: string, metric: 'cpi' | 'consumptionPerCapita'): number {
  const values = getCountryHistory(session.state, country, metric).values;
  return values[values.length - 1] ?? 0;
}

function checkpoint(session: EconomySession, country: string, cpiPath: number[]): Checkpoint {
  const view = getCountryEconomy(session, country);
  const legal = session.summary.regions.filter(region => region.legalOwnerId === country);
  const people = legal.reduce((total, region) => total + region.population, 0);
  const output = view.sectors.reduce((total, sector) => total + sector.output, 0);
  const capacity = view.sectors.reduce((total, sector) => total + sector.capacity, 0);
  const { infrastructure, technology } = zoneMeans(session, country);
  return {
    week: session.week, gdpReal: view.gdpReal, gdpGrowth: view.gdpGrowth, cpiYoY: yoy(cpiPath), inflation: view.inflation,
    unemployment: view.unemployment, revenue: view.budget.revenue, expenditure: view.budget.expenditure, balance: view.budget.balance,
    interest: view.budget.interest, fundedShare: view.budget.fundedShare, treasury: view.treasury, debt: view.debt, debtToGdp: view.debtToGdp,
    marketAccess: view.marketAccess, marketRate: view.marketRate, policyRate: view.centralBank.policyRate,
    output, capacity, utilization: capacity > 0 ? output / capacity : 0,
    sectors: Object.fromEntries(view.sectors.map(sector => [sector.sectorId, sector.output])), infrastructure, technology,
    worstShortage: Math.max(...view.sectors.map(sector => sector.shortage)), sectorsShort: view.sectors.filter(sector => sector.shortage > 0.05).length,
    deprivation: people > 0 ? legal.reduce((total, region) => total + region.deprivation * region.population, 0) / people : 0,
    consumptionPerCapita: lastValue(session, country, 'consumptionPerCapita'),
    stability: view.stability, unrestTier: view.unrestTier, regime: view.regime, fiscal: structuredClone(view.fiscal),
  };
}

/** CPI change over the past 52 weeks; before week 53 the change since week 1 (labelled as such in the report). */
function yoy(cpiPath: number[]): number {
  const now = cpiPath[cpiPath.length - 1];
  const then = cpiPath[Math.max(0, cpiPath.length - 1 - 52)];
  return then > 0 ? now / then - 1 : 0;
}

export function play(base: EconomySession, strategy: Strategy, country: string, seed: number, baseline?: Run & { series?: Record<string, number[]> }, keepSeries = false): Run {
  const ai = strategy.group === 'ai';
  const seat = ai ? COUNTRIES.find(other => other !== country)! : country;
  let session = withPlayerCountry(base, seat);
  const start = structuredClone(getCountryEconomy(session, country).fiscal);
  const neighbours = COUNTRIES.filter(other => other !== country);
  const run: Run = {
    strategy: strategy.id, country, seed, controller: ai ? 'ai' : 'player', checkpoints: [], defeatWeek: null, weeksPlayed: 0,
    events: {}, declaredDefaults: 0, forcedDefaults: 0, debtWrittenOff: 0, unrestWeeks: 0, marketClosedWeeks: 0,
    minStability: Infinity, maxUnemployment: 0, maxInflation: -Infinity, maxCpiYoY: -Infinity, minFundedShare: Infinity,
    weeksToGdpEffect: null, weeksToStabilityEffect: null, firstMarketLossWeek: null, treasuryResidual: 0, debtResidual: 0, aiNeighbours: {},
  };
  const series: Record<string, number[]> = Object.fromEntries(SERIES.map(key => [key, [] as number[]]));
  const cpiPath = [lastValue(session, country, 'cpi')];
  const memory: Record<string, number> = {};
  let previous = getCountryEconomy(session, country);
  for (let week = 2; week <= LAST_WEEK; week++) {
    const commands = ai ? [] : strategy.plan({ country, week, start, view: previous, memory });
    session = advanceEconomyWeek(session, { playerCommands: commands });
    const view = getCountryEconomy(session, country);
    cpiPath.push(lastValue(session, country, 'cpi'));
    run.weeksPlayed = week - 1;
    let writtenOff = 0;
    for (const event of session.summary.events) {
      if (event.countryId !== country) continue;
      run.events[event.type] = (run.events[event.type] ?? 0) + 1;
      if (event.type === 'sovereign-default') {
        if (event.forced) run.forcedDefaults++; else run.declaredDefaults++;
        run.debtWrittenOff += event.debtWrittenOff; writtenOff += event.debtWrittenOff;
      }
      if (event.type === 'market-access-lost' && run.firstMarketLossWeek === null) run.firstMarketLossWeek = session.week;
    }
    // Accounting checks with the published figures: treasury and debt must move exactly as the budget says.
    const treasuryGap = view.treasury - previous.treasury - (view.budget.revenue - view.budget.expenditure + view.budget.borrowed - view.budget.repaid);
    const debtGap = view.debt - previous.debt - (view.budget.borrowed - view.budget.repaid + view.budget.detail.unpaidInterest - writtenOff);
    run.treasuryResidual = Math.max(run.treasuryResidual, Math.abs(treasuryGap));
    run.debtResidual = Math.max(run.debtResidual, Math.abs(debtGap));
    run.minStability = Math.min(run.minStability, view.stability);
    run.maxUnemployment = Math.max(run.maxUnemployment, view.unemployment);
    run.maxInflation = Math.max(run.maxInflation, view.inflation);
    if (cpiPath.length > 52) run.maxCpiYoY = Math.max(run.maxCpiYoY, yoy(cpiPath));
    run.minFundedShare = Math.min(run.minFundedShare, view.budget.fundedShare);
    if (!view.marketAccess) run.marketClosedWeeks++;
    if (view.unrestTier > 0) run.unrestWeeks++;
    const k = week - 2;
    const values = { gdpReal: view.gdpReal, stability: view.stability, unemployment: view.unemployment, debtToGdp: view.debtToGdp, cpiYoY: yoy(cpiPath), marketRate: view.marketRate };
    for (const key of SERIES) series[key].push(values[key]);
    if (baseline?.series) {
      if (run.weeksToGdpEffect === null && Math.abs(view.gdpReal / baseline.series.gdpReal[k] - 1) > 0.01) run.weeksToGdpEffect = week - 2;
      if (run.weeksToStabilityEffect === null && Math.abs(view.stability - baseline.series.stability[k]) > 3) run.weeksToStabilityEffect = week - 2;
    }
    if (CHECKPOINTS.includes(session.week)) run.checkpoints.push(checkpoint(session, country, cpiPath));
    previous = view;
    // A human player's defeat ends the game: nothing after it counts as play.
    if (!ai && session.summary.playerRegimeFell) { run.defeatWeek = session.week; break; }
  }
  while (run.checkpoints.length < CHECKPOINTS.length) run.checkpoints.push(null);
  for (const other of neighbours) {
    const view = getCountryEconomy(session, other);
    run.aiNeighbours[other] = { gdpReal: view.gdpReal, stability: view.stability };
  }
  if (keepSeries || baseline === undefined) (run as Run & { series: Record<string, number[]> }).series = series;
  return run;
}

// --------------------------------------------------------------------------- output helpers
const pct = (x: number | null | undefined, digits = 1) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(digits)}%`);
const signed = (x: number | null | undefined, digits = 1) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : `${x > 0 ? '+' : ''}${(x * 100).toFixed(digits)}%`);
const num = (x: number | null | undefined, digits = 1) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x.toFixed(digits));
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN);

function lineChart(title: string, subtitle: string, weeks: number[], lines: { label: string; values: (number | null)[]; color: string; dash?: string; defeat?: number | null }[], format: (v: number) => string, zero?: number): string {
  const W = 880, H = 380, left = 64, right = 280, top = 58, bottom = 44;
  const all = lines.flatMap(line => line.values.filter((v): v is number => v !== null && Number.isFinite(v)));
  let lo = Math.min(...all, zero ?? Infinity), hi = Math.max(...all, zero ?? -Infinity);
  if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
  const x = (w: number) => left + (w - weeks[0]) / (weeks[weeks.length - 1] - weeks[0]) * (W - left - right);
  const y = (v: number) => top + (hi - v) / (hi - lo) * (H - top - bottom);
  const raw = (hi - lo) / 5, magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(f => f * magnitude).find(s => s >= raw)!;
  const tickValues: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-12; v += step) tickValues.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, -apple-system, Segoe UI, sans-serif" role="img" aria-label="${title}">\n`;
  svg += `<rect width="${W}" height="${H}" fill="#fcfcfb"/>\n<text x="${left}" y="24" font-size="16" font-weight="600" fill="#1a1a19">${title}</text>\n<text x="${left}" y="44" font-size="12" fill="#5f5e5a">${subtitle}</text>\n`;
  for (const v of tickValues) {
    svg += `<line x1="${left}" x2="${W - right}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="#e6e5e0" stroke-width="1"/>`;
    svg += `<text x="${left - 8}" y="${(y(v) + 4).toFixed(1)}" font-size="11" fill="#5f5e5a" text-anchor="end">${format(v)}</text>\n`;
  }
  if (zero !== undefined) svg += `<line x1="${left}" x2="${W - right}" y1="${y(zero).toFixed(1)}" y2="${y(zero).toFixed(1)}" stroke="#9c9a92" stroke-width="1"/>\n`;
  for (const w of [2, 26, 52, 78, 104, 130, 156]) {
    svg += `<line x1="${x(w).toFixed(1)}" x2="${x(w).toFixed(1)}" y1="${H - bottom}" y2="${H - bottom + 4}" stroke="#9c9a92"/>`;
    svg += `<text x="${x(w).toFixed(1)}" y="${H - bottom + 18}" font-size="11" fill="#5f5e5a" text-anchor="middle">${w}</text>\n`;
  }
  svg += `<text x="${((left + W - right) / 2).toFixed(0)}" y="${H - 8}" font-size="11" fill="#5f5e5a" text-anchor="middle">week</text>\n`;
  // Direct labels at line ends, nudged apart so they never collide.
  const ends: { y: number; label: string; color: string }[] = [];
  for (const line of lines) {
    let d = ''; let last: [number, number] | null = null;
    line.values.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) return;
      d += `${d ? 'L' : 'M'}${x(weeks[i]).toFixed(1)},${y(v).toFixed(1)}`; last = [x(weeks[i]), y(v)];
    });
    svg += `<path d="${d}" fill="none" stroke="${line.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${line.dash ? ` stroke-dasharray="${line.dash}"` : ''}><title>${line.label}</title></path>\n`;
    if (last) {
      const [lx, ly] = last as [number, number];
      if (line.defeat) svg += `<g><circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="5" fill="#fcfcfb" stroke="${line.color}" stroke-width="2"/><text x="${(lx + 7).toFixed(1)}" y="${(ly - 7).toFixed(1)}" font-size="11" fill="#1a1a19">✕ defeat wk ${line.defeat}</text></g>\n`;
      ends.push({ y: line.defeat ? y(line.values.filter((v): v is number => v !== null).at(-1)!) : ly, label: line.label + (line.defeat ? ' ✕' : ''), color: line.color });
    }
  }
  ends.sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
  for (const end of ends) {
    svg += `<line x1="${W - right + 6}" x2="${W - right + 18}" y1="${end.y.toFixed(1)}" y2="${end.y.toFixed(1)}" stroke="${end.color}" stroke-width="3"/>`;
    svg += `<text x="${W - right + 22}" y="${(end.y + 4).toFixed(1)}" font-size="11" fill="#1a1a19">${end.label}</text>\n`;
  }
  return svg + '</svg>\n';
}

// --------------------------------------------------------------------------- main
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const started = performance.now();
  const save = readFileSync(resolve(here, '../scenarios/fictional-week1.economy.json'), 'utf8');
  const checks: string[] = [];
  const runs: Run[] = [];
  const all = [...STRATEGIES, AI_RUN];
  for (const seed of SEEDS) {
    const world = { ...fictionalGameWorld(null), seed };
    let base: EconomySession;
    if (seed === 2401) {
      base = startEconomyFromSave(save, fictionalGameWorld('alden'));
      const built = createEconomySession(fictionalGameWorld('alden'));
      checks.push(`Production starting save (seed 2401) is identical to a freshly built economy: ${economyFingerprint(base) === economyFingerprint(built) ? 'yes' : 'NO'} (${economyFingerprint(base)}).`);
    } else base = createEconomySession(world);
    for (const country of COUNTRIES) {
      const baseline = play(base, STRATEGIES[0], country, seed, undefined, true);
      runs.push(baseline);
      for (const strategy of all.slice(1)) runs.push(play(base, strategy, country, seed, baseline, seed === 2401));
    }
    process.stdout.write(`seed ${seed} done (${((performance.now() - started) / 1000).toFixed(1)} s)\n`);
  }
  // Defeat-risk sweep: regime rolls are seeded draws, so defeat odds need more than three seeds.
  const SWEEP_SEEDS = Array.from({ length: 20 }, (_, i) => 1001 + i);
  const SWEEP = ['B01', 'B02', 'B03', 'B05', 'B08', 'B09', 'B10', 'B12', 'X02', 'X04', 'X05', 'X08', 'R01', 'R02', 'R03'];
  const sweep: { strategy: string; country: string; seed: number; defeatWeek: number | null; minStability: number; unrestWeeks: number }[] = [];
  for (const seed of SWEEP_SEEDS) {
    const base = createEconomySession({ ...fictionalGameWorld(null), seed });
    for (const country of COUNTRIES) {
      const baseline = play(base, STRATEGIES[0], country, seed, undefined, true);
      for (const id of SWEEP) {
        const run = id === 'B01' ? baseline : play(base, STRATEGIES.find(s => s.id === id)!, country, seed, baseline);
        sweep.push({ strategy: id, country, seed, defeatWeek: run.defeatWeek, minStability: run.minStability, unrestWeeks: run.unrestWeeks });
      }
    }
  }
  process.stdout.write(`defeat-risk sweep done (${((performance.now() - started) / 1000).toFixed(1)} s)\n`);

  // Determinism: replay one run and compare.
  {
    const base = startEconomyFromSave(save, fictionalGameWorld('alden'));
    const again = play(base, STRATEGIES.find(s => s.id === 'B12')!, 'alden', 2401, runs[0], true);
    const first = runs.find(r => r.strategy === 'B12' && r.country === 'alden' && r.seed === 2401)!;
    checks.push(`Replaying B12 for Alden (seed 2401) gives identical results: ${JSON.stringify(again) === JSON.stringify(first) ? 'yes' : 'NO'}.`);
  }
  const treasury = Math.max(...runs.map(r => r.treasuryResidual)), debt = Math.max(...runs.map(r => r.debtResidual));
  checks.push(`Largest weekly treasury residual (treasury change minus revenue - expenditure + borrowed - repaid), all ${runs.length} runs: ${treasury.toExponential(2)}.`);
  checks.push(`Largest weekly debt residual (debt change minus borrowed - repaid + unpaid interest - written off), all runs: ${debt.toExponential(2)}.`);
  checks.push(`Every week of every run also passed the engine's own conservation audit (advanceEconomyWeek throws otherwise).`);

  // ----- JSON
  const strategies = all.map(({ id, group, name, parameters }) => ({ id, group, name, parameters }));
  const json = { generated: 'npm run econ06:balance', seeds: SEEDS, countries: COUNTRIES, checkpoints: CHECKPOINTS, strategies, checks, runs, sweepSeeds: SWEEP_SEEDS, sweep };
  writeFileSync(resolve(reports, 'econ06_balance.json'), JSON.stringify(json, (_key, value) => (typeof value === 'number' ? Number(value.toPrecision(6)) : value)));

  // ----- Markdown data tables
  const find = (s: string, c: string, seed: number) => runs.find(r => r.strategy === s && r.country === c && r.seed === seed)!;
  const lines: string[] = [];
  lines.push('# ECON-06 balance study — data tables', '', 'Generated by `npm run econ06:balance` (`sim/econ06-balance.ts`). Do not edit by hand.', '');
  lines.push('Figures are for **seed 2401** (the production game) unless stated. "vs base" compares with the baseline run (B01) of the same country and seed.', '');
  lines.push('**Defeated** means the player\'s regime fell before that week (GAME_DESIGN.md §6); the run stopped at defeat.', '');
  lines.push('CPI y/y is the change of the engine\'s consumer-price index over the past 52 weeks (at week 52: since week 1). "Annualised" is the engine\'s own weekly inflation figure × 52, which the dashboard shows.', '');
  lines.push('## Verification checks', '', ...checks.map(c => `- ${c}`), '');
  lines.push('## Strategies', '', '| ID | Strategy | Parameters |', '|---|---|---|', ...strategies.map(s => `| ${s.id} | ${s.name} | ${s.parameters} |`), '');
  for (const country of COUNTRIES) {
    lines.push(`## ${country[0].toUpperCase() + country.slice(1)}`, '');
    CHECKPOINTS.forEach((week, k) => {
      lines.push(`### ${country} — week ${week}`, '');
      lines.push('| ID | Real GDP | vs base | Growth | CPI y/y | Annualised | Unempl. | Revenue/wk | Spending/wk | Funded | Treasury | Debt | Debt/GDP | Rate | Market | Output/capacity | Infra index | Worst shortage | Deprivation | Cons./head vs base | Stability | Tier |');
      lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|');
      for (const s of all) {
        const run = find(s.id, country, 2401); const c = run.checkpoints[k]; const b = find('B01', country, 2401).checkpoints[k]!;
        if (!c) { lines.push(`| ${s.id} | **Defeated in week ${run.defeatWeek}** |||||||||||||||||||||`); continue; }
        lines.push(`| ${s.id} | ${num(c.gdpReal)} | ${signed(c.gdpReal / b.gdpReal - 1)} | ${pct(c.gdpGrowth)} | ${pct(c.cpiYoY)} | ${pct(c.inflation)} | ${pct(c.unemployment)} | ${num(c.revenue, 2)} | ${num(c.expenditure, 2)} | ${pct(c.fundedShare, 0)} | ${num(c.treasury)} | ${num(c.debt, 0)} | ${pct(c.debtToGdp, 0)} | ${pct(c.marketRate)} | ${c.marketAccess ? 'open' : 'closed'} | ${pct(c.utilization, 0)} | ${num(c.infrastructure, 2)} | ${pct(c.worstShortage, 0)} | ${pct(c.deprivation)} | ${signed(c.consumptionPerCapita / b.consumptionPerCapita - 1)} | ${num(c.stability, 0)} | ${c.unrestTier} |`);
      }
      lines.push('');
    });
    lines.push(`### ${country} — sector output at week 156 (vs base)`, '');
    const sectorIds = Object.keys(find('B01', country, 2401).checkpoints[2]!.sectors);
    lines.push(`| ID | ${sectorIds.join(' | ')} |`, `|---|${sectorIds.map(() => '---:').join('|')}|`);
    for (const s of all) {
      const c = find(s.id, country, 2401).checkpoints[2]; const b = find('B01', country, 2401).checkpoints[2]!;
      lines.push(c ? `| ${s.id} | ${sectorIds.map(id => signed(c.sectors[id] / b.sectors[id] - 1, 0)).join(' | ')} |` : `| ${s.id} | defeated ${sectorIds.map(() => '').join(' | ')}|`);
    }
    lines.push('');
  }
  lines.push('## Whole game, all three seeds', '', 'Per country: seeds 2401 / 7 / 99. Defeat week, or "survived".', '');
  lines.push('| ID | Alden | Belora | Cyrin | Declared / forced defaults (all 9) | Missed payments | Weeks without market access | Weeks in unrest | Lowest stability | Highest unemployment | Highest CPI y/y | Lowest funded share | Weeks until GDP ±1% | Weeks until stability ±3 |');
  lines.push('|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|');
  for (const s of all) {
    const rs = runs.filter(r => r.strategy === s.id);
    const fate = (c: string) => SEEDS.map(seed => { const r = find(s.id, c, seed); return r.defeatWeek ? `✕${r.defeatWeek}` : '✓'; }).join(' / ');
    const range = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x !== null); return v.length ? `${Math.min(...v)}–${Math.max(...v)}` : '—'; };
    lines.push(`| ${s.id} | ${fate('alden')} | ${fate('belora')} | ${fate('cyrin')} | ${rs.reduce((a, r) => a + r.declaredDefaults, 0)} / ${rs.reduce((a, r) => a + r.forcedDefaults, 0)} | ${rs.reduce((a, r) => a + (r.events['missed-payment'] ?? 0), 0)} | ${rs.reduce((a, r) => a + r.marketClosedWeeks, 0)} | ${rs.reduce((a, r) => a + r.unrestWeeks, 0)} | ${num(Math.min(...rs.map(r => r.minStability)), 0)} | ${pct(Math.max(...rs.map(r => r.maxUnemployment)))} | ${pct(Math.max(...rs.map(r => r.maxCpiYoY)))} | ${pct(Math.min(...rs.map(r => r.minFundedShare)), 0)} | ${range(rs.map(r => r.weeksToGdpEffect))} | ${range(rs.map(r => r.weeksToStabilityEffect))} |`);
  }
  lines.push('', 'Weeks are counted from the first command (week 2). ✓ = survived to week 156; ✕N = regime fell in week N (defeat).', '');
  lines.push('## AI autopilot compared with a passive player (week 156, seed 2401)', '');
  lines.push('| Country | Controller | Real GDP | Unempl. | CPI y/y | Debt/GDP | Stability | Income / consumption / corporate tax | Admin / social / military / infra |', '|---|---|---:|---:|---:|---:|---:|---|---|');
  for (const country of COUNTRIES) for (const id of ['B01', 'AI']) {
    const c = find(id, country, 2401).checkpoints[2]!;
    lines.push(`| ${country} | ${id === 'AI' ? 'AI autopilot' : 'passive player (B01)'} | ${num(c.gdpReal)} | ${pct(c.unemployment)} | ${pct(c.cpiYoY)} | ${pct(c.debtToGdp, 0)} | ${num(c.stability, 0)} | ${pct(c.fiscal.taxes.income)} / ${pct(c.fiscal.taxes.consumption)} / ${pct(c.fiscal.taxes.corporate)} | ${pct(c.fiscal.spending.administration)} / ${pct(c.fiscal.spending.social)} / ${pct(c.fiscal.spending.military)} / ${pct(c.fiscal.spending.infrastructure)} |`);
  }
  lines.push('', '## Spillover on the AI neighbours (week 156, seed 2401, their real GDP vs their value in the baseline run)', '');
  lines.push('| ID | Alden as player: Belora / Cyrin | Belora as player: Alden / Cyrin | Cyrin as player: Alden / Belora |', '|---|---|---|---|');
  for (const s of STRATEGIES.slice(1)) {
    lines.push(`| ${s.id} | ${COUNTRIES.map(country => {
      const r = find(s.id, country, 2401); const b = find('B01', country, 2401);
      return r.defeatWeek ? `defeated in week ${r.defeatWeek}` : Object.keys(r.aiNeighbours).map(n => signed(r.aiNeighbours[n].gdpReal / b.aiNeighbours[n].gdpReal - 1)).join(' / ');
    }).join(' | ')} |`);
  }
  lines.push('', `## Defeat risk over ${SWEEP_SEEDS.length} further seeds (${SWEEP_SEEDS[0]}–${SWEEP_SEEDS.at(-1)}), 156 weeks`, '');
  lines.push('Share of games in which the player\'s regime fell (defeat), and the median defeat week among those.', '');
  lines.push('| ID | Alden | Belora | Cyrin | All | Median defeat week | Mean weeks in unrest |', '|---|---:|---:|---:|---:|---:|---:|');
  for (const id of SWEEP) {
    const rows = sweep.filter(r => r.strategy === id);
    const share = (c?: string) => { const xs = rows.filter(r => !c || r.country === c); return `${xs.filter(r => r.defeatWeek).length}/${xs.length}`; };
    const weeksLost = rows.map(r => r.defeatWeek).filter((w): w is number => w !== null).sort((a, b) => a - b);
    lines.push(`| ${id} | ${share('alden')} | ${share('belora')} | ${share('cyrin')} | ${share()} | ${weeksLost.length ? weeksLost[Math.floor(weeksLost.length / 2)] : '—'} | ${num(mean(rows.map(r => r.unrestWeeks)), 1)} |`);
  }
  writeFileSync(resolve(reports, 'ECON_06_BALANCE_DATA.md'), lines.join('\n') + '\n');

  // ----- Charts (Alden, seed 2401)
  const charts = resolve(reports, 'econ06-charts');
  mkdirSync(charts, { recursive: true });
  const weeks = Array.from({ length: LAST_WEEK - 1 }, (_, i) => i + 2);
  const palette = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
  const dashes = [undefined, '6 3', undefined, '2 3', '8 3 2 3', undefined];
  const groups: Record<string, string[]> = {
    taxes: ['B01', 'B02', 'B03', 'B07', 'B08', 'X05'],
    priorities: ['B01', 'B04', 'B05', 'B06', 'B11', 'X06'],
    defaults: ['B01', 'B12', 'X01', 'X02', 'X03', 'X04'],
  };
  const groupTitle: Record<string, string> = { taxes: 'tax and budget stance', priorities: 'spending priorities', defaults: 'borrowing and default' };
  for (const country of COUNTRIES) {
    const base = find('B01', country, 2401).series!;
    for (const [group, ids] of Object.entries(groups)) {
      const pick = (metric: string, transform: (v: number, k: number) => number) => ids.map((id, i) => {
        const run = find(id, country, 2401);
        const values = run.series![metric].map(transform);
        return { label: `${id} ${STRATEGIES.find(s => s.id === id)!.name}`, values: weeks.map((_, k) => (k < values.length ? values[k] : null)), color: palette[i], dash: dashes[i], defeat: run.defeatWeek };
      });
      const name = country[0].toUpperCase() + country.slice(1);
      writeFileSync(resolve(charts, `${country}-${group}-gdp.svg`), lineChart(`${name}: real GDP vs baseline — ${groupTitle[group]}`, 'Seed 2401 (production game). Percentage difference from doing nothing; ○ marks the regime\'s fall (defeat).', weeks,
        pick('gdpReal', (v, k) => v / base.gdpReal[k] - 1), v => `${+(v * 100).toFixed(1)}%`, 0));
      writeFileSync(resolve(charts, `${country}-${group}-stability.svg`), lineChart(`${name}: political stability — ${groupTitle[group]}`, 'Seed 2401. 0–100. Unrest tiers begin below 40, 25 and 10; regime rolls happen once per tier per crisis.', weeks,
        pick('stability', v => v), v => v.toFixed(0)));
      writeFileSync(resolve(charts, `${country}-${group}-debt.svg`), lineChart(`${name}: public debt / GDP — ${groupTitle[group]}`, 'Seed 2401.', weeks,
        pick('debtToGdp', v => v), v => `${+(v * 100).toFixed(1)}%`));
      writeFileSync(resolve(charts, `${country}-${group}-unemployment.svg`), lineChart(`${name}: unemployment — ${groupTitle[group]}`, 'Seed 2401.', weeks,
        pick('unemployment', v => v), v => `${+(v * 100).toFixed(1)}%`));
    }
  }
  process.stdout.write(`${runs.length} runs in ${((performance.now() - started) / 1000).toFixed(1)} s\n${checks.join('\n')}\n`);
}

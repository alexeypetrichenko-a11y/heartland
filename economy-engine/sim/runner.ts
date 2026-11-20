import type { CountryId, EconomyEvent, EconomyState, GoodId, StepOptions, TurnInput, TurnReport } from '../src/index.ts';
import { advanceEconomyInPlace, auditError, autopilotCommands } from '../src/index.ts';

/**
 * Runs a simulation for any number of weeks and records what happened.
 *
 * Pure TypeScript with no Node or browser dependencies, so it can be used by
 * tests, the command-line simulator and (later) the game itself for
 * fast-forwarding. There is no upper limit on `turns`.
 */

export const COUNTRY_SERIES = ['gdpReal', 'gdpNominal', 'gdpRealPerCapita', 'cpi', 'inflation', 'unemployment', 'wage',
  'consumptionPerCapita', 'deprivation', 'exports', 'imports', 'tradeBalance', 'balanceToGdp', 'revenueToGdp',
  'spendingToGdp', 'debtToGdp', 'debt', 'treasury', 'marketRate', 'marketAccess', 'stability', 'unrestTier', 'regime',
  'armsDelivered', 'armsStock', 'taxIncome', 'spendSocial', 'fundedShare', 'population'] as const;
export type CountrySeriesName = typeof COUNTRY_SERIES[number];

export interface CountrySeries extends Record<CountrySeriesName, number[]> {
  /** Price buyers pay, per good. */
  buyPrice: Record<GoodId, number[]>;
  /** Share of household demand met, per good. */
  householdFill: Record<GoodId, number[]>;
  /** Units bought by households, per good. */
  householdPurchases: Record<GoodId, number[]>;
  output: Record<GoodId, number[]>;
  capacity: Record<GoodId, number[]>;
  reserves: Record<GoodId, number[]>;
}

export interface GoodSeries { price: number[]; production: number[]; traded: number[]; unmet: number[]; householdUse: number[] }

export interface Series {
  turns: number[];
  world: { gdpReal: number[]; gdpNominal: number[]; inflation: number[]; interestRate: number[]; money: number[]; debt: number[]; population: number[] };
  countries: Record<CountryId, CountrySeries>;
  goods: Record<GoodId, GoodSeries>;
}

export interface SimulationOptions {
  /** Number of weeks to simulate. Any non-negative whole number. */
  turns: number;
  /** Countries steered by the fiscal autopilot: true = all, false = none, or a list of ids. */
  autopilot?: boolean | readonly CountryId[];
  /** Extra inputs for the week about to be resolved (1 = first simulated week). */
  script?: (week: number, state: EconomyState) => TurnInput | undefined;
  /** Verify conservation every week and stop with an error if it fails. */
  audit?: boolean;
  /** Record time series (default true). Switch off for bulk speed runs. */
  record?: boolean;
  /** Record only every n-th week (default 1). */
  sampleEvery?: number;
  tradeDetail?: boolean;
  onReport?: (report: TurnReport, state: EconomyState) => void;
}

export interface SimulationResult {
  state: EconomyState;
  series: Series;
  events: EconomyEvent[];
  /** Largest relative conservation error seen in any week. */
  worstAuditError: number;
}

function createSeries(state: EconomyState): Series {
  const goods = state.config.goods;
  const perGood = () => {
    const record: Record<GoodId, number[]> = {};
    for (const good of goods) record[good.id] = [];
    return record;
  };
  const countries: Record<CountryId, CountrySeries> = {};
  for (const country of state.countries) {
    const entry = {
      buyPrice: perGood(), householdFill: perGood(), householdPurchases: perGood(), output: perGood(),
      capacity: perGood(), reserves: perGood(),
    } as CountrySeries;
    for (const name of COUNTRY_SERIES) entry[name] = [];
    countries[country.id] = entry;
  }
  const goodSeries: Record<GoodId, GoodSeries> = {};
  for (const good of goods) goodSeries[good.id] = { price: [], production: [], traded: [], unmet: [], householdUse: [] };
  return {
    turns: [],
    world: { gdpReal: [], gdpNominal: [], inflation: [], interestRate: [], money: [], debt: [], population: [] },
    countries,
    goods: goodSeries,
  };
}

function record(series: Series, report: TurnReport, state: EconomyState): void {
  series.turns.push(report.turn);
  const world = series.world;
  world.gdpReal.push(report.world.gdpReal);
  world.gdpNominal.push(report.world.gdpNominal);
  world.inflation.push(report.world.inflation);
  world.interestRate.push(report.world.interestRate);
  world.money.push(report.world.money);
  world.debt.push(report.world.debt);
  world.population.push(report.world.population);
  const goods = state.config.goods;
  report.countries.forEach((country, c) => {
    const entry = series.countries[country.countryId];
    const gdp = country.gdpNominal > 0 ? country.gdpNominal : 1;
    entry.gdpReal.push(country.gdpReal);
    entry.gdpNominal.push(country.gdpNominal);
    entry.gdpRealPerCapita.push(country.gdpRealPerCapita);
    entry.cpi.push(country.cpi);
    entry.inflation.push(country.inflation);
    entry.unemployment.push(country.unemployment);
    entry.wage.push(country.wage);
    entry.consumptionPerCapita.push(country.consumptionPerCapita);
    entry.deprivation.push(country.deprivation);
    entry.exports.push(country.exports);
    entry.imports.push(country.imports);
    entry.tradeBalance.push(country.tradeBalance);
    entry.balanceToGdp.push(country.budget.balance / gdp);
    entry.revenueToGdp.push(country.budget.revenue / gdp);
    entry.spendingToGdp.push(country.budget.spending / gdp);
    entry.debtToGdp.push(country.debtToGdp);
    entry.debt.push(country.debt);
    entry.treasury.push(country.treasury);
    entry.marketRate.push(country.marketRate);
    entry.marketAccess.push(country.marketAccess ? 1 : 0);
    entry.stability.push(country.stability);
    entry.unrestTier.push(country.unrestTier);
    entry.regime.push(country.regime);
    entry.armsDelivered.push(country.armsDelivered);
    entry.armsStock.push(country.armsStock);
    entry.taxIncome.push(state.country.taxIncome[c]);
    entry.spendSocial.push(state.country.spendSocial[c]);
    entry.fundedShare.push(country.budget.fundedShare);
    entry.population.push(country.population);
    goods.forEach((good, g) => {
      entry.buyPrice[good.id].push(country.buyPrices[g]);
      entry.householdFill[good.id].push(country.householdFill[g]);
      entry.householdPurchases[good.id].push(country.householdPurchases[g]);
      entry.output[good.id].push(country.output[g]);
      entry.capacity[good.id].push(country.capacity[g]);
      entry.reserves[good.id].push(country.reserves[g]);
    });
  });
  report.goods.forEach(good => {
    const entry = series.goods[good.goodId];
    entry.price.push(good.price);
    entry.production.push(good.production);
    entry.traded.push(good.traded);
    entry.unmet.push(good.unmetDemand);
    entry.householdUse.push(good.householdUse);
  });
}

/** Advance `state` in place by `options.turns` weeks. */
export function runSimulation(state: EconomyState, options: SimulationOptions): SimulationResult {
  if (!Number.isSafeInteger(options.turns) || options.turns < 0) throw new Error('turns must be a non-negative whole number.');
  const recording = options.record !== false;
  const sampleEvery = Math.max(1, Math.floor(options.sampleEvery ?? 1));
  const series = createSeries(state);
  const events: EconomyEvent[] = [];
  let worstAuditError = 0;
  const pilots = options.autopilot === true ? undefined : Array.isArray(options.autopilot) ? options.autopilot : null;
  for (let week = 1; week <= options.turns; week++) {
    const sample = recording && week % sampleEvery === 0;
    const scripted = options.script ? options.script(week, state) : undefined;
    const automatic = pilots === null ? [] : autopilotCommands(state, pilots);
    const input: TurnInput = {
      // Scripted commands come last so that a scenario can overrule the autopilot.
      commands: [...automatic, ...(scripted?.commands ?? [])],
      effects: scripted?.effects ?? [],
    };
    const stepOptions: StepOptions = {
      audit: options.audit === true,
      report: sample || options.onReport ? 'full' : 'none',
      tradeDetail: options.tradeDetail === true,
    };
    const report = advanceEconomyInPlace(state, input, stepOptions);
    const error = auditError(report.audit);
    if (error > worstAuditError) worstAuditError = error;
    for (const event of report.events) events.push(event);
    if (sample) record(series, report, state);
    if (options.onReport) options.onReport(report, state);
  }
  return { state, series, events, worstAuditError };
}

// --- Small helpers for analysing recorded series ------------------------------

export function mean(values: readonly number[], from = 0, to = values.length): number {
  const start = Math.max(0, from);
  const end = Math.min(values.length, to);
  if (end <= start) return 0;
  let total = 0;
  for (let i = start; i < end; i++) total += values[i];
  return total / (end - start);
}

export function minimum(values: readonly number[], from = 0, to = values.length): number {
  let result = Infinity;
  for (let i = Math.max(0, from); i < Math.min(values.length, to); i++) if (values[i] < result) result = values[i];
  return result;
}

export function maximum(values: readonly number[], from = 0, to = values.length): number {
  let result = -Infinity;
  for (let i = Math.max(0, from); i < Math.min(values.length, to); i++) if (values[i] > result) result = values[i];
  return result;
}

/** Index of the smallest value in [from, to). */
export function argMin(values: readonly number[], from = 0, to = values.length): number {
  let best = Math.max(0, from);
  for (let i = best; i < Math.min(values.length, to); i++) if (values[i] < values[best]) best = i;
  return best;
}

export function argMax(values: readonly number[], from = 0, to = values.length): number {
  let best = Math.max(0, from);
  for (let i = best; i < Math.min(values.length, to); i++) if (values[i] > values[best]) best = i;
  return best;
}

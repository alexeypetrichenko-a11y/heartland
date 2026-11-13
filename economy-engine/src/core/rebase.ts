import type { EconomyState } from '../types.ts';
import { HISTORY_COUNTRY_METRICS } from './stats.ts';

/**
 * Automatic redenomination of the money unit.
 *
 * With any positive inflation the price level grows without limit, and a game
 * with no end date would eventually push numbers beyond what floating point can
 * hold. Whenever the money supply exceeds ROLLOVER_MONEY, every money amount in
 * the state is divided by REBASE_FACTOR = 2^30.
 *
 * Dividing by a power of two is exact in floating point (only the exponent
 * changes), and every equation of the engine is homogeneous of degree one in
 * money amounts, so this changes nothing about the simulation: prices, wages,
 * debts and cash all shrink together. Stored history is rescaled the same way,
 * and `world.rebases` records how many times it happened so a host that shows
 * absolute money amounts can convert: 1 money unit now = 2^(30 * rebases) units
 * at the start of the game. Ratios, rates and real quantities never change.
 */
export const REBASE_FACTOR = 1073741824; // 2^30, written out so no library routine is involved
export const ROLLOVER_MONEY = 1180591620717411303424; // 2^70

function scale(values: number[], factor: number): void {
  for (let i = 0; i < values.length; i++) values[i] *= factor;
}

/** Multiply every money amount in the state (and its history) by `factor`. Use powers of two. */
export function rescaleMoney(state: EconomyState, factor: number): void {
  const zone = state.zone;
  for (const values of [zone.householdMoney, zone.firmMoney, zone.expectedIncome, zone.firmCosts, zone.wage, zone.cpi]) scale(values, factor);
  scale(state.zoneGood.price, factor);
  scale(state.zoneGood.buyPrice, factor);
  scale(state.zoneGood.refPrice, factor);
  scale(state.country.treasury, factor);
  scale(state.country.debt, factor);
  scale(state.country.gdp, factor);
  scale(state.bonds, factor);
  state.world.baseMoney *= factor;

  // History columns that hold money amounts or price levels.
  const C = state.countries.length;
  const G = state.config.goods.length;
  const countryMetrics = HISTORY_COUNTRY_METRICS.length;
  const columns: number[] = [];
  const nominal = [HISTORY_COUNTRY_METRICS.indexOf('gdpNominal'), HISTORY_COUNTRY_METRICS.indexOf('cpi')];
  for (let c = 0; c < C; c++) for (const k of nominal) columns.push(c * countryMetrics + k);
  // Per good: [price, production]; only the price is nominal.
  for (let g = 0; g < G; g++) columns.push(C * countryMetrics + g * 2);
  const rowSize = state.history.rowSize;
  for (const tier of state.history.tiers) {
    for (const column of columns) {
      for (let row = 0; row < tier.length; row++) tier.data[row * rowSize + column] *= factor;
      tier.sums[column] *= factor;
    }
  }
}

/** Divide all money amounts by 2^30 if the money supply has grown past the rollover point. */
export function rebaseIfNeeded(state: EconomyState): boolean {
  let changed = false;
  // Normally at most once per thousand years of play; the loop only matters for states moved from elsewhere.
  for (let guard = 0; guard < 40 && state.world.baseMoney > ROLLOVER_MONEY; guard++) {
    rescaleMoney(state, 1 / REBASE_FACTOR);
    state.world.rebases += 1;
    changed = true;
  }
  return changed;
}

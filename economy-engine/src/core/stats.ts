import type {
  AuditReport, BudgetReport, CountryReport, EconomyEvent, EconomyState, GoodLedger, GoodReport, HistoryState,
  HistoryTier, StepOptions, TradeFlow, TurnReport,
} from '../types.ts';
import type { Model, Workspace } from './model.ts';
import { EPSILON } from './model.ts';

/**
 * End-of-week bookkeeping: conservation audit, bounded history and the report
 * handed back to the host game.
 */

/** Indicators stored per country in every history entry, in this order. */
export const HISTORY_COUNTRY_METRICS = [
  'gdpReal', 'gdpNominal', 'cpi', 'inflation', 'unemployment', 'debtToGdp', 'balanceToGdp', 'stability',
  'tradeBalanceToGdp', 'consumptionPerCapita',
] as const;
export type HistoryCountryMetric = typeof HISTORY_COUNTRY_METRICS[number];
/** Indicators stored per good: world average producer price and world output. */
export const HISTORY_GOOD_METRICS = ['price', 'production'] as const;
export type HistoryGoodMetric = typeof HISTORY_GOOD_METRICS[number];
export const HISTORY_WORLD_METRICS = ['gdpReal', 'inflation', 'interestRate'] as const;
export type HistoryWorldMetric = typeof HISTORY_WORLD_METRICS[number];
export const HISTORY_TIERS = ['weekly', 'quarterly', 'yearly'] as const;
export type HistoryTierName = typeof HISTORY_TIERS[number];

const COUNTRY_METRICS = HISTORY_COUNTRY_METRICS.length;
const GOOD_METRICS = HISTORY_GOOD_METRICS.length;
const WORLD_METRICS = HISTORY_WORLD_METRICS.length;

export function createHistory(countryCount: number, goodCount: number, weekly: number, quarterly: number, yearly: number): HistoryState {
  const rowSize = countryCount * COUNTRY_METRICS + goodCount * GOOD_METRICS + WORLD_METRICS;
  const tier = (span: number, capacity: number): HistoryTier => ({
    span, capacity: Math.max(0, Math.floor(capacity)), length: 0, head: 0, pending: 0,
    sums: new Array<number>(rowSize).fill(0), data: [], turns: [],
  });
  return { rowSize, tiers: [tier(1, weekly), tier(13, quarterly), tier(52, yearly)] };
}

/** Add one entry; once a tier is full the oldest entry is overwritten. */
function pushEntry(tier: HistoryTier, rowSize: number, row: ArrayLike<number>, turn: number): void {
  if (tier.capacity <= 0) return;
  if (tier.length < tier.capacity) {
    for (let i = 0; i < rowSize; i++) tier.data.push(row[i]);
    tier.turns.push(turn);
    tier.length += 1;
    tier.head = tier.length % tier.capacity;
    return;
  }
  const start = tier.head * rowSize;
  for (let i = 0; i < rowSize; i++) tier.data[start + i] = row[i];
  tier.turns[tier.head] = turn;
  tier.head = (tier.head + 1) % tier.capacity;
}

function recordHistory(history: HistoryState, row: Float64Array, turn: number): void {
  const rowSize = history.rowSize;
  for (const tier of history.tiers) {
    if (tier.span === 1) { pushEntry(tier, rowSize, row, turn); continue; }
    if (tier.capacity <= 0) continue;
    for (let i = 0; i < rowSize; i++) tier.sums[i] += row[i];
    tier.pending += 1;
    if (tier.pending >= tier.span) {
      // Coarser tiers store averages, so memory stays fixed however long the game runs.
      for (let i = 0; i < rowSize; i++) tier.sums[i] /= tier.pending;
      pushEntry(tier, rowSize, tier.sums, turn);
      for (let i = 0; i < rowSize; i++) tier.sums[i] = 0;
      tier.pending = 0;
    }
  }
}

export interface HistorySeries { turns: number[]; values: number[] }

function readColumn(state: EconomyState, tierName: HistoryTierName, column: number): HistorySeries {
  const tier = state.history.tiers[HISTORY_TIERS.indexOf(tierName)];
  const rowSize = state.history.rowSize;
  const turns: number[] = [];
  const values: number[] = [];
  if (!tier || column < 0) return { turns, values };
  const first = tier.length < tier.capacity ? 0 : tier.head;
  for (let k = 0; k < tier.length; k++) {
    const entry = (first + k) % tier.capacity;
    turns.push(tier.turns[entry]);
    values.push(tier.data[entry * rowSize + column]);
  }
  return { turns, values };
}

/** Stored history of one country indicator, oldest entry first. */
export function getCountryHistory(state: EconomyState, countryId: string, metric: HistoryCountryMetric, tier: HistoryTierName = 'weekly'): HistorySeries {
  const c = state.countries.findIndex(country => country.id === countryId);
  const k = HISTORY_COUNTRY_METRICS.indexOf(metric);
  return readColumn(state, tier, c < 0 || k < 0 ? -1 : c * COUNTRY_METRICS + k);
}

export function getGoodHistory(state: EconomyState, goodId: string, metric: HistoryGoodMetric, tier: HistoryTierName = 'weekly'): HistorySeries {
  const g = state.config.goods.findIndex(good => good.id === goodId);
  const k = HISTORY_GOOD_METRICS.indexOf(metric);
  return readColumn(state, tier, g < 0 || k < 0 ? -1 : state.countries.length * COUNTRY_METRICS + g * GOOD_METRICS + k);
}

export function getWorldHistory(state: EconomyState, metric: HistoryWorldMetric, tier: HistoryTierName = 'weekly'): HistorySeries {
  const k = HISTORY_WORLD_METRICS.indexOf(metric);
  const offset = state.countries.length * COUNTRY_METRICS + state.config.goods.length * GOOD_METRICS;
  return readColumn(state, tier, k < 0 ? -1 : offset + k);
}

/** Money and stock totals taken before anything happens in the week. */
export function captureStart(s: EconomyState, w: Workspace, m: Model): void {
  const Z = s.zones.length;
  const C = s.countries.length;
  const G = m.goodCount;
  for (let z = 0; z < Z; z++) {
    const taxed = 1 + s.country.taxConsumption[s.zone.owner[z]];
    for (let g = 0; g < G; g++) {
      const index = z * G + g;
      w.ledgerBefore[g] += s.zoneGood.stock[index] + s.zoneGood.inputBuffer[index];
      w.previousConsumerPrice[index] = s.zoneGood.buyPrice[index] * taxed;
    }
  }
  for (let c = 0; c < C; c++) for (let g = 0; g < G; g++) w.ledgerBefore[g] += s.countryGood.reserves[c * G + g];
  w.moneyBefore = totalMoney(s);
}

export function totalMoney(s: EconomyState): number {
  let total = 0;
  for (let z = 0; z < s.zones.length; z++) total += s.zone.householdMoney[z] + s.zone.firmMoney[z];
  for (let c = 0; c < s.countries.length; c++) total += s.country.treasury[c];
  return total;
}

/** Arrays that may never hold a negative number. */
function nonNegativeArrays(s: EconomyState): number[][] {
  const { zone, zoneGood: zg, country, countryGood } = s;
  return [zone.population, zone.technology, zone.infrastructure, zone.mobilized, zone.wage, zone.householdMoney,
    zone.firmMoney, zone.cpi, zone.unemployment, zone.deprivation, zg.capacity, zg.build1, zg.build2, zg.build3,
    zg.stock, zg.inputBuffer, zg.price, zg.buyPrice, zg.refPrice, zg.expectedDemand, zg.yieldFactor, zg.shortage,
    zg.usage, s.bonds, country.treasury, country.debt, country.stability, country.gdp, country.armsStock,
    countryGood.reserves];
}

function allNumericArrays(s: EconomyState): number[][] {
  const groups: Record<string, number[]>[] = [
    s.zone as unknown as Record<string, number[]>, s.zoneGood as unknown as Record<string, number[]>,
    s.country as unknown as Record<string, number[]>, s.countryGood as unknown as Record<string, number[]>,
  ];
  const arrays: number[][] = [s.bonds, s.lanes.distance, s.lanes.costMultiplier, s.lanes.throughput];
  for (const group of groups) for (const key of Object.keys(group)) arrays.push(group[key]);
  return arrays;
}

/** Rounding can leave a balance a hair below zero; anything larger is a real error. */
function clearRoundingResidue(values: number[], tolerance: number): void {
  for (let i = 0; i < values.length; i++) if (values[i] < 0 && values[i] > -tolerance) values[i] = 0;
}

function audit(s: EconomyState, w: Workspace, m: Model): AuditReport {
  const Z = s.zones.length;
  const C = s.countries.length;
  const G = m.goodCount;
  const scale = Math.max(1, w.moneyBefore);
  clearRoundingResidue(s.zone.householdMoney, scale * 1e-12);
  clearRoundingResidue(s.zone.firmMoney, scale * 1e-12);
  clearRoundingResidue(s.country.treasury, scale * 1e-12);

  const goods: GoodLedger[] = [];
  for (let g = 0; g < G; g++) {
    let after = 0;
    for (let z = 0; z < Z; z++) after += s.zoneGood.stock[z * G + g] + s.zoneGood.inputBuffer[z * G + g];
    for (let c = 0; c < C; c++) after += s.countryGood.reserves[c * G + g];
    const expected = w.ledgerBefore[g] + w.ledgerProduced[g] - w.ledgerUsed[g] - w.ledgerSpoiled[g]
      - w.ledgerDestroyed[g] - w.ledgerDust[g];
    goods.push({
      before: w.ledgerBefore[g], produced: w.ledgerProduced[g], used: w.ledgerUsed[g], spoiled: w.ledgerSpoiled[g],
      destroyed: w.ledgerDestroyed[g], dust: w.ledgerDust[g], after, error: after - expected,
    });
  }

  const moneyAfter = totalMoney(s);
  const moneyError = moneyAfter - w.moneyBefore - w.moneyCreated;
  // Money in existence is by definition what agents hold: rounding can never accumulate.
  s.world.baseMoney = moneyAfter;

  let bondError = 0;
  for (let c = 0; c < C; c++) {
    let held = 0;
    for (let z = 0; z < Z; z++) held += s.bonds[z * C + c];
    const error = Math.abs(held - s.country.debt[c]) / Math.max(1, s.country.debt[c]);
    if (error > bondError) bondError = error;
  }

  let negativeValues = 0;
  let nonFiniteValues = 0;
  for (const values of nonNegativeArrays(s)) for (let i = 0; i < values.length; i++) if (values[i] < 0) negativeValues++;
  for (const values of allNumericArrays(s)) for (let i = 0; i < values.length; i++) if (!Number.isFinite(values[i])) nonFiniteValues++;
  if (!Number.isFinite(s.world.baseMoney) || !Number.isFinite(s.world.interestRate)) nonFiniteValues++;

  return { goods, moneyBefore: w.moneyBefore, moneyCreated: w.moneyCreated, moneyAfter, moneyError, bondError, negativeValues, nonFiniteValues };
}

/** Relative size of the largest conservation error in an audit. */
export function auditError(report: AuditReport): number {
  let worst = Math.abs(report.moneyError) / Math.max(1, report.moneyBefore);
  if (report.bondError > worst) worst = report.bondError;
  for (const ledger of report.goods) {
    const error = Math.abs(ledger.error) / Math.max(1, ledger.before + ledger.produced);
    if (error > worst) worst = error;
  }
  return worst;
}

export const AUDIT_TOLERANCE = 1e-9;

export function assertAudit(report: AuditReport, turn: number): void {
  const error = auditError(report);
  if (report.negativeValues > 0 || report.nonFiniteValues > 0 || !(error <= AUDIT_TOLERANCE)) {
    throw new Error(`Economy audit failed on turn ${turn}: conservation error ${error}, `
      + `${report.negativeValues} negative and ${report.nonFiniteValues} non-finite values.`);
  }
}

/** Close the week: audit, history, report. */
export function finishTurn(s: EconomyState, w: Workspace, m: Model, options: StepOptions, events: EconomyEvent[]): TurnReport {
  const Z = s.zones.length;
  const C = s.countries.length;
  const G = m.goodCount;
  const zg = s.zoneGood;
  const country = s.country;
  const p = s.config.params;

  // Country aggregates.
  const cpi = w.reportCpi;
  const wage = w.reportWage;
  const consumption = w.reportConsumption;
  for (let z = 0; z < Z; z++) {
    const c = s.zone.owner[z];
    const weight = w.population[c] > EPSILON ? s.zone.population[z] / w.population[c] : 0;
    cpi[c] += weight * s.zone.cpi[z];
    wage[c] += weight * s.zone.wage[z];
    consumption[c] += w.householdReal[z];
  }
  for (let c = 0; c < C; c++) {
    consumption[c] = w.population[c] > EPSILON ? consumption[c] / w.population[c] : 0;
    w.reportArms[c] = w.governmentBought[c * G + m.armsGood];
    country.armsStock[c] = country.armsStock[c] * (1 - p.armsAttrition) + w.reportArms[c];
  }

  // World averages per good.
  const goodPrice = w.goodScratchA;
  const goodStock = w.goodScratchB;
  goodPrice.fill(0); goodStock.fill(0);
  for (let z = 0; z < Z; z++) {
    for (let g = 0; g < G; g++) {
      goodPrice[g] += zg.price[z * G + g] * w.output[z * G + g];
      goodStock[g] += zg.stock[z * G + g];
    }
  }
  for (let g = 0; g < G; g++) {
    if (w.ledgerProduced[g] > EPSILON) goodPrice[g] /= w.ledgerProduced[g];
    else {
      // Nothing was produced: fall back to the plain average of local prices.
      let total = 0;
      for (let z = 0; z < Z; z++) total += zg.price[z * G + g];
      goodPrice[g] = Z > 0 ? total / Z : 0;
    }
  }

  const auditReport = audit(s, w, m);
  if (options.audit) assertAudit(auditReport, s.turn);

  // History row.
  const row = w.historyRow;
  let worldNominal = 0;
  let worldDebt = 0;
  let worldPopulation = 0;
  for (let c = 0; c < C; c++) {
    const gdp = w.countryNominal[c];
    const smoothed = country.gdp[c];
    const revenue = w.revenueIncomeTax[c] + w.revenueConsumptionTax[c] + w.revenueCorporateTax[c] + w.revenueTariffs[c]
      + w.revenueSeigniorage[c] + w.revenueReserveSales[c] + w.revenueFunds[c];
    const spending = w.spentAdministration[c] + w.spentSocial[c] + w.spentMilitary[c] + w.spentInfrastructure[c]
      + w.spentReserves[c] + w.spentInterest[c] + w.spentFunds[c];
    w.reportRevenue[c] = revenue;
    w.reportSpending[c] = spending;
    const base = c * COUNTRY_METRICS;
    row[base] = w.countryReal[c];
    row[base + 1] = gdp;
    row[base + 2] = cpi[c];
    row[base + 3] = w.countryInflation[c];
    row[base + 4] = w.countryUnemployment[c];
    row[base + 5] = smoothed > EPSILON ? country.debt[c] / (52 * smoothed) : 0;
    row[base + 6] = gdp > EPSILON ? (revenue - spending) / gdp : 0;
    row[base + 7] = country.stability[c];
    row[base + 8] = gdp > EPSILON ? (w.countryExports[c] - w.countryImports[c]) / gdp : 0;
    row[base + 9] = consumption[c];
    worldNominal += gdp;
    worldDebt += country.debt[c];
    worldPopulation += w.population[c];
  }
  const goodBase = C * COUNTRY_METRICS;
  for (let g = 0; g < G; g++) {
    row[goodBase + g * GOOD_METRICS] = goodPrice[g];
    row[goodBase + g * GOOD_METRICS + 1] = w.ledgerProduced[g];
  }
  const worldBase = goodBase + G * GOOD_METRICS;
  row[worldBase] = s.world.realGdp;
  row[worldBase + 1] = s.world.inflation * 52;
  row[worldBase + 2] = s.world.interestRate;
  recordHistory(s.history, row, s.turn);

  const world = {
    gdpReal: s.world.realGdp, gdpNominal: worldNominal, inflation: s.world.inflation * 52,
    interestRate: s.world.interestRate, money: s.world.baseMoney, debt: worldDebt, population: worldPopulation, rebases: s.world.rebases,
  };
  if (options.report === 'none') {
    return { turn: s.turn, countries: [], goods: [], world, events, audit: auditReport };
  }

  // Full report.
  const householdDemand = new Float64Array(C * G);
  const householdGot = new Float64Array(C * G);
  const capacity = new Float64Array(C * G);
  const output = new Float64Array(C * G);
  const buyPrices = new Float64Array(C * G);
  for (let z = 0; z < Z; z++) {
    const c = s.zone.owner[z];
    const weight = w.population[c] > EPSILON ? s.zone.population[z] / w.population[c] : 0;
    for (let g = 0; g < G; g++) {
      buyPrices[c * G + g] += weight * zg.buyPrice[z * G + g];
      householdDemand[c * G + g] += w.demandHousehold[z * G + g];
      householdGot[c * G + g] += w.gotHousehold[z * G + g];
      capacity[c * G + g] += zg.capacity[z * G + g];
      output[c * G + g] += w.output[z * G + g];
    }
  }
  const countries: CountryReport[] = [];
  for (let c = 0; c < C; c++) {
    const slice = (source: ArrayLike<number>) => {
      const values: number[] = [];
      for (let g = 0; g < G; g++) values.push(source[c * G + g]);
      return values;
    };
    const householdFill: number[] = [];
    const governmentFill: number[] = [];
    for (let g = 0; g < G; g++) {
      householdFill.push(householdDemand[c * G + g] > EPSILON ? Math.min(1, householdGot[c * G + g] / householdDemand[c * G + g]) : 1);
      governmentFill.push(w.governmentOrdered[c * G + g] > EPSILON ? Math.min(1, w.governmentBought[c * G + g] / w.governmentOrdered[c * G + g]) : 1);
    }
    const budget: BudgetReport = {
      incomeTax: w.revenueIncomeTax[c], consumptionTax: w.revenueConsumptionTax[c], corporateTax: w.revenueCorporateTax[c],
      tariffs: w.revenueTariffs[c], seigniorage: w.revenueSeigniorage[c], reserveSales: w.revenueReserveSales[c],
      fundsReceived: w.revenueFunds[c], revenue: w.reportRevenue[c],
      administration: w.spentAdministration[c], social: w.spentSocial[c], military: w.spentMilitary[c],
      infrastructure: w.spentInfrastructure[c], reservePurchases: w.spentReserves[c], interest: w.spentInterest[c],
      fundsSent: w.spentFunds[c], spending: w.reportSpending[c], balance: w.reportRevenue[c] - w.reportSpending[c],
      borrowed: w.borrowed[c], repaid: w.repaid[c], fundedShare: w.fundedShare[c],
    };
    countries.push({
      countryId: s.countries[c].id,
      population: w.population[c],
      gdpNominal: w.countryNominal[c],
      gdpReal: w.countryReal[c],
      gdpRealPerCapita: w.population[c] > EPSILON ? w.countryReal[c] / w.population[c] : 0,
      cpi: cpi[c],
      inflation: w.countryInflation[c],
      unemployment: w.countryUnemployment[c],
      wage: wage[c],
      consumptionPerCapita: consumption[c],
      deprivation: w.countryDeprivation[c],
      exports: w.countryExports[c],
      imports: w.countryImports[c],
      tradeBalance: w.countryExports[c] - w.countryImports[c],
      budget,
      treasury: country.treasury[c],
      debt: country.debt[c],
      debtToGdp: country.gdp[c] > EPSILON ? country.debt[c] / (52 * country.gdp[c]) : 0,
      marketRate: country.marketRate[c],
      averageRate: country.averageRate[c],
      marketAccess: country.marketAccess[c] === 1,
      stability: country.stability[c],
      unrestTier: country.unrestTier[c],
      regime: country.regime[c],
      buyPrices: slice(buyPrices),
      householdPurchases: slice(householdGot),
      householdFill,
      governmentFill,
      governmentPurchases: slice(w.governmentBought),
      reserves: slice(s.countryGood.reserves),
      armsDelivered: w.reportArms[c],
      armsStock: country.armsStock[c],
      capacity: slice(capacity),
      output: slice(output),
    });
  }
  const goods: GoodReport[] = [];
  for (let g = 0; g < G; g++) {
    goods.push({
      goodId: s.config.goods[g].id, price: goodPrice[g], production: w.ledgerProduced[g],
      householdUse: w.useHousehold[g], intermediateUse: w.useInput[g], investmentUse: w.useInvestment[g],
      governmentUse: w.useGovernment[g], traded: w.traded[g], stock: goodStock[g], unmetDemand: w.unmet[g],
    });
  }
  const report: TurnReport = { turn: s.turn, countries, goods, world, events, audit: auditReport };
  if (w.tradeLog) {
    const trade: TradeFlow[] = [];
    for (let i = 0; i < w.tradeLog.length; i += 5) {
      trade.push({
        fromZoneId: s.zones[w.tradeLog[i]].id, toZoneId: s.zones[w.tradeLog[i + 1]].id,
        goodId: s.config.goods[w.tradeLog[i + 2]].id, quantity: w.tradeLog[i + 3], value: w.tradeLog[i + 4],
      });
    }
    report.trade = trade;
  }
  return report;
}

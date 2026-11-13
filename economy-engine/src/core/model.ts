import type { EconomyConfig, EconomyState } from '../types.ts';

/**
 * Derived, read-only lookup tables and reusable scratch memory.
 *
 * Nothing in this file is part of the saved game. Everything is rebuilt from
 * the state on demand, so loading a save needs no extra steps and a cache can
 * never disagree with the state it was derived from.
 */

/** Quantities and amounts smaller than this are treated as zero. */
export const EPSILON = 1e-12;
/** Stocks below this size are removed so values cannot decay into denormals. */
export const DUST = 1e-9;

export interface Model {
  goodCount: number;
  goodIndex: Map<string, number>;
  tradable: boolean[];
  resourceBased: boolean[];
  /** True for goods that cannot be stored and are therefore produced to order. */
  madeToOrder: boolean[];
  spoilage: Float64Array;
  freight: Float64Array;
  cover: Float64Array;
  labor: Float64Array;
  capitalWeeks: Float64Array;
  depreciationWeekly: Float64Array;
  /** Share of each construction stage completed per week (three stages). */
  buildRate: Float64Array;
  targetMargin: Float64Array;
  normalUtilization: Float64Array;
  basePrice: Float64Array;
  subsistence: Float64Array;
  budgetShare: Float64Array;
  essential: Float64Array;
  essentialTotal: number;
  /** recipe[sector * G + input] = units of input per unit of sector output. */
  recipe: Float64Array;
  inputGoods: number[][];
  inputAmounts: number[][];
  administration: Float64Array;
  military: Float64Array;
  infrastructure: Float64Array;
  investment: Float64Array;
  /** Good that dominates military procurement; reported as arms deliveries. */
  armsGood: number;
}

const models = new WeakMap<EconomyConfig, Model>();

export function getModel(config: EconomyConfig): Model {
  const cached = models.get(config);
  if (cached) return cached;
  const goods = config.goods;
  const G = goods.length;
  const goodIndex = new Map<string, number>();
  goods.forEach((good, index) => goodIndex.set(good.id, index));
  const column = (read: (index: number) => number) => {
    const values = new Float64Array(G);
    for (let g = 0; g < G; g++) values[g] = read(g);
    return values;
  };
  const recipe = new Float64Array(G * G);
  const inputGoods: number[][] = [];
  const inputAmounts: number[][] = [];
  for (let s = 0; s < G; s++) {
    const list: number[] = [];
    const amounts: number[] = [];
    for (const input of goods[s].inputs) {
      const g = goodIndex.get(input.goodId);
      if (g === undefined) throw new Error(`Unknown input good ${input.goodId}.`);
      recipe[s * G + g] += input.amount;
    }
    for (let g = 0; g < G; g++) {
      if (recipe[s * G + g] > 0) { list.push(g); amounts.push(recipe[s * G + g]); }
    }
    inputGoods.push(list);
    inputAmounts.push(amounts);
  }
  let armsGood = 0;
  for (let g = 1; g < G; g++) if (goods[g].militaryShare > goods[armsGood].militaryShare) armsGood = g;
  const model: Model = {
    goodCount: G,
    goodIndex,
    tradable: goods.map(good => good.tradable),
    resourceBased: goods.map(good => good.resourceBased),
    madeToOrder: goods.map(good => good.spoilage >= 1),
    spoilage: column(g => goods[g].spoilage),
    freight: column(g => goods[g].freight),
    cover: column(g => goods[g].coverWeeks),
    labor: column(g => goods[g].laborPerUnit),
    capitalWeeks: column(g => goods[g].capitalWeeks),
    depreciationWeekly: column(g => goods[g].depreciation / 52),
    buildRate: column(g => Math.min(1, 3 / goods[g].constructionWeeks)),
    targetMargin: column(g => goods[g].targetMargin),
    normalUtilization: column(g => goods[g].normalUtilization),
    basePrice: column(g => goods[g].basePrice),
    subsistence: column(g => goods[g].subsistence),
    budgetShare: column(g => goods[g].budgetShare),
    essential: column(g => goods[g].essential),
    essentialTotal: goods.reduce((total, good) => total + good.essential, 0),
    recipe,
    inputGoods,
    inputAmounts,
    administration: column(g => goods[g].administrationShare),
    military: column(g => goods[g].militaryShare),
    infrastructure: column(g => goods[g].infrastructureShare),
    investment: column(g => goods[g].investmentShare),
    armsGood,
  };
  models.set(config, model);
  return model;
}

/** Names of the scratch arrays, grouped by their size. */
const ZONE_GOOD_FIELDS = ['plan', 'want', 'output', 'effectiveCapacity', 'unitCost', 'demandHousehold', 'demandInput',
  'demandInvestment', 'demandGovernment', 'demandReserve', 'gotHousehold', 'gotInput', 'gotInvestment',
  'gotGovernment', 'gotReserve', 'orders', 'sold', 'newBuild', 'previousConsumerPrice', 'potential', 'staffPerUnit'] as const;
const ZONE_FIELDS = ['productivity', 'laborSupply', 'laborScale', 'employment', 'wageReserve', 'householdBudget',
  'householdIncome', 'householdSpending', 'householdReal', 'householdNeed', 'firmRevenue', 'firmPurchases', 'wageBill',
  'valueAdded', 'valueAddedReal', 'investFill', 'lendable', 'lendAsked', 'lendScale', 'lendGiven', 'zoneDemand',
  'remainingDemand', 'remainingStock', 'supplierOrders', 'supplierFill', 'paid', 'received', 'releaseShipped',
  'idealPrice', 'foreignLeft', 'delivered'] as const;
const COUNTRY_FIELDS = ['population', 'planAdministration', 'planSocial', 'planMilitaryPay', 'planMilitaryGoods',
  'planInfrastructure', 'planExtras', 'planTotal', 'cashTarget', 'interestDue', 'principalDue', 'fundedShare', 'creditRequest',
  'borrowed', 'repaid', 'revenueIncomeTax', 'revenueConsumptionTax', 'revenueCorporateTax', 'revenueTariffs',
  'revenueSeigniorage', 'revenueReserveSales', 'revenueFunds', 'spentAdministration', 'spentSocial', 'spentMilitary',
  'spentInfrastructure', 'spentReserves', 'spentInterest', 'spentFunds', 'infrastructureReal', 'missedPayment',
  'extraRepayment', 'defaultRequested', 'countryNominal', 'countryReal', 'countryExports', 'countryImports',
  'countryScratch', 'countryInflation', 'countryUnemployment', 'countryDeprivation', 'countryHouseholdShortage',
  'countryLiving', 'reportCpi', 'reportWage', 'reportConsumption', 'reportArms', 'reportRevenue',
  'reportSpending'] as const;
const COUNTRY_GOOD_FIELDS = ['procurement', 'releaseOffer', 'releaseSold', 'reserveBuy', 'governmentOrdered',
  'governmentBought', 'countryPrice', 'countryRefPrice', 'countryShortage', 'countryUse'] as const;
const GOOD_FIELDS = ['ledgerBefore', 'ledgerProduced', 'ledgerUsed', 'ledgerSpoiled', 'ledgerDestroyed', 'ledgerDust',
  'useHousehold', 'useInput', 'useInvestment', 'useGovernment', 'traded', 'unmet', 'goodScratchA', 'goodScratchB',
  'goodScratchC'] as const;
const PAIR_FIELDS = ['costFactor', 'attraction', 'order', 'shipped', 'pairLimit'] as const;

type FloatFields = typeof ZONE_GOOD_FIELDS[number] | typeof ZONE_FIELDS[number] | typeof COUNTRY_FIELDS[number]
  | typeof COUNTRY_GOOD_FIELDS[number] | typeof GOOD_FIELDS[number] | typeof PAIR_FIELDS[number];

/** Scratch memory for one turn. Reused between turns; never saved. */
export type Workspace = Record<FloatFields, Float64Array> & {
  zoneCount: number;
  countryCount: number;
  goodCount: number;
  rowSize: number;
  /** Value ordered by each government per good and category (administration, military, infrastructure). */
  governmentCategoryShare: Float64Array;
  /** blocked[(buyer country * C + seller country) * G + good] = 1 when trade is forbidden. */
  blocked: Uint8Array;
  tariff: Float64Array;
  hasSupplier: Uint8Array;
  historyRow: Float64Array;
  moneyCreated: number;
  moneyBefore: number;
  creditRequested: number;
  creditAvailable: number;
  tradeLog: number[] | null;
  /** True while the world builder is searching for starting prices. */
  calibrating: boolean;
};

let workspace: Workspace | null = null;
let workspaceArrays: (Float64Array | Uint8Array)[] = [];

function allocate(Z: number, C: number, G: number, rowSize: number): Workspace {
  const arrays: (Float64Array | Uint8Array)[] = [];
  const fields: Record<string, Float64Array> = {};
  const add = (names: readonly string[], size: number) => {
    for (const name of names) { fields[name] = new Float64Array(size); arrays.push(fields[name]); }
  };
  add(ZONE_GOOD_FIELDS, Z * G);
  add(ZONE_FIELDS, Z);
  add(COUNTRY_FIELDS, C);
  add(COUNTRY_GOOD_FIELDS, C * G);
  add(GOOD_FIELDS, G);
  add(PAIR_FIELDS, Z * Z);
  const extra = {
    zoneCount: Z, countryCount: C, goodCount: G, rowSize,
    governmentCategoryShare: new Float64Array(C * G * 3),
    blocked: new Uint8Array(C * C * G),
    tariff: new Float64Array(C * C * G),
    hasSupplier: new Uint8Array(Z),
    historyRow: new Float64Array(rowSize),
    moneyCreated: 0, moneyBefore: 0, creditRequested: 0, creditAvailable: 0, tradeLog: null, calibrating: false,
  };
  arrays.push(extra.governmentCategoryShare, extra.blocked, extra.tariff, extra.hasSupplier, extra.historyRow);
  workspaceArrays = arrays;
  return Object.assign(fields, extra) as Workspace;
}

/** Return scratch memory of the right size with every accumulator cleared. */
export function getWorkspace(state: EconomyState): Workspace {
  const Z = state.zones.length;
  const C = state.countries.length;
  const G = state.config.goods.length;
  const rowSize = state.history.rowSize;
  if (!workspace || workspace.zoneCount !== Z || workspace.countryCount !== C || workspace.goodCount !== G
    || workspace.rowSize !== rowSize) {
    workspace = allocate(Z, C, G, rowSize);
    return workspace;
  }
  for (let i = 0; i < workspaceArrays.length; i++) workspaceArrays[i].fill(0);
  workspace.moneyCreated = 0;
  workspace.moneyBefore = 0;
  workspace.creditRequested = 0;
  workspace.creditAvailable = 0;
  workspace.tradeLog = null;
  workspace.calibrating = false;
  return workspace;
}

/**
 * Cost of capital carried by one unit of output: what a sector must earn above
 * its running costs to pay for the plant it uses at normal utilisation. Prices,
 * investment and the world builder all use this one definition, so a sector
 * that just covers it neither expands nor shrinks.
 */
export function capitalCharge(m: Model, good: number, capitalPrice: number, hurdle: number, keptAfterTax: number): number {
  return (hurdle + m.depreciationWeekly[good] * 52) * m.capitalWeeks[good] * capitalPrice
    / (52 * m.normalUtilization[good] * Math.max(0.05, keptAfterTax));
}

/**
 * Return a firm in country `c` demands before it expands: the world interest
 * rate, part of its government's risk premium, and an equity premium.
 */
export function privateHurdle(s: EconomyState, c: number): number {
  const p = s.config.params;
  const sovereignPremium = Math.max(0, s.country.marketRate[c] - s.world.interestRate);
  return Math.min(p.maxHurdle, s.world.interestRate + p.sovereignPassThrough * sovereignPremium + p.equityPremium);
}

export function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

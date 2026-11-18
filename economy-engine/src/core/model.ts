import type { EconomyConfig, EconomyState } from '../types.ts';
import { madeToOrderOrder } from '../config/defaults.ts';

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

/** Kinds of firm ownership (R57), in index order. */
export const OWNERSHIP_TYPES = ['private', 'public', 'mixed'] as const;
export type OwnershipType = typeof OWNERSHIP_TYPES[number];
/** Performance tiers within every aggregate (R58), in index order. */
export const PERFORMANCE_TIERS = ['strong', 'average', 'fragile'] as const;
export type PerformanceTier = typeof PERFORMANCE_TIERS[number];
export const OWNERSHIP_COUNT = 3;
export const TIER_COUNT = 3;
export const PRIVATE = 0;
export const PUBLIC = 1;
export const MIXED = 2;
/** Strategic objectives the player can give public firms (R03), in index order. */
export const PUBLIC_OBJECTIVES = ['profitability', 'maximum-production', 'affordable-prices', 'strategic-supply'] as const;
export type PublicObjective = typeof PUBLIC_OBJECTIVES[number];
export const OBJECTIVE_PROFITABILITY = 0;
export const OBJECTIVE_MAX_PRODUCTION = 1;
export const OBJECTIVE_AFFORDABLE = 2;
export const OBJECTIVE_STRATEGIC = 3;
/** Share of its running costs below which a public firm stops producing, per objective (provisional). */
export const PUBLIC_PRICE_FLOOR: readonly number[] = [1, 0.7, 0.8, 0.75];
/** Multiple of the normal investment hurdle a public firm demands, per objective (provisional). */
export const PUBLIC_HURDLE_FACTOR: readonly number[] = [1, 0.5, 1, 0.5];

/** New plant always joins the average tier. */
export const AVERAGE_TIER = 1;

export interface Model {
  goodCount: number;
  sectorCount: number;
  goodIndex: Map<string, number>;
  /** Sector of every good. */
  goodSector: number[];
  /** Goods of every sector. */
  sectorGoods: number[][];
  /** Labour productivity of each performance tier relative to the sector norm. */
  tierFactor: Float64Array;
  /** Made-to-order goods in the order they must be cleared (inputs before users). */
  madeToOrderOrder: number[];
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
  const S = config.sectors.length;
  const goodIndex = new Map<string, number>();
  goods.forEach((good, index) => goodIndex.set(good.id, index));
  const sectorIndex = new Map<string, number>();
  config.sectors.forEach((sector, index) => sectorIndex.set(sector.id, index));
  const goodSector = goods.map(good => {
    const sector = sectorIndex.get(good.sectorId);
    if (sector === undefined) throw new Error(`Unknown sector ${good.sectorId}.`);
    return sector;
  });
  const sectorGoods: number[][] = config.sectors.map(() => []);
  goodSector.forEach((sector, g) => sectorGoods[sector].push(g));
  const order = madeToOrderOrder(goods);
  if (order === null) throw new Error('Made-to-order goods depend on each other in a loop.');
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
    sectorCount: S,
    goodIndex,
    goodSector,
    sectorGoods,
    tierFactor: Float64Array.from(config.params.tierProductivity),
    madeToOrderOrder: order,
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
  'gotGovernment', 'gotReserve', 'orders', 'sold', 'previousConsumerPrice', 'potential', 'staffPerUnit',
  'laborCost', 'inputCost', 'inputNeed'] as const;
/** Per zone, good and ownership. */
const OWNER_GOOD_FIELDS = ['ownerBuild', 'saleShare'] as const;
/** Per production line (zone, good, ownership, tier). */
const LINE_FIELDS = ['linePlan', 'lineSpare'] as const;
/** Per firm aggregate (zone, sector, ownership). */
const AGGREGATE_FIELDS = ['aggRevenue', 'aggPurchases', 'aggWageReserve', 'aggEmployment', 'aggOutlay', 'aggInputCost',
  'aggInvestCost', 'aggCall', 'aggCapitalValue', 'aggInterest', 'aggProfit', 'aggTrouble', 'aggDebtSupport'] as const;
/** Per firm aggregate and good. */
const AGGREGATE_GOOD_FIELDS = ['aggDemandInput', 'aggDemandInvestment', 'aggGotInvestment'] as const;
const ZONE_FIELDS = ['productivity', 'laborSupply', 'laborScale', 'employment', 'householdBudget',
  'householdIncome', 'householdSpending', 'householdReal', 'householdNeed', 'wageBill',
  'valueAdded', 'valueAddedReal', 'lendable', 'lendAsked', 'lendScale', 'lendGiven', 'zoneDemand',
  'remainingDemand', 'remainingStock', 'supplierOrders', 'supplierFill', 'paid', 'received', 'releaseShipped',
  'idealPrice', 'foreignLeft', 'delivered'] as const;
const COUNTRY_FIELDS = ['population', 'planAdministration', 'planSocial', 'planMilitaryPay', 'planMilitaryGoods',
  'planInfrastructure', 'planExtras', 'planTotal', 'cashTarget', 'interestDue', 'principalDue', 'fundedShare', 'creditRequest',
  'borrowed', 'repaid', 'revenueIncomeTax', 'revenueConsumptionTax', 'revenueCorporateTax', 'revenueTariffs',
  'revenueCentralBank', 'revenueMoneyCreation', 'revenueReserveSales', 'revenueFunds', 'spentAdministration', 'spentSocial', 'spentMilitary',
  'spentInfrastructure', 'spentReserves', 'spentInterest', 'spentFunds', 'revenueFirmDividends', 'spentFirmSupport',
  'spentReserveStorage', 'reserveFunded', 'spentOwnership', 'revenueOwnership', 'spentCentralBankCapital', 'cbLentState', 'cbInterestIncome', 'cbWriteOffs', 'cbFirmLoans', 'cbCapacityLeft', 'bankruptcies',
  'firmLoanRate', 'infrastructureReal', 'missedPayment',
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
  | typeof COUNTRY_GOOD_FIELDS[number] | typeof GOOD_FIELDS[number] | typeof PAIR_FIELDS[number]
  | typeof OWNER_GOOD_FIELDS[number] | typeof LINE_FIELDS[number] | typeof AGGREGATE_FIELDS[number]
  | typeof AGGREGATE_GOOD_FIELDS[number];

/** Scratch memory for one turn. Reused between turns; never saved. */
export type Workspace = Record<FloatFields, Float64Array> & {
  zoneCount: number;
  countryCount: number;
  goodCount: number;
  sectorCount: number;
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
  /** Money issued by all central banks at the start of the week. */
  issuedBefore: number;
  creditRequested: number;
  creditAvailable: number;
  tradeLog: number[] | null;
  /** True while the world builder is searching for starting prices. */
  calibrating: boolean;
};

let workspace: Workspace | null = null;
let workspaceArrays: (Float64Array | Uint8Array)[] = [];

function allocate(Z: number, C: number, G: number, S: number, rowSize: number): Workspace {
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
  add(OWNER_GOOD_FIELDS, Z * G * OWNERSHIP_COUNT);
  add(LINE_FIELDS, Z * G * OWNERSHIP_COUNT * TIER_COUNT);
  add(AGGREGATE_FIELDS, Z * S * OWNERSHIP_COUNT);
  add(AGGREGATE_GOOD_FIELDS, Z * S * OWNERSHIP_COUNT * G);
  const extra = {
    zoneCount: Z, countryCount: C, goodCount: G, sectorCount: S, rowSize,
    governmentCategoryShare: new Float64Array(C * G * 3),
    blocked: new Uint8Array(C * C * G),
    tariff: new Float64Array(C * C * G),
    hasSupplier: new Uint8Array(Z),
    historyRow: new Float64Array(rowSize),
    moneyCreated: 0, moneyBefore: 0, issuedBefore: 0, creditRequested: 0, creditAvailable: 0, tradeLog: null, calibrating: false,
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
  const S = state.config.sectors.length;
  const rowSize = state.history.rowSize;
  if (!workspace || workspace.zoneCount !== Z || workspace.countryCount !== C || workspace.goodCount !== G
    || workspace.sectorCount !== S || workspace.rowSize !== rowSize) {
    workspace = allocate(Z, C, G, S, rowSize);
    return workspace;
  }
  for (let i = 0; i < workspaceArrays.length; i++) workspaceArrays[i].fill(0);
  workspace.moneyCreated = 0;
  workspace.issuedBefore = 0;
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
  // Firms borrow at their national central bank's rate; part of the state's own risk premium reaches them too.
  const sovereignPremium = Math.max(0, s.country.marketRate[c] - s.world.interestRate);
  return Math.min(p.maxHurdle, s.country.cbRate[c] + p.sovereignPassThrough * sovereignPremium + p.equityPremium);
}

/**
 * Long-run return built into normal prices: the neutral rate, part of the state's
 * risk premium and the equity premium. Unlike the investment hurdle it does not
 * follow the policy rate, so cutting rates in a slump does not pull normal prices
 * down (which would deepen the slump and invite further cuts).
 */
export function structuralHurdle(s: EconomyState, c: number): number {
  const p = s.config.params;
  const sovereignPremium = Math.max(0, s.country.marketRate[c] - s.world.interestRate);
  return Math.min(p.maxHurdle, p.baseRate + p.sovereignPassThrough * sovereignPremium + p.equityPremium);
}

/** Interest rate firms in country c pay on bank loans. */
export function firmLoanRate(s: EconomyState, c: number): number {
  return s.country.cbRate[c] + s.config.params.firmLoanSpread;
}

export function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

/** Total installed capacity of one good in one zone, summed over owners and tiers. */
export function zoneCapacity(s: EconomyState, z: number, g: number): number {
  const G = s.config.goods.length;
  const base = (z * G + g) * OWNERSHIP_COUNT * TIER_COUNT;
  let total = 0;
  for (let k = 0; k < OWNERSHIP_COUNT * TIER_COUNT; k++) total += s.firmLine.capacity[base + k];
  return total;
}

/** Capacity of one good in one zone still under construction, summed over owners. */
export function zonePipeline(s: EconomyState, z: number, g: number): number {
  const G = s.config.goods.length;
  const base = (z * G + g) * OWNERSHIP_COUNT;
  const fg = s.firmGood;
  let total = 0;
  for (let o = 0; o < OWNERSHIP_COUNT; o++) total += fg.build1[base + o] + fg.build2[base + o] + fg.build3[base + o];
  return total;
}

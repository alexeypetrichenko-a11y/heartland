import type { EconomyConfig, EconomyParams, GoodDefinition, GoodInput } from '../types.ts';

/**
 * Default configuration of the economic engine.
 *
 * STATUS: every number in this file is a provisional balancing value for the
 * fictional test worlds. None of it is an approved game rule. The goods list,
 * the recipes and the formulas are a proposal for GAME_DESIGN.md section 17
 * item 1 and may be replaced without touching engine code.
 */

/** Return a sector needs before it expands: lending rate + risk premium. */
export const REFERENCE_HURDLE = 0.10;
/** Corporate tax rate assumed when calibrating normal margins. */
export const REFERENCE_CORPORATE_TAX = 0.20;
/** Normal utilisation of ordinary sectors and of sectors tied to natural resources. */
export const REFERENCE_UTILIZATION = 0.85;
export const RESOURCE_UTILIZATION = 0.93;

interface GoodDraft {
  id: string;
  name: string;
  tradable: boolean;
  spoilage: number;
  freight: number;
  coverWeeks: number;
  inputs: Record<string, number>;
  capitalWeeks: number;
  depreciation: number;
  constructionWeeks: number;
  subsistence: number;
  budgetShare: number;
  essential: number;
  resourceBased: boolean;
  administrationShare: number;
  militaryShare: number;
  infrastructureShare: number;
  investmentShare: number;
}

/**
 * Derive the normal margin and the labour requirement so that, at the base
 * price, a sector running at normal utilisation earns exactly the reference
 * return on its capital. This makes "all prices = base price, wage =
 * technology level" a consistent long-run resting point.
 */
export function calibrateGoods(drafts: readonly GoodDraft[], basePrice = 1): GoodDefinition[] {
  return drafts.map(draft => {
    const inputs: GoodInput[] = Object.keys(draft.inputs).map(goodId => ({ goodId, amount: draft.inputs[goodId] }));
    const inputCost = inputs.reduce((total, input) => total + input.amount * basePrice, 0);
    const normalUtilization = draft.resourceBased ? RESOURCE_UTILIZATION : REFERENCE_UTILIZATION;
    const targetMargin = (REFERENCE_HURDLE + draft.depreciation) * draft.capitalWeeks
      / (52 * normalUtilization * (1 - REFERENCE_CORPORATE_TAX));
    const laborPerUnit = basePrice * (1 - targetMargin) - inputCost;
    if (!(laborPerUnit > 0)) throw new Error(`Good ${draft.id}: inputs and capital leave no room for labour.`);
    return {
      id: draft.id, name: draft.name, tradable: draft.tradable, spoilage: draft.spoilage,
      freight: draft.freight, coverWeeks: draft.coverWeeks, inputs, laborPerUnit,
      capitalWeeks: draft.capitalWeeks, depreciation: draft.depreciation,
      constructionWeeks: draft.constructionWeeks, targetMargin, basePrice,
      subsistence: draft.subsistence, budgetShare: draft.budgetShare, essential: draft.essential,
      resourceBased: draft.resourceBased, normalUtilization, administrationShare: draft.administrationShare,
      militaryShare: draft.militaryShare, infrastructureShare: draft.infrastructureShare,
      investmentShare: draft.investmentShare,
    };
  });
}

/**
 * Seven goods: enough to give every country a distinct profile and every
 * sanction a distinct effect, few enough to read on a phone screen.
 */
const GOOD_DRAFTS: readonly GoodDraft[] = [
  {
    id: 'food', name: 'Food', tradable: true, spoilage: 0.01, freight: 1.2, coverWeeks: 5,
    inputs: { energy: 0.06, industrial: 0.04, materials: 0.02, services: 0.05 },
    capitalWeeks: 45, depreciation: 0.04, constructionWeeks: 26,
    subsistence: 0.08, budgetShare: 0.08, essential: 1, resourceBased: true,
    administrationShare: 0, militaryShare: 0.10, infrastructureShare: 0, investmentShare: 0,
  },
  {
    id: 'energy', name: 'Energy (oil, gas, fuel)', tradable: true, spoilage: 0, freight: 1.0, coverWeeks: 4,
    inputs: { industrial: 0.05, services: 0.05 },
    capitalWeeks: 120, depreciation: 0.05, constructionWeeks: 52,
    subsistence: 0.02, budgetShare: 0.07, essential: 0.6, resourceBased: true,
    administrationShare: 0.10, militaryShare: 0.20, infrastructureShare: 0, investmentShare: 0,
  },
  {
    id: 'materials', name: 'Raw materials', tradable: true, spoilage: 0, freight: 1.5, coverWeeks: 5,
    inputs: { energy: 0.10, industrial: 0.05, services: 0.05 },
    capitalWeeks: 80, depreciation: 0.05, constructionWeeks: 39,
    subsistence: 0, budgetShare: 0, essential: 0, resourceBased: true,
    administrationShare: 0, militaryShare: 0, infrastructureShare: 0.15, investmentShare: 0,
  },
  {
    id: 'industrial', name: 'Industrial goods', tradable: true, spoilage: 0, freight: 0.6, coverWeeks: 5,
    inputs: { materials: 0.30, energy: 0.08, services: 0.08 },
    capitalWeeks: 60, depreciation: 0.06, constructionWeeks: 39,
    subsistence: 0, budgetShare: 0, essential: 0, resourceBased: false,
    administrationShare: 0.10, militaryShare: 0.10, infrastructureShare: 0.55, investmentShare: 0.8,
  },
  {
    id: 'consumer', name: 'Consumer goods', tradable: true, spoilage: 0, freight: 0.5, coverWeeks: 5,
    inputs: { materials: 0.12, industrial: 0.10, energy: 0.05, food: 0.06, services: 0.10 },
    capitalWeeks: 45, depreciation: 0.07, constructionWeeks: 26,
    subsistence: 0.03, budgetShare: 0.35, essential: 0.2, resourceBased: false,
    administrationShare: 0.10, militaryShare: 0, infrastructureShare: 0, investmentShare: 0,
  },
  {
    id: 'military', name: 'Military equipment', tradable: true, spoilage: 0, freight: 0.4, coverWeeks: 6,
    inputs: { industrial: 0.35, materials: 0.08, energy: 0.05, services: 0.07 },
    capitalWeeks: 55, depreciation: 0.06, constructionWeeks: 39,
    subsistence: 0, budgetShare: 0, essential: 0, resourceBased: false,
    administrationShare: 0, militaryShare: 0.50, infrastructureShare: 0, investmentShare: 0,
  },
  {
    id: 'services', name: 'Services', tradable: false, spoilage: 1, freight: 0, coverWeeks: 0.15,
    inputs: { energy: 0.03, consumer: 0.04, industrial: 0.03, food: 0.02 },
    capitalWeeks: 30, depreciation: 0.05, constructionWeeks: 13,
    subsistence: 0.04, budgetShare: 0.50, essential: 0.2, resourceBased: false,
    administrationShare: 0.70, militaryShare: 0.10, infrastructureShare: 0.30, investmentShare: 0.2,
  },
];

export const DEFAULT_GOODS: readonly GoodDefinition[] = calibrateGoods(GOOD_DRAFTS);

export const DEFAULT_PARAMS: EconomyParams = {
  // --- Households -----------------------------------------------------------
  /** Share of the population able to work. */
  laborParticipation: 0.48,
  /** Share of expected weekly income spent each week. */
  consumeIncome: 0.80,
  /** Share of money holdings spent each week (sets desired cash: 8 weeks of income). */
  consumeMoney: 0.025,
  /** Share of government-bond wealth spent each week. */
  consumeBonds: 0.0008,
  /** How fast income expectations follow actual income. */
  incomeSmoothing: 0.25,
  /** Households never spend more than this share of their cash in one week. */
  maxMoneySpendShare: 0.5,

  // --- Firms ----------------------------------------------------------------
  demandSmoothing: 0.25,
  /** Share of an inventory gap producers try to close per week. */
  inventoryAdjust: 0.3,
  /** Weeks of inputs firms keep on site; cushions short interruptions. */
  inputBufferWeeks: 1.5,
  inputBufferAdjust: 0.5,
  /** Output is cut as price falls from 110% to 90% of unit cost. */
  shutdownBand: 0.10,
  workingCapitalWeeks: 6,
  cashFloorWeeks: 1.5,
  /** Share of cash above working capital paid out to households each week. */
  dividendSpeed: 0.08,
  /** Largest weekly owner rescue, as a share of household cash. */
  capitalCallShare: 0.01,
  costSmoothing: 0.1,

  // --- Prices and wages -----------------------------------------------------
  /** Weekly price change for a 100% inventory gap. */
  priceInventoryGain: 0.04,
  /** Weekly price change when no order could be filled. */
  priceShortageGain: 0.12,
  /** Weekly pull of the price towards unit cost plus the normal margin. */
  priceCostGain: 0.03,
  /** Weekly price change per unit of demand pressure above normal utilisation. */
  pricePressureGain: 0.05,
  priceMaxUp: 0.10,
  priceMaxDown: 0.06,
  /** Producers never sell below this share of unit cost. */
  priceFloorCostRatio: 0.5,
  /** Prices cannot exceed this multiple of their two-year average. */
  priceCapRefMultiple: 8,
  refPriceWeeks: 104,
  naturalUnemployment: 0.05,
  /** Weekly wage change per unit of unemployment below/above natural. */
  wageUnemploymentGain: 0.012,
  wageShortageGain: 0.05,
  /** Share of consumer inflation passed into wages (below 1 anchors prices). */
  wageInflationPass: 0.5,
  wageMaxUp: 0.008,
  /** Wages fall more slowly than they rise. */
  wageMaxDown: 0.0015,
  inflationSmoothing: 0.08,

  // --- Trade ----------------------------------------------------------------
  /** Buyers react to price with elasticity 2^n (3 gives 8). */
  tradeElasticityDoublings: 3,
  /** How much more buyers favour a unit of stock made in their own zone. */
  homePreference: 8,
  /** Same, for stock made in another zone of their own country. */
  nationalPreference: 3,
  /** Rounds in which unmet demand is redirected to other suppliers. */
  allocationPasses: 3,
  /** Freight per distance unit as a share of the price, for bulkiness 1. */
  freightPerDistance: 0.02,
  /** Suppliers whose freight plus tariff exceeds this share are ignored. */
  maxTradeCost: 2.5,

  // --- Private investment ---------------------------------------------------
  equityPremium: 0.06,
  /** Fastest weekly growth of a sector's capacity. */
  investGrowthMax: 0.0025,
  investSensitivity: 2.0,
  /** Expansion starts once demand reaches this share of normal utilisation. */
  investPressureTrigger: 0.94,
  /** Share of spare cash firms are willing to invest per week. */
  investCashShare: 0.25,
  /** Fastest weekly closure of idle, unprofitable capacity. */
  scrapRateMax: 0.003,
  scrapPressure: 0.6,
  profitSmoothing: 0.08,
  /** Size of a new sector's first plant relative to local use. */
  entryShare: 0.002,
  /** Seeded noise in investment appetite: firms are not perfect optimisers. */
  behaviorNoise: 0.2,
  /** Seeded weekly noise in resource-based output (0 = off). */
  harvestNoise: 0,

  // --- Public finances ------------------------------------------------------
  treasuryBufferWeeks: 4,
  debtMaturityWeeks: 156,
  baseRate: 0.03,
  worldRateSlope: 0.01,
  /** Share of household cash that can be lent to governments per week. */
  lendableShare: 0.008,
  lenderHomeBias: 3,
  spreadDebtThreshold: 0.6,
  spreadLinear: 0.02,
  spreadQuadThreshold: 0.9,
  spreadQuad: 0.25,
  spreadDeficit: 0.5,
  spreadInstability: 0.04,
  /** Above this rate nobody lends: the country loses market access. */
  marketAccessRate: 0.20,
  accessRestoreRate: 0.14,
  maxRate: 0.40,
  missedPaymentsToDefault: 4,
  defaultHaircut: 0.55,
  defaultExclusionWeeks: 78,
  defaultReputationSpread: 0.05,
  reputationDecayWeeks: 156,
  defaultStabilityShock: 12,
  /** Share of output lost to financial disruption right after a default. */
  defaultOutputShock: 0.06,
  defaultShockRecoveryWeeks: 52,
  restructuredRate: 0.03,
  surplusRepayShare: 0.1,
  gdpSmoothing: 1 / 13,
  /** Share of the military budget paid to personnel instead of suppliers. */
  militaryPayShare: 0.35,
  armsAttrition: 0.002,

  // --- Strategic reserves ---------------------------------------------------
  reserveFillShare: 0.04,
  reserveReleaseShare: 0.08,
  reserveBuyPriceRatio: 1.15,
  reserveReleasePriceRatio: 1.3,
  reserveReleaseShortage: 0.03,

  // --- Monetary authority (world level, not player controlled) --------------
  inflationTarget: 0.02,
  moneyRuleGain: 0.5,
  /** Extra weekly money growth per unit of world unemployment above the natural rate. */
  moneyRuleSlackGain: 0.01,
  moneyGrowthMaxWeekly: 0.002,
  growthSmoothing: 0.02,

  // --- Political stability --------------------------------------------------
  stabilityBase: 70,
  /** Share of the gap to the target closed per week. */
  stabilityAdjust: 0.08,
  inflationTolerance: 0.04,
  stabilityInflationWeight: 120,
  unemploymentTolerance: 0.07,
  stabilityUnemploymentWeight: 150,
  stabilityDeprivationWeight: 150,
  stabilityShortageWeight: 25,
  stabilityLivingStandardWeight: 100,
  taxTolerance: 0.35,
  stabilityTaxWeight: 60,
  socialNorm: 0.10,
  stabilitySocialWeight: 150,
  stabilityArrearsWeight: 30,
  livingStandardSmoothing: 0.12,
  livingStandardRefWeeks: 104,
  /** Stability below which unrest tiers 1, 2 and 3 begin. */
  unrestThresholds: [40, 25, 10],
  unrestEndThreshold: 50,
  /** Weeks a tier must last before its single regime roll. */
  unrestGraceWeeks: 4,
  /** GAME_DESIGN.md section 6 illustration: 15% / 50% / 100% per crisis episode. */
  collapseProbability: [0.15, 0.5, 1.0],
  strikeLoss: [0.02, 0.07, 0.18],
  postRegimeStability: 55,
  regimeImmunityWeeks: 26,

  // --- Development ----------------------------------------------------------
  techGrowthBase: 0.01,
  techCatchUp: 0.02,
  infraNormShare: 0.02,
  infraAdjust: 0.01,
  infraProductivity: 0.15,
  infraGrowthEffect: 0.01,

  // --- Limits on player commands -------------------------------------------
  maxTaxRate: 0.7,
  maxSpendingShare: 0.5,
  maxTariff: 3,
  maxReserveWeeks: 52,

  // --- History retention ----------------------------------------------------
  historyWeekly: 52,
  historyQuarterly: 40,
  historyYearly: 50,
};

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
    Object.freeze(value);
  }
  return value;
}

/** Check a configuration and return a frozen copy that is safe to share. */
export function createConfig(overrides: Partial<EconomyParams> = {}, goods: readonly GoodDefinition[] = DEFAULT_GOODS): EconomyConfig {
  const config: EconomyConfig = JSON.parse(JSON.stringify({ goods, params: { ...DEFAULT_PARAMS, ...overrides } }));
  validateConfig(config);
  return deepFreeze(config);
}

const near = (value: number, target: number) => value > target - 1e-9 && value < target + 1e-9;

export function validateConfig(config: EconomyConfig): void {
  const { goods, params } = config;
  if (!Array.isArray(goods) || goods.length === 0) throw new Error('Configuration needs at least one good.');
  const ids = new Set<string>();
  for (const good of goods) {
    if (typeof good.id !== 'string' || good.id.length === 0 || ids.has(good.id)) throw new Error('Good IDs must be unique, non-empty text.');
    ids.add(good.id);
  }
  let budget = 0, administration = 0, military = 0, infrastructure = 0, investment = 0;
  for (const good of goods) {
    const numbers = [good.spoilage, good.freight, good.coverWeeks, good.laborPerUnit, good.capitalWeeks,
      good.depreciation, good.constructionWeeks, good.targetMargin, good.basePrice, good.subsistence,
      good.budgetShare, good.essential, good.administrationShare, good.militaryShare,
      good.infrastructureShare, good.investmentShare, good.normalUtilization];
    if (numbers.some(value => !Number.isFinite(value) || value < 0)) throw new Error(`Good ${good.id}: values must be finite and not negative.`);
    if (good.spoilage > 1 || good.targetMargin >= 1 || good.basePrice <= 0 || good.laborPerUnit <= 0
      || good.capitalWeeks <= 0 || good.constructionWeeks < 1 || good.normalUtilization <= 0.1
      || good.normalUtilization > 1) throw new Error(`Good ${good.id}: value out of range.`);
    let inputCost = 0;
    for (const input of good.inputs) {
      const source = goods.find(candidate => candidate.id === input.goodId);
      if (!source || input.goodId === good.id || !(input.amount > 0) || !Number.isFinite(input.amount)) {
        throw new Error(`Good ${good.id}: invalid input ${input.goodId}.`);
      }
      inputCost += input.amount * source.basePrice;
    }
    if (inputCost >= good.basePrice) throw new Error(`Good ${good.id}: inputs cost more than the output is worth.`);
    // Goods that cannot be stored are made to order; their inputs must therefore be storable.
    if (good.spoilage >= 1 && good.inputs.some(input => goods.some(other => other.id === input.goodId && other.spoilage >= 1))) {
      throw new Error(`Good ${good.id}: a good that cannot be stored may not need another such good as input.`);
    }
    budget += good.budgetShare; administration += good.administrationShare; military += good.militaryShare;
    infrastructure += good.infrastructureShare; investment += good.investmentShare;
  }
  if (!near(budget, 1) || !near(administration, 1) || !near(military, 1) || !near(infrastructure, 1) || !near(investment, 1)) {
    throw new Error('Household, administration, military, infrastructure and investment shares must each sum to 1.');
  }
  for (const key of Object.keys(params) as (keyof EconomyParams)[]) {
    const value = params[key];
    const list = Array.isArray(value) ? value : [value];
    if (list.some(entry => typeof entry !== 'number' || !Number.isFinite(entry) || entry < 0)) {
      throw new Error(`Parameter ${key} must be finite and not negative.`);
    }
  }
  if (params.consumeIncome >= 1 || params.consumeMoney <= 0 || params.laborParticipation <= 0 || params.laborParticipation > 1
    || params.wageInflationPass >= 1
    || params.allocationPasses < 1 || params.tradeElasticityDoublings < 0 || params.tradeElasticityDoublings > 5
    || !Number.isInteger(params.tradeElasticityDoublings) || !Number.isInteger(params.allocationPasses)
    || params.historyWeekly < 1 || params.debtMaturityWeeks < 1 || params.refPriceWeeks < 1
    || params.priceMaxDown >= 1 || params.wageMaxDown >= 1 || params.defaultHaircut > 1
    || params.unrestThresholds.length !== 3 || params.collapseProbability.length !== 3 || params.strikeLoss.length !== 3) {
    throw new Error('A parameter is outside its valid range.');
  }
}

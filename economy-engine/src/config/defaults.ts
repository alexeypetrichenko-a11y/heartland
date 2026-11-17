import type { EconomyConfig, EconomyParams, GoodDefinition, GoodInput, SectorDefinition } from '../types.ts';

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
export const RESOURCE_UTILIZATION = 0.85;

interface GoodDraft {
  id: string;
  name: string;
  sectorId: string;
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
      id: draft.id, name: draft.name, sectorId: draft.sectorId, tradable: draft.tradable, spoilage: draft.spoilage,
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

// ---------------------------------------------------------------------------
// Legacy seven-good catalogue (compatibility configuration)
// ---------------------------------------------------------------------------

/**
 * Sectors of the legacy catalogue: one good each, all privately owned, every
 * firm in the average tier. With these settings the firm-aggregate engine
 * reproduces the behaviour of the pre-Milestone-1 engine closely, which keeps
 * the existing scenarios, tests and integration example meaningful.
 */
export const LEGACY_SECTORS: readonly SectorDefinition[] = [
  { id: 'agriculture', name: 'Agriculture', publicShare: 0, mixedShare: 0, tierShares: [0, 1, 0] },
  { id: 'hydrocarbons', name: 'Hydrocarbons', publicShare: 0, mixedShare: 0, tierShares: [0, 1, 0] },
  { id: 'mining', name: 'Mining', publicShare: 0, mixedShare: 0, tierShares: [0, 1, 0] },
  { id: 'heavy_industry', name: 'Heavy industry', publicShare: 0, mixedShare: 0, tierShares: [0, 1, 0] },
  { id: 'consumer_goods', name: 'Consumer goods', publicShare: 0, mixedShare: 0, tierShares: [0, 1, 0] },
  { id: 'military_industry', name: 'Military industry', publicShare: 0, mixedShare: 0, tierShares: [0, 1, 0] },
  { id: 'services', name: 'Services', publicShare: 0, mixedShare: 0, tierShares: [0, 1, 0] },
];

/**
 * Seven goods: enough to give every country a distinct profile and every
 * sanction a distinct effect, few enough to read on a phone screen.
 */
const LEGACY_GOOD_DRAFTS: readonly GoodDraft[] = [
  {
    id: 'food', name: 'Food', sectorId: 'agriculture', tradable: true, spoilage: 0.01, freight: 1.2, coverWeeks: 5,
    inputs: { energy: 0.06, industrial: 0.04, materials: 0.02, services: 0.05 },
    capitalWeeks: 45, depreciation: 0.04, constructionWeeks: 26,
    subsistence: 0.08, budgetShare: 0.08, essential: 1, resourceBased: true,
    administrationShare: 0, militaryShare: 0.10, infrastructureShare: 0, investmentShare: 0,
  },
  {
    id: 'energy', name: 'Energy (oil, gas, fuel)', sectorId: 'hydrocarbons', tradable: true, spoilage: 0, freight: 1.0, coverWeeks: 4,
    inputs: { industrial: 0.05, services: 0.05 },
    capitalWeeks: 120, depreciation: 0.05, constructionWeeks: 52,
    subsistence: 0.02, budgetShare: 0.07, essential: 0.6, resourceBased: true,
    administrationShare: 0.10, militaryShare: 0.20, infrastructureShare: 0, investmentShare: 0,
  },
  {
    id: 'materials', name: 'Raw materials', sectorId: 'mining', tradable: true, spoilage: 0, freight: 1.5, coverWeeks: 5,
    inputs: { energy: 0.10, industrial: 0.05, services: 0.05 },
    capitalWeeks: 80, depreciation: 0.05, constructionWeeks: 39,
    subsistence: 0, budgetShare: 0, essential: 0, resourceBased: true,
    administrationShare: 0, militaryShare: 0, infrastructureShare: 0.15, investmentShare: 0,
  },
  {
    id: 'industrial', name: 'Industrial goods', sectorId: 'heavy_industry', tradable: true, spoilage: 0, freight: 0.6, coverWeeks: 5,
    inputs: { materials: 0.30, energy: 0.08, services: 0.08 },
    capitalWeeks: 60, depreciation: 0.06, constructionWeeks: 39,
    subsistence: 0, budgetShare: 0, essential: 0, resourceBased: false,
    administrationShare: 0.10, militaryShare: 0.10, infrastructureShare: 0.55, investmentShare: 0.8,
  },
  {
    id: 'consumer', name: 'Consumer goods', sectorId: 'consumer_goods', tradable: true, spoilage: 0, freight: 0.5, coverWeeks: 5,
    inputs: { materials: 0.12, industrial: 0.10, energy: 0.05, food: 0.06, services: 0.10 },
    capitalWeeks: 45, depreciation: 0.07, constructionWeeks: 26,
    subsistence: 0.03, budgetShare: 0.35, essential: 0.2, resourceBased: false,
    administrationShare: 0.10, militaryShare: 0, infrastructureShare: 0, investmentShare: 0,
  },
  {
    id: 'military', name: 'Military equipment', sectorId: 'military_industry', tradable: true, spoilage: 0, freight: 0.4, coverWeeks: 6,
    inputs: { industrial: 0.35, materials: 0.08, energy: 0.05, services: 0.07 },
    capitalWeeks: 55, depreciation: 0.06, constructionWeeks: 39,
    subsistence: 0, budgetShare: 0, essential: 0, resourceBased: false,
    administrationShare: 0, militaryShare: 0.50, infrastructureShare: 0, investmentShare: 0,
  },
  {
    id: 'services', name: 'Services', sectorId: 'services', tradable: false, spoilage: 1, freight: 0, coverWeeks: 0.15,
    inputs: { energy: 0.03, consumer: 0.04, industrial: 0.03, food: 0.02 },
    capitalWeeks: 30, depreciation: 0.05, constructionWeeks: 13,
    subsistence: 0.04, budgetShare: 0.50, essential: 0.2, resourceBased: false,
    administrationShare: 0.70, militaryShare: 0.10, infrastructureShare: 0.30, investmentShare: 0.2,
  },
];

export const LEGACY_GOODS: readonly GoodDefinition[] = calibrateGoods(LEGACY_GOOD_DRAFTS);
/** Default catalogue of `createConfig()`; kept as the legacy catalogue during Milestone 1. */
export const DEFAULT_GOODS = LEGACY_GOODS;
export const DEFAULT_SECTORS = LEGACY_SECTORS;

// ---------------------------------------------------------------------------
// Ten-sector catalogue (Milestone 1, provisional: decisions R59, R64-R71)
// ---------------------------------------------------------------------------

/**
 * The ten economic sectors. Ownership and tier shares are provisional
 * starting defaults applied to every zone; they are not approved values.
 */
export const CATALOGUE_SECTORS: readonly SectorDefinition[] = [
  { id: 'agriculture', name: 'Agriculture', publicShare: 0, mixedShare: 0.05, tierShares: [0.2, 0.5, 0.3] },
  { id: 'mining', name: 'Mining', publicShare: 0.2, mixedShare: 0.1, tierShares: [0.25, 0.5, 0.25] },
  { id: 'hydrocarbons', name: 'Hydrocarbons', publicShare: 0.35, mixedShare: 0.15, tierShares: [0.3, 0.5, 0.2] },
  { id: 'electricity', name: 'Electricity', publicShare: 0.35, mixedShare: 0.2, tierShares: [0.25, 0.5, 0.25] },
  { id: 'heavy_industry', name: 'Heavy industry', publicShare: 0.1, mixedShare: 0.1, tierShares: [0.25, 0.5, 0.25] },
  { id: 'manufacturing', name: 'Manufacturing', publicShare: 0, mixedShare: 0.05, tierShares: [0.25, 0.5, 0.25] },
  { id: 'consumer_goods', name: 'Consumer goods', publicShare: 0, mixedShare: 0, tierShares: [0.2, 0.5, 0.3] },
  { id: 'military_industry', name: 'Military industry', publicShare: 0.4, mixedShare: 0.2, tierShares: [0.25, 0.5, 0.25] },
  { id: 'construction', name: 'Construction', publicShare: 0, mixedShare: 0, tierShares: [0.2, 0.5, 0.3] },
  { id: 'services', name: 'Services', publicShare: 0.1, mixedShare: 0, tierShares: [0.2, 0.5, 0.3] },
];

type Row = Omit<GoodDraft, 'id' | 'name' | 'sectorId' | 'inputs' | 'subsistence' | 'budgetShare' | 'essential'
  | 'administrationShare' | 'militaryShare' | 'infrastructureShare' | 'investmentShare'>;
const storable = (freight: number, coverWeeks: number, capitalWeeks: number, depreciation: number,
  constructionWeeks: number, resourceBased: boolean, spoilage = 0): Row =>
  ({ tradable: true, spoilage, freight, coverWeeks, capitalWeeks, depreciation, constructionWeeks, resourceBased });
const NO_FINAL_USE = { subsistence: 0, budgetShare: 0, essential: 0, administrationShare: 0, militaryShare: 0, infrastructureShare: 0, investmentShare: 0 };
const good = (id: string, name: string, sectorId: string, row: Row, inputs: Record<string, number>,
  uses: Partial<typeof NO_FINAL_USE> = {}): GoodDraft => ({ id, name, sectorId, ...row, inputs, ...NO_FINAL_USE, ...uses });

/**
 * Thirty-one goods in ten sectors (approved target about 30, at most 35; R69).
 * Distinct goods follow R66-R71: separate energy sources, electricity that
 * cannot be stored, cereals / other agricultural products / processed food,
 * uranium apart from other strategic minerals, aluminium, and semiconductors
 * apart from electronic components. Chemicals stay a single good (R72 not
 * approved). Recipes, coefficients and final-use shares are provisional.
 */
const CATALOGUE_GOOD_DRAFTS: readonly GoodDraft[] = [
  // --- Agriculture ---
  good('cereals', 'Cereals', 'agriculture', storable(1.3, 5, 45, 0.04, 26, true, 0.01),
    { chemicals: 0.06, fuels: 0.05, machinery: 0.03, general_services: 0.04 },
    { subsistence: 0.02, budgetShare: 0.02, essential: 0.4 }),
  good('other_agri', 'Other agricultural products', 'agriculture', storable(1.2, 4, 45, 0.04, 26, true, 0.02),
    { cereals: 0.08, chemicals: 0.04, fuels: 0.04, machinery: 0.02, general_services: 0.05 },
    { subsistence: 0.01, budgetShare: 0.04, essential: 0.1 }),
  // --- Mining ---
  good('iron_ore', 'Iron ore', 'mining', storable(1.8, 5, 90, 0.05, 39, true),
    { fuels: 0.06, electricity: 0.05, machinery: 0.05, general_services: 0.04 }),
  good('nonferrous_ore', 'Non-ferrous ores (copper, bauxite)', 'mining', storable(1.6, 5, 90, 0.05, 39, true),
    { fuels: 0.06, electricity: 0.06, machinery: 0.05, chemicals: 0.03, general_services: 0.04 }),
  good('strategic_minerals', 'Strategic minerals', 'mining', storable(1.0, 6, 100, 0.05, 52, true),
    { fuels: 0.05, electricity: 0.06, chemicals: 0.06, machinery: 0.05, general_services: 0.05 }),
  good('uranium', 'Uranium', 'mining', storable(0.8, 8, 110, 0.05, 52, true),
    { fuels: 0.04, electricity: 0.05, chemicals: 0.08, machinery: 0.04, general_services: 0.05 }),
  good('coal', 'Coal', 'mining', storable(1.8, 5, 70, 0.05, 39, true),
    { fuels: 0.05, electricity: 0.04, machinery: 0.05, general_services: 0.04 }),
  // --- Hydrocarbons ---
  good('crude_oil', 'Crude oil', 'hydrocarbons', storable(1.0, 4, 120, 0.05, 52, true),
    { machinery: 0.05, electricity: 0.03, general_services: 0.05 }),
  good('natural_gas', 'Natural gas', 'hydrocarbons', storable(1.4, 4, 120, 0.05, 52, true),
    { machinery: 0.05, electricity: 0.03, general_services: 0.05 },
    { budgetShare: 0.01 }),
  good('fuels', 'Refined fuels', 'hydrocarbons', storable(0.9, 4, 70, 0.05, 39, false),
    { crude_oil: 0.55, electricity: 0.04, chemicals: 0.02, general_services: 0.04 },
    { subsistence: 0.01, budgetShare: 0.05, essential: 0.3, administrationShare: 0.05, militaryShare: 0.13 }),
  // --- Electricity (cannot be stored between weeks; R66) ---
  good('electricity', 'Electricity', 'electricity',
    { tradable: true, spoilage: 1, freight: 2.0, coverWeeks: 0.15, capitalWeeks: 150, depreciation: 0.04, constructionWeeks: 52, resourceBased: false },
    { coal: 0.10, natural_gas: 0.10, uranium: 0.02, fuels: 0.02, machinery: 0.05, chemicals: 0.01 },
    { subsistence: 0.01, budgetShare: 0.04, essential: 0.3, administrationShare: 0.05, infrastructureShare: 0.05 }),
  // --- Heavy industry ---
  good('steel', 'Steel', 'heavy_industry', storable(1.2, 5, 80, 0.05, 39, false),
    { iron_ore: 0.30, coal: 0.12, electricity: 0.06, machinery: 0.03, general_services: 0.04 },
    { infrastructureShare: 0.10, investmentShare: 0.05 }),
  good('aluminium', 'Aluminium', 'heavy_industry', storable(1.0, 5, 80, 0.05, 39, false),
    { nonferrous_ore: 0.30, electricity: 0.15, chemicals: 0.04, machinery: 0.03, general_services: 0.04 }),
  good('chemicals', 'Chemicals', 'heavy_industry', storable(1.0, 5, 80, 0.05, 39, false),
    { natural_gas: 0.15, crude_oil: 0.10, electricity: 0.06, machinery: 0.03, general_services: 0.05 }),
  good('cement', 'Cement', 'heavy_industry', storable(2.0, 5, 70, 0.05, 39, false),
    { coal: 0.10, electricity: 0.06, fuels: 0.04, machinery: 0.03, general_services: 0.04 },
    { infrastructureShare: 0.10 }),
  // --- Manufacturing ---
  good('machinery', 'Machinery and equipment', 'manufacturing', storable(0.7, 5, 60, 0.06, 39, false),
    { steel: 0.22, aluminium: 0.05, electronic_components: 0.06, electricity: 0.04, general_services: 0.06, tech_services: 0.04 },
    { administrationShare: 0.03, infrastructureShare: 0.10, investmentShare: 0.35 }),
  good('electronic_components', 'Electronic components', 'manufacturing', storable(0.3, 6, 60, 0.07, 39, false),
    { semiconductors: 0.15, aluminium: 0.03, chemicals: 0.06, strategic_minerals: 0.04, electricity: 0.05, general_services: 0.05, tech_services: 0.05 },
    { administrationShare: 0.02, militaryShare: 0.04, investmentShare: 0.05 }),
  good('semiconductors', 'Semiconductors', 'manufacturing', storable(0.2, 6, 90, 0.08, 52, false),
    { strategic_minerals: 0.06, chemicals: 0.10, electricity: 0.08, machinery: 0.06, tech_services: 0.08, general_services: 0.04 }),
  good('vehicles', 'Vehicles', 'manufacturing', storable(0.6, 5, 60, 0.07, 39, false),
    { steel: 0.15, aluminium: 0.06, electronic_components: 0.08, machinery: 0.04, chemicals: 0.04, electricity: 0.03, general_services: 0.05 },
    { budgetShare: 0.04, administrationShare: 0.05, militaryShare: 0.06, investmentShare: 0.05 }),
  // --- Consumer goods ---
  good('processed_food', 'Processed food', 'consumer_goods', storable(0.9, 4, 40, 0.06, 26, false, 0.02),
    { cereals: 0.20, other_agri: 0.20, chemicals: 0.02, electricity: 0.03, fuels: 0.02, general_services: 0.06 },
    { subsistence: 0.05, budgetShare: 0.12, essential: 0.5, militaryShare: 0.06 }),
  good('everyday_goods', 'Everyday goods (clothing, household items)', 'consumer_goods', storable(0.5, 5, 40, 0.07, 26, false),
    { chemicals: 0.10, other_agri: 0.06, electricity: 0.03, fuels: 0.02, general_services: 0.08 },
    { subsistence: 0.03, budgetShare: 0.14, essential: 0.2, administrationShare: 0.05 }),
  good('durable_goods', 'Durable consumer goods', 'consumer_goods', storable(0.5, 5, 50, 0.07, 26, false),
    { steel: 0.06, aluminium: 0.04, electronic_components: 0.10, chemicals: 0.05, electricity: 0.03, general_services: 0.07 },
    { budgetShare: 0.06, administrationShare: 0.05 }),
  // --- Military industry (predefined equipment classes; R65) ---
  good('small_arms', 'Small arms', 'military_industry', storable(0.4, 6, 55, 0.06, 39, false),
    { steel: 0.15, chemicals: 0.05, machinery: 0.05, electricity: 0.03, general_services: 0.06 },
    { militaryShare: 0.06 }),
  good('munitions', 'Munitions', 'military_industry', storable(0.5, 6, 55, 0.06, 39, false),
    { chemicals: 0.15, steel: 0.10, nonferrous_ore: 0.05, electricity: 0.03, general_services: 0.05 },
    { militaryShare: 0.12 }),
  good('military_vehicles', 'Military vehicles', 'military_industry', storable(0.5, 6, 60, 0.06, 39, false),
    { steel: 0.18, electronic_components: 0.08, machinery: 0.06, vehicles: 0.05, electricity: 0.03, general_services: 0.06 },
    { militaryShare: 0.15 }),
  good('military_aircraft', 'Military aircraft', 'military_industry', storable(0.3, 6, 70, 0.06, 52, false),
    { aluminium: 0.15, electronic_components: 0.12, semiconductors: 0.04, strategic_minerals: 0.03, machinery: 0.05, tech_services: 0.06, general_services: 0.04 },
    { militaryShare: 0.14 }),
  good('naval_vessels', 'Naval vessels', 'military_industry', storable(0.5, 6, 70, 0.06, 52, false),
    { steel: 0.25, electronic_components: 0.06, machinery: 0.08, electricity: 0.03, general_services: 0.06 },
    { militaryShare: 0.10 }),
  // --- Construction ---
  good('construction_materials', 'Construction materials', 'construction', storable(1.8, 5, 45, 0.05, 26, false),
    { cement: 0.08, chemicals: 0.04, other_agri: 0.03, electricity: 0.04, fuels: 0.03, general_services: 0.05 },
    { infrastructureShare: 0.10, investmentShare: 0.05 }),
  good('construction_services', 'Construction work', 'construction',
    { tradable: false, spoilage: 1, freight: 0, coverWeeks: 0.15, capitalWeeks: 30, depreciation: 0.06, constructionWeeks: 13, resourceBased: false },
    { cement: 0.10, steel: 0.06, construction_materials: 0.14, machinery: 0.03, fuels: 0.03, electricity: 0.02, general_services: 0.04 },
    { infrastructureShare: 0.45, investmentShare: 0.35 }),
  // --- Services ---
  good('general_services', 'General services', 'services',
    { tradable: false, spoilage: 1, freight: 0, coverWeeks: 0.15, capitalWeeks: 32, depreciation: 0.05, constructionWeeks: 13, resourceBased: false },
    { electricity: 0.04, fuels: 0.02, everyday_goods: 0.03, processed_food: 0.02, durable_goods: 0.01, electronic_components: 0.01 },
    { subsistence: 0.04, budgetShare: 0.40, essential: 0.2, administrationShare: 0.60, militaryShare: 0.10, infrastructureShare: 0.05 }),
  good('tech_services', 'Technology, finance and business services', 'services',
    { tradable: true, spoilage: 1, freight: 0.3, coverWeeks: 0.15, capitalWeeks: 35, depreciation: 0.08, constructionWeeks: 13, resourceBased: false },
    { electricity: 0.04, electronic_components: 0.04, general_services: 0.06 },
    { budgetShare: 0.08, administrationShare: 0.10, militaryShare: 0.04, infrastructureShare: 0.05, investmentShare: 0.10 }),
];

export const CATALOGUE_GOODS: readonly GoodDefinition[] = calibrateGoods(CATALOGUE_GOOD_DRAFTS);

/**
 * Parameters that differ for the catalogue. With explicit performance tiers the
 * smoothing band around each tier's break-even point can be narrow; the wide
 * legacy band was a stand-in for firm heterogeneity that tiers now represent.
 */
export const CATALOGUE_PARAM_OVERRIDES: Partial<EconomyParams> = { shutdownBand: 0.03 };

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
  /**
   * Labour productivity of strong, average and fragile firms. The spread is
   * kept small enough that fragile firms still cover their running costs at
   * normal prices in the most labour-intensive sector (provisional, R58).
   */
  tierProductivity: [1.1, 1.0, 0.9],
  mixedPublicShare: 0.5,

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
  priceCapRefMultiple: 4,
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
  /** Share of a government's borrowing premium over the world rate that reaches its firms. */
  sovereignPassThrough: 0.25,
  /** Cap on the return firms demand (world rate + premiums). */
  maxHurdle: 0.20,
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
  /** Weekly cost of storing strategic reserves, as a share of their value (R13: real storage costs). */
  reserveStorageCost: 0.002,
  /** Weekly loss of stored reserves relative to the good's normal spoilage (managed storage loses less). */
  reserveSpoilageShare: 0.5,

  // --- Central banks (R07-R09, R61; every value provisional) -----------------
  /** Inflation the automatic policy rate aims at. */
  inflationTarget: 0.02,
  growthSmoothing: 0.02,
  /** Capital a central bank must hold per unit of loans: lending capacity = capital / ratio (R61). */
  cbCapitalRatio: 0.10,
  /** Room to lend beyond the starting loans, as a share of yearly GDP. */
  cbStartingHeadroom: 0.10,
  /** Share of each week's profit paid to the treasury; the rest builds capital. */
  cbProfitPayout: 0.75,
  /**
   * Weekly pull of the policy rate towards its rule value. The rule is deliberately gentle:
   * the policy rate also sets firms' cost of capital, so a sharp rate response cuts investment
   * and capacity, which raises prices further (tested: a standard 1.5 / 0.5 rule produced
   * 15% swings in inflation and 35% unemployment in the test world).
   */
  cbRateSmoothing: 0.03,
  /** Policy-rate response to inflation above target. */
  cbInflationGain: 0.5,
  /** Policy-rate response to unemployment above the natural rate. */
  cbUnemploymentGain: 0.25,
  cbRateFloor: 0.005,
  cbRateCeiling: 0.25,
  /** Extra policy rate when nearly all lending capacity is used (credit becomes scarce and dear). */
  cbScarcityPremium: 0.04,
  /** Weeks over which central-bank loans to a state without market access are repaid (they roll over otherwise). */
  cbStateLoanWeeks: 156,
  /**
   * Open-market operations: each week a central bank buys (or sells back) its own state's bonds
   * from households so that the money it has issued grows with real output at the inflation
   * target, leaning against inflation that is off target. Purchases need lending capacity;
   * nothing is given away: households swap bonds for money.
   */
  cbMoneyGain: 0.5,
  /** Largest weekly bond purchase or sale, as a share of the bank's money issued. */
  cbMoneyMaxWeekly: 0.0012,
  /** Sovereign risk premium per unit of recent exceptional money relative to yearly GDP. */
  exceptionalMoneySpread: 0.5,
  /** Weeks over which the memory of exceptional money creation fades. */
  exceptionalMoneyMemoryWeeks: 156,

  // --- Firm credit and bankruptcy (R31, R57; provisional) --------------------
  /** Firms' loan rate above the policy rate. */
  firmLoanSpread: 0.02,
  /** Share of new investment financed with loans at the neutral rate; also the starting debt / replacement value of plant. */
  firmTargetLeverage: 0.10,
  /** Credit limit: debt may not exceed this share of the replacement value of the aggregate's plant. */
  firmMaxLeverage: 0.30,
  /** How strongly the loan-financed share of investment reacts to cheaper or dearer credit. */
  firmLeverageRateSensitivity: 2.0,
  /** Share of cash above working capital used each week to repay debt above the target leverage. */
  firmExcessDebtRepay: 0.25,
  /** Consecutive weeks unable to pay wages or debt service before firms are liquidated. */
  bankruptcyWeeks: 8,
  /** Smallest share of an aggregate's plant that fails in one bankruptcy (its fragile firms first). */
  bankruptcyMinShare: 0.2,
  /** Price obtained for liquidated plant, as a share of its replacement value. */
  liquidationValue: 0.3,

  // --- Performance tiers (R58; provisional) -----------------------------------
  /** Weekly share of the gap between the tier mix and its target that is closed. */
  tierTransitionRate: 0.01,
  /** How far a fully healthy (or fully stricken) aggregate's target mix moves towards strong (or fragile) firms. */
  tierHealthShift: 0.4,
  healthSmoothing: 0.05,

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
  /** Technology level at which exogenous progress has faded to nothing (growth is cubic-smoothly damped). */
  techCeiling: 20,
  techCatchUp: 0.02,
  infraNormShare: 0.02,
  infraAdjust: 0.01,
  infraProductivity: 0.15,
  infraGrowthEffect: 0.004,
  /** Highest infrastructure index public investment can sustain (1 = normal). */
  infraMax: 1.8,
  /**
   * Fastest weekly growth of a resource ceiling (new deposits, land, extraction methods) while demand keeps
   * pressing against it. Scarcity bites in the short run; it cannot become a permanent cap on growth.
   */
  resourceDiscoveryRate: 0.0015,

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
export function createConfig(overrides: Partial<EconomyParams> = {}, goods: readonly GoodDefinition[] = DEFAULT_GOODS,
  sectors: readonly SectorDefinition[] = goods === CATALOGUE_GOODS ? CATALOGUE_SECTORS : DEFAULT_SECTORS): EconomyConfig {
  const config: EconomyConfig = JSON.parse(JSON.stringify({ sectors, goods, params: { ...DEFAULT_PARAMS, ...overrides } }));
  validateConfig(config);
  return deepFreeze(config);
}

/** The ten-sector, 31-good catalogue with its provisional parameters. */
export function createCatalogueConfig(overrides: Partial<EconomyParams> = {}): EconomyConfig {
  return createConfig({ ...CATALOGUE_PARAM_OVERRIDES, ...overrides }, CATALOGUE_GOODS, CATALOGUE_SECTORS);
}

const near = (value: number, target: number) => value > target - 1e-9 && value < target + 1e-9;

export function validateConfig(config: EconomyConfig): void {
  const { sectors, goods, params } = config;
  if (!Array.isArray(sectors) || sectors.length === 0) throw new Error('Configuration needs at least one sector.');
  const sectorIds = new Set<string>();
  for (const sector of sectors) {
    if (typeof sector.id !== 'string' || sector.id.length === 0 || sectorIds.has(sector.id)) throw new Error('Sector IDs must be unique, non-empty text.');
    sectorIds.add(sector.id);
    const shares = [sector.publicShare, sector.mixedShare];
    if (shares.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0) || sector.publicShare + sector.mixedShare > 1) {
      throw new Error(`Sector ${sector.id}: ownership shares must be between 0 and 1 in total.`);
    }
    const tiers = sector.tierShares;
    if (!Array.isArray(tiers) || tiers.length !== 3 || tiers.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0)
      || !near(tiers[0] + tiers[1] + tiers[2], 1)) throw new Error(`Sector ${sector.id}: tier shares must be three numbers summing to 1.`);
  }
  if (!Array.isArray(goods) || goods.length === 0) throw new Error('Configuration needs at least one good.');
  const ids = new Set<string>();
  for (const good of goods) {
    if (typeof good.id !== 'string' || good.id.length === 0 || ids.has(good.id)) throw new Error('Good IDs must be unique, non-empty text.');
    ids.add(good.id);
    if (!sectorIds.has(good.sectorId)) throw new Error(`Good ${good.id}: unknown sector ${String(good.sectorId)}.`);
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
    budget += good.budgetShare; administration += good.administrationShare; military += good.militaryShare;
    infrastructure += good.infrastructureShare; investment += good.investmentShare;
  }
  // Goods that cannot be stored are made to order in the same week; a chain of them
  // is cleared in dependency order, so it must not loop back on itself.
  if (madeToOrderOrder(goods) === null) throw new Error('Goods that cannot be stored may not depend on each other in a loop.');
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
    || params.unrestThresholds.length !== 3 || params.collapseProbability.length !== 3 || params.strikeLoss.length !== 3
    || !Array.isArray(params.tierProductivity) || params.tierProductivity.length !== 3 || params.tierProductivity.some(value => value < 0.2 || value > 5)
    || params.mixedPublicShare > 1 || params.cbCapitalRatio <= 0.01 || params.cbCapitalRatio > 1 || params.cbProfitPayout > 1
    || params.cbRateFloor > params.cbRateCeiling || params.cbStateLoanWeeks < 1 || params.cbMoneyMaxWeekly > 0.05 || params.exceptionalMoneyMemoryWeeks < 1
    || params.firmTargetLeverage > params.firmMaxLeverage || params.firmMaxLeverage > 1 || params.firmExcessDebtRepay > 1
    || params.bankruptcyWeeks < 1 || params.bankruptcyMinShare > 1 || params.liquidationValue > 1 || params.tierTransitionRate > 1
    || params.healthSmoothing > 1 || params.tierHealthShift > 1 || params.reserveStorageCost >= 1 || params.reserveSpoilageShare > 1) {
    throw new Error('A parameter is outside its valid range.');
  }
}

/**
 * Order in which made-to-order goods must be cleared so that every such good
 * comes after the made-to-order goods it uses as inputs. Null if they loop.
 */
export function madeToOrderOrder(goods: readonly GoodDefinition[]): number[] | null {
  const index = new Map<string, number>();
  goods.forEach((good, g) => index.set(good.id, g));
  const order: number[] = [];
  const state = new Array<number>(goods.length).fill(0);
  const visit = (g: number): boolean => {
    if (state[g] === 2) return true;
    if (state[g] === 1) return false;
    state[g] = 1;
    for (const input of goods[g].inputs) {
      const k = index.get(input.goodId);
      if (k !== undefined && goods[k].spoilage >= 1 && !visit(k)) return false;
    }
    state[g] = 2;
    order.push(g);
    return true;
  };
  for (let g = 0; g < goods.length; g++) if (goods[g].spoilage >= 1 && !visit(g)) return null;
  return order;
}

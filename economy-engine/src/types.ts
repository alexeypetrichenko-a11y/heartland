/**
 * Public data contracts of the standalone HEARTLAND economic engine.
 *
 * Everything here is plain JSON-compatible data (strings, finite numbers,
 * booleans, arrays and objects). There are no classes, typed arrays, Maps,
 * Dates or functions inside the simulation state, so a state can be saved with
 * JSON.stringify and restored with JSON.parse without loss.
 *
 * Status: provisional prototype contracts. Goods, coefficients and formulas are
 * proposals awaiting owner approval (GAME_DESIGN.md section 17, item 1).
 */

export type GoodId = string;
export type CountryId = string;
export type ZoneId = string;
export type LaneId = string;

// ---------------------------------------------------------------------------
// Static configuration (data, not rules)
// ---------------------------------------------------------------------------

export interface GoodInput {
  goodId: GoodId;
  /** Units of the input consumed per unit of output. */
  amount: number;
}

/**
 * One good and the sector that produces it. Each sector produces exactly one
 * good, so "sector" and "good" share an index.
 */
export interface GoodDefinition {
  id: GoodId;
  name: string;
  /** False for goods that can only be used in the zone that produced them. */
  tradable: boolean;
  /**
   * Share of unsold producer stock lost every week. A value of 1 means the
   * good cannot be stored at all: it is then produced to order, in the same
   * week it is bought (services, for example).
   */
  spoilage: number;
  /** Bulkiness: multiplies the freight rate per distance unit. */
  freight: number;
  /**
   * Weeks of expected sales producers try to keep in stock after selling. For
   * made-to-order goods: spare capacity kept ready, as a share of expected sales.
   */
  coverWeeks: number;
  /** Intermediate inputs per unit of output (Leontief recipe). */
  inputs: GoodInput[];
  /** Worker-weeks per unit of output at technology level 1. */
  laborPerUnit: number;
  /** Investment goods needed per unit of weekly capacity. */
  capitalWeeks: number;
  /** Share of capacity worn out per year. */
  depreciation: number;
  /** Average delay between paying for capacity and using it. */
  constructionWeeks: number;
  /** Margin at which the sector neither expands nor shrinks. */
  targetMargin: number;
  /** Constant price used for "real" (volume) statistics. */
  basePrice: number;
  /** Household need per person per week that is bought before anything else. */
  subsistence: number;
  /** Share of household spending above subsistence that goes to this good. */
  budgetShare: number;
  /** Weight in the deprivation index; 0 means not a basic necessity. */
  essential: number;
  /** True when capacity is limited by a zone's natural resources. */
  resourceBased: boolean;
  /**
   * Share of capacity in use in normal times. The rest is slack that can be
   * called on at short notice: factories keep more of it than farms or wells.
   */
  normalUtilization: number;
  /** Composition (by value) of each kind of non-household spending. */
  administrationShare: number;
  militaryShare: number;
  infrastructureShare: number;
  investmentShare: number;
}

/** Adjustable behavioural constants. See config/defaults.ts for meanings. */
export interface EconomyParams {
  // Households
  laborParticipation: number;
  consumeIncome: number;
  consumeMoney: number;
  consumeBonds: number;
  incomeSmoothing: number;
  maxMoneySpendShare: number;
  // Firms
  demandSmoothing: number;
  inventoryAdjust: number;
  inputBufferWeeks: number;
  inputBufferAdjust: number;
  shutdownBand: number;
  workingCapitalWeeks: number;
  cashFloorWeeks: number;
  dividendSpeed: number;
  capitalCallShare: number;
  costSmoothing: number;
  // Prices and wages
  priceInventoryGain: number;
  priceShortageGain: number;
  priceCostGain: number;
  pricePressureGain: number;
  priceMaxUp: number;
  priceMaxDown: number;
  priceFloorCostRatio: number;
  priceCapRefMultiple: number;
  refPriceWeeks: number;
  naturalUnemployment: number;
  wageUnemploymentGain: number;
  wageShortageGain: number;
  wageInflationPass: number;
  wageMaxUp: number;
  wageMaxDown: number;
  inflationSmoothing: number;
  // Trade
  tradeElasticityDoublings: number;
  homePreference: number;
  nationalPreference: number;
  allocationPasses: number;
  freightPerDistance: number;
  maxTradeCost: number;
  // Private investment
  equityPremium: number;
  investGrowthMax: number;
  investSensitivity: number;
  investPressureTrigger: number;
  investCashShare: number;
  scrapRateMax: number;
  scrapPressure: number;
  profitSmoothing: number;
  entryShare: number;
  behaviorNoise: number;
  harvestNoise: number;
  // Public finances
  treasuryBufferWeeks: number;
  debtMaturityWeeks: number;
  baseRate: number;
  worldRateSlope: number;
  lendableShare: number;
  lenderHomeBias: number;
  spreadDebtThreshold: number;
  spreadLinear: number;
  spreadQuadThreshold: number;
  spreadQuad: number;
  spreadDeficit: number;
  spreadInstability: number;
  marketAccessRate: number;
  accessRestoreRate: number;
  maxRate: number;
  missedPaymentsToDefault: number;
  defaultHaircut: number;
  defaultExclusionWeeks: number;
  defaultReputationSpread: number;
  reputationDecayWeeks: number;
  defaultStabilityShock: number;
  defaultOutputShock: number;
  defaultShockRecoveryWeeks: number;
  restructuredRate: number;
  surplusRepayShare: number;
  gdpSmoothing: number;
  militaryPayShare: number;
  armsAttrition: number;
  // Strategic reserves
  reserveFillShare: number;
  reserveReleaseShare: number;
  reserveBuyPriceRatio: number;
  reserveReleasePriceRatio: number;
  reserveReleaseShortage: number;
  // Monetary authority
  inflationTarget: number;
  moneyRuleGain: number;
  moneyRuleSlackGain: number;
  moneyGrowthMaxWeekly: number;
  growthSmoothing: number;
  // Political stability
  stabilityBase: number;
  stabilityAdjust: number;
  inflationTolerance: number;
  stabilityInflationWeight: number;
  unemploymentTolerance: number;
  stabilityUnemploymentWeight: number;
  stabilityDeprivationWeight: number;
  stabilityShortageWeight: number;
  stabilityLivingStandardWeight: number;
  taxTolerance: number;
  stabilityTaxWeight: number;
  socialNorm: number;
  stabilitySocialWeight: number;
  stabilityArrearsWeight: number;
  livingStandardSmoothing: number;
  livingStandardRefWeeks: number;
  unrestThresholds: [number, number, number];
  unrestEndThreshold: number;
  unrestGraceWeeks: number;
  collapseProbability: [number, number, number];
  strikeLoss: [number, number, number];
  postRegimeStability: number;
  regimeImmunityWeeks: number;
  // Development
  techGrowthBase: number;
  techCatchUp: number;
  infraNormShare: number;
  infraAdjust: number;
  infraProductivity: number;
  infraGrowthEffect: number;
  // Policy limits accepted from commands
  maxTaxRate: number;
  maxSpendingShare: number;
  maxTariff: number;
  maxReserveWeeks: number;
  // History retention (entries kept per resolution)
  historyWeekly: number;
  historyQuarterly: number;
  historyYearly: number;
}

export interface EconomyConfig {
  goods: GoodDefinition[];
  params: EconomyParams;
}

// ---------------------------------------------------------------------------
// Simulation state
// ---------------------------------------------------------------------------

export interface CountryInfo { id: CountryId; name: string }
export interface ZoneInfo { id: ZoneId; name: string }
export interface WaypointInfo { id: string; name: string }

/**
 * Transport graph. Nodes 0..Z-1 are the zones, the following nodes are
 * waypoints (straits, sea junctions). Each lane is an undirected edge.
 */
export interface LaneArrays {
  id: LaneId[];
  from: number[];
  to: number[];
  distance: number[];
  /** 1 = normal. Raised by war risk, damage or detours. */
  costMultiplier: number[];
  /** 1 = open, 0 = closed. Share of normal trade a partial blockade lets through. */
  throughput: number[];
}

/** Per-zone values, indexed by zone. */
export interface ZoneArrays {
  owner: number[];
  population: number[];
  populationGrowth: number[];
  technology: number[];
  infrastructure: number[];
  mobilized: number[];
  wage: number[];
  householdMoney: number[];
  firmMoney: number[];
  expectedIncome: number[];
  firmCosts: number[];
  cpi: number[];
  inflation: number[];
  unemployment: number[];
  livingStandard: number[];
  livingStandardRef: number[];
  deprivation: number[];
}

/** Per-zone, per-good values, indexed by zone * goodCount + good. */
export interface ZoneGoodArrays {
  capacity: number[];
  build1: number[];
  build2: number[];
  build3: number[];
  /** Producer inventory of local origin; the only stock that can be exported. */
  stock: number[];
  /** Inputs already bought by local firms; can only be used locally. */
  inputBuffer: number[];
  /** Price charged by local producers. */
  price: number[];
  /** Average price local buyers pay, including freight and tariffs. */
  buyPrice: number[];
  /** Slow average of the producer price (anchor for caps and reserves). */
  refPrice: number[];
  expectedDemand: number[];
  margin: number[];
  pressure: number[];
  /** Largest capacity natural resources allow; -1 means unlimited. */
  resourceCap: number[];
  /**
   * Local productivity of this sector relative to the zone's general technology.
   * This is what makes a zone good at some things and poor at others.
   */
  efficiency: number[];
  yieldFactor: number[];
  yieldRecovery: number[];
  shortage: number[];
  usage: number[];
}

/** Per-country values, indexed by country. */
export interface CountryArrays {
  treasury: number[];
  debt: number[];
  averageRate: number[];
  marketRate: number[];
  marketAccess: number[];
  exclusionWeeks: number[];
  reputationSpread: number[];
  missedPayments: number[];
  defaults: number[];
  gdp: number[];
  realGdp: number[];
  deficit: number[];
  arrears: number[];
  stability: number[];
  stabilityModifier: number[];
  unrestTier: number[];
  episodeActive: number[];
  episodePeakTier: number[];
  rolledTier: number[];
  tierWeeks: number[];
  regime: number[];
  immunityWeeks: number[];
  armsStock: number[];
  // Standing policies (changed only by commands)
  taxIncome: number[];
  taxConsumption: number[];
  taxCorporate: number[];
  spendAdministration: number[];
  spendSocial: number[];
  spendMilitary: number[];
  spendInfrastructure: number[];
  autoBorrow: number[];
  governmentPriority: number[];
}

/** Per-country, per-good values, indexed by country * goodCount + good. */
export interface CountryGoodArrays {
  reserves: number[];
  reserveTargetWeeks: number[];
  /** 0 automatic, 1 hold, 2 release, 3 fill. */
  reserveMode: number[];
  tariff: number[];
}

/** One trade restriction: imposer forbids trade in one good with the target. */
export interface SanctionRecord {
  imposer: number;
  target: number;
  good: number;
  /** Imposer refuses to buy this good from the target. */
  imports: boolean;
  /** Imposer refuses to sell this good to the target. */
  exports: boolean;
}

/** Tariff that replaces the general rate for one trading partner. */
export interface TariffOverride {
  imposer: number;
  target: number;
  good: number;
  rate: number;
}

export interface WorldScalars {
  /** Total money in existence; households + firms + treasuries always equal it. */
  baseMoney: number;
  interestRate: number;
  creditUtilization: number;
  realGrowth: number;
  inflation: number;
  realGdp: number;
}

export interface HistoryTier {
  /** Turns summarised by one entry. */
  span: number;
  capacity: number;
  length: number;
  /** Position of the next entry to write. */
  head: number;
  /** Turns accumulated so far for the entry being built. */
  pending: number;
  sums: number[];
  data: number[];
  /** Turn number at which each stored entry ended. */
  turns: number[];
}

export interface HistoryState {
  rowSize: number;
  tiers: HistoryTier[];
}

/** Indicators recorded when the simulation was created; never overwritten. */
export interface BaselineSnapshot {
  realGdp: number[];
  realGdpPerCapita: number[];
  consumptionPerCapita: number[];
  population: number[];
  stability: number[];
}

export interface EconomyState {
  format: 'heartland-economy';
  version: number;
  /** Number of weeks already resolved. There is no upper limit. */
  turn: number;
  seed: number;
  /** Shared by reference between turns and treated as read-only. */
  config: EconomyConfig;
  countries: CountryInfo[];
  zones: ZoneInfo[];
  waypoints: WaypointInfo[];
  lanes: LaneArrays;
  zone: ZoneArrays;
  zoneGood: ZoneGoodArrays;
  /** Face value of country c debt held by zone z households: z * C + c. */
  bonds: number[];
  country: CountryArrays;
  countryGood: CountryGoodArrays;
  sanctions: SanctionRecord[];
  tariffOverrides: TariffOverride[];
  world: WorldScalars;
  baseline: BaselineSnapshot;
  history: HistoryState;
}

// ---------------------------------------------------------------------------
// Turn inputs
// ---------------------------------------------------------------------------

export type TaxKind = 'income' | 'consumption' | 'corporate';
export type SpendingCategory = 'administration' | 'social' | 'military' | 'infrastructure';
export type ReserveMode = 'automatic' | 'hold' | 'release' | 'fill';

/** Standing government decisions. They persist until changed. */
export type EconomyCommand =
  | { type: 'set-tax'; countryId: CountryId; tax: TaxKind; rate: number }
  | { type: 'set-spending'; countryId: CountryId; category: SpendingCategory; share: number }
  /** With `partnerId` the rate applies to that partner only; `null` removes such an exception. */
  | { type: 'set-tariff'; countryId: CountryId; goodId: GoodId; rate: number | null; partnerId?: CountryId }
  | { type: 'set-sanction'; countryId: CountryId; targetId: CountryId; goodIds: GoodId[] | 'all'; imports: boolean; exports: boolean }
  | { type: 'set-reserve'; countryId: CountryId; goodId: GoodId; targetWeeks: number; mode?: ReserveMode }
  | { type: 'set-borrowing'; countryId: CountryId; enabled: boolean }
  | { type: 'set-procurement-priority'; countryId: CountryId; enabled: boolean }
  | { type: 'repay-debt'; countryId: CountryId; amount: number }
  | { type: 'declare-default'; countryId: CountryId };

/** Facts decided by other game systems (war, diplomacy, events). */
export type ExternalEffect =
  | { type: 'production-shock'; zoneId: ZoneId; goodId: GoodId; factor: number; recoveryWeeks: number }
  | { type: 'destroy-capacity'; zoneId: ZoneId; goodId: GoodId | 'all'; fraction: number }
  | { type: 'destroy-stock'; zoneId: ZoneId; goodId: GoodId | 'all'; fraction: number }
  | { type: 'set-lane'; laneId: LaneId; costMultiplier: number; throughput: number }
  | { type: 'transfer-zone'; zoneId: ZoneId; ownerId: CountryId }
  | { type: 'set-mobilization'; zoneId: ZoneId; personnel: number }
  | { type: 'military-procurement'; countryId: CountryId; goodId: GoodId; quantity: number }
  | { type: 'stability-modifier'; countryId: CountryId; value: number }
  | { type: 'transfer-funds'; fromCountryId: CountryId; toCountryId: CountryId; amount: number };

export interface TurnInput {
  commands?: readonly EconomyCommand[];
  effects?: readonly ExternalEffect[];
}

export interface StepOptions {
  /** Verify conservation and non-negativity after the turn; throws on failure. */
  audit?: boolean;
  /** 'full' builds the per-country report, 'none' skips it for bulk simulation. */
  report?: 'full' | 'none';
  /** Include the bilateral trade matrix in the report. */
  tradeDetail?: boolean;
  /**
   * Used only by the world builder while it searches for starting prices:
   * prices then follow supply and demand alone and no money is created.
   */
  calibration?: boolean;
}

// ---------------------------------------------------------------------------
// Turn outputs
// ---------------------------------------------------------------------------

export type EconomyEvent =
  | { type: 'sovereign-default'; turn: number; countryId: CountryId; forced: boolean; haircut: number; debtWrittenOff: number }
  | { type: 'market-access-lost'; turn: number; countryId: CountryId; rate: number }
  | { type: 'market-access-restored'; turn: number; countryId: CountryId; rate: number }
  | { type: 'unrest-started'; turn: number; countryId: CountryId; tier: number }
  | { type: 'unrest-escalated'; turn: number; countryId: CountryId; tier: number }
  | { type: 'unrest-ended'; turn: number; countryId: CountryId }
  | { type: 'regime-survived'; turn: number; countryId: CountryId; tier: number; probability: number }
  | { type: 'regime-change'; turn: number; countryId: CountryId; tier: number; probability: number; regime: number }
  | { type: 'missed-payment'; turn: number; countryId: CountryId; consecutive: number };

export interface BudgetReport {
  incomeTax: number;
  consumptionTax: number;
  corporateTax: number;
  tariffs: number;
  seigniorage: number;
  reserveSales: number;
  fundsReceived: number;
  revenue: number;
  administration: number;
  social: number;
  military: number;
  infrastructure: number;
  reservePurchases: number;
  interest: number;
  fundsSent: number;
  spending: number;
  /** Revenue minus spending for the week. */
  balance: number;
  borrowed: number;
  repaid: number;
  /** Share of planned spending that could actually be paid. */
  fundedShare: number;
}

export interface CountryReport {
  countryId: CountryId;
  population: number;
  gdpNominal: number;
  gdpReal: number;
  gdpRealPerCapita: number;
  /** Consumer price level, population-weighted over the country's zones. */
  cpi: number;
  /** Smoothed consumer-price inflation, annualised. */
  inflation: number;
  unemployment: number;
  wage: number;
  /** Household consumption per person at constant prices. */
  consumptionPerCapita: number;
  deprivation: number;
  exports: number;
  imports: number;
  tradeBalance: number;
  budget: BudgetReport;
  treasury: number;
  debt: number;
  /** Debt divided by annualised smoothed GDP. */
  debtToGdp: number;
  marketRate: number;
  averageRate: number;
  marketAccess: boolean;
  stability: number;
  unrestTier: number;
  regime: number;
  /** Average price buyers pay per good, including freight and tariffs (population-weighted). */
  buyPrices: number[];
  /** Units bought by households this week, per good. */
  householdPurchases: number[];
  /** Share of household demand met, per good (1 = no shortage). */
  householdFill: number[];
  /** Share of government orders met, per good. */
  governmentFill: number[];
  /** Units bought by the government this week, per good. */
  governmentPurchases: number[];
  reserves: number[];
  armsDelivered: number;
  armsStock: number;
  /** Capacity per good, summed over the country's zones. */
  capacity: number[];
  /** Output per good, summed over the country's zones. */
  output: number[];
}

export interface GoodReport {
  goodId: GoodId;
  /** Production-weighted average producer price. */
  price: number;
  production: number;
  householdUse: number;
  intermediateUse: number;
  investmentUse: number;
  governmentUse: number;
  /** Quantity that crossed a zone border. */
  traded: number;
  stock: number;
  unmetDemand: number;
}

/** Physical balance of one good for the week. `error` should be ~0. */
export interface GoodLedger {
  before: number;
  produced: number;
  used: number;
  spoiled: number;
  destroyed: number;
  dust: number;
  after: number;
  error: number;
}

export interface AuditReport {
  goods: GoodLedger[];
  moneyBefore: number;
  moneyCreated: number;
  moneyAfter: number;
  moneyError: number;
  /** Largest difference between a country's debt and the bonds held against it. */
  bondError: number;
  negativeValues: number;
  nonFiniteValues: number;
}

export interface TradeFlow { fromZoneId: ZoneId; toZoneId: ZoneId; goodId: GoodId; quantity: number; value: number }

export interface TurnReport {
  /** Turn number just completed. */
  turn: number;
  countries: CountryReport[];
  goods: GoodReport[];
  world: { gdpReal: number; gdpNominal: number; inflation: number; interestRate: number; money: number; debt: number; population: number };
  events: EconomyEvent[];
  audit: AuditReport;
  trade?: TradeFlow[];
}

export interface TurnResult {
  state: EconomyState;
  report: TurnReport;
}

// ---------------------------------------------------------------------------
// World description used to create a simulation
// ---------------------------------------------------------------------------

export interface CountrySpec {
  id: CountryId;
  name: string;
  /** Public debt as a multiple of yearly GDP at the start. */
  debtToGdp?: number;
  stability?: number;
  taxConsumption?: number;
  taxCorporate?: number;
  /** Omit to let the builder choose the rate that balances the first budget. */
  taxIncome?: number;
  spendAdministration?: number;
  spendSocial?: number;
  spendMilitary?: number;
  spendInfrastructure?: number;
  tariff?: number;
  /** Weeks of national use to keep in strategic reserve, per good. */
  reserveWeeks?: Record<GoodId, number>;
}

export interface ZoneSpec {
  id: ZoneId;
  name: string;
  countryId: CountryId;
  /** Any consistent unit, for example millions of people. */
  population: number;
  /** Productivity relative to the reference economy (1 = reference). */
  technology: number;
  /** Yearly population growth rate. */
  populationGrowth?: number;
  /** Relative strength per tradable good; 0 means the zone cannot produce it. */
  advantage?: Record<GoodId, number>;
  /** Room to expand resource-based sectors above their starting capacity. */
  resourceHeadroom?: number;
}

export interface LaneSpec {
  id: LaneId;
  from: string;
  to: string;
  distance: number;
}

export interface WorldSpec {
  seed: number;
  countries: CountrySpec[];
  zones: ZoneSpec[];
  waypoints?: WaypointInfo[];
  lanes: LaneSpec[];
  config?: EconomyConfig;
  /** Weeks simulated with structure frozen so prices and stocks settle. */
  warmupTurns?: number;
}

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
export type SectorId = string;

// ---------------------------------------------------------------------------
// Static configuration (data, not rules)
// ---------------------------------------------------------------------------

export interface GoodInput {
  goodId: GoodId;
  /** Units of the input consumed per unit of output. */
  amount: number;
}

/**
 * One of the economic sectors. A sector groups several goods; firms are
 * aggregated per zone, sector and type of ownership (R57), and every aggregate
 * is split into three performance tiers (R58).
 */
export interface SectorDefinition {
  id: SectorId;
  name: string;
  /** Share of starting capacity owned by the state (provisional default for every zone). */
  publicShare: number;
  /** Share of starting capacity in mixed (part public, part private) ownership. */
  mixedShare: number;
  /** Starting split of capacity between strong, average and fragile firms. */
  tierShares: [number, number, number];
}

/** One good. Several goods can belong to the same sector. */
export interface GoodDefinition {
  id: GoodId;
  name: string;
  /** Sector whose firms produce this good. */
  sectorId: SectorId;
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
  /** Intermediate inputs per unit of output (Leontief recipe; any number of inputs). */
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
  /** Labour productivity of strong, average and fragile firms relative to the sector norm. */
  tierProductivity: [number, number, number];
  /** Share of a mixed-ownership firm's dividends (and rescues) that belongs to the state. */
  mixedPublicShare: number;
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
  wageProductivityPass: number;
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
  sovereignPassThrough: number;
  maxHurdle: number;
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
  /**
   * ECON-07 (B): a default declared while the state still has market access and no missed payments counts, for
   * every consequence, as this many extra previous defaults (0 = no distinction, the legacy behaviour).
   */
  voluntaryDefaultWeight: number;
  defaultMemoryWeeks: number;
  ownershipTransferValue: number;
  defaultOutputShock: number;
  defaultShockRecoveryWeeks: number;
  restructuredRate: number;
  surplusRepayShare: number;
  gdpSmoothing: number;
  /**
   * ECON-07 (A): weekly speed at which the base of the spending shares follows a FALLING nominal GDP
   * (it follows a rising GDP at gdpSmoothing). Legacy behaviour: equal to gdpSmoothing.
   */
  spendingBaseFall: number;
  /** ECON-07 (A): strategic cash reserve, in weeks of core spending, a debt-free treasury may keep. */
  treasuryReserveWeeks: number;
  /** ECON-07 (A): weekly share of debt-free cash above the strategic reserve returned to households (0 = never). */
  surplusReturnShare: number;
  militaryPayShare: number;
  armsAttrition: number;
  // Strategic reserves
  reserveFillShare: number;
  reserveReleaseShare: number;
  reserveBuyPriceRatio: number;
  reserveReleasePriceRatio: number;
  reserveReleaseShortage: number;
  reserveStorageCost: number;
  reserveSpoilageShare: number;
  // Central banks (R07-R09, R61)
  inflationTarget: number;
  growthSmoothing: number;
  cbCapitalRatio: number;
  cbStartingHeadroom: number;
  cbProfitPayout: number;
  cbRateSmoothing: number;
  cbInflationGain: number;
  cbUnemploymentGain: number;
  cbRateFloor: number;
  cbRateCeiling: number;
  cbScarcityPremium: number;
  cbStateLoanWeeks: number;
  cbStateLimit: number;
  exceptionalMoneySpread: number;
  exceptionalMoneyMemoryWeeks: number;
  // Firm credit and bankruptcy (R31, R57)
  firmLoanSpread: number;
  firmTargetLeverage: number;
  firmMaxLeverage: number;
  firmLeverageRateSensitivity: number;
  firmExcessDebtRepay: number;
  firmLiquidityBorrow: number;
  bankruptcyWeeks: number;
  bankruptcyMinShare: number;
  liquidationValue: number;
  // Performance-tier transitions (R58)
  tierTransitionRate: number;
  tierHealthShift: number;
  healthSmoothing: number;
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
  techCeiling: number;
  techCatchUp: number;
  infraNormShare: number;
  infraAdjust: number;
  infraProductivity: number;
  infraGrowthEffect: number;
  infraMax: number;
  resourceDiscoveryRate: number;
  // Policy limits accepted from commands
  maxTaxRate: number;
  maxSpendingShare: number;
  maxTariff: number;
  maxReserveWeeks: number;
  // Occupation (R49, R50, R62; Milestone 4). Index 0 = moderate, 1 = intensive policy.
  /** Share of each firm's profit (before tax) the occupier levies, per policy. */
  occupationProfitLevy: [number, number];
  /** Share of the wages paid in the zone the occupier levies, per policy. */
  occupationWageLevy: [number, number];
  /** Share of normal output lost to disorganisation under occupation, per policy (before any sabotage). */
  occupationDisorder: [number, number];
  /** Weight of the occupied population in the occupier's spending (social transfers, pay and purchases), per policy. */
  occupationCivilianSpending: [number, number];
  /** Resistance level each policy pushes towards in calm conditions (0-1). */
  resistanceBase: [number, number];
  /** Extra resistance target per unit of deprivation and per point of unemployment above the natural rate. */
  resistanceDeprivationWeight: number;
  resistanceUnemploymentWeight: number;
  /** Weekly share of the gap closed when resistance rises, and when it falls (slower: memory of past policy). */
  resistanceRise: number;
  resistanceFall: number;
  /** Weekly share of resistance that fades once a zone is no longer occupied. */
  resistanceFallFree: number;
  /** Share of output lost to sabotage at full resistance. */
  sabotageOutputLoss: number;
  /** Weekly probability of a sabotage attack at full resistance, and the share of one good's plant it destroys. */
  sabotageChance: number;
  sabotageDamage: number;
  /** Weekly security cost as a share of the zone's weekly output value: per policy, plus this much times resistance. */
  securityCost: [number, number];
  securityResistanceCost: number;
  /** Resistance above which an open revolt is reported, and below which it is reported over. */
  revoltThreshold: number;
  revoltEndThreshold: number;
  // Transport capacity and military requisition (R45, R46, R63; Milestone 4)
  /** Physical capacity of every lane as a multiple of its normal civilian traffic at the start. */
  laneCapacityHeadroom: number;
  /** Smallest lane capacity, as a share of the average lane capacity. */
  laneCapacityFloor: number;
  /** Weekly share of the gap closed by the smoothed estimate of civilian transport demand. */
  laneDemandSmoothing: number;
  // History retention (entries kept per resolution)
  historyWeekly: number;
  historyQuarterly: number;
  historyYearly: number;
}

export interface EconomyConfig {
  sectors: SectorDefinition[];
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
  /**
   * Physical transport capacity per week at the starting size of the economy, in freight units
   * (quantity x base price x bulkiness). It grows with productive potential (world.transportIndex) and is
   * never raised by requisition. -1 = not yet measured (only while a world is being built).
   */
  capacity: number[];
}

/** Per-zone values, indexed by zone. */
export interface ZoneArrays {
  /** Country that controls the zone's economy (taxes, production, distribution, trade). */
  owner: number[];
  /**
   * Legal owner (Milestone 4, R62). Equal to `owner` except while the zone is occupied: then
   * `owner` is the occupier and `sovereign` the country the zone legally belongs to.
   */
  sovereign: number[];
  /** Occupation policy while occupied: 0 moderate, 1 intensive (R50). */
  occupationPolicy: number[];
  /** Resistance to occupation, 0-1. It persists after a change of policy and fades after liberation. */
  resistance: number[];
  /** 1 while an open revolt is reported in the zone. */
  revolt: number[];
  population: number[];
  populationGrowth: number[];
  /** Population the zone can grow towards; growth fades smoothly as it is approached. */
  populationCap: number[];
  technology: number[];
  infrastructure: number[];
  mobilized: number[];
  wage: number[];
  householdMoney: number[];
  expectedIncome: number[];
  cpi: number[];
  inflation: number[];
  unemployment: number[];
  livingStandard: number[];
  livingStandardRef: number[];
  deprivation: number[];
}

/** Per-zone, per-good values, indexed by zone * goodCount + good. */
export interface ZoneGoodArrays {
  /** Producer inventory of local origin; the only stock that can be exported. */
  stock: number[];
  /** Inputs already bought by local firms; can only be used locally. */
  inputBuffer: number[];
  /** Price charged by local producers. */
  price: number[];
  /** Average price local buyers pay, including freight and tariffs. */
  buyPrice: number[];
  /** Slow average of the producer price (anchor for price caps). */
  refPrice: number[];
  /** Slow average of what local buyers pay (anchor for strategic-reserve decisions). */
  refBuyPrice: number[];
  /**
   * Plant left from liquidations, held for sale by the creditor central bank (R31, R32):
   * capacity units, their book value, and the bank that holds them (-1 = none).
   */
  idleCapacity: number[];
  idleValue: number[];
  idleHolder: number[];
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

/**
 * Firm aggregates (R57), indexed by (zone * sectorCount + sector) * 3 + ownership,
 * with ownership 0 private, 1 public, 2 mixed. An aggregate stands for all
 * firms of one sector and one kind of owner in one zone; no individual firm
 * is simulated, openly or hidden.
 */
export interface FirmArrays {
  /** Cash held by the aggregate. Part of the money supply. */
  cash: number[];
  /** Smoothed weekly running costs (wages and purchased inputs). */
  costs: number[];
  /** Workers employed last week. */
  employment: number[];
  /** Sales revenue last week. */
  revenue: number[];
  /** Outstanding bank loan (owed to the central bank of country `lender`). */
  loan: number[];
  /** Country whose central bank holds the loan. */
  lender: number[];
  /** Consecutive weeks in which the aggregate could not meet wages or debt service. */
  distress: number[];
  /** Smoothed financial health from -1 (crisis) to +1 (thriving); steers tier transitions. */
  health: number[];
}

/**
 * Per zone, good and ownership, indexed by (zone * goodCount + good) * 3 + ownership.
 * Construction is owned by whoever pays for it; finished plant joins the average tier.
 */
export interface FirmGoodArrays {
  build1: number[];
  build2: number[];
  build3: number[];
  /** Share of the zone's unsold stock of the good that belongs to each kind of owner. */
  stockShare: number[];
}

/**
 * Production lines (R58), indexed by ((zone * goodCount + good) * 3 + ownership) * 3 + tier,
 * with tier 0 strong, 1 average, 2 fragile.
 */
export interface FirmLineArrays {
  capacity: number[];
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
  // National central bank (R07). Its balance sheet: assets = reserves + loans to the state
  // + loans to firms; liabilities = money issued; equity (capital) = assets - liabilities.
  /** Policy rate, set automatically (R09). */
  cbRate: number[];
  /** Non-circulating assets (gold and foreign reserves) that back money not lent out. */
  cbReserves: number[];
  /**
   * Money issued and not yet withdrawn: the bank's liability. All money in circulation is issued
   * by some central bank. With one shared currency (R36 not yet implemented) a bank can withdraw
   * more than it issued, for example from an exporter's firms repaying loans with money earned
   * abroad; a negative value is then a net claim on money issued by other banks.
   */
  cbIssued: number[];
  /** Loans from the central bank to its own state (part of public debt). */
  cbStateLoans: number[];
  /** Exceptional money created on explicit authorisation, cumulative (R08). */
  cbExceptional: number[];
  /** Same, fading with time; feeds the sovereign risk premium. */
  cbExceptionalRecent: number[];
  /** Memory of recent sovereign defaults (+1 per default, fading over time); repeat defaults cost more (C3). */
  defaultMemory: number[];
  /** ECON-07 (A): nominal weekly GDP the spending shares apply to (rises like gdp, falls slowly). */
  spendingBase: number[];
}

/** Per-country, per-sector policies, indexed by country * sectorCount + sector. */
export interface CountrySectorArrays {
  /** Strategic objective of public firms (R03): 0 profitability, 1 maximum production, 2 affordable prices, 3 strategic supply. */
  publicObjective: number[];
  /** 1 = the state automatically supports its struggling public firms (at a fiscal cost), 0 = it does not. */
  publicSupport: number[];
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
  /** Total money in existence; households + firm aggregates + treasuries always equal it. */
  baseMoney: number;
  interestRate: number;
  creditUtilization: number;
  realGrowth: number;
  inflation: number;
  realGdp: number;
  /**
   * Number of times all money amounts were divided by 2^30 to keep numbers in a safe
   * range. One money unit now equals 2^(30 * rebases) of the original units.
   */
  rebases: number;
  /** Productive potential (sum of population x technology) when transport capacities were measured. */
  transportBase: number;
  /** Growth of transport capacity with the economy: highest productive potential so far / transportBase (never falls). */
  transportIndex: number;
}

/** A standing military transport requisition (R46, R63): priority capacity on an itinerary. */
export interface RequisitionRecord {
  country: number;
  origin: number;
  destination: number;
  /** Freight units per week requested. */
  volume: number;
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
  firm: FirmArrays;
  firmGood: FirmGoodArrays;
  firmLine: FirmLineArrays;
  /** Face value of country c debt held by zone z households: z * C + c. */
  bonds: number[];
  country: CountryArrays;
  countryGood: CountryGoodArrays;
  countrySector: CountrySectorArrays;
  sanctions: SanctionRecord[];
  tariffOverrides: TariffOverride[];
  /** Standing military transport requisitions, sorted by country, origin, destination. */
  requisitions: RequisitionRecord[];
  /**
   * Smoothed civilian freight (freight units per week) that buyers in zone a wanted to bring from
   * zone b, before any capacity limit: tradeDemand[a * Z + b]. Spread over the current routes it
   * gives every lane's expected civilian load, also right after traffic has been rerouted.
   */
  tradeDemand: number[];
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
export type OccupationPolicy = 'moderate' | 'intensive';

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
  /** Exceptional money creation by the national central bank, paid to the treasury (R08, R43). */
  | { type: 'create-money'; countryId: CountryId; amount: number }
  | { type: 'declare-default'; countryId: CountryId }
  /** Strategic objective of the country's public firms in one sector or all (R03). */
  | { type: 'set-public-objective'; countryId: CountryId; sectorId: SectorId | 'all'; objective: 'profitability' | 'maximum-production' | 'affordable-prices' | 'strategic-supply' }
  /** Whether the state automatically supports its struggling public and mixed firms (at a fiscal cost). */
  | { type: 'set-public-support'; countryId: CountryId; sectorId: SectorId | 'all'; enabled: boolean }
  /** Pay treasury money into a public or mixed firm aggregate, as cash or to repay its bank debt. */
  | { type: 'recapitalize-firm'; countryId: CountryId; zoneId: ZoneId; sectorId: SectorId; ownership: 'public' | 'mixed'; amount: number; use?: 'cash' | 'debt' }
  /** Buy the liquidated plant a bank holds for sale in one of the country's zones (R32); no old debt is taken over. */
  | { type: 'acquire-assets'; countryId: CountryId; zoneId: ZoneId; goodId: GoodId | 'all' }
  /** Buy a share of a private (or mixed) firm aggregate at fair value; its plant, cash and debts move with it (R02). */
  | { type: 'nationalize'; countryId: CountryId; zoneId: ZoneId; sectorId: SectorId; share: number; from?: 'private' | 'mixed' }
  /** Sell a share of a public firm aggregate at fair value to the zone's households (R02). */
  | { type: 'privatize'; countryId: CountryId; zoneId: ZoneId; sectorId: SectorId; share: number; to?: 'private' | 'mixed' }
  /** Pay treasury money to the central bank: it first repays the state's loans from the bank, the rest becomes capital. */
  | { type: 'recapitalize-central-bank'; countryId: CountryId; amount: number }
  /** Occupation policy in a zone the country occupies (R50). */
  | { type: 'set-occupation-policy'; countryId: CountryId; zoneId: ZoneId; policy: OccupationPolicy }
  /**
   * Standing military priority on the transport itinerary between two zones the country controls
   * (R46, R63). The engine finds the lanes; `volume` (freight units per week) 0 cancels it.
   */
  | { type: 'set-transport-requisition'; countryId: CountryId; originZoneId: ZoneId; destinationZoneId: ZoneId; volume: number };

/** Facts decided by other game systems (war, diplomacy, events). */
export type ExternalEffect =
  | { type: 'production-shock'; zoneId: ZoneId; goodId: GoodId; factor: number; recoveryWeeks: number }
  | { type: 'destroy-capacity'; zoneId: ZoneId; goodId: GoodId | 'all'; fraction: number }
  | { type: 'destroy-stock'; zoneId: ZoneId; goodId: GoodId | 'all'; fraction: number }
  | { type: 'set-lane'; laneId: LaneId; costMultiplier: number; throughput: number }
  /** Annexation: the zone legally and economically becomes the new owner's (ends any occupation). */
  | { type: 'transfer-zone'; zoneId: ZoneId; ownerId: CountryId }
  /** Military occupation (R49, R62): the occupier takes economic control; firms keep their legal owners. */
  | { type: 'occupy-zone'; zoneId: ZoneId; occupierId: CountryId; policy?: OccupationPolicy }
  /** Liberation: control returns to the zone's legal owner. */
  | { type: 'liberate-zone'; zoneId: ZoneId }
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
  | { type: 'sovereign-default'; turn: number; countryId: CountryId; forced: boolean; /** ECON-07: declared while still able to borrow and pay (absent in events from older engines). */ voluntary?: boolean; haircut: number; debtWrittenOff: number }
  | { type: 'market-access-lost'; turn: number; countryId: CountryId; rate: number }
  | { type: 'market-access-restored'; turn: number; countryId: CountryId; rate: number }
  | { type: 'unrest-started'; turn: number; countryId: CountryId; tier: number }
  | { type: 'unrest-escalated'; turn: number; countryId: CountryId; tier: number }
  | { type: 'unrest-ended'; turn: number; countryId: CountryId }
  | { type: 'regime-survived'; turn: number; countryId: CountryId; tier: number; probability: number }
  | { type: 'regime-change'; turn: number; countryId: CountryId; tier: number; probability: number; regime: number }
  | { type: 'missed-payment'; turn: number; countryId: CountryId; consecutive: number }
  | { type: 'money-created'; turn: number; countryId: CountryId; amount: number }
  /** Zone events carry `countryId` too: the occupier, the liberated legal owner, or the annexing country. */
  | { type: 'zone-occupied'; turn: number; countryId: CountryId; zoneId: ZoneId; occupierId: CountryId; sovereignId: CountryId; policy: OccupationPolicy }
  | { type: 'zone-liberated'; turn: number; countryId: CountryId; zoneId: ZoneId; sovereignId: CountryId; formerOccupierId: CountryId }
  | { type: 'zone-annexed'; turn: number; countryId: CountryId; zoneId: ZoneId; ownerId: CountryId; formerOwnerId: CountryId }
  /** Plant destroyed by sabotage in an occupied zone: `capacity` units of `goodId`, `share` of what was there. `countryId` is the occupier. */
  | { type: 'sabotage'; turn: number; countryId: CountryId; zoneId: ZoneId; occupierId: CountryId; goodId: GoodId; capacity: number; share: number }
  | { type: 'occupation-revolt'; turn: number; countryId: CountryId; zoneId: ZoneId; occupierId: CountryId; resistance: number }
  | { type: 'occupation-revolt-ended'; turn: number; countryId: CountryId; zoneId: ZoneId; occupierId: CountryId; resistance: number }
  | { type: 'firm-bankruptcy'; turn: number; countryId: CountryId; zoneId: ZoneId; sectorId: SectorId; ownership: string; capacityShare: number;
    debt: number; recovered: number; writtenOff: number; assetsSold: number; assetsHeld: number };

export interface BudgetReport {
  incomeTax: number;
  consumptionTax: number;
  corporateTax: number;
  tariffs: number;
  /** Profit transferred by the national central bank. */
  centralBankProfit: number;
  /** Exceptional money creation received from the central bank (R08). */
  moneyCreation: number;
  reserveSales: number;
  fundsReceived: number;
  /** Dividends from public and mixed firm aggregates. */
  firmDividends: number;
  /** Received from privatisations. */
  ownershipSales: number;
  /** Levied on the firms of zones the country occupies (R50). */
  occupationLevy: number;
  revenue: number;
  administration: number;
  social: number;
  military: number;
  infrastructure: number;
  /** Strategic-reserve purchases and storage costs. */
  reservePurchases: number;
  /** Interest paid to bondholders and to the central bank. */
  interest: number;
  /** Interest due but not paid this week; it was added to the debt (not part of spending). */
  unpaidInterest: number;
  fundsSent: number;
  /** Cash injected into struggling public and mixed firm aggregates (rescues, debt relief, recapitalisations). */
  firmSupport: number;
  /** Paid for nationalisations and for liquidated plant bought by the state. */
  ownershipPurchases: number;
  /** Paid in capital to the central bank (after repaying the state's loans from it). */
  centralBankCapital: number;
  /** Security of the zones the country occupies (paid as pay to its own households). */
  occupationSecurity: number;
  /** Paid for military transport on requisitioned itineraries (to transport workers). */
  transportRequisition: number;
  /** ECON-07 (A): debt-free cash above the strategic reserve returned to households. */
  surplusReturned: number;
  spending: number;
  /** Revenue minus spending for the week. */
  balance: number;
  borrowed: number;
  /** Part of `borrowed` that came from the national central bank. */
  borrowedFromCentralBank: number;
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
  centralBank: CentralBankReport;
  /** Bank debt of the firms located in the country. */
  firmDebt: number;
  /** Firm bankruptcies in the country this week. */
  bankruptcies: number;
}

export interface CentralBankReport {
  policyRate: number;
  /** Rate firms pay on new and existing loans. */
  firmLoanRate: number;
  reserves: number;
  loansToState: number;
  loansToFirms: number;
  /** Money issued and outstanding (liability). */
  moneyIssued: number;
  /** Capital: reserves + loans - money issued. */
  equity: number;
  /** Largest total of loans the capital allows (R61). */
  lendingCapacity: number;
  /** Exceptional money created so far (R08). */
  exceptionalMoney: number;
  /** Book value of liquidated plant the bank holds for sale. */
  assetsHeld: number;
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
  /** Relative difference between money in circulation and money issued by all central banks (should be ~0). */
  issuedError: number;
  negativeValues: number;
  nonFiniteValues: number;
}

export interface TradeFlow { fromZoneId: ZoneId; toZoneId: ZoneId; goodId: GoodId; quantity: number; value: number }

/** One occupied zone this week (Milestone 4). */
export interface OccupationReport {
  zoneId: ZoneId;
  occupierId: CountryId;
  sovereignId: CountryId;
  policy: OccupationPolicy;
  resistance: number;
  revolt: boolean;
  /** Share of normal output lost to disorganisation and sabotage this week. */
  outputLoss: number;
  /** Levy collected by the occupier this week. */
  levy: number;
  /** Security cost paid by the occupier this week. */
  securityCost: number;
  /** Dividends of the legal owner's public firms withheld in the zone this week (kept by the firms). */
  withheldDividends: number;
}

export interface LaneReport {
  laneId: LaneId;
  /** Physical capacity this week, freight units. */
  capacity: number;
  /** Taken by military requisitions. */
  military: number;
  /** Civilian freight actually moved. */
  civilian: number;
  /** Civilian freight buyers wanted to move (before capacity limits). */
  civilianDemand: number;
  /** (military + civilian) / capacity. */
  utilization: number;
}

export interface RequisitionReport {
  countryId: CountryId;
  originZoneId: ZoneId;
  destinationZoneId: ZoneId;
  requested: number;
  /** Capacity actually secured on every lane of the itinerary. */
  delivered: number;
  /** Lanes of the itinerary, in order; empty if no route through controlled territory exists. */
  laneIds: LaneId[];
  /** Lane that limited the volume, if any. */
  bottleneckLaneId: LaneId | null;
  cost: number;
}

/** One zone this week (full reports only): what its firms produced, per good. */
export interface ZoneReport {
  zoneId: ZoneId;
  /** Units produced this week, per good (same order as the configuration's goods). */
  output: number[];
}

export interface TurnReport {
  /** Turn number just completed. */
  turn: number;
  countries: CountryReport[];
  goods: GoodReport[];
  /** Per-zone production (empty with report: 'none'). */
  zones: ZoneReport[];
  occupations: OccupationReport[];
  transport: { lanes: LaneReport[]; requisitions: RequisitionReport[] };
  world: { gdpReal: number; gdpNominal: number; inflation: number; interestRate: number; money: number; debt: number; population: number; rebases: number };
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
  /** Yearly population growth rate while far below the ceiling. */
  populationGrowth?: number;
  /** Population ceiling as a multiple of the starting population (default 3). */
  populationLimit?: number;
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

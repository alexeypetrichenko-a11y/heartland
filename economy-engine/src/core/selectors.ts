import type { CountryId, EconomyState, GoodId, ReserveMode, ZoneId } from '../types.ts';

/**
 * Read-only views of a state for the host game and its interface.
 *
 * These never run a turn and never change the state. They translate the
 * engine's compact arrays into named values keyed by the host's own ids.
 */

const RESERVE_MODES: readonly ReserveMode[] = ['automatic', 'hold', 'release', 'fill'];

export interface CountryPolicy {
  taxIncome: number;
  taxConsumption: number;
  taxCorporate: number;
  spendAdministration: number;
  spendSocial: number;
  spendMilitary: number;
  spendInfrastructure: number;
  borrowingEnabled: boolean;
  procurementPriority: boolean;
  tariff: Record<GoodId, number>;
  reserveTargetWeeks: Record<GoodId, number>;
  reserveMode: Record<GoodId, ReserveMode>;
}

export interface CountrySnapshot {
  countryId: CountryId;
  name: string;
  zoneIds: ZoneId[];
  population: number;
  treasury: number;
  debt: number;
  /** Debt divided by annualised smoothed GDP. */
  debtToGdp: number;
  /** Smoothed weekly GDP at current prices. */
  gdp: number;
  /** Last week's GDP at constant prices. */
  realGdp: number;
  marketRate: number;
  averageRate: number;
  marketAccess: boolean;
  /** Weeks left before a defaulted country may borrow again. */
  exclusionWeeks: number;
  defaults: number;
  stability: number;
  unrestTier: number;
  regime: number;
  armsStock: number;
  reserves: Record<GoodId, number>;
  policy: CountryPolicy;
}

export interface ZoneGoodSnapshot {
  goodId: GoodId;
  capacity: number;
  underConstruction: number;
  stock: number;
  /** Price charged by local producers. */
  price: number;
  /** Price local buyers pay, including freight and tariffs. */
  buyPrice: number;
  /** Smoothed share of local demand that could not be met (0 = none). */
  shortage: number;
  /** 1 = normal; below 1 while a production shock lasts. */
  yieldFactor: number;
}

export interface ZoneSnapshot {
  zoneId: ZoneId;
  name: string;
  ownerId: CountryId;
  population: number;
  technology: number;
  infrastructure: number;
  wage: number;
  unemployment: number;
  cpi: number;
  /** Smoothed consumer-price inflation, annualised. */
  inflation: number;
  /** Share of basic needs households could not obtain. */
  deprivation: number;
  householdMoney: number;
  goods: ZoneGoodSnapshot[];
}

function countryIndex(state: EconomyState, countryId: CountryId): number {
  const index = state.countries.findIndex(country => country.id === countryId);
  if (index < 0) throw new Error(`Unknown country: ${countryId}.`);
  return index;
}

export function getCountry(state: EconomyState, countryId: CountryId): CountrySnapshot {
  const c = countryIndex(state, countryId);
  const goods = state.config.goods;
  const G = goods.length;
  const country = state.country;
  let population = 0;
  const zoneIds: ZoneId[] = [];
  for (let z = 0; z < state.zones.length; z++) {
    if (state.zone.owner[z] !== c) continue;
    population += state.zone.population[z];
    zoneIds.push(state.zones[z].id);
  }
  const tariff: Record<GoodId, number> = {};
  const reserveTargetWeeks: Record<GoodId, number> = {};
  const reserveMode: Record<GoodId, ReserveMode> = {};
  const reserves: Record<GoodId, number> = {};
  for (let g = 0; g < G; g++) {
    const id = goods[g].id;
    tariff[id] = state.countryGood.tariff[c * G + g];
    reserveTargetWeeks[id] = state.countryGood.reserveTargetWeeks[c * G + g];
    reserveMode[id] = RESERVE_MODES[state.countryGood.reserveMode[c * G + g]] ?? 'automatic';
    reserves[id] = state.countryGood.reserves[c * G + g];
  }
  return {
    countryId,
    name: state.countries[c].name,
    zoneIds,
    population,
    treasury: country.treasury[c],
    debt: country.debt[c],
    debtToGdp: country.gdp[c] > 0 ? country.debt[c] / (52 * country.gdp[c]) : 0,
    gdp: country.gdp[c],
    realGdp: country.realGdp[c],
    marketRate: country.marketRate[c],
    averageRate: country.averageRate[c],
    marketAccess: country.marketAccess[c] === 1,
    exclusionWeeks: country.exclusionWeeks[c],
    defaults: country.defaults[c],
    stability: country.stability[c],
    unrestTier: country.unrestTier[c],
    regime: country.regime[c],
    armsStock: country.armsStock[c],
    reserves,
    policy: {
      taxIncome: country.taxIncome[c],
      taxConsumption: country.taxConsumption[c],
      taxCorporate: country.taxCorporate[c],
      spendAdministration: country.spendAdministration[c],
      spendSocial: country.spendSocial[c],
      spendMilitary: country.spendMilitary[c],
      spendInfrastructure: country.spendInfrastructure[c],
      borrowingEnabled: country.autoBorrow[c] === 1,
      procurementPriority: country.governmentPriority[c] === 1,
      tariff,
      reserveTargetWeeks,
      reserveMode,
    },
  };
}

export function getZone(state: EconomyState, zoneId: ZoneId): ZoneSnapshot {
  const z = state.zones.findIndex(zone => zone.id === zoneId);
  if (z < 0) throw new Error(`Unknown zone: ${zoneId}.`);
  const goods = state.config.goods;
  const G = goods.length;
  const zg = state.zoneGood;
  const list: ZoneGoodSnapshot[] = [];
  for (let g = 0; g < G; g++) {
    const index = z * G + g;
    list.push({
      goodId: goods[g].id,
      capacity: zg.capacity[index],
      underConstruction: zg.build1[index] + zg.build2[index] + zg.build3[index],
      stock: zg.stock[index],
      price: zg.price[index],
      buyPrice: zg.buyPrice[index],
      shortage: zg.shortage[index],
      yieldFactor: zg.yieldFactor[index],
    });
  }
  return {
    zoneId,
    name: state.zones[z].name,
    ownerId: state.countries[state.zone.owner[z]].id,
    population: state.zone.population[z],
    technology: state.zone.technology[z],
    infrastructure: state.zone.infrastructure[z],
    wage: state.zone.wage[z],
    unemployment: state.zone.unemployment[z],
    cpi: state.zone.cpi[z],
    inflation: state.zone.inflation[z] * 52,
    deprivation: state.zone.deprivation[z],
    householdMoney: state.zone.householdMoney[z],
    goods: list,
  };
}

export interface SanctionView {
  imposerId: CountryId;
  targetId: CountryId;
  goodId: GoodId;
  imports: boolean;
  exports: boolean;
}

/** Every trade restriction currently in force. */
export function listSanctions(state: EconomyState): SanctionView[] {
  return state.sanctions.map(entry => ({
    imposerId: state.countries[entry.imposer].id,
    targetId: state.countries[entry.target].id,
    goodId: state.config.goods[entry.good].id,
    imports: entry.imports,
    exports: entry.exports,
  }));
}

export interface ProgressView {
  /** Real GDP now divided by real GDP at the start of the game. */
  realGdp: number;
  population: number;
  /** Stability now minus stability at the start. */
  stabilityChange: number;
}

/**
 * Change since the start of the game, for "progress relative to starting
 * conditions" (GAME_DESIGN.md section 13). The scoring formula itself is an
 * open owner decision and is deliberately not implemented here.
 */
export function getProgress(state: EconomyState, countryId: CountryId): ProgressView {
  const c = countryIndex(state, countryId);
  let population = 0;
  for (let z = 0; z < state.zones.length; z++) if (state.zone.owner[z] === c) population += state.zone.population[z];
  const base = state.baseline;
  return {
    realGdp: base.realGdp[c] > 0 ? state.country.realGdp[c] / base.realGdp[c] : 0,
    population: base.population[c] > 0 ? population / base.population[c] : 0,
    stabilityChange: state.country.stability[c] - base.stability[c],
  };
}

import type { CountrySpec, EconomyConfig, EconomyState, WorldSpec } from '../types.ts';
import { createConfig, validateConfig } from '../config/defaults.ts';
import { capitalCharge, EPSILON, getModel } from '../core/model.ts';
import { STATE_FORMAT, STATE_VERSION } from '../core/state.ts';
import { createHistory } from '../core/stats.ts';
import { advanceEconomyInPlace } from '../core/step.ts';

/**
 * Builds a consistent starting economy from a high-level world description.
 *
 * The designer states who lives where, how productive each zone is and what
 * it is good at. The builder then solves for a production structure in which
 * every zone's workers are employed, every good produced is wanted somewhere
 * and every government budget balances, and finally lets prices and stocks
 * settle for a few simulated weeks with the structure held fixed.
 *
 * All default policy values below are provisional test-world assumptions.
 */

export const DEFAULT_COUNTRY_POLICY = {
  debtToGdp: 0.5,
  taxConsumption: 0.10,
  taxCorporate: 0.20,
  spendAdministration: 0.12,
  spendSocial: 0.10,
  spendMilitary: 0.02,
  spendInfrastructure: 0.02,
  tariff: 0.03,
} as const;

export const DEFAULT_WARMUP_TURNS = 160;
const SOLVER_ITERATIONS = 400;
/** Weeks run with normal rules after calibration, to confirm the start is a resting point. */
const CHECK_TURNS = 12;
/** Passes of "find prices, then recalibrate"; later passes are a quarter as long. */
const CALIBRATION_ROUNDS = 4;
/** A sector a zone does not have becomes worth starting once local prices rise by this share. */
const ENTRY_PRICE_GAP = 0.15;

function fail(message: string): never {
  throw new Error(`Invalid world description: ${message}`);
}

function positive(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) fail(`${label} must be a positive number.`);
  return value;
}

function fraction(value: unknown, fallback: number, high: number, label: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > high) fail(`${label} must be between 0 and ${high}.`);
  return value;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
    Object.freeze(value);
  }
  return value;
}

export function createEconomy(spec: WorldSpec): EconomyState {
  let config: EconomyConfig;
  if (spec.config) {
    config = JSON.parse(JSON.stringify(spec.config));
    validateConfig(config);
    deepFreeze(config);
  } else config = createConfig();
  const m = getModel(config);
  const p = config.params;
  const G = m.goodCount;
  const goods = config.goods;

  // --- Validate the description ----------------------------------------------
  if (!Number.isInteger(spec.seed) || spec.seed < 0 || spec.seed > 4294967295) fail('seed must be a whole number from 0 to 4294967295.');
  if (!Array.isArray(spec.countries) || spec.countries.length === 0) fail('at least one country is required.');
  if (!Array.isArray(spec.zones) || spec.zones.length === 0) fail('at least one zone is required.');
  const C = spec.countries.length;
  const Z = spec.zones.length;
  const waypoints = spec.waypoints ?? [];
  const countryIndex = new Map<string, number>();
  spec.countries.forEach((country, index) => {
    if (typeof country.id !== 'string' || country.id.length === 0 || countryIndex.has(country.id)) fail('country ids must be unique text.');
    countryIndex.set(country.id, index);
  });
  const nodeIndex = new Map<string, number>();
  spec.zones.forEach((zone, index) => {
    if (typeof zone.id !== 'string' || zone.id.length === 0 || nodeIndex.has(zone.id)) fail('zone ids must be unique text.');
    if (!countryIndex.has(zone.countryId)) fail(`zone ${zone.id} belongs to unknown country ${zone.countryId}.`);
    nodeIndex.set(zone.id, index);
  });
  waypoints.forEach((waypoint, index) => {
    if (typeof waypoint.id !== 'string' || waypoint.id.length === 0 || nodeIndex.has(waypoint.id)) fail('waypoint ids must be unique and differ from zone ids.');
    nodeIndex.set(waypoint.id, Z + index);
  });
  const laneIds = new Set<string>();
  for (const lane of spec.lanes ?? []) {
    if (typeof lane.id !== 'string' || lane.id.length === 0 || laneIds.has(lane.id)) fail('lane ids must be unique text.');
    laneIds.add(lane.id);
    if (!nodeIndex.has(lane.from) || !nodeIndex.has(lane.to) || lane.from === lane.to) fail(`lane ${lane.id} must join two different known places.`);
    positive(lane.distance, `lane ${lane.id} distance`);
  }

  // --- Policies ------------------------------------------------------------------
  const policy = spec.countries.map((country: CountrySpec) => ({
    debtToGdp: fraction(country.debtToGdp, DEFAULT_COUNTRY_POLICY.debtToGdp, 5, 'debtToGdp'),
    taxConsumption: fraction(country.taxConsumption, DEFAULT_COUNTRY_POLICY.taxConsumption, p.maxTaxRate, 'taxConsumption'),
    taxCorporate: fraction(country.taxCorporate, DEFAULT_COUNTRY_POLICY.taxCorporate, p.maxTaxRate, 'taxCorporate'),
    administration: fraction(country.spendAdministration, DEFAULT_COUNTRY_POLICY.spendAdministration, p.maxSpendingShare, 'spendAdministration'),
    social: fraction(country.spendSocial, DEFAULT_COUNTRY_POLICY.spendSocial, p.maxSpendingShare, 'spendSocial'),
    military: fraction(country.spendMilitary, DEFAULT_COUNTRY_POLICY.spendMilitary, p.maxSpendingShare, 'spendMilitary'),
    infrastructure: fraction(country.spendInfrastructure, DEFAULT_COUNTRY_POLICY.spendInfrastructure, p.maxSpendingShare, 'spendInfrastructure'),
    tariff: fraction(country.tariff, DEFAULT_COUNTRY_POLICY.tariff, p.maxTariff, 'tariff'),
    stability: fraction(country.stability, p.stabilityBase, 100, 'stability'),
  }));

  // --- Zone data -----------------------------------------------------------------
  const owner: number[] = [];
  const population: number[] = [];
  const technology: number[] = [];
  const advantage = new Float64Array(Z * G);
  spec.zones.forEach((zone, z) => {
    owner.push(countryIndex.get(zone.countryId) as number);
    population.push(positive(zone.population, `zone ${zone.id} population`));
    technology.push(positive(zone.technology, `zone ${zone.id} technology`));
    let total = 0;
    for (let g = 0; g < G; g++) {
      const given = zone.advantage ? zone.advantage[goods[g].id] : undefined;
      if (given !== undefined && (typeof given !== 'number' || !Number.isFinite(given) || given < 0)) fail(`zone ${zone.id} advantage for ${goods[g].id} is invalid.`);
      advantage[z * G + g] = m.tradable[g] ? (given === undefined ? 1 : given) : 1;
      if (m.tradable[g]) total += advantage[z * G + g];
    }
    if (!(total > 0)) fail(`zone ${zone.id} cannot produce any tradable good.`);
  });

  // --- Solve for a consistent production structure -----------------------------------
  const valueAdded = new Float64Array(G);
  let capitalPrice = 0;
  for (let g = 0; g < G; g++) {
    let inputs = 0;
    for (let k = 0; k < G; k++) inputs += m.recipe[g * G + k] * m.basePrice[k];
    valueAdded[g] = m.basePrice[g] - inputs;
    capitalPrice += m.investment[g] * m.basePrice[g];
  }
  const employment = new Float64Array(Z);
  const income = new Float64Array(Z);
  const output = new Float64Array(Z * G);
  const use = new Float64Array(Z * G);
  const household = new Float64Array(Z * G);
  const input = new Float64Array(Z * G);
  const privateSpending = new Float64Array(Z);
  const investmentValue = new Float64Array(Z);
  const lossValue = new Float64Array(Z);
  const bufferLossValue = new Float64Array(Z);
  const rowScale = new Float64Array(Z).fill(1);
  const columnScale = new Float64Array(G).fill(1);
  const world = new Float64Array(G);
  const tradableLabor = new Float64Array(Z);
  for (let z = 0; z < Z; z++) {
    employment[z] = population[z] * p.laborParticipation * (1 - p.naturalUnemployment);
    income[z] = employment[z] * technology[z] / 0.62;
    for (let g = 0; g < G; g++) output[z * G + g] = income[z] / G;
  }
  for (let iteration = 0; iteration < SOLVER_ITERATIONS; iteration++) {
    world.fill(0);
    for (let z = 0; z < Z; z++) {
      const rule = policy[owner[z]];
      const base = z * G;
      let investUnits = 0;
      for (let g = 0; g < G; g++) investUnits += m.depreciationWeekly[g] * m.capitalWeeks[g] * output[base + g] / m.normalUtilization[g];
      investmentValue[z] = investUnits * capitalPrice;
      // Goods that spoil in warehouses and input stores were paid for but never
      // sold or used: that value is lost to the zone's firms and their owners.
      let spoiled = bufferLossValue[z];
      for (let g = 0; g < G; g++) spoiled += output[base + g] * (1 - 1 / storageLoss(m, g)) * m.basePrice[g];
      lossValue[z] = spoiled;
      bufferLossValue[z] = 0;
      const stateGoods = (rule.administration + rule.military * (1 - p.militaryPayShare) + rule.infrastructure) * income[z];
      const spending = Math.max(0.1 * income[z], income[z] - stateGoods - investmentValue[z] - spoiled);
      privateSpending[z] = spending;
      const taxed = 1 + rule.taxConsumption;
      const budget = spending * taxed;
      let subsistence = 0;
      for (let g = 0; g < G; g++) subsistence += m.subsistence[g] * population[z] * m.basePrice[g] * taxed;
      for (let g = 0; g < G; g++) {
        const consumed = budget >= subsistence
          ? m.subsistence[g] * population[z] + m.budgetShare[g] * (budget - subsistence) / (m.basePrice[g] * taxed)
          : m.subsistence[g] * population[z] * budget / subsistence;
        household[base + g] = consumed;
        const state = (rule.administration * m.administration[g] + rule.military * (1 - p.militaryPayShare) * m.military[g]
          + rule.infrastructure * m.infrastructure[g]) * income[z] / m.basePrice[g];
        let intermediate = 0;
        for (let sector = 0; sector < G; sector++) intermediate += m.recipe[sector * G + g] * output[base + sector];
        input[base + g] = intermediate;
        // Firms also replace what spoils in their on-site input stores.
        const bufferLoss = m.madeToOrder[g] ? 0 : m.spoilage[g] * p.inputBufferWeeks * intermediate;
        bufferLossValue[z] += bufferLoss * m.basePrice[g];
        use[base + g] = consumed + state + investUnits * m.investment[g] + intermediate + bufferLoss;
        // Producers must also replace what spoils in their own warehouses.
        if (m.tradable[g]) world[g] += use[base + g] * storageLoss(m, g);
      }
    }
    // Goods that cannot travel are made where they are used.
    for (let z = 0; z < Z; z++) {
      let localLabor = 0;
      for (let g = 0; g < G; g++) {
        if (m.tradable[g]) continue;
        output[z * G + g] += 0.5 * (use[z * G + g] * storageLoss(m, g) - output[z * G + g]);
        localLabor += m.labor[g] * output[z * G + g] / technology[z];
      }
      tradableLabor[z] = Math.max(0.05 * employment[z], employment[z] - localLabor);
    }
    // Traded goods: fit a pattern that supplies what the world wants and uses
    // every zone's remaining workers (iterative proportional fitting). The
    // last step is the labour step, so the size of the economy is set by the
    // people available to work, never by an initial guess.
    for (let round = 0; round < 6; round++) {
      for (let g = 0; g < G; g++) {
        if (!m.tradable[g]) continue;
        let supply = 0;
        for (let z = 0; z < Z; z++) supply += rowScale[z] * advantage[z * G + g];
        columnScale[g] = supply > 0 ? world[g] / supply : 0;
      }
      for (let z = 0; z < Z; z++) {
        let labor = 0;
        for (let g = 0; g < G; g++) if (m.tradable[g]) labor += advantage[z * G + g] * columnScale[g] * m.labor[g] / technology[z];
        rowScale[z] = labor > 0 ? tradableLabor[z] / labor : 0;
      }
    }
    for (let z = 0; z < Z; z++) {
      let total = 0;
      for (let g = 0; g < G; g++) {
        if (m.tradable[g]) output[z * G + g] += 0.5 * (rowScale[z] * advantage[z * G + g] * columnScale[g] - output[z * G + g]);
        total += output[z * G + g] * valueAdded[g];
      }
      income[z] += 0.5 * (total - income[z]);
    }
  }
  for (let i = 0; i < output.length; i++) {
    if (!Number.isFinite(output[i]) || output[i] < 0) fail('no consistent production structure could be found.');
  }
  // The solution must supply what the world uses, good by good.
  for (let g = 0; g < G; g++) {
    if (!m.tradable[g]) continue;
    let supply = 0;
    for (let z = 0; z < Z; z++) supply += output[z * G + g];
    if (Math.abs(supply - world[g]) > 1e-4 * Math.max(1, world[g])) fail(`supply and demand of ${goods[g].id} could not be balanced.`);
  }

  // --- Assemble the state ------------------------------------------------------------
  const zeros = (length: number) => new Array<number>(length).fill(0);
  const filled = (length: number, value: number) => new Array<number>(length).fill(value);
  const zoneGood = {
    capacity: zeros(Z * G), build1: zeros(Z * G), build2: zeros(Z * G), build3: zeros(Z * G), stock: zeros(Z * G),
    inputBuffer: zeros(Z * G), price: zeros(Z * G), buyPrice: zeros(Z * G), refPrice: zeros(Z * G),
    expectedDemand: zeros(Z * G), margin: zeros(Z * G), pressure: zeros(Z * G), resourceCap: zeros(Z * G),
    efficiency: filled(Z * G, 1), yieldFactor: filled(Z * G, 1), yieldRecovery: zeros(Z * G), shortage: zeros(Z * G), usage: zeros(Z * G),
  };
  const zone = {
    owner, population, populationGrowth: zeros(Z), technology, infrastructure: filled(Z, 1), mobilized: zeros(Z),
    wage: zeros(Z), householdMoney: zeros(Z), firmMoney: zeros(Z), expectedIncome: zeros(Z), firmCosts: zeros(Z),
    cpi: filled(Z, 1), inflation: zeros(Z), unemployment: filled(Z, p.naturalUnemployment), livingStandard: zeros(Z),
    livingStandardRef: zeros(Z), deprivation: zeros(Z),
  };
  const gdp = zeros(C);
  const wages = zeros(C);
  const privateTotal = zeros(C);
  const investTotal = zeros(C);
  const lossTotal = zeros(C);
  const consumption = zeros(C);
  const populationTotal = zeros(C);
  for (let z = 0; z < Z; z++) {
    const c = owner[z];
    const base = z * G;
    const spec0 = spec.zones[z];
    zone.populationGrowth[z] = spec0.populationGrowth === undefined ? 0 : spec0.populationGrowth;
    if (!Number.isFinite(zone.populationGrowth[z]) || zone.populationGrowth[z] < -0.1 || zone.populationGrowth[z] > 0.1) fail(`zone ${spec0.id} population growth is out of range.`);
    const headroom = spec0.resourceHeadroom === undefined ? 0.3 : spec0.resourceHeadroom;
    if (!Number.isFinite(headroom) || headroom < 0) fail(`zone ${spec0.id} resource headroom is invalid.`);
    zone.wage[z] = technology[z];
    let costs = 0;
    let wageBill = 0;
    let real = 0;
    for (let g = 0; g < G; g++) {
      const index = base + g;
      const made = output[index];
      const capacity = made / m.normalUtilization[g];
      zoneGood.capacity[index] = capacity;
      const stage = m.depreciationWeekly[g] * capacity / m.buildRate[g];
      zoneGood.build1[index] = stage; zoneGood.build2[index] = stage; zoneGood.build3[index] = stage;
      zoneGood.stock[index] = m.madeToOrder[g] ? 0 : made * (1 + m.cover[g]);
      zoneGood.inputBuffer[index] = p.inputBufferWeeks * input[index] * (1 - m.spoilage[g]);
      zoneGood.price[index] = m.basePrice[g];
      zoneGood.buyPrice[index] = m.basePrice[g];
      zoneGood.refPrice[index] = m.basePrice[g];
      zoneGood.expectedDemand[index] = made / storageLoss(m, g);
      zoneGood.margin[index] = m.targetMargin[g];
      zoneGood.pressure[index] = m.normalUtilization[g];
      zoneGood.resourceCap[index] = m.resourceBased[g] ? capacity * (1 + headroom) : -1;
      zoneGood.usage[index] = use[index];
      wageBill += made * m.labor[g];
      costs += made * (m.basePrice[g] - valueAdded[g]);
      real += household[index] * m.basePrice[g];
    }
    costs += wageBill;
    const spending = privateSpending[z] * (1 + policy[c].taxConsumption);
    zone.expectedIncome[z] = spending;
    zone.householdMoney[z] = (1 - p.consumeIncome) / p.consumeMoney * spending;
    zone.firmCosts[z] = costs;
    zone.firmMoney[z] = p.workingCapitalWeeks * costs;
    zone.livingStandard[z] = real / population[z];
    zone.livingStandardRef[z] = zone.livingStandard[z];
    gdp[c] += income[z];
    wages[c] += wageBill;
    privateTotal[c] += privateSpending[z];
    investTotal[c] += investmentValue[z];
    lossTotal[c] += lossValue[z];
    consumption[c] += real;
    populationTotal[c] += population[z];
  }

  const country = {
    treasury: zeros(C), debt: zeros(C), averageRate: zeros(C), marketRate: zeros(C), marketAccess: filled(C, 1),
    exclusionWeeks: zeros(C), reputationSpread: zeros(C), missedPayments: zeros(C), defaults: zeros(C), gdp,
    realGdp: gdp.slice(), deficit: zeros(C), arrears: zeros(C), stability: policy.map(rule => rule.stability),
    stabilityModifier: zeros(C), unrestTier: zeros(C), episodeActive: zeros(C), episodePeakTier: zeros(C),
    rolledTier: zeros(C), tierWeeks: zeros(C), regime: zeros(C), immunityWeeks: zeros(C), armsStock: zeros(C),
    taxIncome: zeros(C), taxConsumption: policy.map(rule => rule.taxConsumption),
    taxCorporate: policy.map(rule => rule.taxCorporate), spendAdministration: policy.map(rule => rule.administration),
    spendSocial: policy.map(rule => rule.social), spendMilitary: policy.map(rule => rule.military),
    spendInfrastructure: policy.map(rule => rule.infrastructure), autoBorrow: filled(C, 1), governmentPriority: zeros(C),
  };
  const countryGood = {
    reserves: zeros(C * G), reserveTargetWeeks: zeros(C * G), reserveMode: zeros(C * G), tariff: zeros(C * G),
  };
  for (let c = 0; c < C; c++) {
    const rule = policy[c];
    const spending = (rule.administration + rule.social + rule.military + rule.infrastructure) * gdp[c];
    country.treasury[c] = spending * (1 + p.treasuryBufferWeeks);
    country.debt[c] = rule.debtToGdp * 52 * gdp[c];
    const over = Math.max(0, rule.debtToGdp - p.spreadQuadThreshold);
    country.marketRate[c] = Math.min(p.maxRate, p.baseRate + p.spreadLinear * Math.max(0, rule.debtToGdp - p.spreadDebtThreshold)
      + p.spreadQuad * over * over + p.spreadInstability * Math.max(0, (50 - rule.stability) / 50));
    country.averageRate[c] = country.marketRate[c];
    const given = spec.countries[c].taxIncome;
    if (given !== undefined) country.taxIncome[c] = fraction(given, 0, p.maxTaxRate, 'taxIncome');
    else {
      // Choose the income tax that balances the first budget.
      const surplus = gdp[c] - wages[c] - lossTotal[c];
      const corporate = rule.taxCorporate * surplus;
      const taxable = gdp[c] - lossTotal[c] - corporate - investTotal[c];
      const needed = spending + country.debt[c] * country.averageRate[c] / 52 - rule.taxConsumption * privateTotal[c] - corporate;
      country.taxIncome[c] = taxable > 0 ? Math.min(p.maxTaxRate, Math.max(0, needed / taxable)) : 0;
    }
    for (let g = 0; g < G; g++) {
      countryGood.tariff[c * G + g] = m.tradable[g] ? rule.tariff : 0;
      const weeks = spec.countries[c].reserveWeeks ? spec.countries[c].reserveWeeks![goods[g].id] : undefined;
      if (weeks !== undefined) {
        if (goods[g].spoilage >= 1) fail(`${goods[g].id} cannot be stored in reserve.`);
        countryGood.reserveTargetWeeks[c * G + g] = fraction(weeks, 0, p.maxReserveWeeks, 'reserveWeeks');
      }
    }
  }
  for (let z = 0; z < Z; z++) {
    const c = owner[z];
    for (let g = 0; g < G; g++) countryGood.reserves[c * G + g] += countryGood.reserveTargetWeeks[c * G + g] * use[z * G + g];
  }

  // Who holds whose debt: savers everywhere, with a preference for their own government.
  const bonds = zeros(Z * C);
  for (let c = 0; c < C; c++) {
    let weightTotal = 0;
    for (let z = 0; z < Z; z++) weightTotal += zone.householdMoney[z] * (owner[z] === c ? p.lenderHomeBias : 1);
    let held = 0;
    for (let z = 0; z < Z; z++) {
      bonds[z * C + c] = country.debt[c] * zone.householdMoney[z] * (owner[z] === c ? p.lenderHomeBias : 1) / weightTotal;
      held += bonds[z * C + c];
    }
    country.debt[c] = held;
  }

  const lanes = { id: [] as string[], from: [] as number[], to: [] as number[], distance: [] as number[], costMultiplier: [] as number[], throughput: [] as number[] };
  for (const lane of spec.lanes ?? []) {
    lanes.id.push(lane.id);
    lanes.from.push(nodeIndex.get(lane.from) as number);
    lanes.to.push(nodeIndex.get(lane.to) as number);
    lanes.distance.push(lane.distance);
    lanes.costMultiplier.push(1);
    lanes.throughput.push(1);
  }

  let baseMoney = 0;
  for (let z = 0; z < Z; z++) baseMoney += zone.householdMoney[z] + zone.firmMoney[z];
  for (let c = 0; c < C; c++) baseMoney += country.treasury[c];
  let worldGdp = 0;
  for (let c = 0; c < C; c++) worldGdp += gdp[c];

  const state: EconomyState = {
    format: STATE_FORMAT,
    version: STATE_VERSION,
    turn: 0,
    seed: spec.seed,
    config,
    countries: deepFreeze(spec.countries.map(entry => ({ id: entry.id, name: entry.name }))),
    zones: deepFreeze(spec.zones.map(entry => ({ id: entry.id, name: entry.name }))),
    waypoints: deepFreeze(waypoints.map(entry => ({ id: entry.id, name: entry.name }))),
    lanes,
    zone,
    zoneGood,
    bonds,
    country,
    countryGood,
    sanctions: [],
    tariffOverrides: [],
    world: { baseMoney, interestRate: p.baseRate, creditUtilization: 0, realGrowth: 0, inflation: 0, realGdp: worldGdp },
    baseline: {
      realGdp: gdp.slice(),
      realGdpPerCapita: gdp.map((value, c) => value / populationTotal[c]),
      consumptionPerCapita: consumption.map((value, c) => value / populationTotal[c]),
      population: populationTotal.slice(),
      stability: country.stability.slice(),
    },
    history: createHistory(C, G, p.historyWeekly, p.historyQuarterly, p.historyYearly),
  };

  settle(state, spec.warmupTurns === undefined ? DEFAULT_WARMUP_TURNS : spec.warmupTurns,
    spec.countries.map(entry => entry.taxIncome === undefined));
  return state;
}

/**
 * Find starting prices and make the designed structure a resting point.
 *
 * 1. With capacity, people and politics held fixed, prices follow supply and
 *    demand alone until markets clear for the designed quantities.
 * 2. Each sector's local efficiency is then set so that, at those prices, it
 *    earns exactly its normal margin. This is what gives a zone a lasting
 *    comparative advantage: the oil state stays an oil state because it is
 *    genuinely cheaper for it to pump oil than to make machines.
 * 3. A few weeks run under normal rules confirm that nothing wants to move.
 *
 * The result becomes week 0 and the baseline for "progress since the start".
 */
function settle(state: EconomyState, turns: number, balanceBudget: boolean[]): void {
  if (!Number.isInteger(turns) || turns < 0) fail('warmupTurns must be a whole number of weeks.');
  const C = state.countries.length;
  const zg = state.zoneGood;
  const zone = state.zone;
  const country = state.country;
  const pinned: number[][] = [zg.capacity, zg.build1, zg.build2, zg.build3, zg.yieldFactor, zg.yieldRecovery,
    zone.population, zone.technology, zone.infrastructure, zone.mobilized, country.stability, country.unrestTier,
    country.episodeActive, country.episodePeakTier, country.rolledTier, country.tierWeeks, country.regime,
    country.immunityWeeks, country.marketAccess, country.exclusionWeeks, country.reputationSpread,
    country.missedPayments, country.defaults, country.armsStock];
  const saved = pinned.map(values => values.slice());
  const run = (count: number, calibration: boolean) => {
    let report = null;
    for (let turn = 0; turn < count; turn++) {
      report = advanceEconomyInPlace(state, undefined, { report: turn === count - 1 ? 'full' : 'none', calibration });
      for (let i = 0; i < pinned.length; i++) {
        const values = pinned[i];
        const original = saved[i];
        for (let k = 0; k < values.length; k++) values[k] = original[k];
      }
      state.turn = 0;
    }
    return report;
  };
  let last = null;
  if (turns > 0) {
    // Calibrating changes wage levels, and owners' dividends take a while to
    // catch up, so the search is repeated a few times at the new wages.
    for (let round = 0; round < CALIBRATION_ROUNDS; round++) {
      const report = run(round === 0 ? turns : Math.max(1, Math.floor(turns / 4)), true);
      calibrateEfficiency(state);
      for (let i = 0; i < pinned.length; i++) saved[i] = pinned[i].slice();
      // Where the designer left the income tax open, set it to balance the budget as it now stands.
      if (report) {
        for (let c = 0; c < C; c++) {
          const budget = report.countries[c].budget;
          const rate = country.taxIncome[c];
          if (!balanceBudget[c] || !(rate > 0) || !(budget.incomeTax > 0)) continue;
          const taxable = budget.incomeTax / rate;
          country.taxIncome[c] = Math.min(state.config.params.maxTaxRate, Math.max(0, rate - budget.balance / taxable));
        }
      }
    }
    last = run(CHECK_TURNS, false);
  }
  state.history = createHistory(C, state.config.goods.length, state.config.params.historyWeekly,
    state.config.params.historyQuarterly, state.config.params.historyYearly);
  if (last) {
    state.baseline = deepFreeze({
      realGdp: last.countries.map(entry => entry.gdpReal),
      realGdpPerCapita: last.countries.map(entry => entry.gdpRealPerCapita),
      consumptionPerCapita: last.countries.map(entry => entry.consumptionPerCapita),
      population: last.countries.map(entry => entry.population),
      stability: country.stability.slice(),
    });
  } else deepFreeze(state.baseline);
}

/**
 * Make the current prices and quantities a resting point of the normal rules.
 *
 * For every zone two things must hold at once: each active sector exactly
 * covers its running costs and its cost of capital, and the zone's workers
 * are employed at the natural rate. Together these fix the zone's wage level
 * (what its sales can pay per worker) and each sector's local efficiency (how
 * many workers a unit of its output needs).
 */
export function calibrateEfficiency(state: EconomyState): void {
  const m = getModel(state.config);
  const p = state.config.params;
  const G = m.goodCount;
  const zg = state.zoneGood;
  const room = new Float64Array(G);
  for (let z = 0; z < state.zones.length; z++) {
    const base = z * G;
    const c = state.zone.owner[z];
    const productivity = Math.max(0.05, state.zone.technology[z] * (1 + p.infraProductivity * (state.zone.infrastructure[z] - 1)));
    let capitalPrice = 0;
    for (let g = 0; g < G; g++) capitalPrice += m.investment[g] * zg.buyPrice[base + g];
    const hurdle = state.country.marketRate[c] + p.equityPremium;
    const keep = 1 - state.country.taxCorporate[c];

    // Capacity is trimmed to the demand actually observed, so that every
    // sector starts at normal utilisation.
    let payroll = 0;
    for (let g = 0; g < G; g++) {
      const index = base + g;
      const active = zg.capacity[index] > EPSILON;
      if (active && zg.pressure[index] > EPSILON) {
        const trim = Math.min(1.25, Math.max(0.8, zg.pressure[index] / m.normalUtilization[g]));
        zg.capacity[index] *= trim;
        zg.build1[index] *= trim;
        zg.build2[index] *= trim;
        zg.build3[index] *= trim;
        if (zg.resourceCap[index] >= 0) zg.resourceCap[index] *= trim;
      }
      zg.pressure[index] = m.normalUtilization[g];
      let inputCost = 0;
      const inputs = m.inputGoods[g];
      const amounts = m.inputAmounts[g];
      for (let i = 0; i < inputs.length; i++) inputCost += amounts[i] * zg.buyPrice[base + inputs[i]];
      const price = active ? zg.price[index] : zg.buyPrice[index] * (1 + ENTRY_PRICE_GAP);
      // What one unit can pay for labour while still covering its cost of capital.
      room[g] = price - inputCost - capitalCharge(m, g, capitalPrice, hurdle, keep);
      if (active && room[g] > 0) payroll += zg.expectedDemand[index] * storageLoss(m, g) * room[g];
    }
    const workers = Math.max(0, state.zone.population[z] * p.laborParticipation - state.zone.mobilized[z]) * (1 - p.naturalUnemployment);
    if (payroll > EPSILON && workers > EPSILON) state.zone.wage[z] = payroll / workers;
    const wage = state.zone.wage[z];
    for (let g = 0; g < G; g++) {
      const index = base + g;
      const efficiency = room[g] > EPSILON ? m.labor[g] * wage / (productivity * room[g]) : 20;
      zg.efficiency[index] = Math.min(20, Math.max(0.05, efficiency));
      const price = zg.capacity[index] > EPSILON ? zg.price[index] : zg.buyPrice[index];
      let cost = m.labor[g] * wage / (productivity * zg.efficiency[index]);
      const inputs = m.inputGoods[g];
      const amounts = m.inputAmounts[g];
      for (let i = 0; i < inputs.length; i++) cost += amounts[i] * zg.buyPrice[base + inputs[i]];
      zg.margin[index] = price > EPSILON ? Math.max(-1, Math.min(1, (price - cost) / price)) : 0;
      zg.refPrice[index] = price;
    }
  }
}

/** Output needed per unit sold once warehouse spoilage is replaced. */
function storageLoss(m: ReturnType<typeof getModel>, g: number): number {
  return m.madeToOrder[g] ? 1 : 1 + m.spoilage[g] * m.cover[g];
}

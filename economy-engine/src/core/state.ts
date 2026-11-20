import type { EconomyConfig, EconomyState, HistoryTier } from '../types.ts';
import { validateConfig } from '../config/defaults.ts';

/**
 * Copying, saving, restoring and checking simulation states.
 *
 * A state is plain JSON data, so saving is JSON.stringify and restoring is
 * JSON.parse plus validation. Finite JavaScript numbers survive that round
 * trip exactly, which is why a restored game continues identically.
 */

export const STATE_FORMAT = 'heartland-economy';
export const STATE_VERSION = 1;

function copyGroup<T extends object>(group: T): T {
  const source = group as Record<string, unknown[]>;
  const copy: Record<string, unknown[]> = {};
  for (const key of Object.keys(source)) copy[key] = source[key].slice();
  return copy as T;
}

function copyTier(tier: HistoryTier): HistoryTier {
  return { ...tier, sums: tier.sums.slice(), data: tier.data.slice(), turns: tier.turns.slice() };
}

/**
 * Independent copy of a state. Static descriptions (configuration, names and
 * the baseline snapshot) never change during a game and are shared.
 */
export function cloneEconomy(state: EconomyState): EconomyState {
  return {
    format: state.format,
    version: state.version,
    turn: state.turn,
    seed: state.seed,
    config: state.config,
    countries: state.countries,
    zones: state.zones,
    waypoints: state.waypoints,
    lanes: copyGroup(state.lanes),
    zone: copyGroup(state.zone),
    zoneGood: copyGroup(state.zoneGood),
    bonds: state.bonds.slice(),
    country: copyGroup(state.country),
    countryGood: copyGroup(state.countryGood),
    sanctions: state.sanctions.map(entry => ({ ...entry })),
    tariffOverrides: state.tariffOverrides.map(entry => ({ ...entry })),
    world: { ...state.world },
    baseline: state.baseline,
    history: { rowSize: state.history.rowSize, tiers: state.history.tiers.map(copyTier) },
  };
}

/** Text form of a state, suitable for local storage or network transfer. */
export function serializeEconomy(state: EconomyState): string {
  return JSON.stringify(state);
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
    Object.freeze(value);
  }
  return value;
}

function fail(message: string): never {
  throw new Error(`Invalid economy save: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberArray(value: unknown, length: number, label: string): void {
  if (!Array.isArray(value) || value.length !== length) fail(`${label} must be a list of ${length} numbers.`);
  for (let i = 0; i < length; i++) {
    if (typeof value[i] !== 'number' || !Number.isFinite(value[i])) fail(`${label}[${i}] is not a finite number.`);
  }
}

function indexArray(value: unknown, length: number, limit: number, label: string): void {
  numberArray(value, length, label);
  const list = value as number[];
  for (let i = 0; i < length; i++) {
    if (!Number.isInteger(list[i]) || list[i] < 0 || list[i] >= limit) fail(`${label}[${i}] is out of range.`);
  }
}

function numberGroup(value: unknown, keys: readonly string[], length: number, label: string): void {
  if (!isRecord(value)) fail(`${label} is missing.`);
  for (const key of keys) numberArray(value[key], length, `${label}.${key}`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${label}.${key} is not a known field.`);
}

function idList(value: unknown, label: string): number {
  if (!Array.isArray(value)) fail(`${label} must be a list.`);
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || entry.id.length === 0 || typeof entry.name !== 'string') {
      fail(`${label} entries need an id and a name.`);
    }
    if (seen.has(entry.id)) fail(`${label} id ${entry.id} is duplicated.`);
    seen.add(entry.id);
  }
  return value.length;
}

const ZONE_KEYS = ['owner', 'population', 'populationGrowth', 'populationCap', 'technology', 'infrastructure', 'mobilized', 'wage',
  'householdMoney', 'firmMoney', 'expectedIncome', 'firmCosts', 'cpi', 'inflation', 'unemployment', 'livingStandard',
  'livingStandardRef', 'deprivation'] as const;
const ZONE_GOOD_KEYS = ['capacity', 'build1', 'build2', 'build3', 'stock', 'inputBuffer', 'price', 'buyPrice',
  'refPrice', 'expectedDemand', 'margin', 'pressure', 'resourceCap', 'efficiency', 'yieldFactor', 'yieldRecovery',
  'shortage', 'usage'] as const;
const COUNTRY_KEYS = ['treasury', 'debt', 'averageRate', 'marketRate', 'marketAccess', 'exclusionWeeks',
  'reputationSpread', 'missedPayments', 'defaults', 'gdp', 'realGdp', 'deficit', 'arrears', 'stability',
  'stabilityModifier', 'unrestTier', 'episodeActive', 'episodePeakTier', 'rolledTier', 'tierWeeks', 'regime',
  'immunityWeeks', 'armsStock', 'taxIncome', 'taxConsumption', 'taxCorporate', 'spendAdministration', 'spendSocial',
  'spendMilitary', 'spendInfrastructure', 'autoBorrow', 'governmentPriority'] as const;
const COUNTRY_GOOD_KEYS = ['reserves', 'reserveTargetWeeks', 'reserveMode', 'tariff'] as const;
const WORLD_KEYS = ['baseMoney', 'interestRate', 'creditUtilization', 'realGrowth', 'inflation', 'realGdp', 'rebases'] as const;
const BASELINE_KEYS = ['realGdp', 'realGdpPerCapita', 'consumptionPerCapita', 'population', 'stability'] as const;

/** Throw a descriptive error unless `value` is a structurally sound state. */
export function validateEconomy(value: unknown): asserts value is EconomyState {
  if (!isRecord(value)) fail('not an object.');
  if (value.format !== STATE_FORMAT) fail('unknown format.');
  if (value.version !== STATE_VERSION) fail(`version ${String(value.version)} is not supported (expected ${STATE_VERSION}).`);
  if (typeof value.turn !== 'number' || !Number.isSafeInteger(value.turn) || value.turn < 0) fail('turn must be a non-negative whole number.');
  if (typeof value.seed !== 'number' || !Number.isInteger(value.seed) || value.seed < 0 || value.seed > 4294967295) fail('seed must be a whole number from 0 to 4294967295.');
  if (!isRecord(value.config) || !Array.isArray(value.config.goods) || !isRecord(value.config.params)) fail('configuration is missing.');
  try {
    validateConfig(value.config as unknown as EconomyConfig);
  } catch (error) {
    fail(error instanceof Error ? error.message : 'configuration is invalid.');
  }
  const G = (value.config.goods as unknown[]).length;
  const C = idList(value.countries, 'countries');
  const Z = idList(value.zones, 'zones');
  const W = idList(value.waypoints, 'waypoints');
  if (C === 0 || Z === 0) fail('at least one country and one zone are required.');

  if (!isRecord(value.lanes) || !Array.isArray(value.lanes.id)) fail('lanes are missing.');
  const L = value.lanes.id.length;
  if (value.lanes.id.some(id => typeof id !== 'string') || new Set(value.lanes.id).size !== L) fail('lane ids must be unique text.');
  indexArray(value.lanes.from, L, Z + W, 'lanes.from');
  indexArray(value.lanes.to, L, Z + W, 'lanes.to');
  for (const key of ['distance', 'costMultiplier', 'throughput']) numberArray(value.lanes[key], L, `lanes.${key}`);

  numberGroup(value.zone, ZONE_KEYS, Z, 'zone');
  indexArray((value.zone as Record<string, unknown>).owner, Z, C, 'zone.owner');
  numberGroup(value.zoneGood, ZONE_GOOD_KEYS, Z * G, 'zoneGood');
  numberArray(value.bonds, Z * C, 'bonds');
  numberGroup(value.country, COUNTRY_KEYS, C, 'country');
  numberGroup(value.countryGood, COUNTRY_GOOD_KEYS, C * G, 'countryGood');
  numberGroup(value.baseline, BASELINE_KEYS, C, 'baseline');
  if (!isRecord(value.world)) fail('world is missing.');
  for (const key of WORLD_KEYS) {
    if (typeof value.world[key] !== 'number' || !Number.isFinite(value.world[key])) fail(`world.${key} is not a finite number.`);
  }

  if (!Array.isArray(value.sanctions) || !Array.isArray(value.tariffOverrides)) fail('trade policy lists are missing.');
  for (const entry of [...value.sanctions, ...value.tariffOverrides]) {
    if (!isRecord(entry) || !Number.isInteger(entry.imposer) || !Number.isInteger(entry.target) || !Number.isInteger(entry.good)
      || (entry.imposer as number) < 0 || (entry.imposer as number) >= C || (entry.target as number) < 0
      || (entry.target as number) >= C || (entry.good as number) < 0 || (entry.good as number) >= G) {
      fail('a trade policy entry refers to something that does not exist.');
    }
  }
  for (const entry of value.sanctions) {
    if (typeof entry.imports !== 'boolean' || typeof entry.exports !== 'boolean') fail('a sanction is malformed.');
  }
  for (const entry of value.tariffOverrides) {
    if (typeof entry.rate !== 'number' || !Number.isFinite(entry.rate) || entry.rate < 0) fail('a tariff exception is malformed.');
  }

  const history = value.history;
  if (!isRecord(history) || !Array.isArray(history.tiers) || typeof history.rowSize !== 'number') fail('history is missing.');
  const rowSize = history.rowSize;
  if (!Number.isInteger(rowSize) || rowSize < 0) fail('history row size is invalid.');
  for (const tier of history.tiers) {
    if (!isRecord(tier)) fail('a history tier is malformed.');
    for (const key of ['span', 'capacity', 'length', 'head', 'pending']) {
      if (!Number.isInteger(tier[key]) || (tier[key] as number) < 0) fail(`history ${key} is invalid.`);
    }
    const length = tier.length as number;
    if (length > (tier.capacity as number) || (length > 0 && (tier.head as number) >= (tier.capacity as number))) fail('history counters are inconsistent.');
    numberArray(tier.sums, rowSize, 'history sums');
    numberArray(tier.data, length * rowSize, 'history data');
    numberArray(tier.turns, length, 'history turns');
  }
}

/** Restore a state saved with serializeEconomy. Rejects damaged or foreign data. */
export function deserializeEconomy(text: string): EconomyState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail('not valid JSON.');
  }
  validateEconomy(parsed);
  deepFreeze(parsed.config);
  deepFreeze(parsed.countries);
  deepFreeze(parsed.zones);
  deepFreeze(parsed.waypoints);
  deepFreeze(parsed.baseline);
  return parsed;
}

/**
 * 64-bit fingerprint of a state as 16 hexadecimal characters. Two players
 * whose simulations produce the same fingerprint hold the same state.
 */
export function hashEconomy(state: EconomyState): string {
  const text = serializeEconomy(state);
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b + code, 0x85ebca6b);
    b ^= b >>> 15;
  }
  const hex = (value: number) => (value >>> 0).toString(16).padStart(8, '0');
  return hex(a) + hex(b);
}

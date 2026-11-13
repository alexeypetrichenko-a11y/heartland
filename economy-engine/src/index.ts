/**
 * Public interface of the standalone HEARTLAND economic engine.
 *
 * Import from this file only. Everything else is an implementation detail
 * that may change without notice.
 */
export type * from './types.ts';

export { createConfig, validateConfig, DEFAULT_GOODS, DEFAULT_PARAMS } from './config/defaults.ts';
export { createEconomy, DEFAULT_COUNTRY_POLICY, DEFAULT_WARMUP_TURNS } from './world/builder.ts';
export { advanceEconomy, advanceEconomyInPlace } from './core/step.ts';
export {
  cloneEconomy, serializeEconomy, deserializeEconomy, validateEconomy, hashEconomy, STATE_FORMAT, STATE_VERSION,
} from './core/state.ts';
export { getCountry, getZone, listSanctions, getProgress } from './core/selectors.ts';
export type { CountryPolicy, CountrySnapshot, ZoneSnapshot, ZoneGoodSnapshot, SanctionView, ProgressView } from './core/selectors.ts';
export {
  getCountryHistory, getGoodHistory, getWorldHistory, auditError, assertAudit, AUDIT_TOLERANCE,
  HISTORY_COUNTRY_METRICS, HISTORY_GOOD_METRICS, HISTORY_WORLD_METRICS, HISTORY_TIERS,
} from './core/stats.ts';
export type { HistorySeries, HistoryCountryMetric, HistoryGoodMetric, HistoryWorldMetric, HistoryTierName } from './core/stats.ts';
export { autopilotCommands, DEFAULT_AUTOPILOT_RULES } from './ai/autopilot.ts';
export type { AutopilotRules } from './ai/autopilot.ts';
export { createTestWorldSpec, createGeneratedWorldSpec, KELL_STRAIT_LANES } from './world/testWorld.ts';

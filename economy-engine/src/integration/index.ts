/**
 * HEARTLAND economy integration API (ECON-05): the only file the game should import
 * to run its economy. Load it lazily, when a game is launched:
 *
 *   const economy = await import('../../economy-engine/src/integration/index.ts');
 *   let session = economy.createEconomySession(gameState);
 *
 * Importing it runs nothing; see INTEGRATION_API.md for the full contract.
 */
export {
  advanceEconomyWeek, checkEconomyCommands, createEconomySession, economyFingerprint, getCountryEconomy, getRegionEconomy,
  legacyEconomyView, loadEconomySession, regionControlEffects, saveEconomySession, SESSION_FORMAT, SESSION_VERSION, withPlayerCountry,
} from './session.ts';
export type {
  BudgetView, CountryEconomyView, CreateSessionOptions, EconomySession, EconomyWeekInput, EconomyWeekSummary, RegionEconomyView,
  SectorEconomyView,
} from './session.ts';
export {
  ADJACENT_ROAD_DISTANCE, fictionalGameWorld, FICTIONAL_REGION_PROFILES, roadLaneId, validateGameWorld, worldSpecFromGame,
} from './scenario.ts';
export type { GameWorldInput, RegionProfile } from './scenario.ts';
// Command, effect and event shapes the game sends and receives (unchanged engine contracts).
export type {
  BudgetReport, CentralBankReport, EconomyCommand, EconomyEvent, ExternalEffect, OccupationPolicy, TaxKind, SpendingCategory,
} from '../types.ts';
export { CATALOGUE_GOODS, CATALOGUE_SECTORS } from '../config/defaults.ts';

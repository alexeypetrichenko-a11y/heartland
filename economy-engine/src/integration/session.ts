import type {
  BudgetReport, CentralBankReport, CountryId, EconomyCommand, EconomyEvent, EconomyState, ExternalEffect, OccupationPolicy, TurnReport, ZoneId,
} from '../types.ts';
import { autopilotCommands } from '../ai/autopilot.ts';
import { resolveInput } from '../core/commands.ts';
import { OWNERSHIP_COUNT, TIER_COUNT } from '../core/model.ts';
import { OCCUPATION_POLICIES } from '../core/occupation.ts';
import { hashEconomy, restoreEconomy } from '../core/state.ts';
import { getCountryHistory } from '../core/stats.ts';
import { advanceEconomy } from '../core/step.ts';
import { createEconomy } from '../world/builder.ts';
import type { GameWorldInput, RegionProfile } from './scenario.ts';
import { FICTIONAL_REGION_PROFILES, worldSpecFromGame } from './scenario.ts';

/**
 * Integration API for the HEARTLAND game (ECON-05).
 *
 * One economy session per game. It wraps the engine's state and the
 * indicators of the last resolved week; it never runs a second simulation.
 *
 * - Pure and atomic, like the game's `advanceTurn`: every function returns a
 *   new session and leaves its input untouched; invalid input throws before
 *   anything is computed, so a rejected week changes nothing.
 * - Deterministic: the same session and the same inputs always give the same
 *   result, also after saving and restoring.
 * - Week numbering follows the game: the game starts in week 1, and the
 *   session's first week is resolved when it is created (by the AI autopilot
 *   alone, before any player decision), so `session.week === gameState.week`.
 *   Each later week is resolved by `advanceEconomyWeek` inside the game's own
 *   weekly turn.
 * - Countries and regions keep the game's identifiers.
 *
 * Nothing runs when this module is imported: an economy exists only once the
 * game calls `createEconomySession`, when a game is launched.
 */

export const SESSION_FORMAT = 'heartland-economy-session';
export const SESSION_VERSION = 1;

/** One sector in one region or country, for the last resolved week. Values at constant (base) prices. */
export interface SectorEconomyView {
  sectorId: string;
  name: string;
  /** Output this week, at base prices. */
  output: number;
  /** Installed capacity per week, at base prices. */
  capacity: number;
  /** output / capacity (0 when there is no capacity). */
  utilization: number;
  /** Shortage index of the sector's worst-supplied good: 0 = demand fully met, 1 = nothing obtained (smoothed). */
  shortage: number;
  /** Goods of the sector whose shortage index is above 5%. */
  goodsShort: string[];
}

export interface BudgetView {
  revenue: number;
  expenditure: number;
  /** revenue - expenditure. */
  balance: number;
  /** Income, consumption and corporate taxes and tariffs. */
  taxes: number;
  /** Interest paid on public debt. */
  interest: number;
  borrowed: number;
  repaid: number;
  /** Share of planned spending that could be paid (below 1: spending was cut for lack of cash). */
  fundedShare: number;
  /** Every revenue and spending line, as reported by the engine. */
  detail: BudgetReport;
}

/** One country, for the last resolved week. */
export interface CountryEconomyView {
  countryId: CountryId;
  name: string;
  controller: 'player' | 'ai';
  /** Regions the country controls (including any it occupies). */
  regionIds: string[];
  population: number;
  /** GDP this week at current prices. */
  gdpNominal: number;
  /** GDP this week at constant prices. */
  gdpReal: number;
  /** Annualised real growth over the weeks on record (up to the last year); null until half a year is on record. */
  gdpGrowth: number | null;
  /** Annualised consumer-price inflation. */
  inflation: number;
  unemployment: number;
  /** Political stability, 0-100. */
  stability: number;
  /** 0 calm, 1 protests, 2 mass unrest, 3 collapse risk. */
  unrestTier: number;
  /** Regime changes so far (the first one, regime 1, defeats a human player). */
  regime: number;
  budget: BudgetView;
  treasury: number;
  /** Public debt, including loans from the central bank. */
  debt: number;
  /** Debt divided by yearly GDP. */
  debtToGdp: number;
  /** Rate the market charges the state on new debt. */
  marketRate: number;
  marketAccess: boolean;
  centralBank: CentralBankReport;
  sectors: SectorEconomyView[];
}

/** One region, for the last resolved week. */
export interface RegionEconomyView {
  regionId: string;
  name: string;
  /** Country controlling the region's economy (the occupier while occupied). */
  controllerId: CountryId;
  /** Country the region legally belongs to. */
  legalOwnerId: CountryId;
  occupied: boolean;
  occupationPolicy: OccupationPolicy | null;
  /** Resistance to occupation, 0-1. */
  resistance: number;
  population: number;
  unemployment: number;
  /** Annualised consumer-price inflation. */
  inflation: number;
  /** Share of basic needs households could not obtain. */
  deprivation: number;
  sectors: SectorEconomyView[];
}

/** Everything the game shows about the economy after a week. */
export interface EconomyWeekSummary {
  /** The game week these figures describe. */
  week: number;
  countries: CountryEconomyView[];
  regions: RegionEconomyView[];
  /** Economic events of the week (defaults, unrest, regime changes, bankruptcies, occupation...). */
  events: EconomyEvent[];
  /** True when the player's regime was overthrown this week: defeat (GAME_DESIGN.md section 6). */
  playerRegimeFell: boolean;
}

export interface EconomySession {
  readonly format: typeof SESSION_FORMAT;
  readonly playerCountryId: CountryId | null;
  /** The engine's state. Read it only through this API (or the engine's selectors); never change it. */
  readonly state: EconomyState;
  readonly summary: EconomyWeekSummary;
  /** Game week; equal to `summary.week`. */
  readonly week: number;
}

export interface CreateSessionOptions {
  /** Economic profile of every region (defaults to the fictional scenario's six regions). */
  profiles?: Readonly<Record<string, RegionProfile>>;
}

/** What the game sends for one week. */
export interface EconomyWeekInput {
  /** The player's economic decisions this week; each must concern the player's country. */
  playerCommands?: readonly EconomyCommand[];
  /**
   * The game's regions after this week's military moves (id and current owner). A region whose
   * owner differs from its economic controller becomes an occupation, or a liberation if the
   * owner is its legal owner. Annexation is never inferred: send a `transfer-zone` effect.
   */
  regionControl?: readonly { id: string; ownerId: CountryId }[];
  /** Other facts decided by game systems this week (damage, blockades, events...). */
  effects?: readonly ExternalEffect[];
}

function countryIndex(state: EconomyState, countryId: CountryId): number {
  const index = state.countries.findIndex(country => country.id === countryId);
  if (index < 0) throw new Error(`Unknown country: ${countryId}.`);
  return index;
}

function zoneIndex(state: EconomyState, regionId: ZoneId): number {
  const index = state.zones.findIndex(zone => zone.id === regionId);
  if (index < 0) throw new Error(`Unknown region: ${regionId}.`);
  return index;
}

/** Commands of the human player may only concern the player's country. */
function authorize(playerCountryId: CountryId | null, commands: readonly EconomyCommand[]): void {
  if (!Array.isArray(commands)) throw new Error('Economic commands must be a list.');
  for (const command of commands) {
    const owner = typeof command === 'object' && command !== null ? (command as { countryId?: unknown }).countryId : undefined;
    if (playerCountryId === null || owner !== playerCountryId) throw new Error(`Economic command ${String((command as { type?: unknown })?.type)} must belong to the player's country.`);
  }
}

/**
 * Check the player's commands for this week without running anything: returns null when
 * they are valid, otherwise the reason they would be refused.
 */
export function checkEconomyCommands(session: EconomySession, commands: readonly EconomyCommand[]): string | null {
  try {
    authorize(session.playerCountryId, commands);
    resolveInput(session.state, { commands });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid economic command.';
  }
}

/** Effects that bring the economy's control of every region in line with the game's region owners. */
export function regionControlEffects(session: EconomySession, regions: readonly { id: string; ownerId: CountryId }[]): ExternalEffect[] {
  const state = session.state;
  const effects: ExternalEffect[] = [];
  for (const region of regions) {
    const z = zoneIndex(state, region.id);
    countryIndex(state, region.ownerId);
    const controller = state.countries[state.zone.owner[z]].id;
    if (region.ownerId === controller) continue;
    const legal = state.countries[state.zone.sovereign[z]].id;
    effects.push(region.ownerId === legal
      ? { type: 'liberate-zone', zoneId: region.id }
      : { type: 'occupy-zone', zoneId: region.id, occupierId: region.ownerId, policy: 'moderate' });
  }
  return effects;
}

/**
 * Annualised growth of a series over the weeks on record (up to 52): the last four weeks against the
 * first four. Shorter spans would turn the noise of a few weeks into large yearly rates.
 */
function annualisedGrowth(values: readonly number[]): number | null {
  const n = values.length;
  if (n < 26) return null;
  let early = 0;
  let late = 0;
  for (let k = 0; k < 4; k++) { early += values[k]; late += values[n - 1 - k]; }
  if (!(early > 0)) return null;
  return (late / early - 1) * 52 / (n - 4);
}

function sectorViews(state: EconomyState, report: TurnReport, zones: readonly number[]): SectorEconomyView[] {
  const config = state.config;
  const G = config.goods.length;
  const lines = OWNERSHIP_COUNT * TIER_COUNT;
  const zoneOutput = new Map(report.zones.map(entry => [entry.zoneId, entry.output]));
  return config.sectors.map(sector => {
    let output = 0;
    let capacity = 0;
    let shortage = 0;
    const short = new Set<string>();
    let population = 0;
    for (const z of zones) population += state.zone.population[z];
    config.goods.forEach((good, g) => {
      if (good.sectorId !== sector.id) return;
      let goodShortage = 0;
      for (const z of zones) {
        const produced = zoneOutput.get(state.zones[z].id)?.[g] ?? 0;
        output += produced * good.basePrice;
        let units = 0;
        for (let k = 0; k < lines; k++) units += state.firmLine.capacity[(z * G + g) * lines + k];
        capacity += units * good.basePrice;
        // Population-weighted over the zones, so a country's figure is its regions' average.
        goodShortage += population > 0 ? state.zoneGood.shortage[z * G + g] * state.zone.population[z] / population : 0;
      }
      if (goodShortage > shortage) shortage = goodShortage;
      if (goodShortage > 0.05) short.add(good.id);
    });
    return { sectorId: sector.id, name: sector.name, output, capacity, utilization: capacity > 0 ? output / capacity : 0, shortage, goodsShort: [...short] };
  });
}

function summarize(state: EconomyState, report: TurnReport, playerCountryId: CountryId | null): EconomyWeekSummary {
  const countries: CountryEconomyView[] = report.countries.map((entry, c) => {
    const zones: number[] = [];
    for (let z = 0; z < state.zones.length; z++) if (state.zone.owner[z] === c) zones.push(z);
    const budget = entry.budget;
    return {
      countryId: entry.countryId,
      name: state.countries[c].name,
      controller: entry.countryId === playerCountryId ? 'player' : 'ai',
      regionIds: zones.map(z => state.zones[z].id),
      // End-of-week population of its regions (the report counts it before the week's growth).
      population: zones.reduce((total, z) => total + state.zone.population[z], 0),
      gdpNominal: entry.gdpNominal,
      gdpReal: entry.gdpReal,
      gdpGrowth: annualisedGrowth(getCountryHistory(state, entry.countryId, 'gdpReal').values),
      inflation: entry.inflation,
      unemployment: entry.unemployment,
      stability: entry.stability,
      unrestTier: entry.unrestTier,
      regime: entry.regime,
      budget: {
        revenue: budget.revenue, expenditure: budget.spending, balance: budget.balance,
        taxes: budget.incomeTax + budget.consumptionTax + budget.corporateTax + budget.tariffs,
        interest: budget.interest, borrowed: budget.borrowed, repaid: budget.repaid, fundedShare: budget.fundedShare, detail: budget,
      },
      treasury: entry.treasury,
      debt: entry.debt,
      debtToGdp: entry.debtToGdp,
      marketRate: entry.marketRate,
      marketAccess: entry.marketAccess,
      centralBank: entry.centralBank,
      sectors: sectorViews(state, report, zones),
    };
  });
  const regions: RegionEconomyView[] = state.zones.map((zone, z) => {
    const occupied = state.zone.owner[z] !== state.zone.sovereign[z];
    return {
      regionId: zone.id,
      name: zone.name,
      controllerId: state.countries[state.zone.owner[z]].id,
      legalOwnerId: state.countries[state.zone.sovereign[z]].id,
      occupied,
      occupationPolicy: occupied ? OCCUPATION_POLICIES[state.zone.occupationPolicy[z]] : null,
      resistance: state.zone.resistance[z],
      population: state.zone.population[z],
      unemployment: state.zone.unemployment[z],
      inflation: state.zone.inflation[z] * 52,
      deprivation: state.zone.deprivation[z],
      sectors: sectorViews(state, report, [z]),
    };
  });
  const playerRegimeFell = playerCountryId !== null
    && report.events.some(event => event.type === 'regime-change' && event.countryId === playerCountryId);
  return { week: state.turn, countries, regions, events: report.events, playerRegimeFell };
}

/** Resolve one week on a copy of `state` (the input is untouched): AI autopilot plus the given input. */
function resolveWeek(state: EconomyState, playerCountryId: CountryId | null, commands: readonly EconomyCommand[], effects: readonly ExternalEffect[]): EconomySession {
  const ai = state.countries.map(country => country.id).filter(id => id !== playerCountryId);
  const result = advanceEconomy(state, { commands: [...autopilotCommands(state, ai), ...commands], effects }, { audit: true, report: 'full' });
  return { format: SESSION_FORMAT, playerCountryId, state: result.state, summary: summarize(result.state, result.report, playerCountryId), week: result.state.turn };
}

/**
 * Start the economy of a new game from the game's countries and regions (31-good catalogue).
 * This builds and calibrates the world (about 0.8 s on a desktop for the fictional scenario):
 * call it once, when a game is launched, never just to display the map.
 */
export function createEconomySession(world: GameWorldInput, options: CreateSessionOptions = {}): EconomySession {
  const state = createEconomy(worldSpecFromGame(world, options.profiles ?? FICTIONAL_REGION_PROFILES));
  // Game week 1: the economy's first week, resolved by the autopilot before any player decision.
  return resolveWeek(state, world.playerCountryId, [], []);
}

/** The same session with another (or no) player country. Nothing is simulated. */
export function withPlayerCountry(session: EconomySession, playerCountryId: CountryId | null): EconomySession {
  if (playerCountryId !== null) countryIndex(session.state, playerCountryId);
  const summary = {
    ...session.summary,
    countries: session.summary.countries.map(view => ({ ...view, controller: (view.countryId === playerCountryId ? 'player' : 'ai') as 'player' | 'ai' })),
    playerRegimeFell: false,
  };
  return { ...session, playerCountryId, summary };
}

/**
 * Resolve the next game week. Returns a new session; the given one is unchanged. Throws (and
 * nothing changes) on a command that is invalid or does not belong to the player's country, on an
 * unknown region or country, or if the conservation audit fails.
 */
export function advanceEconomyWeek(session: EconomySession, input: EconomyWeekInput = {}): EconomySession {
  if (session.playerCountryId === null) throw new Error('Select a player country before advancing a week.');
  const commands = input.playerCommands ?? [];
  authorize(session.playerCountryId, commands);
  const effects = [...(input.regionControl ? regionControlEffects(session, input.regionControl) : []), ...(input.effects ?? [])];
  return resolveWeek(session.state, session.playerCountryId, commands, effects);
}

export function getCountryEconomy(session: EconomySession, countryId: CountryId): CountryEconomyView {
  const view = session.summary.countries.find(entry => entry.countryId === countryId);
  if (!view) throw new Error(`Unknown country: ${countryId}.`);
  return view;
}

export function getRegionEconomy(session: EconomySession, regionId: string): RegionEconomyView {
  const view = session.summary.regions.find(entry => entry.regionId === regionId);
  if (!view) throw new Error(`Unknown region: ${regionId}.`);
  return view;
}

/**
 * The three numbers the game's current economy panel shows, taken from the engine, for the
 * migration period. Display only: they are not whole numbers and must not be fed back into the
 * game's own treasury rule (that would count the money twice).
 */
export function legacyEconomyView(view: CountryEconomyView): { treasury: number; weeklyIncome: number; weeklyExpenses: number } {
  return { treasury: view.treasury, weeklyIncome: view.budget.revenue, weeklyExpenses: view.budget.expenditure };
}

/** 16-character fingerprint of the economy (identical sessions have identical fingerprints). */
export function economyFingerprint(session: EconomySession): string {
  return hashEconomy(session.state);
}

/** Text form of a session, to store with the game's save. */
export function saveEconomySession(session: EconomySession): string {
  return JSON.stringify({ format: SESSION_FORMAT, version: SESSION_VERSION, playerCountryId: session.playerCountryId, summary: session.summary, economy: session.state });
}

/** Restore a session saved with saveEconomySession. Rejects damaged or foreign data. */
export function loadEconomySession(text: string): EconomySession {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Invalid economy session save: not valid JSON.');
  }
  const record = parsed as Record<string, unknown> | null;
  if (typeof record !== 'object' || record === null || record.format !== SESSION_FORMAT) throw new Error('Invalid economy session save: unknown format.');
  if (record.version !== SESSION_VERSION) throw new Error(`Invalid economy session save: version ${String(record.version)} is not supported.`);
  const state = restoreEconomy(record.economy);
  const playerCountryId = record.playerCountryId;
  if (playerCountryId !== null && (typeof playerCountryId !== 'string' || !state.countries.some(country => country.id === playerCountryId))) {
    throw new Error('Invalid economy session save: unknown player country.');
  }
  const summary = record.summary as EconomyWeekSummary | null;
  if (typeof summary !== 'object' || summary === null || summary.week !== state.turn || !Array.isArray(summary.countries)
    || summary.countries.length !== state.countries.length || !Array.isArray(summary.regions) || summary.regions.length !== state.zones.length
    || !Array.isArray(summary.events)) {
    throw new Error('Invalid economy session save: the weekly summary does not match the economy.');
  }
  return { format: SESSION_FORMAT, playerCountryId, state, summary, week: state.turn };
}

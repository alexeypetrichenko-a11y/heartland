import type {
  CountryId, CountrySpec, EconomyCommand, EconomyEvent, EconomyState, ExternalEffect, LaneSpec, TurnReport, WorldSpec, ZoneSpec,
} from '../src/index.ts';
import { advanceEconomy, autopilotCommands, createEconomy } from '../src/index.ts';

/**
 * EXAMPLE adapter between the HEARTLAND game and the economic engine.
 *
 * It lives outside `src/` on purpose: it is documentation that compiles and is
 * tested, not part of the engine. It imports nothing from the game; the host
 * types below mirror the fields of `src/game/models.ts` that matter
 * (countries, regions with owners and adjacency, the player country), so the
 * same code can be copied into the game and pointed at the real `GameState`.
 *
 * Everything in `RegionProfile` is PROPOSED test data, not approved game data.
 */

export interface HostCountry { id: CountryId; name: string; controller: 'player' | 'ai' }
export interface HostRegion { id: string; name: string; ownerId: CountryId; adjacentRegionIds: string[] }
export interface HostWorld { seed: number; playerCountryId: CountryId | null; countries: HostCountry[]; regions: HostRegion[] }

/** Economic character of a region. Population is in millions; technology 1 = reference economy. */
export interface RegionProfile {
  population: number;
  technology: number;
  populationGrowth?: number;
  advantage?: Record<string, number>;
}

/** The economy numbers the existing dashboard shows (treasury, weekly income, weekly expenses). */
export interface LegacyEconomyView { treasury: number; weeklyIncome: number; weeklyExpenses: number }

/** Build the engine's world description from the game's countries and regions. */
export function worldSpecFromHost(host: HostWorld, profiles: Record<string, RegionProfile>): WorldSpec {
  const countries: CountrySpec[] = host.countries.map(country => ({ id: country.id, name: country.name }));
  const zones: ZoneSpec[] = host.regions.map(region => {
    const profile = profiles[region.id];
    if (!profile) throw new Error(`No economic profile for region ${region.id}.`);
    return { id: region.id, name: region.name, countryId: region.ownerId, ...profile };
  });
  // One lane per pair of adjacent regions (the game's adjacency list is symmetric).
  const lanes: LaneSpec[] = [];
  const seen = new Set<string>();
  for (const region of host.regions) {
    for (const other of region.adjacentRegionIds) {
      const key = [region.id, other].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      lanes.push({ id: `road-${key}`, from: region.id, to: other, distance: 0.8 });
    }
  }
  return { seed: host.seed, countries, zones, lanes };
}

export interface HostTurnInput {
  /** Decisions of the human player this week. The host has already shown them to the player. */
  playerCommands: EconomyCommand[];
  /** Facts decided by other game systems this week (battles, events, diplomacy outcomes). */
  effects: ExternalEffect[];
}

export interface HostTurnOutcome {
  state: EconomyState;
  report: TurnReport;
  /** Events the game should show or act on. */
  events: EconomyEvent[];
  /** True when the player's regime was overthrown this week (GAME_DESIGN.md section 6: defeat). */
  playerRegimeFell: boolean;
  /** Dashboard numbers per country in the shape the existing UI already uses. */
  legacy: Record<CountryId, LegacyEconomyView>;
}

/** Commands may only concern the country the player controls: the engine does not check who is asking. */
export function assertPlayerOwns(host: HostWorld, commands: readonly EconomyCommand[]): void {
  for (const command of commands) {
    if (command.type === 'repay-debt' || command.type === 'declare-default' || 'countryId' in command) {
      if (command.countryId !== host.playerCountryId) throw new Error(`Command ${command.type} does not belong to the player's country.`);
    }
  }
}

/** Zones whose owner differs from the game's region ownership (e.g. after a conquest) become transfer effects. */
export function ownershipEffects(host: HostWorld, state: EconomyState): ExternalEffect[] {
  const effects: ExternalEffect[] = [];
  for (const region of host.regions) {
    const z = state.zones.findIndex(zone => zone.id === region.id);
    if (z >= 0 && state.countries[state.zone.owner[z]].id !== region.ownerId) effects.push({ type: 'transfer-zone', zoneId: region.id, ownerId: region.ownerId });
  }
  return effects;
}

/**
 * Resolve one economic week for the game. Nothing is changed in `state`
 * (pure); the new state is returned and the game keeps it as its economic save.
 */
export function runHostTurn(host: HostWorld, state: EconomyState, input: HostTurnInput): HostTurnOutcome {
  assertPlayerOwns(host, input.playerCommands);
  const aiIds = host.countries.filter(country => country.id !== host.playerCountryId).map(country => country.id);
  const commands = [...autopilotCommands(state, aiIds), ...input.playerCommands];
  const effects = [...ownershipEffects(host, state), ...input.effects];
  const result = advanceEconomy(state, { commands, effects }, { audit: true });
  const legacy: Record<CountryId, LegacyEconomyView> = {};
  for (const country of result.report.countries) {
    legacy[country.countryId] = { treasury: country.treasury, weeklyIncome: country.budget.revenue, weeklyExpenses: country.budget.spending };
  }
  const playerRegimeFell = result.report.events.some(event => event.type === 'regime-change' && event.countryId === host.playerCountryId);
  return { state: result.state, report: result.report, events: result.report.events, playerRegimeFell, legacy };
}

/** Create the engine world for a new game. Takes about 0.25 s on a desktop: do it once, then keep the saved state. */
export function createHostEconomy(host: HostWorld, profiles: Record<string, RegionProfile>): EconomyState {
  return createEconomy(worldSpecFromHost(host, profiles));
}

// ---------------------------------------------------------------------------
// Fixture matching src/game/initialState.ts (Alden, Belora, Cyrin; six regions).
// The economic profiles are an invented proposal for illustration.
// ---------------------------------------------------------------------------

export function fixtureHostWorld(): HostWorld {
  return {
    seed: 2401,
    playerCountryId: 'alden',
    countries: [
      { id: 'alden', name: 'Alden', controller: 'player' },
      { id: 'belora', name: 'Belora', controller: 'ai' },
      { id: 'cyrin', name: 'Cyrin', controller: 'ai' },
    ],
    regions: [
      { id: 'alden-vale', name: 'Alden Vale', ownerId: 'alden', adjacentRegionIds: ['reed-coast', 'amber-plain'] },
      { id: 'reed-coast', name: 'Reed Coast', ownerId: 'alden', adjacentRegionIds: ['alden-vale', 'silver-hills'] },
      { id: 'amber-plain', name: 'Amber Plain', ownerId: 'belora', adjacentRegionIds: ['alden-vale', 'silver-hills', 'cedar-basin'] },
      { id: 'silver-hills', name: 'Silver Hills', ownerId: 'belora', adjacentRegionIds: ['reed-coast', 'amber-plain', 'dawn-ridge'] },
      { id: 'cedar-basin', name: 'Cedar Basin', ownerId: 'cyrin', adjacentRegionIds: ['amber-plain', 'dawn-ridge'] },
      { id: 'dawn-ridge', name: 'Dawn Ridge', ownerId: 'cyrin', adjacentRegionIds: ['silver-hills', 'cedar-basin'] },
    ],
  };
}

export const FIXTURE_PROFILES: Record<string, RegionProfile> = {
  'alden-vale': { population: 30, technology: 1.6, populationGrowth: 0.003, advantage: { food: 2, energy: 0.3, materials: 0.5, industrial: 1.2, consumer: 1.5, military: 0.6 } },
  'reed-coast': { population: 18, technology: 1.4, populationGrowth: 0.003, advantage: { food: 0.8, energy: 1.5, materials: 0.4, industrial: 1, consumer: 1.2, military: 0.3 } },
  'amber-plain': { population: 28, technology: 1.2, populationGrowth: 0.004, advantage: { food: 3, energy: 0.2, materials: 0.8, industrial: 0.6, consumer: 0.8, military: 0.2 } },
  'silver-hills': { population: 16, technology: 1.3, populationGrowth: 0.002, advantage: { food: 0.4, energy: 0.4, materials: 3, industrial: 1.5, consumer: 0.6, military: 1 } },
  'cedar-basin': { population: 22, technology: 1.1, populationGrowth: 0.004, advantage: { food: 1, energy: 2.5, materials: 1, industrial: 0.5, consumer: 1, military: 0.2 } },
  'dawn-ridge': { population: 14, technology: 1.5, populationGrowth: 0.003, advantage: { food: 0.6, energy: 0.6, materials: 0.6, industrial: 2, consumer: 1.5, military: 1.2 } },
};

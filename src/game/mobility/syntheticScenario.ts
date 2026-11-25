import { advanceTurn } from '../advanceTurn.ts';
import { economySnapshot, type EconomyCommand, type LoadedEconomy } from '../economyBridge.ts';
import { createInitialState } from '../initialState.ts';
import type { CountryId, TurnCommand } from '../models.ts';
import { emptyDrafts } from '../playerDrafts.ts';
import { decodeGameSave, encodeGameSave, restoreGameSave, type PlayableSession } from '../saveFormat.ts';
import { isSaveObject } from '../saveValidation.ts';
import { selectCountry } from '../selectCountry.ts';
import { settleMobility, validateRoutes, type MaritimeRoute, type MobilityState, type TransportOrder } from './journeys.ts';

const SCENARIO = 'mil-01a-synthetic';
const VERSION = 1;

// Reuse in-repo synthetic economic profiles and diplomacy IDs. The test world
// has a distinct seed, a detached island, and an independent starting roster.
function createFixture() {
  const game = createInitialState();
  game.seed = 2402;
  for (const region of game.regions) {
    if (region.id === 'reed-coast') {
      region.name = 'Reed Island';
      region.adjacentRegionIds = [];
    } else {
      region.adjacentRegionIds = region.adjacentRegionIds.filter(id => id !== 'reed-coast');
    }
  }
  game.divisions[0].manpower = 25_000;
  game.divisions.push({ ...game.divisions[0], id: 'alden-second', name: 'Alden Second Division' });
  return game;
}

export const syntheticRoutes = Object.freeze([
  Object.freeze({ id: 'island-outbound', from: 'alden-vale', to: 'reed-coast', weeks: 1, capacityGroup: 'island', slots: 1 }),
  Object.freeze({ id: 'island-inbound', from: 'reed-coast', to: 'alden-vale', weeks: 2, capacityGroup: 'island', slots: 1 }),
] satisfies MaritimeRoute[]);
const fixture = createFixture();
validateRoutes(fixture, syntheticRoutes);

export interface SyntheticSession extends PlayableSession {
  mobility: MobilityState;
  transportDrafts: TransportOrder[];
}

export function startSyntheticMobility(runtime: LoadedEconomy, countryId: CountryId = 'alden'): SyntheticSession {
  const game = selectCountry(createFixture(), countryId);
  const economy = economySnapshot(runtime, runtime.api.createEconomySession(game), null);
  return { game, economy, drafts: emptyDrafts(), transportDrafts: [], mobility: { journeys: [], closedRouteIds: [], results: [] } };
}

/** Opt-in weekly entry point. The land resolver sees only units with regional presence. */
export function advanceSyntheticMobility(runtime: LoadedEconomy, current: SyntheticSession,
  landOrders: readonly TurnCommand[] = [], fiscalOrders: readonly EconomyCommand[] = []): SyntheticSession {
  if (!Number.isSafeInteger(current.game.week) || current.game.week < 1 || current.game.week > Number.MAX_SAFE_INTEGER - 2) {
    throw new Error('The game week must leave room for a two-week journey.');
  }
  if (current.economy.defeated) throw new Error('The player’s regime has been overthrown.');
  const { mobility, arrivals } = settleMobility(current.game, current.mobility, syntheticRoutes, current.transportDrafts);
  const traveling = new Set(mobility.journeys.map(journey => journey.divisionId));
  const transportOrdered = new Set(current.transportDrafts.map(order => order.divisionId));
  if (landOrders.some(command => command.type === 'set-military-order'
    && (traveling.has(command.divisionId) || arrivals.has(command.divisionId) || transportOrdered.has(command.divisionId)))) {
    throw new Error('A division with a transport action cannot receive a land order this week.');
  }
  const settled = runtime.api.advanceWeekTogether({
    game: current.game, session: current.economy.session, economyCommands: fiscalOrders,
    advanceGame: game => {
      const divisions = game.divisions.filter(division => !traveling.has(division.id))
        .map(division => {
          const arrival = arrivals.get(division.id);
          return arrival ? { ...division, regionId: arrival.regionId, order: { kind: 'defend' as const } } : division;
        });
      const land = advanceTurn({ ...game, divisions }, landOrders);
      const resolved = new Map(land.divisions.map(division => [division.id, division]));
      return { ...land, divisions: game.divisions.map(division => resolved.get(division.id) ?? { ...division, order: { kind: 'defend' as const } }) };
    },
  });
  return { game: settled.game, economy: economySnapshot(runtime, settled.session, current.economy.player),
    drafts: emptyDrafts(), mobility, transportDrafts: [] };
}

function invalidCheckpoint(): never { throw new Error('Invalid synthetic mobility checkpoint.'); }

function validatedMobility(value: unknown, drafts: unknown, game: SyntheticSession['game']) {
  if (!isSaveObject(value) || !Array.isArray(value.journeys) || !Array.isArray(value.closedRouteIds)
    || !Array.isArray(value.results) || !Array.isArray(drafts)) invalidCheckpoint();
  const routes = new Map<string, MaritimeRoute>(syntheticRoutes.map(route => [route.id, route]));
  const regionIds = new Set(game.regions.map(region => region.id));
  const divisions = new Map(game.divisions.map(division => [division.id, division]));
  const travelers = new Set<string>();
  for (const journey of value.journeys) {
    if (!isSaveObject(journey) || typeof journey.divisionId !== 'string' || typeof journey.routeId !== 'string') invalidCheckpoint();
    const division = divisions.get(journey.divisionId);
    const route = routes.get(journey.routeId);
    if (!division || !route || division.ownerId !== game.playerCountryId || division.regionId !== route.from
      || division.manpower <= 0 || division.order.kind !== 'defend' || travelers.has(division.id)
      || journey.operation !== 'friendly-transport' || (journey.leg !== 'outbound' && journey.leg !== 'return')
      || (journey.status !== 'traveling' && journey.status !== 'waiting') || typeof journey.dueWeek !== 'number'
      || !Number.isSafeInteger(journey.dueWeek) || journey.dueWeek < 2 || journey.dueWeek > game.week + route.weeks - 1
      || (journey.status === 'traveling' && journey.dueWeek < game.week)) invalidCheckpoint();
    travelers.add(division.id);
  }
  if (new Set(value.closedRouteIds).size !== value.closedRouteIds.length
    || value.closedRouteIds.some(id => typeof id !== 'string' || !routes.has(id))) invalidCheckpoint();
  const draftsById = new Set<string>();
  for (const draft of drafts) {
    if (!isSaveObject(draft) || typeof draft.divisionId !== 'string') invalidCheckpoint();
    const unit = divisions.get(draft.divisionId);
    if (!unit || unit.ownerId !== game.playerCountryId || unit.manpower <= 0 || draftsById.has(unit.id)
      || (draft.kind !== 'return' && draft.kind !== 'transport')
      || (draft.kind === 'return' && !travelers.has(unit.id))
      || (draft.kind === 'transport' && (typeof draft.routeId !== 'string' || !routes.has(draft.routeId)))) invalidCheckpoint();
    draftsById.add(unit.id);
  }
  const resultKinds = new Set(['departed', 'arrived', 'returned', 'returning', 'waiting', 'refused']);
  for (const result of value.results) {
    if (!isSaveObject(result) || typeof result.kind !== 'string' || !resultKinds.has(result.kind)
      || typeof result.divisionId !== 'string' || !divisions.has(result.divisionId)
      || typeof result.routeId !== 'string' || !routes.has(result.routeId)
      || (result.regionId !== undefined && (typeof result.regionId !== 'string' || !regionIds.has(result.regionId)))
      || (result.reason !== undefined && typeof result.reason !== 'string')
      || (result.dueWeek !== undefined && (typeof result.dueWeek !== 'number' || !Number.isSafeInteger(result.dueWeek)))) invalidCheckpoint();
  }
  return { mobility: value as unknown as MobilityState, transportDrafts: drafts as TransportOrder[] };
}

async function fingerprint(payload: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Separate review checkpoint, never written to the public game’s active SAVE-01 slot. */
export async function encodeSyntheticMobility(runtime: LoadedEconomy, session: SyntheticSession) {
  validatedMobility(session.mobility, session.transportDrafts, session.game);
  const gameSave = await encodeGameSave(runtime, session, fixture);
  const payload = JSON.stringify({ scenario: SCENARIO, version: VERSION, gameSave, mobility: session.mobility, drafts: session.transportDrafts });
  return JSON.stringify({ payload, checksum: await fingerprint(payload) });
}

export async function restoreSyntheticMobility(runtime: LoadedEconomy, record: string): Promise<SyntheticSession> {
  const envelope: unknown = JSON.parse(record);
  if (!isSaveObject(envelope) || typeof envelope.payload !== 'string' || envelope.checksum !== await fingerprint(envelope.payload)) invalidCheckpoint();
  const data: unknown = JSON.parse(envelope.payload);
  if (!isSaveObject(data) || data.scenario !== SCENARIO || data.version !== VERSION || typeof data.gameSave !== 'string') invalidCheckpoint();
  const core = restoreGameSave(runtime, await decodeGameSave(data.gameSave, fixture), fixture);
  return { ...core, ...validatedMobility(data.mobility, data.drafts, core.game) };
}

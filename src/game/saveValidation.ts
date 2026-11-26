import { collectiveReasons, STRATEGIC_LAND, type CollectiveOrder } from './strategicLand.ts';
import { DIPLOMACY_PARAMETERS, parseDiplomaticCommand } from './diplomacy.ts';
import { createInitialState } from './initialState.ts';
import { parseMilitaryOrder } from './military.ts';
import type { GameState } from './models.ts';
import type { PlayerDrafts } from './playerDrafts.ts';

const fictional = createInitialState();
const relationshipSpan = DIPLOMACY_PARAMETERS.maxRelationship - DIPLOMACY_PARAMETERS.minRelationship;

export function isSaveObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const integer = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const known = (ids: Set<string>, value: unknown): value is string => typeof value === 'string' && ids.has(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const sameArray = (value: unknown, expected: string[]) =>
  Array.isArray(value) && value.length === expected.length && expected.every((id, i) => value[i] === id);
const stance = (value: unknown) => value === 'goodwill' || value === 'condemnation';

function requireSave(condition: unknown): asserts condition {
  if (!condition) throw new Error('The saved game state is incomplete or invalid.');
}

function matchesFixture<T>(value: unknown, expected: T[], valid: (entry: Record<string, unknown>, original: T) => boolean) {
  return Array.isArray(value) && value.length === expected.length && expected.every((entry, i) =>
    isSaveObject(value[i]) && valid(value[i], entry));
}

function orderInScenario(value: unknown, regions: Set<string>) {
  const order = parseMilitaryOrder(value);
  return order.kind === 'defend' || regions.has(order.targetRegionId);
}

function militaryResult(value: unknown, regions: Set<string>, divisions: Set<string>) {
  if (!isSaveObject(value) || !known(divisions, value.divisionId)) return false;
  if (value.kind === 'cancelled') return text(value.reason);
  if (!known(regions, value.targetRegionId)) return false;
  if (value.kind === 'moved') return known(regions, value.fromRegionId);
  return value.kind === 'combat' && typeof value.captured === 'boolean' && integer(value.attackerCasualties, 0)
    && Array.isArray(value.defenderCasualties) && value.defenderCasualties.every(loss =>
      isSaveObject(loss) && known(divisions, loss.divisionId) && integer(loss.losses, 0));
}

function diplomaticMessage(value: unknown, week: number, countries: Set<string>) {
  if (!isSaveObject(value) || !text(value.id) || !integer(value.week, 1, week - 1)
    || !known(countries, value.fromId) || !known(countries, value.toId) || value.fromId === value.toId
    || !integer(value.relationshipChange, -relationshipSpan, relationshipSpan) || !text(value.reason)) return false;
  if (value.visibility === 'public') return stance(value.stance);
  if (value.visibility !== 'private') return false;
  if (value.status === 'pending') return value.resolvedWeek === undefined && value.responseReason === undefined;
  return (value.status === 'accepted' || value.status === 'rejected')
    && integer(value.resolvedWeek, value.week, week - 1) && text(value.responseReason);
}

/** Validate the fixed world and all persistent records before handing them to the simulation. */
function validateStrategicLand(game: GameState) {
  const land = game.strategicLand;
  if (land === undefined) return;
  if (!isSaveObject(land) || land.rules !== STRATEGIC_LAND) throw new Error('Unsupported combat rules.');
  const units = new Map(game.divisions.map(unit => [unit.id, unit]));
  const areas = new Map(game.regions.map(region => [region.id, region]));
  const actors = new Set(game.countries.map(country => country.id));
  requireSave(isSaveObject(land.readiness) && Object.keys(land.readiness).length === units.size);
  for (const unit of units.values()) {
    const readiness = land.readiness[unit.id];
    requireSave(isSaveObject(readiness) && integer(readiness.baseline, unit.manpower)
      && integer(readiness.eligibleWeek, 1, game.week + 1)
      && integer(readiness.prisoners, 0, readiness.baseline)
      && (!readiness.prisoners || unit.manpower === 0));
  }
  requireSave(Array.isArray(land.fronts) && Array.isArray(land.events));
  const committed = new Set<string>();
  const fronts = new Set<string>();
  for (const front of land.fronts) {
    requireSave(isSaveObject(front) && text(front.id) && !fronts.has(front.id)
      && (front.kind === 'assault' || front.kind === 'clash') && areas.has(front.target)
      && integer(front.progress, -100, 100) && integer(front.rounds, 1, game.week - 1)
      && (front.suspended === undefined || integer(front.suspended, 1, game.week - 1))
      && Array.isArray(front.countries) && front.countries.length === 2
      && front.countries.every(actor => actors.has(actor)) && front.countries[0] !== front.countries[1]
      && Array.isArray(front.sides) && front.sides.length === 2);
    fronts.add(front.id);
    requireSave(Array.isArray(front.blocked) && front.blocked.length === 2
      && front.blocked.every(n => integer(n, 0, game.week - 1))
      && isSaveObject(front.enclosed) && Object.entries(front.enclosed).every(([id, n]) =>
        front.sides.some(side => side.includes(id)) && integer(n, 1, 1)));
    for (const side of [0, 1] as const) {
      requireSave(Array.isArray(front.sides[side]) && front.sides[side].length);
      for (const id of front.sides[side]) {
        const unit = units.get(id);
        requireSave(unit && unit.ownerId === front.countries[side] && unit.manpower > 0 && !committed.has(id));
        committed.add(id);
      }
    }
  }
  for (const event of land.events) {
    requireSave(isSaveObject(event) && actors.has(event.countryId)
      && ['loss', 'prisoners', 'retreat', 'capture', 'moved', 'suspended', 'blocked', 'rejected', 'contested'].includes(event.kind)
      && (event.divisionId === undefined || units.get(event.divisionId)?.ownerId === event.countryId)
      && (event.regionId === undefined || areas.has(event.regionId))
      && (event.amount === undefined || integer(event.amount, 0))
      && (event.reason === undefined || text(event.reason)));
  }
}

function validateCollectiveDraft(value: unknown, game: GameState): asserts value is CollectiveOrder {
  requireSave(isSaveObject(value) && text(value.id) && value.countryId === game.playerCountryId
    && value.week === game.week && Array.isArray(value.divisionIds) && value.divisionIds.every(text)
    && isSaveObject(value.action));
  const action = value.action;
  if (action.kind === 'reinforce') requireSave(text(action.engagementId));
  else if (action.kind === 'disengage') requireSave(action.fallbackRegionId === undefined || text(action.fallbackRegionId));
  else parseMilitaryOrder(action);
  requireSave(collectiveReasons(game, value as unknown as CollectiveOrder).length === 0);
}

export function validateSavedGame(value: unknown, scenario = fictional, playable?: readonly string[]): GameState {
  const countries = new Set(scenario.countries.map(country => country.id));
  const regions = new Set(scenario.regions.map(region => region.id));
  const divisions = new Set(scenario.divisions.map(division => division.id));
  const actors = playable ? new Set(scenario.relations.flatMap(relation => relation.countryIds)) : countries;
  requireSave(isSaveObject(value) && integer(value.week, 1) && known(countries, value.playerCountryId));
  const { playerCountryId, week } = value;
  requireSave(!playable || playable.includes(playerCountryId));
  if (value.seed !== scenario.seed) throw new Error('This local save belongs to a different scenario.');
  requireSave(matchesFixture(value.countries, scenario.countries, (entry, original) =>
    entry.id === original.id && entry.name === original.name
    && entry.controller === (entry.id === playerCountryId ? 'player' : 'ai')));
  requireSave(matchesFixture(value.regions, scenario.regions, (entry, original) =>
    entry.id === original.id && entry.name === original.name && known(countries, entry.ownerId)
    && (!playable || entry.ownerId === original.ownerId
      || (original.adjacentRegionIds.length > 0 && playable.includes(original.ownerId) && playable.includes(entry.ownerId)))
    && sameArray(entry.adjacentRegionIds, original.adjacentRegionIds)));
  requireSave(matchesFixture(value.divisions, scenario.divisions, (entry, original) =>
    entry.id === original.id && entry.name === original.name && entry.ownerId === original.ownerId
    && known(regions, entry.regionId) && integer(entry.manpower, 0) && orderInScenario(entry.order, regions)));
  requireSave(matchesFixture(value.relations, scenario.relations, (entry, original) =>
    sameArray(entry.countryIds, original.countryIds)
    && integer(entry.value, DIPLOMACY_PARAMETERS.minRelationship, DIPLOMACY_PARAMETERS.maxRelationship)));
  requireSave(Array.isArray(value.standingOrders) && value.standingOrders.every(order =>
    isSaveObject(order) && text(order.id) && known(countries, order.countryId) && order.kind === 'placeholder' && text(order.label)));
  requireSave(new Set(value.standingOrders.map(order => order.id)).size === value.standingOrders.length);
  requireSave(Array.isArray(value.diplomaticMessages) && value.diplomaticMessages.every(message => diplomaticMessage(message, week, actors)));
  requireSave(new Set(value.diplomaticMessages.map(message => message.id)).size === value.diplomaticMessages.length);
  requireSave(Array.isArray(value.militaryResults) && value.militaryResults.every(result => militaryResult(result, regions, divisions)));
  const game = value as unknown as GameState;
  validateStrategicLand(game);
  return game;
}

export function validateSavedDrafts(value: unknown, game: GameState, europe = false): PlayerDrafts {
  const regions = new Set(game.regions.map(region => region.id));
  requireSave(isSaveObject(value) && Array.isArray(value.military) && isSaveObject(value.fiscal)
    && Object.values(value.fiscal).every(entry => typeof entry === 'string'));
  requireSave(value.military.every(command =>
    isSaveObject(command) && command.type === 'set-military-order' && command.countryId === game.playerCountryId
    && game.divisions.some(division => division.id === command.divisionId && division.ownerId === command.countryId)
    && orderInScenario(command.order, regions)));
  requireSave(new Set(value.military.map(command => command.divisionId)).size === value.military.length);
  if (value.collective !== undefined) {
    requireSave(game.strategicLand && Array.isArray(value.collective));
    const ids = new Set<string>();
    const divisions = new Set(value.military.map(command => command.divisionId));
    for (const draft of value.collective) {
      validateCollectiveDraft(draft, game);
      requireSave(!ids.has(draft.id) && draft.divisionIds.every(id => !divisions.has(id)));
      ids.add(draft.id);
      for (const id of draft.divisionIds) divisions.add(id);
    }
  }
  if (value.diplomacy !== null) {
    const command = parseDiplomaticCommand(value.diplomacy);
    requireSave(command.countryId === game.playerCountryId);
    requireSave(command.type === 'respond-offer'
      ? game.diplomaticMessages.some(message => message.id === command.offerId && message.visibility === 'private' && message.toId === command.countryId)
      : game.countries.some(country => country.id === command.targetId) && command.targetId !== command.countryId
        && (!europe || game.relations.some(relation => relation.countryIds.includes(command.countryId) && relation.countryIds.includes(command.targetId))));
  }
  return value as unknown as PlayerDrafts;
}

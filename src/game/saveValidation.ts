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
export function validateSavedGame(value: unknown, scenario = fictional): GameState {
  const countries = new Set(scenario.countries.map(country => country.id));
  const regions = new Set(scenario.regions.map(region => region.id));
  const divisions = new Set(scenario.divisions.map(division => division.id));
  requireSave(isSaveObject(value) && integer(value.week, 1) && known(countries, value.playerCountryId));
  const { playerCountryId, week } = value;
  if (value.seed !== scenario.seed) throw new Error('This local save belongs to a different scenario.');
  requireSave(matchesFixture(value.countries, scenario.countries, (entry, original) =>
    entry.id === original.id && entry.name === original.name
    && entry.controller === (entry.id === playerCountryId ? 'player' : 'ai')));
  requireSave(matchesFixture(value.regions, scenario.regions, (entry, original) =>
    entry.id === original.id && entry.name === original.name && known(countries, entry.ownerId)
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
  requireSave(Array.isArray(value.diplomaticMessages) && value.diplomaticMessages.every(message => diplomaticMessage(message, week, countries)));
  requireSave(new Set(value.diplomaticMessages.map(message => message.id)).size === value.diplomaticMessages.length);
  requireSave(Array.isArray(value.militaryResults) && value.militaryResults.every(result => militaryResult(result, regions, divisions)));
  return value as unknown as GameState;
}

export function validateSavedDrafts(value: unknown, game: GameState): PlayerDrafts {
  const regions = new Set(game.regions.map(region => region.id));
  requireSave(isSaveObject(value) && Array.isArray(value.military) && isSaveObject(value.fiscal)
    && Object.values(value.fiscal).every(entry => typeof entry === 'string'));
  requireSave(value.military.every(command =>
    isSaveObject(command) && command.type === 'set-military-order' && command.countryId === game.playerCountryId
    && game.divisions.some(division => division.id === command.divisionId && division.ownerId === command.countryId)
    && orderInScenario(command.order, regions)));
  requireSave(new Set(value.military.map(command => command.divisionId)).size === value.military.length);
  if (value.diplomacy !== null) {
    const command = parseDiplomaticCommand(value.diplomacy);
    requireSave(command.countryId === game.playerCountryId);
    requireSave(command.type === 'respond-offer'
      ? game.diplomaticMessages.some(message => message.id === command.offerId && message.visibility === 'private' && message.toId === command.countryId)
      : game.countries.some(country => country.id === command.targetId) && command.targetId !== command.countryId);
  }
  return value as unknown as PlayerDrafts;
}

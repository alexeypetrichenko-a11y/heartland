import { resolveStrategicLand, type CollectiveOrder } from './strategicLand.ts';
import type { GameState, TurnCommand } from './models.ts';
import { parseMilitaryOrder, resolveMilitary, validateMilitaryOrder } from './military.ts';
import { applyDiplomaticCommand, DIPLOMACY_PARAMETERS, parseDiplomaticCommand } from './diplomacy.ts';
import { resolveAIDiplomacy } from './ai.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Validate runtime input too, rather than relying on TypeScript at call sites. */
function validateCommand(value: unknown): TurnCommand {
  if (isRecord(value)) {
    if (value.type === 'declare' || value.type === 'offer-cooperation' || value.type === 'respond-offer') {
      return parseDiplomaticCommand(value);
    }
    if (value.type === 'set-military-order' && isText(value.countryId) && isText(value.divisionId)) {
      return { type: value.type, countryId: value.countryId, divisionId: value.divisionId, order: parseMilitaryOrder(value.order) };
    }
    if (value.type === 'set-standing-order' && isRecord(value.order)) {
      const order = value.order;
      if (isText(order.id) && isText(order.countryId) && order.kind === 'placeholder' && isText(order.label)) {
        return { type: value.type, order: { id: order.id, countryId: order.countryId, kind: order.kind, label: order.label } };
      }
    }
    if (value.type === 'cancel-standing-order' && isText(value.countryId) && isText(value.orderId)) {
      return { type: value.type, countryId: value.countryId, orderId: value.orderId };
    }
  }
  throw new Error('Invalid turn command.');
}

/**
 * Resolve one local week, atomically. Commands apply in supplied array order:
 * set inserts/replaces an owned order by ID; cancel removes an owned order.
 * Invalid input throws without changing the supplied state or commands.
 * Placeholder orders persist without effects. Player diplomacy applies before
 * one action per AI country, in stable country ID order; military orders then
 * resolve within the same atomic turn.
 * The economy is not resolved here: the economic engine resolves the same week
 * in `economyBridge.ts` (advanceWeekTogether), and a week is never rejected for
 * lack of funds (INT-01, decision A1).
 * No clock, randomness, React, storage or network access; the seed is untouched.
 */
export function advanceTurn(state: GameState, commands: readonly TurnCommand[] = [], scenarioDiplomacy = false, collective: readonly CollectiveOrder[] = []): GameState {
  const player = state.countries.find(country => country.id === state.playerCountryId);
  if (!player || player.controller !== 'player') {
    throw new Error('Select a player country before advancing a week.');
  }
  if (!Number.isSafeInteger(state.week) || state.week < 1 || state.week >= Number.MAX_SAFE_INTEGER) {
    throw new Error('Week must be a positive safe integer with room to advance.');
  }
  if (!Array.isArray(commands)) throw new Error('Turn commands must be an array.');

  let orders = state.standingOrders.map(order => ({ ...order }));
  let divisions = state.divisions;
  let diplomacy = state;
  let diplomaticActions = 0;
  for (const input of commands) {
    const command = validateCommand(input);
    const countryId = command.type === 'set-standing-order' ? command.order.countryId : command.countryId;
    if (countryId !== player.id) throw new Error('Commands must belong to the selected player country.');
    if (command.type === 'declare' || command.type === 'offer-cooperation' || command.type === 'respond-offer') {
      if (++diplomaticActions > DIPLOMACY_PARAMETERS.playerActionsPerWeek) throw new Error('Only one diplomatic action is allowed per week.');
      diplomacy = applyDiplomaticCommand(diplomacy, command);
      continue;
    }
    if (command.type === 'set-military-order') {
      if (state.strategicLand) continue;
      validateMilitaryOrder({ ...state, divisions }, countryId, command.divisionId, command.order);
      divisions = divisions.map(division => division.id === command.divisionId ? { ...division, order: command.order } : division);
      continue;
    }
    const orderId = command.type === 'set-standing-order' ? command.order.id : command.orderId;
    const existing = orders.find(order => order.id === orderId);
    if (existing && existing.countryId !== player.id) throw new Error('Cannot change another country’s order.');

    if (command.type === 'set-standing-order') {
      if (existing) orders = orders.map(order => order.id === orderId ? command.order : order);
      else orders.push(command.order);
    } else {
      if (!existing) throw new Error('Cannot cancel an order that does not exist.');
      orders = orders.filter(order => order.id !== orderId);
    }
  }

  diplomacy = resolveAIDiplomacy(diplomacy, scenarioDiplomacy);
  if (!state.strategicLand && collective.length) throw new Error('Collective orders require strategic land rules.');
  if (state.strategicLand && collective.some(order => order.countryId !== player.id)) {
    throw new Error('Collective orders must belong to the selected player country.');
  }
  const converted = state.strategicLand ? commands.flatMap(command => command.type === 'set-military-order' ? [{
    id: command.divisionId, countryId: command.countryId, divisionIds: [command.divisionId], week: state.week,
    action: command.order,
  }] : []) : [];
  const military = state.strategicLand
    ? resolveStrategicLand(diplomacy, [...collective, ...converted])
    : resolveMilitary({ ...state, divisions });
  return { ...state, week: state.week + 1, standingOrders: orders, ...military,
    relations: diplomacy.relations, diplomaticMessages: diplomacy.diplomaticMessages };
}

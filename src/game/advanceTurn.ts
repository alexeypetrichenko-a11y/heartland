import type { GameState, TurnCommand } from './models.ts';
import { isEconomicPolicy, resolveWeeklyEconomy } from './economy.ts';
import { parseMilitaryOrder, resolveMilitary, validateMilitaryOrder } from './military.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Validate runtime input too, rather than relying on TypeScript at call sites. */
function validateCommand(value: unknown): TurnCommand {
  if (isRecord(value)) {
    if (value.type === 'set-military-order' && isText(value.countryId) && isText(value.divisionId)) {
      return { type: value.type, countryId: value.countryId, divisionId: value.divisionId, order: parseMilitaryOrder(value.order) };
    }
    if (value.type === 'set-economic-policy' && isText(value.countryId) && isEconomicPolicy(value.policy)) {
      return { type: value.type, countryId: value.countryId, policy: value.policy };
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
 * Placeholder orders persist without effects. Economic policy persists on each
 * country; policy commands apply before resolving every country's weekly budget.
 * Insufficient funds or invalid amounts reject the entire week, including commands.
 * Military commands are validated before settlement; military outcomes resolve
 * after budgets, within the same atomic turn.
 * No clock, randomness, React, storage or network access; the seed is untouched.
 */
export function advanceTurn(state: GameState, commands: readonly TurnCommand[] = []): GameState {
  const player = state.countries.find(country => country.id === state.playerCountryId);
  if (!player || player.controller !== 'player') {
    throw new Error('Select a player country before advancing a week.');
  }
  if (!Number.isSafeInteger(state.week) || state.week < 1 || state.week >= Number.MAX_SAFE_INTEGER) {
    throw new Error('Week must be a positive safe integer with room to advance.');
  }
  if (!Array.isArray(commands)) throw new Error('Turn commands must be an array.');

  let orders = state.standingOrders.map(order => ({ ...order }));
  let countries = state.countries.map(country => ({ ...country }));
  let divisions = state.divisions;
  for (const input of commands) {
    const command = validateCommand(input);
    const countryId = command.type === 'set-standing-order' ? command.order.countryId : command.countryId;
    if (countryId !== player.id) throw new Error('Commands must belong to the selected player country.');
    if (command.type === 'set-military-order') {
      validateMilitaryOrder({ ...state, divisions }, countryId, command.divisionId, command.order);
      divisions = divisions.map(division => division.id === command.divisionId ? { ...division, order: command.order } : division);
      continue;
    }
    if (command.type === 'set-economic-policy') {
      countries = countries.map(country => country.id === countryId ? { ...country, economicPolicy: command.policy } : country);
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

  // Fixed budgets also settle for AI-labeled countries; no AI decisions run.
  countries = countries.map(country => {
    try {
      return { ...country, economy: resolveWeeklyEconomy(country.economy, country.economicPolicy) };
    } catch (error) {
      throw new Error(`${country.name}: ${error instanceof Error ? error.message : 'Economic resolution failed.'} Week not advanced; no changes applied.`);
    }
  });
  const military = resolveMilitary({ ...state, divisions });
  return { ...state, week: state.week + 1, standingOrders: orders, countries, ...military };
}

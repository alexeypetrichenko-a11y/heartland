import type { EconomyEvent, EconomyState, StepOptions, TurnInput, TurnReport, TurnResult } from '../types.ts';
import { applyActions, compileTradePolicy, resolveInput } from './commands.ts';
import { planBudgets, settleFinances } from './finance.ts';
import { clearMarkets } from './market.ts';
import { getModel, getWorkspace } from './model.ts';
import { planPrivateSector } from './planning.ts';
import { updatePolitics } from './politics.ts';
import { adjust, develop, produce } from './production.ts';
import { getRoutes } from './routes.ts';
import { rebaseIfNeeded } from './rebase.ts';
import { cloneEconomy } from './state.ts';
import { captureStart, finishTurn } from './stats.ts';

/**
 * One week of the world economy.
 *
 * Order of events (fixed, so results are reproducible):
 *   1. inputs are validated, then external effects and commands are applied;
 *   2. governments plan budgets, borrow, service debt and pay transfers;
 *   3. firms and households decide what they want to make and buy;
 *   4. markets clear zone by zone, good by good, with trade between zones;
 *   5. firms produce with the inputs they obtained and pay wages and taxes;
 *   6. prices, wages, expectations and capacity adjust;
 *   7. public finances settle (repayment, default, interest rates, money rule);
 *   8. political stability reacts;
 *   9. population, technology and infrastructure drift;
 *  10. the week is audited, recorded in history and reported.
 *
 * There is no limit on the number of weeks.
 */

/**
 * Advance `state` by one week, changing it directly. Fast path for bulk
 * simulation. Inputs are validated before anything changes; if the optional
 * audit fails afterwards the state has already been modified, so callers who
 * need all-or-nothing behaviour should use `advanceEconomy`.
 */
export function advanceEconomyInPlace(state: EconomyState, input?: TurnInput, options: StepOptions = {}): TurnReport {
  if (!Number.isSafeInteger(state.turn) || state.turn < 0 || state.turn >= Number.MAX_SAFE_INTEGER) {
    throw new Error('Turn counter must be a non-negative safe integer with room to advance.');
  }
  const model = getModel(state.config);
  const actions = resolveInput(state, input);
  // Keep money amounts in a safe range however long the game has run (exact, see rebase.ts).
  rebaseIfNeeded(state);
  const w = getWorkspace(state);
  w.calibrating = options.calibration === true;
  const events: EconomyEvent[] = [];
  captureStart(state, w, model);
  applyActions(state, w, actions);
  compileTradePolicy(state, w);
  const routes = getRoutes(state);
  planBudgets(state, w, model, events);
  planPrivateSector(state, w, model);
  clearMarkets(state, w, model, routes, options.tradeDetail === true);
  produce(state, w, model);
  adjust(state, w, model);
  settleFinances(state, w, model, events);
  updatePolitics(state, w, events);
  develop(state, w, model);
  state.turn += 1;
  return finishTurn(state, w, model, options, events);
}

/**
 * Pure version: returns a new state and leaves the input untouched. If the
 * inputs are invalid (or an audit fails) it throws and nothing has changed,
 * which matches the atomic `advanceTurn` contract of the main game.
 */
export function advanceEconomy(state: EconomyState, input?: TurnInput, options: StepOptions = {}): TurnResult {
  const next = cloneEconomy(state);
  const report = advanceEconomyInPlace(next, input, options);
  return { state: next, report };
}

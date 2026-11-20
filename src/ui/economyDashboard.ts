import { calculateWeeklyBudget } from '../game/economy.ts';
import type { Country } from '../game/models';

/** A display-only record of the game state before the latest successful turn. */
export type EconomyWeekStart = {
  countryId: Country['id'];
  week: number;
  treasury: number;
};

/**
 * Read the current scenario's economic values. ECON-05 can supply the budget
 * and settled-week report from the same state that advances the game.
 */
export function readEconomyDashboard(country: Country, week: number, start: EconomyWeekStart | null) {
  const { treasury } = country.economy;
  return {
    treasury,
    weeklyBudget: calculateWeeklyBudget(country.economy, country.economicPolicy),
    lastWeek: start?.countryId === country.id && start.week === week - 1
      ? { week: start.week, openingTreasury: start.treasury, closingTreasury: treasury }
      : null,
  };
}

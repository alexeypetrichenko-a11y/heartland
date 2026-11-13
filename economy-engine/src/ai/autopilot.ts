import type { CountryId, EconomyCommand, EconomyState } from '../types.ts';

/**
 * Rule-based fiscal management for governments nobody is steering.
 *
 * This is deliberately simple and predictable: it keeps a budget roughly
 * balanced, tightens when debt or borrowing costs get dangerous, and spends a
 * little more on social support when the regime is under pressure and can
 * afford it. It is separate from the engine: it only reads a state and
 * returns ordinary commands, exactly as a player would issue them. There is
 * no randomness, no network access and no language model.
 *
 * All thresholds are provisional. The AI's national priorities are an open
 * design question (GAME_DESIGN.md section 17, item 6).
 */
export interface AutopilotRules {
  /** Weeks between reviews; governments do not change policy every week. */
  reviewWeeks: number;
  /** Deficit (share of GDP) tolerated before taxes move. */
  deficitTolerance: number;
  /** Debt-to-GDP above which the government consolidates regardless of the deficit. */
  debtCeiling: number;
  /** Debt-to-GDP the autopilot is comfortable carrying in the long run. */
  debtComfort: number;
  /** Deficit (share of GDP) accepted per unit of debt-to-GDP below the comfort level. */
  deficitPerDebtRoom: number;
  /** Borrowing rate that triggers consolidation. */
  rateAlarm: number;
  taxStepMin: number;
  taxStepMax: number;
  taxFloor: number;
  taxCeiling: number;
  /** Stability below which social spending is raised, if affordable. */
  unrestAlarm: number;
  socialStep: number;
  socialCeiling: number;
  /** Social spending the autopilot returns to in calm times. */
  socialNormal: number;
}

export const DEFAULT_AUTOPILOT_RULES: AutopilotRules = {
  reviewWeeks: 4,
  deficitTolerance: 0.005,
  debtCeiling: 0.9,
  debtComfort: 0.5,
  deficitPerDebtRoom: 0.03,
  rateAlarm: 0.08,
  taxStepMin: 0.001,
  taxStepMax: 0.01,
  taxFloor: 0.02,
  taxCeiling: 0.5,
  unrestAlarm: 50,
  socialStep: 0.003,
  socialCeiling: 0.2,
  socialNormal: 0.10,
};

/**
 * Commands the autopilot would issue this week for the given countries
 * (all countries when the list is omitted). Returns an empty list on weeks
 * without a policy review.
 */
export function autopilotCommands(
  state: EconomyState, countryIds?: readonly CountryId[], rules: AutopilotRules = DEFAULT_AUTOPILOT_RULES,
): EconomyCommand[] {
  const commands: EconomyCommand[] = [];
  if (state.turn % rules.reviewWeeks !== 0) return commands;
  const country = state.country;
  for (let c = 0; c < state.countries.length; c++) {
    const countryId = state.countries[c].id;
    if (countryIds && !countryIds.includes(countryId)) continue;
    const gdp = country.gdp[c];
    if (!(gdp > 0)) continue;
    const debtRatio = country.debt[c] / (52 * gdp);
    const deficit = country.deficit[c];
    const shutOut = country.marketAccess[c] !== 1;
    const tax = country.taxIncome[c];
    const maxTax = Math.min(rules.taxCeiling, state.config.params.maxTaxRate);

    // --- Income tax: steer the budget towards its target ---------------------
    // A government with little debt can afford a small standing deficit; one
    // above its comfort level aims for balance.
    const wanted = Math.max(0, rules.debtComfort - debtRatio) * rules.deficitPerDebtRoom;
    const gap = deficit - wanted;
    let change = 0;
    const step = Math.min(rules.taxStepMax, Math.max(rules.taxStepMin, Math.abs(gap) * 0.25));
    if (shutOut || debtRatio > rules.debtCeiling || country.marketRate[c] > rules.rateAlarm) {
      // Danger: consolidate unless the budget is already comfortably in surplus.
      if (deficit > -0.02) change = shutOut ? rules.taxStepMax : step;
    } else if (gap > rules.deficitTolerance) change = step;
    else if (gap < -rules.deficitTolerance) change = -step;
    const nextTax = Math.min(maxTax, Math.max(rules.taxFloor, tax + change));
    if (nextTax !== tax) commands.push({ type: 'set-tax', countryId, tax: 'income', rate: nextTax });

    // --- Social spending: a cushion against unrest, withdrawn in calm times --
    const social = country.spendSocial[c];
    const maxSocial = Math.min(rules.socialCeiling, state.config.params.maxSpendingShare);
    let nextSocial = social;
    if (country.stability[c] < rules.unrestAlarm && !shutOut && debtRatio < rules.debtCeiling) {
      nextSocial = Math.min(maxSocial, social + rules.socialStep);
    } else if (country.stability[c] > rules.unrestAlarm + 10 && social > rules.socialNormal) {
      nextSocial = Math.max(rules.socialNormal, social - rules.socialStep);
    }
    if (nextSocial !== social) commands.push({ type: 'set-spending', countryId, category: 'social', share: nextSocial });
  }
  return commands;
}

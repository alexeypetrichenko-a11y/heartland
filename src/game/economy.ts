import type { EconomicPolicy, Economy } from './models.ts';

/** T06 demo parameters only, not approved fiscal balance or real currency. */
export const ECONOMIC_POLICIES = {
  standard: { label: 'Standard taxation', incomeReduction: 0 },
  'tax-relief': { label: 'Tax relief', incomeReduction: 6 },
} as const;

export function isEconomicPolicy(value: unknown): value is EconomicPolicy {
  return value === 'standard' || value === 'tax-relief';
}

/**
 * Provisional weekly budget: income = max(0, base income - policy reduction).
 * Expenses stay fixed; all amounts are nonnegative whole illustrative units.
 * Base income is never overwritten, so the reduction cannot compound.
 */
export function calculateWeeklyBudget(economy: Economy, policy: EconomicPolicy) {
  if (!isEconomicPolicy(policy)) throw new Error('Invalid economic policy.');
  for (const value of [economy.treasury, economy.weeklyIncome, economy.weeklyExpenses]) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error('Economic amounts must be nonnegative safe integers.');
    }
  }
  const income = Math.max(0, economy.weeklyIncome - ECONOMIC_POLICIES[policy].incomeReduction);
  const expenses = economy.weeklyExpenses;
  return { income, expenses, balance: income - expenses };
}

/** Collect income, pay expenses, or reject explicitly; no borrowing or unpaid bills. */
export function resolveWeeklyEconomy(economy: Economy, policy: EconomicPolicy): Economy {
  const { income, expenses, balance } = calculateWeeklyBudget(economy, policy);
  const treasury = economy.treasury + balance;
  if (treasury < 0) {
    throw new Error(`Insufficient funds: treasury ${economy.treasury} + income ${income} cannot cover expenses ${expenses} (shortfall ${-treasury}).`);
  }
  if (!Number.isSafeInteger(treasury)) throw new Error('Treasury exceeds the safe integer limit.');
  return { ...economy, treasury };
}

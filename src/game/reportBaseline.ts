import type { CountryEconomyView } from '../../economy-engine/src/integration/index.ts';
import { isSaveObject } from './saveValidation.ts';

const indicators = ['gdpReal', 'inflation', 'unemployment', 'stability', 'debt', 'debtToGdp'] as const satisfies readonly (keyof CountryEconomyView)[];
const budgetLines = ['balance', 'revenue', 'expenditure'] as const satisfies readonly (keyof CountryEconomyView['budget'])[];
const taxes = ['income', 'consumption', 'corporate'] as const satisfies readonly (keyof CountryEconomyView['fiscal']['taxes'])[];
const spending = ['administration', 'social', 'military', 'infrastructure'] as const satisfies readonly (keyof CountryEconomyView['fiscal']['spending'])[];

/** Only the prior observations needed to compare the latest report's figures. */
export type ReportBaseline = Partial<Pick<CountryEconomyView, typeof indicators[number] | 'regionIds'>> & {
  budget?: Partial<Pick<CountryEconomyView['budget'], typeof budgetLines[number]>>;
  fiscal?: {
    taxes?: Partial<CountryEconomyView['fiscal']['taxes']>;
    spending?: Partial<CountryEconomyView['fiscal']['spending']>;
  };
};

function finiteFields<K extends string>(value: unknown, keys: readonly K[]): Partial<Record<K, number>> {
  const fields: Partial<Record<K, number>> = {};
  if (!isSaveObject(value)) return fields;
  for (const key of keys) {
    const field = value[key];
    if (typeof field === 'number' && Number.isFinite(field)) fields[key] = field;
  }
  return fields;
}

/** Project the official view, or validate the optional comparison data in a save. */
export function reportBaseline(value: unknown): ReportBaseline {
  if (!isSaveObject(value)) return {};
  const result: ReportBaseline = finiteFields(value, indicators);
  const budget = finiteFields(value.budget, budgetLines);
  if (Object.keys(budget).length) result.budget = budget;
  if (Array.isArray(value.regionIds) && value.regionIds.every(id => typeof id === 'string')) result.regionIds = value.regionIds;
  if (isSaveObject(value.fiscal)) {
    const taxRates = finiteFields(value.fiscal.taxes, taxes);
    const spendingShares = finiteFields(value.fiscal.spending, spending);
    if (Object.keys(taxRates).length || Object.keys(spendingShares).length) {
      result.fiscal = { taxes: taxRates, spending: spendingShares };
    }
  }
  return result;
}

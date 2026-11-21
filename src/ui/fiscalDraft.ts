import type { SpendingCategory, TaxKind } from '../../economy-engine/src/integration/index.ts';
import type { EconomyRuntime, EconomySnapshot } from '../game/economyBridge.ts';

export type FiscalApi = Pick<EconomyRuntime['api'], 'fiscalLimits' | 'fiscalCommands' | 'checkEconomyCommands'>;
export type FiscalField = TaxKind | SpendingCategory;
export type FiscalDraft = Partial<Record<FiscalField, string>>;

const TAX_LABELS = {
  income: 'Income tax', consumption: 'Consumption tax', corporate: 'Corporate profit tax',
} satisfies Record<TaxKind, string>;
const SPENDING_LABELS = {
  administration: 'Administration', social: 'Social spending', military: 'Military spending',
  infrastructure: 'Infrastructure investment',
} satisfies Record<SpendingCategory, string>;

const percent = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 4 });
export const formatFiscalPercent = (rate: number) => percent.format(rate);

function readPercent(text: string): number | undefined {
  const value = text.trim();
  if (!value) return undefined;
  if (!/^-?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(value)) return NaN;
  // Parse the decimal directly as a fraction to avoid rounding twice at conversion.
  return Number(value.replace(',', '.') + 'e-2');
}

function draftGroup<K extends FiscalField>(labels: Record<K, string>, current: Record<K, number>, draft: FiscalDraft) {
  const changes: Partial<Record<K, number>> = {};
  const fields = (Object.keys(labels) as K[]).map(key => {
    const proposed = draft[key] ?? '';
    const value = readPercent(proposed);
    const pending = value !== undefined && value !== current[key];
    if (pending) changes[key] = value;
    return { key, label: labels[key], current: current[key], proposed, pending };
  });
  return { fields, changes };
}

/** Translate typed percentages into the engine's commands for the active player. */
export function reviewFiscalDraft(api: FiscalApi, economy: EconomySnapshot, draft: FiscalDraft) {
  const playerId = economy.session.playerCountryId;
  if (!playerId || playerId !== economy.player.countryId) return null;
  const { fiscal } = economy.player;
  const taxes = draftGroup(TAX_LABELS, fiscal.taxes, draft);
  const spending = draftGroup(SPENDING_LABELS, fiscal.spending, draft);
  const limits = api.fiscalLimits(economy.session);
  const commands = api.fiscalCommands(playerId, { taxes: taxes.changes, spending: spending.changes });
  const error = commands.length ? api.checkEconomyCommands(economy.session, commands) : null;
  const fieldErrors: Partial<Record<FiscalField, string>> = {};
  if (error) {
    for (const command of commands) {
      if (command.type !== 'set-tax' && command.type !== 'set-spending') continue;
      const problem = api.checkEconomyCommands(economy.session, [command]);
      if (problem) fieldErrors[command.type === 'set-tax' ? command.tax : command.category] = problem;
    }
  }
  return {
    groups: [
      { id: 'taxes', label: 'Taxes', maximum: limits.maxTaxRate, fields: taxes.fields },
      { id: 'spending', label: 'Government spending', maximum: limits.maxSpendingShare, fields: spending.fields },
    ],
    commands, error, fieldErrors,
  };
}

export type FiscalReview = NonNullable<ReturnType<typeof reviewFiscalDraft>>;

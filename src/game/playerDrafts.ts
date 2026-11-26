import type { CollectiveOrder } from './strategicLand.ts';
import type { SpendingCategory, TaxKind } from '../../economy-engine/src/integration/index.ts';
import type { DiplomaticCommand, MilitaryCommand } from './models.ts';

export type FiscalDraft = Partial<Record<TaxKind | SpendingCategory, string>>;

export interface PlayerDrafts {
  military: MilitaryCommand[];
  collective?: CollectiveOrder[];
  diplomacy: DiplomaticCommand | null;
  fiscal: FiscalDraft;
}

export function emptyDrafts(): PlayerDrafts {
  return { military: [], diplomacy: null, fiscal: {} };
}

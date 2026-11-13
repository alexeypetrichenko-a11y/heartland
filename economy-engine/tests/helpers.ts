import type { CountryId, EconomyCommand, EconomyState, ExternalEffect, TurnInput, TurnReport } from '../src/index.ts';
import { advanceEconomyInPlace, cloneEconomy, createEconomy, createTestWorldSpec, hashEconomy } from '../src/index.ts';

let cached: EconomyState | null = null;

/** Fresh independent copy of the calibrated Meridian test world (built once per process). */
export function world(): EconomyState {
  cached ??= createEconomy(createTestWorldSpec());
  return cloneEconomy(cached);
}

export function idx(state: EconomyState, id: CountryId): number {
  const index = state.countries.findIndex(country => country.id === id);
  if (index < 0) throw new Error(`no country ${id}`);
  return index;
}
export function zoneIdx(state: EconomyState, id: string): number {
  const index = state.zones.findIndex(zone => zone.id === id);
  if (index < 0) throw new Error(`no zone ${id}`);
  return index;
}
export function goodIdx(state: EconomyState, id: string): number {
  return state.config.goods.findIndex(good => good.id === id);
}

/** Advance `weeks` weeks with the audit on; `script` may supply input per week (1-based). */
export function advance(state: EconomyState, weeks: number, script?: (week: number) => TurnInput | undefined,
  onReport?: (report: TurnReport, week: number) => void, report: 'full' | 'none' = 'none'): void {
  for (let week = 1; week <= weeks; week++) {
    const result = advanceEconomyInPlace(state, script?.(week), { audit: true, report: onReport ? 'full' : report, tradeDetail: false });
    onReport?.(result, week);
  }
}

export function once(state: EconomyState, input?: TurnInput, tradeDetail = false): TurnReport {
  return advanceEconomyInPlace(state, input, { audit: true, report: 'full', tradeDetail });
}

export const at = (week: number, input: TurnInput) => (w: number) => (w === week ? input : undefined);
export const commands = (...list: EconomyCommand[]): TurnInput => ({ commands: list });
export const effects = (...list: ExternalEffect[]): TurnInput => ({ effects: list });

/** Total trade flow (quantity) per "fromCountry>toCountry" key for one good over a run. */
export function tradeFlows(state: EconomyState, goodId: string, weeks: number, script?: (week: number) => TurnInput | undefined): Map<string, number> {
  const flows = new Map<string, number>();
  const owner = new Map<string, string>();
  for (let z = 0; z < state.zones.length; z++) owner.set(state.zones[z].id, state.countries[state.zone.owner[z]].id);
  for (let week = 1; week <= weeks; week++) {
    const report = advanceEconomyInPlace(state, script?.(week), { audit: true, report: 'full', tradeDetail: true });
    for (const flow of report.trade ?? []) {
      if (flow.goodId !== goodId) continue;
      const key = `${owner.get(flow.fromZoneId)}>${owner.get(flow.toZoneId)}`;
      flows.set(key, (flows.get(key) ?? 0) + flow.quantity);
    }
  }
  return flows;
}
export function flow(flows: Map<string, number>, from: string, to: string): number {
  return flows.get(`${from}>${to}`) ?? 0;
}

export const fingerprint = hashEconomy;

/** Every numeric array in a state, for blanket checks. */
export function allNumbers(state: EconomyState): number[] {
  const out: number[] = [...state.bonds];
  for (const group of [state.zone, state.zoneGood, state.country, state.countryGood, state.lanes] as unknown as Record<string, unknown>[]) {
    for (const key of Object.keys(group)) {
      const value = group[key];
      if (Array.isArray(value) && value.every(item => typeof item === 'number')) out.push(...value);
    }
  }
  return out;
}

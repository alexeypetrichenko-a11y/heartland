import type { EconomyState, ReserveMode, TurnInput } from '../types.ts';
import type { Workspace } from './model.ts';
import { getModel } from './model.ts';

/**
 * Runtime validation and application of turn inputs.
 *
 * Inputs are checked completely before anything is applied, so a rejected
 * batch never leaves a half-changed state. The engine does not decide who is
 * allowed to command a country: the host game must check ownership first.
 */

type Action = (state: EconomyState, w: Workspace) => void;

const RESERVE_MODES: readonly ReserveMode[] = ['automatic', 'hold', 'release', 'fill'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function indexOfId(list: readonly { id: string }[], id: unknown, label: string): number {
  if (typeof id === 'string') {
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return i;
  }
  throw new Error(`Unknown ${label}: ${String(id)}.`);
}

function numberIn(value: unknown, low: number, high: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high) {
    throw new Error(`${label} must be a number from ${low} to ${high}.`);
  }
  return value;
}

function flag(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be true or false.`);
  return value;
}

function goodSelection(state: EconomyState, value: unknown, tradableOnly: boolean): number[] {
  const goods = state.config.goods;
  if (value === 'all') {
    const all: number[] = [];
    goods.forEach((good, index) => { if (!tradableOnly || good.tradable) all.push(index); });
    return all;
  }
  const list = Array.isArray(value) ? value : [value];
  if (list.length === 0) throw new Error('Select at least one good.');
  const result: number[] = [];
  for (const id of list) {
    const index = indexOfId(goods, id, 'good');
    if (tradableOnly && !goods[index].tradable) throw new Error(`${goods[index].name} is not traded between zones.`);
    if (!result.includes(index)) result.push(index);
  }
  return result;
}

function resolveCommand(state: EconomyState, input: unknown): Action {
  if (!isRecord(input)) throw new Error('Invalid economy command.');
  const params = state.config.params;
  const G = state.config.goods.length;
  const c = indexOfId(state.countries, input.countryId, 'country');
  switch (input.type) {
    case 'set-tax': {
      const rate = numberIn(input.rate, 0, params.maxTaxRate, 'Tax rate');
      const tax = input.tax;
      if (tax !== 'income' && tax !== 'consumption' && tax !== 'corporate') throw new Error('Unknown tax.');
      return s => {
        if (tax === 'income') s.country.taxIncome[c] = rate;
        else if (tax === 'consumption') s.country.taxConsumption[c] = rate;
        else s.country.taxCorporate[c] = rate;
      };
    }
    case 'set-spending': {
      const share = numberIn(input.share, 0, params.maxSpendingShare, 'Spending share');
      const category = input.category;
      if (category !== 'administration' && category !== 'social' && category !== 'military' && category !== 'infrastructure') {
        throw new Error('Unknown spending category.');
      }
      return s => {
        if (category === 'administration') s.country.spendAdministration[c] = share;
        else if (category === 'social') s.country.spendSocial[c] = share;
        else if (category === 'military') s.country.spendMilitary[c] = share;
        else s.country.spendInfrastructure[c] = share;
      };
    }
    case 'set-tariff': {
      const g = indexOfId(state.config.goods, input.goodId, 'good');
      if (input.partnerId === undefined) {
        const rate = numberIn(input.rate, 0, params.maxTariff, 'Tariff');
        return s => { s.countryGood.tariff[c * G + g] = rate; };
      }
      const partner = indexOfId(state.countries, input.partnerId, 'country');
      if (partner === c) throw new Error('A tariff exception needs another country.');
      const rate = input.rate === null ? null : numberIn(input.rate, 0, params.maxTariff, 'Tariff');
      return s => {
        s.tariffOverrides = s.tariffOverrides.filter(entry => !(entry.imposer === c && entry.target === partner && entry.good === g));
        if (rate !== null) s.tariffOverrides.push({ imposer: c, target: partner, good: g, rate });
        s.tariffOverrides.sort((a, b) => (a.imposer - b.imposer) || (a.target - b.target) || (a.good - b.good));
      };
    }
    case 'set-sanction': {
      const target = indexOfId(state.countries, input.targetId, 'country');
      if (target === c) throw new Error('A country cannot sanction itself.');
      const goods = goodSelection(state, input.goodIds, true);
      const imports = flag(input.imports, 'imports');
      const exports = flag(input.exports, 'exports');
      return s => {
        s.sanctions = s.sanctions.filter(entry => !(entry.imposer === c && entry.target === target && goods.includes(entry.good)));
        if (imports || exports) for (const good of goods) s.sanctions.push({ imposer: c, target, good, imports, exports });
        s.sanctions.sort((a, b) => (a.imposer - b.imposer) || (a.target - b.target) || (a.good - b.good));
      };
    }
    case 'set-reserve': {
      const g = indexOfId(state.config.goods, input.goodId, 'good');
      if (state.config.goods[g].spoilage >= 1) throw new Error(`${state.config.goods[g].name} cannot be stored.`);
      const weeks = numberIn(input.targetWeeks, 0, params.maxReserveWeeks, 'Reserve target');
      const mode = input.mode === undefined ? -1 : RESERVE_MODES.indexOf(input.mode as ReserveMode);
      if (input.mode !== undefined && mode < 0) throw new Error('Unknown reserve mode.');
      return s => {
        s.countryGood.reserveTargetWeeks[c * G + g] = weeks;
        if (mode >= 0) s.countryGood.reserveMode[c * G + g] = mode;
      };
    }
    case 'set-borrowing': {
      const enabled = flag(input.enabled, 'enabled');
      return s => { s.country.autoBorrow[c] = enabled ? 1 : 0; };
    }
    case 'set-procurement-priority': {
      const enabled = flag(input.enabled, 'enabled');
      return s => { s.country.governmentPriority[c] = enabled ? 1 : 0; };
    }
    case 'repay-debt': {
      const amount = numberIn(input.amount, 0, Number.MAX_VALUE, 'Repayment');
      return (_s, w) => { w.extraRepayment[c] += amount; };
    }
    case 'declare-default':
      return (_s, w) => { w.defaultRequested[c] = 1; };
    default:
      throw new Error(`Unknown economy command: ${String(input.type)}.`);
  }
}

function resolveEffect(state: EconomyState, input: unknown): Action {
  if (!isRecord(input)) throw new Error('Invalid external effect.');
  const G = state.config.goods.length;
  const params = state.config.params;
  switch (input.type) {
    case 'production-shock': {
      const z = indexOfId(state.zones, input.zoneId, 'zone');
      const g = indexOfId(state.config.goods, input.goodId, 'good');
      const factor = numberIn(input.factor, 0, 10, 'Shock factor');
      const weeks = numberIn(input.recoveryWeeks, 0, 1e6, 'Recovery weeks');
      return s => {
        // Shocks stack multiplicatively; the most recent one sets the recovery speed.
        s.zoneGood.yieldFactor[z * G + g] = Math.min(10, s.zoneGood.yieldFactor[z * G + g] * factor);
        s.zoneGood.yieldRecovery[z * G + g] = weeks > 0 ? Math.min(1, 1 / weeks) : 0;
      };
    }
    case 'destroy-capacity':
    case 'destroy-stock': {
      const z = indexOfId(state.zones, input.zoneId, 'zone');
      const goods = goodSelection(state, input.goodId, false);
      const keep = 1 - numberIn(input.fraction, 0, 1, 'Fraction');
      if (input.type === 'destroy-capacity') {
        return s => { for (const g of goods) s.zoneGood.capacity[z * G + g] *= keep; };
      }
      return (s, w) => {
        for (const g of goods) {
          const index = z * G + g;
          const lost = (s.zoneGood.stock[index] + s.zoneGood.inputBuffer[index]) * (1 - keep);
          s.zoneGood.stock[index] *= keep;
          s.zoneGood.inputBuffer[index] *= keep;
          w.ledgerDestroyed[g] += lost;
        }
      };
    }
    case 'set-lane': {
      const lane = state.lanes.id.indexOf(input.laneId as string);
      if (lane < 0) throw new Error(`Unknown lane: ${String(input.laneId)}.`);
      const cost = numberIn(input.costMultiplier, 0.1, 100, 'Cost multiplier');
      const throughput = numberIn(input.throughput, 0, 1, 'Throughput');
      return s => { s.lanes.costMultiplier[lane] = cost; s.lanes.throughput[lane] = throughput; };
    }
    case 'transfer-zone': {
      const z = indexOfId(state.zones, input.zoneId, 'zone');
      const owner = indexOfId(state.countries, input.ownerId, 'country');
      return s => { s.zone.owner[z] = owner; };
    }
    case 'set-mobilization': {
      const z = indexOfId(state.zones, input.zoneId, 'zone');
      const personnel = numberIn(input.personnel, 0, Number.MAX_VALUE, 'Personnel');
      return s => { s.zone.mobilized[z] = Math.min(personnel, s.zone.population[z] * params.laborParticipation * 0.9); };
    }
    case 'military-procurement': {
      const c = indexOfId(state.countries, input.countryId, 'country');
      const g = indexOfId(state.config.goods, input.goodId, 'good');
      const quantity = numberIn(input.quantity, 0, Number.MAX_VALUE, 'Quantity');
      return (_s, w) => { w.procurement[c * G + g] += quantity; };
    }
    case 'stability-modifier': {
      const c = indexOfId(state.countries, input.countryId, 'country');
      const value = numberIn(input.value, -100, 100, 'Stability modifier');
      return s => { s.country.stabilityModifier[c] = value; };
    }
    case 'transfer-funds': {
      const from = indexOfId(state.countries, input.fromCountryId, 'country');
      const to = indexOfId(state.countries, input.toCountryId, 'country');
      if (from === to) throw new Error('Funds must move between two different countries.');
      const amount = numberIn(input.amount, 0, Number.MAX_VALUE, 'Amount');
      return (s, w) => {
        // A treasury cannot go negative: send what is actually available.
        const sent = Math.min(amount, s.country.treasury[from]);
        s.country.treasury[from] -= sent;
        s.country.treasury[to] += sent;
        w.spentFunds[from] += sent;
        w.revenueFunds[to] += sent;
      };
    }
    default:
      throw new Error(`Unknown external effect: ${String(input.type)}.`);
  }
}

/** Validate every command and effect. Throws before anything is changed. */
export function resolveInput(state: EconomyState, input: TurnInput | undefined): Action[] {
  const actions: Action[] = [];
  if (input === undefined) return actions;
  if (!isRecord(input)) throw new Error('Turn input must be an object.');
  const commands = input.commands ?? [];
  const effects = input.effects ?? [];
  if (!Array.isArray(commands) || !Array.isArray(effects)) throw new Error('Commands and effects must be arrays.');
  // External facts (war damage, captured zones) apply before government decisions.
  for (const effect of effects) actions.push(resolveEffect(state, effect));
  for (const command of commands) actions.push(resolveCommand(state, command));
  return actions;
}

export function applyActions(state: EconomyState, w: Workspace, actions: readonly Action[]): void {
  for (const action of actions) action(state, w);
}

/**
 * Compile sanctions and tariffs into per-pair tables for the market.
 * blocked[(buyer * C + seller) * G + good] is 1 when the buyer country may not
 * buy that good from the seller country, whichever side imposed the ban.
 */
export function compileTradePolicy(state: EconomyState, w: Workspace): void {
  const C = state.countries.length;
  const G = getModel(state.config).goodCount;
  const tariff = state.countryGood.tariff;
  for (let buyer = 0; buyer < C; buyer++) {
    for (let seller = 0; seller < C; seller++) {
      const base = (buyer * C + seller) * G;
      for (let g = 0; g < G; g++) w.tariff[base + g] = buyer === seller ? 0 : tariff[buyer * G + g];
    }
  }
  for (const entry of state.tariffOverrides) {
    w.tariff[(entry.imposer * C + entry.target) * G + entry.good] = entry.rate;
  }
  for (const entry of state.sanctions) {
    if (entry.imports) w.blocked[(entry.imposer * C + entry.target) * G + entry.good] = 1;
    if (entry.exports) w.blocked[(entry.target * C + entry.imposer) * G + entry.good] = 1;
  }
}

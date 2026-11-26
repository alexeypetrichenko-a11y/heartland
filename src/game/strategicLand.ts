import { parseMilitaryOrder, validateMilitaryOrder } from './military.ts';
import type { Division, GameState, MilitaryOrder } from './models.ts';

export const STRATEGIC_LAND = 'strategic-land-v1';
export const LAND_RULES = {
  baseLoss: 300, maxLoss: 600, defence: 115, retreat: 80, pace: 45, breakthrough: 100,
  screening: 25, clashRounds: 8, blockedWeeks: 3, encircledWeeks: 2, recoveryWeeks: 1,
} as const;

export type CollectiveAction = MilitaryOrder
  | { kind: 'reinforce'; engagementId: string }
  | { kind: 'disengage'; fallbackRegionId?: string };

export interface CollectiveOrder {
  id: string;
  countryId: string;
  divisionIds: string[];
  week: number;
  action: CollectiveAction;
}

interface Readiness {
  baseline: number;
  eligibleWeek: number;
  prisoners: number;
}

interface Front {
  id: string;
  kind: 'assault' | 'clash';
  target: string;
  countries: [string, string];
  sides: [string[], string[]];
  progress: number;
  rounds: number;
  blocked: [number, number];
  enclosed: Record<string, number>;
  suspended?: number;
}

interface LandEvent {
  countryId: string;
  regionId?: string;
  divisionId?: string;
  kind: 'loss' | 'prisoners' | 'retreat' | 'capture' | 'moved' | 'suspended' | 'blocked' | 'rejected' | 'contested';
  amount?: number;
  reason?: string;
}

export interface StrategicLand {
  rules: typeof STRATEGIC_LAND;
  readiness: Record<string, Readiness>;
  fronts: Front[];
  events: LandEvent[];
}

type LandPlacement = (division: Division) => boolean;
const onLand: LandPlacement = () => true;
const frontId = (target: string, attacker: string, defender: string, source?: string) =>
  JSON.stringify([target, attacker, defender, source ?? null]);

export function startStrategicLand(game: GameState): GameState {
  if (game.week !== 1 || game.strategicLand) throw new Error('Strategic land rules require a new match.');
  return {
    ...game,
    strategicLand: {
      rules: STRATEGIC_LAND, fronts: [], events: [],
      readiness: Object.fromEntries(game.divisions.map(d => [d.id, { baseline: d.manpower, eligibleWeek: 1, prisoners: 0 }])),
    },
  };
}

export function collectiveReasons(game: GameState, order: CollectiveOrder, present = onLand) {
  if (!game.strategicLand || order.week !== game.week || !order.id.trim() || !order.divisionIds.length) {
    throw new Error('Invalid collective order or execution week.');
  }
  const land = game.strategicLand;
  const action = order.action;
  if (action.kind !== 'reinforce' && action.kind !== 'disengage') parseMilitaryOrder(action);
  return order.divisionIds.flatMap(divisionId => {
    const unit = game.divisions.find(d => d.id === divisionId);
    let reason: string | undefined;
    try {
      if (!unit || unit.ownerId !== order.countryId || !unit.manpower || !present(unit)) throw new Error('Division is unavailable.');
      if (order.divisionIds.indexOf(divisionId) !== order.divisionIds.lastIndexOf(divisionId)) throw new Error('Division is selected more than once.');
      const membership = land.fronts.find(f => f.sides.some(side => side.includes(divisionId)));
      const readiness = land.readiness[divisionId];
      if (action.kind === 'attack' || action.kind === 'reinforce') {
        if (game.week < readiness.eligibleWeek || unit.manpower * 100 <= readiness.baseline * LAND_RULES.retreat) {
          throw new Error('Division is recovering or depleted.');
        }
      }
      if (action.kind === 'disengage' || action.kind === 'defend' && membership) {
        if (!membership && game.regions.some(r => r.id === unit.regionId && r.ownerId === unit.ownerId)) {
          throw new Error('Division has no active engagement and is already in a friendly region.');
        }
        if (action.kind === 'disengage' && action.fallbackRegionId !== undefined) {
          const origin = game.regions.find(r => r.id === unit.regionId);
          if (!origin?.adjacentRegionIds.includes(action.fallbackRegionId)
            || !game.regions.some(r => r.id === action.fallbackRegionId && r.ownerId === unit.ownerId)) {
            throw new Error('Fallback must be a neighboring friendly region.');
          }
        }
      } else {
        if (membership) throw new Error('Disengage before selecting a new operation.');
        if (action.kind === 'reinforce') {
          const front = land.fronts.find(f => f.id === action.engagementId && f.kind === 'assault' && f.suspended === undefined);
          if (!front || !front.countries.includes(unit.ownerId)) throw new Error('Engagement is unavailable.');
          validateMilitaryOrder(game, unit.ownerId, unit.id, {
            kind: front.countries[0] === unit.ownerId ? 'attack' : 'move', targetRegionId: front.target,
          });
        } else validateMilitaryOrder(game, unit.ownerId, unit.id, action);
      }
    } catch (error) {
      reason = (error as Error).message;
    }
    return reason ? [{ divisionId, reason }] : [];
  });
}

export function stageCollective(game: GameState, drafts: readonly CollectiveOrder[], order: CollectiveOrder, present = onLand) {
  const reasons = collectiveReasons(game, order, present);
  if (reasons.length) return { drafts, reasons };
  const conflicts = drafts.filter(existing => existing.countryId === order.countryId &&
    (existing.id === order.id || existing.divisionIds.some(id => order.divisionIds.includes(id))));
  return {
    drafts: [...drafts.filter(d => !conflicts.includes(d)), structuredClone(order)],
    reasons, replaced: conflicts.map(d => d.id),
  };
}

export function militarySelection(game: GameState, viewer: string, ids: readonly string[], present = onLand) {
  const land = game.strategicLand;
  return game.divisions.filter(d => d.ownerId === viewer && ids.includes(d.id)).map(d => {
    const engagement = land?.fronts.find(f => f.sides.some(side => side.includes(d.id)));
    const readiness = land?.readiness[d.id];
    return {
      id: d.id, regionId: present(d) ? d.regionId : null, strength: d.manpower,
      status: readiness?.prisoners ? 'surrendered' : !present(d) ? 'in-transit' :
        engagement ? engagement.suspended === undefined ? 'engaged' : 'suspended' :
        game.regions.some(region => region.id === d.regionId && region.ownerId !== d.ownerId) ? 'displaced' :
        readiness && readiness.eligibleWeek > game.week ? 'recovering' :
        readiness && d.manpower * 100 <= readiness.baseline * LAND_RULES.retreat ? 'depleted' : 'available',
      engagementId: engagement?.id, destination: engagement?.target, executionWeek: game.week,
    };
  });
}

/** Authorized preview shared by future map and Military menu callers. */
export function collectivePreview(game: GameState, viewer: string, order: CollectiveOrder, present = onLand) {
  if (order.countryId !== viewer) throw new Error('Cannot preview another country’s orders.');
  const selected = militarySelection(game, viewer, order.divisionIds, present);
  const { action } = order;
  return {
    selected, count: order.divisionIds.length,
    strength: selected.reduce((total, unit) => total + unit.strength, 0),
    origins: [...new Set(selected.flatMap(unit => unit.regionId === null ? [] : [unit.regionId]))].sort(),
    destination: action.kind === 'move' || action.kind === 'attack' ? action.targetRegionId :
      action.kind === 'disengage' ? action.fallbackRegionId :
      action.kind === 'reinforce' ? game.strategicLand?.fronts.find(front =>
        front.id === action.engagementId && front.countries.includes(viewer))?.target : undefined,
    executionWeek: order.week, reasons: collectiveReasons(game, order, present),
  };
}

export function militaryEvents(game: GameState, viewer: string) {
  return game.strategicLand?.events.filter(event => event.countryId === viewer) ?? [];
}

function zeroPair(): [number, number] { return [0, 0]; }

export function resolveStrategicLand(game: GameState, bundles: readonly CollectiveOrder[], present = onLand) {
  if (game.strategicLand?.rules !== STRATEGIC_LAND) throw new Error('Strategic land rules are unavailable.');
  const land = structuredClone(game.strategicLand);
  land.events = [];
  const divisions = game.divisions.map(d => ({ ...d }));
  const regions = game.regions.map(r => ({ ...r }));
  const units = new Map(divisions.filter(d => d.manpower > 0 && present(d)).map(d => [d.id, d]));
  const areas = new Map(game.regions.map(r => [r.id, r]));
  const intents = new Map<string, CollectiveAction>();
  const requests = new Map<string, number>();
  for (const bundle of bundles) for (const id of new Set(bundle.divisionIds)) requests.set(id, (requests.get(id) ?? 0) + 1);
  for (const bundle of bundles) {
    const failures = collectiveReasons(game, bundle, present);
    for (const id of bundle.divisionIds) {
      if ((requests.get(id) ?? 0) > 1) failures.push({ divisionId: id, reason: 'Conflicting collective orders.' });
    }
    if (failures.length) {
      for (const failure of failures) land.events.push({
        countryId: bundle.countryId, kind: 'rejected', reason: failure.reason,
        ...(game.divisions.some(unit => unit.id === failure.divisionId && unit.ownerId === bundle.countryId)
          ? { divisionId: failure.divisionId } : {}),
      });
    } else {
      for (const id of bundle.divisionIds) intents.set(id, bundle.action);
    }
  }

  const contested = new Set(land.fronts.filter(f => f.suspended === undefined).map(f => f.target));
  for (const intent of intents.values()) if (intent.kind === 'attack') contested.add(intent.targetRegionId);
  function fallback(unit: Division, attacker: boolean, preferred?: string) {
    const origin = areas.get(unit.regionId);
    const choices = [
      ...(attacker ? [unit.regionId] : []),
      ...(origin?.adjacentRegionIds ?? []).filter(id => id !== unit.regionId).sort(),
    ].filter(id => areas.get(id)?.ownerId === unit.ownerId);
    if (preferred && choices.includes(preferred)) choices.unshift(preferred);
    return { exists: choices.length > 0, destination: choices.find(id => !contested.has(id)) };
  }

  const reserved = new Set<string>();
  function retreat(unit: Division, destination: string) {
    unit.regionId = destination;
    unit.order = { kind: 'defend' };
    land.readiness[unit.id].eligibleWeek = game.week + LAND_RULES.recoveryWeeks + 1;
    reserved.add(unit.id);
    land.events.push({ kind: 'retreat', countryId: unit.ownerId, regionId: destination, divisionId: unit.id });
  }

  for (const front of land.fronts) {
    for (const side of [0, 1] as const) {
      front.sides[side] = front.sides[side].filter(id => {
        const unit = units.get(id);
        if (!unit) {
          delete front.enclosed[id];
          return false;
        }
        const intent = intents.get(id);
        const withdrawing = intent?.kind === 'disengage' ||
          intent?.kind === 'defend' && (side === 0 || front.kind === 'clash');
        if (withdrawing) {
          const route = fallback(unit, side === 0 || front.kind === 'clash',
            intent.kind === 'disengage' ? intent.fallbackRegionId : undefined);
          if (route.destination) {
            retreat(unit, route.destination);
            delete front.enclosed[id];
            return false;
          }
          land.events.push({ kind: 'blocked', countryId: unit.ownerId, divisionId: id });
        }
        reserved.add(id);
        return true;
      });
    }
  }

  for (const [id, intent] of intents) {
    if (intent.kind !== 'disengage' || reserved.has(id)) continue;
    const unit = units.get(id)!;
    const route = fallback(unit, false, intent.fallbackRegionId);
    if (route.destination) retreat(unit, route.destination);
    else land.events.push({ kind: 'blocked', countryId: unit.ownerId, divisionId: id });
  }

  const makeFront = (target: string, attacker: string, defender: string, source?: string): Front => ({
    id: frontId(target, attacker, defender, source), kind: source === undefined ? 'assault' : 'clash',
    target, countries: [attacker, defender], sides: [[], []], progress: 0, rounds: 0,
    blocked: zeroPair(), enclosed: {},
  });
  const assault = new Map(land.fronts.filter(f => f.kind === 'assault').map(f => [f.target, f]));
  const outgoing = new Map<string, { target: string; source: string; ids: string[] }>();
  for (const [id, intent] of intents) {
    if (reserved.has(id)) continue;
    const unit = units.get(id)!;
    if (intent.kind === 'reinforce') {
      const front = land.fronts.find(f => f.id === intent.engagementId)!;
      const side = front.countries[0] === unit.ownerId ? 0 : 1;
      front.sides[side].push(id);
      if (side === 1) unit.regionId = front.target;
      reserved.add(id);
    }
    if (intent.kind === 'attack') {
      const key = JSON.stringify([unit.regionId, intent.targetRegionId]);
      const group = outgoing.get(key) ?? { source: unit.regionId, target: intent.targetRegionId, ids: [] };
      group.ids.push(id);
      outgoing.set(key, group);
    }
  }

  const strength = (ids: string[]) => ids.reduce((sum, id) => sum + units.get(id)!.manpower, 0);
  for (const group of outgoing.values()) {
    if (group.source >= group.target || assault.has(group.source) || assault.has(group.target)) continue;
    const reverse = outgoing.get(JSON.stringify([group.target, group.source]));
    if (!reverse) continue;
    const left = strength(group.ids), right = strength(reverse.ids);
    if (left * 100 < right * LAND_RULES.screening) outgoing.delete(JSON.stringify([group.source, group.target]));
    else if (right * 100 < left * LAND_RULES.screening) outgoing.delete(JSON.stringify([reverse.source, reverse.target]));
    else {
      const clash = makeFront(group.target, areas.get(group.source)!.ownerId, areas.get(group.target)!.ownerId, group.source);
      clash.sides = [group.ids, reverse.ids];
      for (const id of [...group.ids, ...reverse.ids]) reserved.add(id);
      land.fronts.push(clash);
    }
  }

  const claims = new Map<string, Map<string, string[]>>();
  for (const { target, ids } of outgoing.values()) {
    const available = ids.filter(id => !reserved.has(id));
    if (!available.length) continue;
    const country = units.get(available[0])!.ownerId;
    const byCountry = claims.get(target) ?? new Map<string, string[]>();
    byCountry.set(country, [...(byCountry.get(country) ?? []), ...available]);
    claims.set(target, byCountry);
  }
  for (const [target, byCountry] of claims) {
    const existing = assault.get(target);
    if (byCountry.size > 1 || existing && !byCountry.has(existing.countries[0])) {
      for (const countryId of byCountry.keys()) land.events.push({ kind: 'contested', countryId, regionId: target });
      continue;
    }
    const [country, ids] = [...byCountry][0];
    const front = existing ?? makeFront(target, country, areas.get(target)!.ownerId);
    if (front.suspended !== undefined) continue;
    front.sides[0].push(...ids);
    for (const id of ids) reserved.add(id);
    if (!existing) land.fronts.push(front);
  }

  for (const [id, intent] of intents) {
    if (reserved.has(id) || intent.kind !== 'move') continue;
    reserved.add(id);
  }
  // Withdrawals use declared threats. Automatic retreats use admitted fronts and planned captures.
  contested.clear();
  for (const front of land.fronts) {
    if (front.suspended === undefined && front.kind === 'assault' && front.sides[0].length) contested.add(front.target);
  }
  const captures = new Map<string, Front>();
  for (const front of land.fronts) {
    if (front.kind !== 'assault' || front.suspended !== undefined || !front.sides[0].length) continue;
    for (const unit of units.values()) {
      if (unit.regionId === front.target && unit.ownerId === front.countries[1] && !reserved.has(unit.id)) {
        reserved.add(unit.id);
        front.sides[1].push(unit.id);
      }
    }
    if (!front.sides[1].length) captures.set(front.target, front);
  }
  for (const target of captures.keys()) contested.add(target);

  const continuing: Front[] = [];
  for (const front of land.fronts) {
    if (captures.has(front.target) && captures.get(front.target) === front) continue;
    const [a, rawDefence] = front.sides.map(strength);
    if (!a || !rawDefence) continue;
    const d = front.kind === 'clash' ? rawDefence : Math.floor(rawDefence * LAND_RULES.defence / 100);
    if (!Number.isSafeInteger((a + d) * 10000)) throw new Error('Land combat strength out of bounds.');
    if (front.suspended === undefined) {
      const rates = [Math.min(LAND_RULES.maxLoss, Math.floor(LAND_RULES.baseLoss * d / a)),
        Math.min(LAND_RULES.maxLoss, Math.floor(LAND_RULES.baseLoss * a / d))];
      for (const side of [0, 1] as const) for (const id of front.sides[side]) {
        const unit = units.get(id)!;
        const amount = Math.floor(unit.manpower * rates[side] / 10000);
        unit.manpower -= amount;
        if (amount) land.events.push({ kind: 'loss', countryId: unit.ownerId, divisionId: id, amount });
      }
      const limit = LAND_RULES.breakthrough;
      front.progress = Math.max(-limit, Math.min(limit, front.progress + Math.trunc(LAND_RULES.pace * (a - d) / (a + d))));
      front.rounds++;
    }

    const qualifies = front.sides.map((ids, side) =>
      (side === 0 ? -front.progress : front.progress) >= LAND_RULES.breakthrough ||
      strength(ids) * 100 <= LAND_RULES.retreat * ids.reduce((total, id) => total + land.readiness[id].baseline, 0));
    for (const side of [0, 1] as const) {
      const remaining: string[] = [];
      let blocked = false;
      for (const id of front.sides[side]) {
        const unit = units.get(id)!;
        const route = fallback(unit, side === 0 || front.kind === 'clash');
        if (qualifies[side] && route.destination) {
          delete front.enclosed[id];
          retreat(unit, route.destination);
        }
        else {
          remaining.push(id);
          if (qualifies[side]) {
            blocked = true;

          }
        }
      }
      front.blocked[side] = blocked ? front.blocked[side] + 1 : 0;
      front.sides[side] = remaining.filter(id => {
        const unit = units.get(id)!;
        const trapped = qualifies[side] && !fallback(unit, side === 0 || front.kind === 'clash').exists;
        if (trapped) front.enclosed[id] = (front.enclosed[id] ?? 0) + 1;
        else delete front.enclosed[id];
        if ((front.enclosed[id] ?? 0) < LAND_RULES.encircledWeeks) return true;
        delete front.enclosed[id];
        const amount = unit.manpower;
        land.readiness[id].prisoners = amount;
        unit.manpower = 0;
        unit.order = { kind: 'defend' };
        land.events.push({ kind: 'prisoners', countryId: unit.ownerId, divisionId: id, amount });
        return false;
      });
    }
    if (front.kind === 'assault' && front.sides[0].length && !front.sides[1].length && !qualifies[0]
      && front.suspended === undefined) {
      captures.set(front.target, front);
      continue;
    }
    if (!front.sides[0].length || !front.sides[1].length) continue;
    if (front.kind === 'clash' && front.rounds >= LAND_RULES.clashRounds && !front.blocked.some(Boolean)) continue;
    if (front.suspended === undefined && front.blocked.some(weeks => weeks >= LAND_RULES.blockedWeeks)) {
      front.suspended = game.week;
      for (const countryId of front.countries) land.events.push({ kind: 'suspended', countryId, regionId: front.target });
    }
    continuing.push(front);
  }
  land.fronts = continuing.sort((a, b) => a.id < b.id ? -1 : 1);
  const occupied = new Map<string, string>();
  for (const [target, front] of captures) {
    occupied.set(target, front.countries[0]);
    for (const id of front.sides[0]) units.get(id)!.regionId = target;
    land.events.push({ kind: 'capture', regionId: target, countryId: front.countries[0] });
  }
  for (const region of regions) region.ownerId = occupied.get(region.id) ?? region.ownerId;
  for (const [id, intent] of intents) {
    if (intent.kind !== 'move') continue;
    const unit = units.get(id)!;
    if (!occupied.has(intent.targetRegionId)) {
      unit.regionId = intent.targetRegionId;
      land.events.push({ kind: 'moved', countryId: unit.ownerId, regionId: unit.regionId, divisionId: id });
    }
    else land.events.push({ kind: 'blocked', countryId: unit.ownerId, divisionId: id, reason: 'Destination changed control.' });
  }
  for (const front of land.fronts) for (const side of front.sides) side.sort();
  land.events.sort((left, right) => {
    const key = (event: LandEvent) => JSON.stringify([event.kind, event.countryId, event.regionId, event.divisionId, event.reason]);
    const a = key(left), b = key(right);
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return { divisions, regions, militaryResults: [], strategicLand: land };
}

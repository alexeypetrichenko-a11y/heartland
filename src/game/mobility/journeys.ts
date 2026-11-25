import type { GameState, RegionId } from '../models.ts';

export interface MaritimeRoute {
  readonly id: string;
  readonly from: RegionId;
  readonly to: RegionId;
  readonly weeks: 1 | 2;
  readonly capacityGroup: string;
  readonly slots: number;
}

export interface Journey {
  operation: 'friendly-transport';
  divisionId: string;
  routeId: string;
  leg: 'outbound' | 'return';
  dueWeek: number;
  status: 'traveling' | 'waiting';
}

export type TransportOrder =
  | { kind: 'transport'; divisionId: string; routeId: string }
  | { kind: 'return'; divisionId: string };

export interface TransportResult {
  kind: 'departed' | 'arrived' | 'returned' | 'returning' | 'waiting' | 'refused';
  divisionId: string;
  routeId: string;
  regionId?: RegionId;
  dueWeek?: number;
  reason?: string;
}

export interface MobilityState {
  journeys: Journey[];
  closedRouteIds: string[];
  results: TransportResult[];
}

export function validateRoutes(game: GameState, routes: readonly MaritimeRoute[]) {
  const regions = new Set(game.regions.map(region => region.id));
  const ids = new Set<string>();
  const groups = new Map<string, number>();
  for (const route of routes) {
    if (!route.id || ids.has(route.id) || !regions.has(route.from) || !regions.has(route.to) || route.from === route.to
      || (route.weeks !== 1 && route.weeks !== 2) || !route.capacityGroup || !Number.isSafeInteger(route.slots) || route.slots < 1
      || (groups.has(route.capacityGroup) && groups.get(route.capacityGroup) !== route.slots)) {
      throw new Error('Invalid maritime route configuration.');
    }
    ids.add(route.id);
    groups.set(route.capacityGroup, route.slots);
  }
}

const byId = (a: TransportOrder, b: TransportOrder) => a.divisionId < b.divisionId ? -1 : a.divisionId > b.divisionId ? 1 : 0;

/** Resolve from the opening control snapshot. Only admitted departures use capacity. */
export function settleMobility(game: GameState, mobility: MobilityState, routes: readonly MaritimeRoute[], orders: readonly TransportOrder[]) {
  const owner = new Map(game.regions.map(region => [region.id, region.ownerId]));
  const divisions = new Map(game.divisions.map(division => [division.id, division]));
  const routeById = new Map(routes.map(route => [route.id, route]));
  const closed = new Set(mobility.closedRouteIds);
  const previous = new Map(mobility.journeys.map(journey => [journey.divisionId, journey]));
  const orderByDivision = new Map<string, TransportOrder>();
  const journeys: Journey[] = [];
  const arrivals = new Map<string, { operation: Journey['operation']; regionId: RegionId }>();
  const results: TransportResult[] = [];
  const used = new Map<string, number>();

  for (const order of orders) {
    const division = divisions.get(order.divisionId);
    if (!division || division.ownerId !== game.playerCountryId || division.manpower <= 0 || orderByDivision.has(division.id)
      || (order.kind !== 'transport' && order.kind !== 'return')) throw new Error('Invalid or duplicate transport order.');
    if (order.kind === 'transport' && !routeById.has(order.routeId)) throw new Error('Unknown maritime route.');
    if (order.kind === 'return' && !previous.has(division.id)) throw new Error('The division is not traveling.');
    orderByDivision.set(division.id, order);
  }

  for (const original of mobility.journeys) {
    const division = divisions.get(original.divisionId)!;
    const route = routeById.get(original.routeId)!;
    let journey = original;
    const friendly = (id: RegionId) => owner.get(id) === division.ownerId;
    const returnRequested = orderByDivision.get(division.id)?.kind === 'return';
    const due = journey.dueWeek <= game.week;
    const canReachOrigin = friendly(route.from) && !closed.has(route.id);
    if (journey.leg === 'outbound' && (returnRequested || (due && (!friendly(route.to) || closed.has(route.id)))) && canReachOrigin) {
      journey = { ...original, leg: 'return', status: 'traveling', dueWeek: game.week + route.weeks };
      results.push({ kind: 'returning', divisionId: division.id, routeId: route.id, dueWeek: journey.dueWeek });
    } else if (returnRequested && journey.leg === 'outbound') {
      journey = { ...original, leg: 'return', status: 'waiting', dueWeek: game.week + route.weeks };
      results.push({ kind: 'waiting', divisionId: division.id, routeId: route.id, reason: 'Return endpoint or route unavailable.' });
    } else if (due) {
      const destination = journey.leg === 'outbound' ? route.to : route.from;
      if (!closed.has(route.id) && friendly(destination)) {
        arrivals.set(division.id, { operation: journey.operation, regionId: destination });
        results.push({ kind: journey.leg === 'outbound' ? 'arrived' : 'returned', divisionId: division.id, routeId: route.id, regionId: destination });
        continue;
      }
      if (journey.status !== 'waiting') {
        journey = { ...original, status: 'waiting' };
        results.push({ kind: 'waiting', divisionId: division.id, routeId: route.id, reason: 'Route or friendly arrival unavailable.' });
      }
    }
    journeys.push(journey);
  }

  for (const order of [...orders].sort(byId)) {
    if (order.kind !== 'transport') continue;
    const route = routeById.get(order.routeId)!;
    const unit = divisions.get(order.divisionId)!;
    const occupiedSlots = used.get(route.capacityGroup) ?? 0;
    const reason = previous.has(unit.id) ? 'Division is already traveling.'
      : closed.has(route.id) ? 'Maritime route is closed.'
      : unit.regionId !== route.from || owner.get(route.from) !== unit.ownerId ? 'Division must be at the friendly origin.'
      : owner.get(route.to) !== unit.ownerId ? 'Destination must be friendly-controlled.'
      : occupiedSlots >= route.slots ? 'No departure slots remain.' : null;
    if (reason) {
      results.push({ kind: 'refused', divisionId: unit.id, routeId: route.id, reason });
      continue;
    }
    used.set(route.capacityGroup, occupiedSlots + 1);
    const dueWeek = game.week + route.weeks;
    journeys.push({ operation: 'friendly-transport', divisionId: unit.id, routeId: route.id, leg: 'outbound', dueWeek, status: 'traveling' });
    results.push({ kind: 'departed', divisionId: unit.id, routeId: route.id, dueWeek });
  }
  return { mobility: { ...mobility, journeys, results }, arrivals };
}

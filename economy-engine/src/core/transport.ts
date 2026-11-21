import type { EconomyState } from '../types.ts';
import type { Workspace } from './model.ts';
import type { RouteTable } from './routes.ts';

/**
 * Transport capacity and military requisition (Milestone 4: R45, R46, R63).
 *
 * Every lane has a physical capacity per week, in freight units (quantity x
 * base price x bulkiness of the goods carried). It is measured when the world is
 * built (a multiple of the traffic the settled economy needs) and grows with
 * the economy's productive potential (population x technology), never with
 * requisition. Civilian trade and military logistics
 * share it.
 *
 * A requisition is a standing order of one country for a volume of military
 * transport between two zones it controls. The engine finds the itinerary (the
 * cheapest open path through lanes whose zones the country controls; sea and
 * other waypoints count as open) and gives the military priority on every lane
 * of it, up to the lane's physical capacity. Civilian freight gets what is
 * left. Each route's civilian orders are first scaled to the share of its usual
 * demand that its tightest lane can carry; lanes whose expected civilian load is
 * above half of what they have left are then checked exactly, good by good and
 * pass by pass, so they never carry more than their capacity. (A lane below that
 * mark could only overflow if its civilian traffic more than doubled within one
 * week.) When a lane is saturated, civilian deliveries over it are cut; unsent
 * goods stay with their sellers, buyers turn to other suppliers or go short,
 * and prices react, as with any other shortage. The requisitioning state pays
 * the normal freight rate for what it moves, to transport workers at both ends.
 */

export interface Itinerary {
  lanes: number[];
  /** Sum of the lanes' effective lengths (distance x cost multiplier). */
  length: number;
}

/**
 * Cheapest open path from zone `origin` to zone `destination` using only lanes
 * whose zone ends are controlled by country c. Dijkstra on the small transport
 * graph with fixed tie-breaking (lowest node, then lowest lane), so the result is
 * reproducible. Null when no such path exists.
 */
export function findItinerary(s: EconomyState, c: number, origin: number, destination: number): Itinerary | null {
  const Z = s.zones.length;
  const V = Z + s.waypoints.length;
  const lanes = s.lanes;
  const owner = s.zone.owner;
  const usable = (node: number) => node >= Z || owner[node] === c;
  if (!usable(origin) || !usable(destination)) return null;
  const dist = new Float64Array(V).fill(Infinity);
  const viaLane = new Int32Array(V).fill(-1);
  const viaNode = new Int32Array(V).fill(-1);
  const done = new Uint8Array(V);
  dist[origin] = 0;
  for (let round = 0; round < V; round++) {
    let u = -1;
    for (let v = 0; v < V; v++) if (!done[v] && dist[v] !== Infinity && (u < 0 || dist[v] < dist[u])) u = v;
    if (u < 0 || u === destination) break;
    done[u] = 1;
    for (let l = 0; l < lanes.id.length; l++) {
      if (!(lanes.throughput[l] > 0)) continue;
      const a = lanes.from[l], b = lanes.to[l];
      const v = a === u ? b : b === u ? a : -1;
      if (v < 0 || done[v] || !usable(v)) continue;
      const through = dist[u] + lanes.distance[l] * lanes.costMultiplier[l];
      if (through < dist[v]) { dist[v] = through; viaLane[v] = l; viaNode[v] = u; }
    }
  }
  if (dist[destination] === Infinity) return null;
  const path: number[] = [];
  for (let node = destination; node !== origin; node = viaNode[node]) path.push(viaLane[node]);
  path.reverse();
  return { lanes: path, length: dist[destination] };
}

/** Physical capacity of lane l this week (Infinity while it has not been measured). */
export function laneCapacity(s: EconomyState, l: number): number {
  const capacity = s.lanes.capacity[l];
  return capacity < 0 ? Infinity : capacity * s.world.transportIndex;
}

/**
 * Before the markets: serve military requisitions first, then work out what each
 * lane leaves for civilian freight and how much of its usual civilian demand
 * that covers.
 */
export function allocateTransport(s: EconomyState, w: Workspace, routes: RouteTable): void {
  const p = s.config.params;
  const lanes = s.lanes;
  const L = lanes.id.length;
  const Z = s.zones.length;
  let limited = false;
  for (let l = 0; l < L; l++) {
    w.laneCapacity[l] = laneCapacity(s, l);
    if (w.laneCapacity[l] !== Infinity) limited = true;
  }
  w.transportLimited = limited;
  // Military priority, in the fixed order of the standing requisitions.
  w.requisitionResults = [];
  for (const order of s.requisitions) {
    const itinerary = w.calibrating ? null : findItinerary(s, order.country, order.origin, order.destination);
    const result = { requested: order.volume, delivered: 0, lanes: itinerary ? itinerary.lanes : [], bottleneck: -1, cost: 0 };
    w.requisitionResults.push(result);
    if (!itinerary) continue;
    let room = order.volume;
    for (const l of itinerary.lanes) {
      // A partial blockade lowers what any traffic can get through a lane.
      const left = Math.max(0, w.laneCapacity[l] * lanes.throughput[l] - w.laneMilitary[l]);
      if (left < room) { room = left; result.bottleneck = l; }
    }
    // The state pays the normal freight rate at the origin's price level, as far as its treasury allows.
    const c = order.country;
    const rate = p.freightPerDistance * itinerary.length * Math.max(0, s.zone.cpi[order.origin]);
    let cost = room * rate;
    const cash = Math.max(0, s.country.treasury[c]);
    if (cost > cash) { room = rate > 0 ? cash / rate : 0; cost = cash; }
    if (!(room > 0)) continue;
    for (const l of itinerary.lanes) w.laneMilitary[l] += room;
    result.delivered = room;
    result.cost = cost;
    if (cost > 0) {
      s.country.treasury[c] -= cost;
      w.spentTransport[c] += cost;
      const half = cost * 0.5;
      s.zone.householdMoney[order.origin] += half;
      s.zone.householdMoney[order.destination] += cost - half;
      w.householdIncome[order.origin] += half;
      w.householdIncome[order.destination] += cost - half;
    }
  }
  // What is left for civilians, the civilian load expected on the current routes, the share of it
  // that fits, and the lanes close enough to saturation to be checked good by good in the markets.
  const expected = expectedLaneLoad(s, routes);
  w.lanesAtRisk = false;
  for (let l = 0; l < L; l++) {
    const civil = Math.max(0, w.laneCapacity[l] - w.laneMilitary[l]);
    w.laneCivil[l] = civil;
    const demand = expected[l];
    w.laneDemand[l] = demand;
    w.laneFactor[l] = demand > civil ? civil / demand : 1;
    const atRisk = limited && demand > 0.5 * civil;
    w.laneRisky[l] = atRisk ? 1 : 0;
    if (atRisk) w.lanesAtRisk = true;
  }
  if (!limited) return;
  let squeezed = false;
  for (let l = 0; l < L; l++) if (w.laneFactor[l] < 1) squeezed = true;
  if (!squeezed) { w.pairFactor.fill(1); return; }
  for (let pair = 0; pair < Z * Z; pair++) {
    let factor = 1;
    for (let k = routes.pathStart[pair]; k < routes.pathStart[pair + 1]; k++) {
      const f = w.laneFactor[routes.pathLanes[k]];
      if (f < factor) factor = f;
    }
    w.pairFactor[pair] = factor;
  }
}

/** Expected civilian load of every lane: the smoothed demand of every zone pair spread over its current route. */
export function expectedLaneLoad(s: EconomyState, routes: RouteTable): Float64Array {
  const load = new Float64Array(s.lanes.id.length);
  const demand = s.tradeDemand;
  const { pathStart, pathLanes } = routes;
  for (let pair = 0; pair < demand.length; pair++) {
    const freight = demand[pair];
    if (!(freight > 0)) continue;
    for (let k = pathStart[pair]; k < pathStart[pair + 1]; k++) load[pathLanes[k]] += freight;
  }
  return load;
}

/** After the markets: remember how much civilian freight buyers in each zone wanted to bring from each other zone. */
export function recordTransportDemand(s: EconomyState, w: Workspace): void {
  const smoothing = s.config.params.laneDemandSmoothing;
  // Capacity grows with the economy's productive potential (population x technology), the
  // highest reached so far: never back down in a slump, and never through requisition.
  const base = s.world.transportBase;
  if (base > 0 && !w.calibrating) {
    const index = productivePotential(s) / base;
    if (index > s.world.transportIndex) s.world.transportIndex = index;
  }
  const demand = s.tradeDemand;
  for (let pair = 0; pair < demand.length; pair++) {
    demand[pair] += smoothing * (w.pairDemand[pair] - demand[pair]);
    if (demand[pair] < 1e-12) demand[pair] = 0;
  }
}

/** Sum over zones of population x technology: what transport capacity grows with. */
export function productivePotential(s: EconomyState): number {
  let total = 0;
  for (let z = 0; z < s.zones.length; z++) total += s.zone.population[z] * s.zone.technology[z];
  return total;
}

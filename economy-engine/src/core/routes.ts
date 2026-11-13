import type { EconomyState } from '../types.ts';

/**
 * Cheapest transport route between every pair of zones.
 *
 * The transport network is a small graph: zones and waypoints (straits, sea
 * junctions) joined by lanes. A lane's effective length is its distance times
 * its cost multiplier; a lane with zero throughput is closed. Trade between
 * two zones follows the cheapest open path, so closing or raising the cost of
 * a lane automatically reroutes traffic through the next-best path.
 *
 * The table is derived data. It is recomputed only when the lanes change and
 * is never stored in the saved game.
 */
export interface RouteTable {
  /** Effective distance from zone a to zone b (a * Z + b); Infinity if cut off. */
  distance: Float64Array;
  /** Smallest lane throughput along that path (1 = unrestricted). */
  throughput: Float64Array;
}

interface CacheEntry {
  zoneCount: number;
  nodeCount: number;
  from: number[];
  to: number[];
  distance: number[];
  costMultiplier: number[];
  throughput: number[];
  table: RouteTable;
}

const CACHE_SIZE = 4;
const cache: CacheEntry[] = [];

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function getRoutes(state: EconomyState): RouteTable {
  const Z = state.zones.length;
  const V = Z + state.waypoints.length;
  const lanes = state.lanes;
  for (let i = 0; i < cache.length; i++) {
    const entry = cache[i];
    if (entry.zoneCount === Z && entry.nodeCount === V && sameNumbers(entry.costMultiplier, lanes.costMultiplier)
      && sameNumbers(entry.throughput, lanes.throughput) && sameNumbers(entry.distance, lanes.distance)
      && sameNumbers(entry.from, lanes.from) && sameNumbers(entry.to, lanes.to)) {
      if (i > 0) { cache.splice(i, 1); cache.unshift(entry); }
      return entry.table;
    }
  }
  const table = computeRoutes(Z, V, lanes.from, lanes.to, lanes.distance, lanes.costMultiplier, lanes.throughput);
  cache.unshift({
    zoneCount: Z, nodeCount: V, from: lanes.from.slice(), to: lanes.to.slice(), distance: lanes.distance.slice(),
    costMultiplier: lanes.costMultiplier.slice(), throughput: lanes.throughput.slice(), table,
  });
  if (cache.length > CACHE_SIZE) cache.pop();
  return table;
}

/** Floyd-Warshall over all nodes; ties keep the first path found (fixed loop order). */
export function computeRoutes(
  zoneCount: number, nodeCount: number, from: readonly number[], to: readonly number[],
  distance: readonly number[], costMultiplier: readonly number[], throughput: readonly number[],
): RouteTable {
  const V = nodeCount;
  const best = new Float64Array(V * V).fill(Infinity);
  const flow = new Float64Array(V * V);
  for (let v = 0; v < V; v++) { best[v * V + v] = 0; flow[v * V + v] = 1; }
  for (let lane = 0; lane < from.length; lane++) {
    if (!(throughput[lane] > 0)) continue;
    const length = distance[lane] * costMultiplier[lane];
    const a = from[lane], b = to[lane];
    if (length < best[a * V + b]) {
      best[a * V + b] = length; best[b * V + a] = length;
      flow[a * V + b] = throughput[lane]; flow[b * V + a] = throughput[lane];
    }
  }
  for (let k = 0; k < V; k++) {
    for (let i = 0; i < V; i++) {
      const ik = best[i * V + k];
      if (ik === Infinity) continue;
      const flowIk = flow[i * V + k];
      for (let j = 0; j < V; j++) {
        const through = ik + best[k * V + j];
        if (through < best[i * V + j]) {
          best[i * V + j] = through;
          const flowKj = flow[k * V + j];
          flow[i * V + j] = flowIk < flowKj ? flowIk : flowKj;
        }
      }
    }
  }
  const Z = zoneCount;
  const table: RouteTable = { distance: new Float64Array(Z * Z), throughput: new Float64Array(Z * Z) };
  for (let a = 0; a < Z; a++) {
    for (let b = 0; b < Z; b++) {
      table.distance[a * Z + b] = best[a * V + b];
      table.throughput[a * Z + b] = best[a * V + b] === Infinity ? 0 : flow[a * V + b];
    }
  }
  return table;
}

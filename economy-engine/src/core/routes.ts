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
  /**
   * Lanes on the cheapest path from zone a to zone b: pathLanes[pathStart[a * Z + b]] up to
   * pathLanes[pathStart[a * Z + b + 1]] (Milestone 4: transport capacity is used lane by lane).
   */
  pathStart: Int32Array;
  pathLanes: Int32Array;
  /** Inverse index: the zone pairs whose path uses lane l are lanePairs[lanePairStart[l]] up to lanePairs[lanePairStart[l + 1]]. */
  lanePairStart: Int32Array;
  lanePairs: Int32Array;
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
  // Next node on the best path from i to j, and the lane used for a direct hop.
  const next = new Int32Array(V * V).fill(-1);
  const direct = new Int32Array(V * V).fill(-1);
  for (let v = 0; v < V; v++) { best[v * V + v] = 0; flow[v * V + v] = 1; next[v * V + v] = v; }
  for (let lane = 0; lane < from.length; lane++) {
    if (!(throughput[lane] > 0)) continue;
    const length = distance[lane] * costMultiplier[lane];
    const a = from[lane], b = to[lane];
    if (length < best[a * V + b]) {
      best[a * V + b] = length; best[b * V + a] = length;
      flow[a * V + b] = throughput[lane]; flow[b * V + a] = throughput[lane];
      next[a * V + b] = b; next[b * V + a] = a;
      direct[a * V + b] = lane; direct[b * V + a] = lane;
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
          next[i * V + j] = next[i * V + k];
          const flowKj = flow[k * V + j];
          flow[i * V + j] = flowIk < flowKj ? flowIk : flowKj;
        }
      }
    }
  }
  const Z = zoneCount;
  const pathStart = new Int32Array(Z * Z + 1);
  const lanesOnPaths: number[] = [];
  const table: RouteTable = {
    distance: new Float64Array(Z * Z), throughput: new Float64Array(Z * Z), pathStart, pathLanes: new Int32Array(0),
    lanePairStart: new Int32Array(from.length + 1), lanePairs: new Int32Array(0),
  };
  for (let a = 0; a < Z; a++) {
    for (let b = 0; b < Z; b++) {
      table.distance[a * Z + b] = best[a * V + b];
      table.throughput[a * Z + b] = best[a * V + b] === Infinity ? 0 : flow[a * V + b];
      pathStart[a * Z + b] = lanesOnPaths.length;
      if (a === b || best[a * V + b] === Infinity) continue;
      let node = a;
      // A path never visits more nodes than exist; the bound only guards against a malformed table.
      for (let step = 0; step < V && node !== b; step++) {
        const hop = next[node * V + b];
        lanesOnPaths.push(direct[node * V + hop]);
        node = hop;
      }
    }
  }
  pathStart[Z * Z] = lanesOnPaths.length;
  table.pathLanes = Int32Array.from(lanesOnPaths);
  // Inverse index (counting sort by lane; pairs stay in increasing order within each lane).
  const L = from.length;
  const counts = table.lanePairStart;
  for (let k = 0; k < lanesOnPaths.length; k++) counts[lanesOnPaths[k] + 1]++;
  for (let l = 0; l < L; l++) counts[l + 1] += counts[l];
  const fillAt = counts.slice(0, L);
  const pairs = new Int32Array(lanesOnPaths.length);
  for (let pair = 0; pair < Z * Z; pair++) {
    for (let k = pathStart[pair]; k < pathStart[pair + 1]; k++) pairs[fillAt[lanesOnPaths[k]]++] = pair;
  }
  table.lanePairs = pairs;
  return table;
}

/**
 * WORLD-02 performance feasibility: synthetic worlds shaped like the proposed European scenario
 * (6 playable countries with several provinces, single-zone simulated countries, single-zone
 * rest-of-world blocs). Analysis only.
 *
 * All populations, productivities and advantages here are SYNTHETIC (a seeded pseudo-random draw).
 * They exist only to give the engine a realistic number and mix of zones and trade links. They are
 * not data about any real country and must never be used as scenario values.
 */
import type { GameWorldInput, RegionProfile } from '../src/integration/index.ts';

export interface BenchConfig {
  /** Label, e.g. "60 zones". */
  name: string;
  /** Provinces per playable country (6 countries). */
  playable: number[];
  /** Number of single-zone simulated countries. */
  simulated: number;
  /** Number of single-zone rest-of-world blocs. */
  blocs: number;
  /** 'normal' or 'dense' trade links. */
  links: 'normal' | 'dense';
}

export const BENCH_CONFIGS: BenchConfig[] = [
  { name: '30 zones', playable: [4, 4, 4, 3, 3, 4], simulated: 4, blocs: 4, links: 'normal' },
  { name: '45 zones', playable: [6, 5, 6, 5, 5, 6], simulated: 7, blocs: 5, links: 'normal' },
  { name: '60 zones', playable: [8, 7, 8, 6, 7, 9], simulated: 10, blocs: 5, links: 'normal' },
  { name: '75 zones', playable: [10, 9, 10, 8, 8, 11], simulated: 13, blocs: 6, links: 'normal' },
  { name: '60 zones, dense links', playable: [8, 7, 8, 6, 7, 9], simulated: 10, blocs: 5, links: 'dense' },
];

const PLAYABLE = ['fra', 'deu', 'gbr', 'ita', 'pol', 'tur'];
/** Land borders between playable countries in the real roster (shape only; FR-GB stands for the Channel link). */
const BORDERS: [number, number][] = [[0, 1], [0, 3], [1, 4], [0, 2]];

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function benchWorld(config: BenchConfig, seed = 2401): { world: GameWorldInput; profiles: Record<string, RegionProfile>; zones: number; lanes: number } {
  const random = rng(seed);
  const countries: { id: string; name: string }[] = [];
  const regions: { id: string; name: string; ownerId: string; adjacentRegionIds: string[] }[] = [];
  const profiles: Record<string, RegionProfile> = {};
  const edges = new Set<string>();
  const link = (a: string, b: string) => { if (a !== b) edges.add(a < b ? `${a}|${b}` : `${b}|${a}`); };
  const advantage = () => ({
    food: 0.3 + random() * 2.2, energy: 0.2 + random() * 2, materials: 0.2 + random() * 2,
    industrial: 0.4 + random() * 1.8, consumer: 0.5 + random() * 1.5, military: 0.2 + random() * 1,
  });

  const provinces: string[][] = [];
  PLAYABLE.forEach((id, c) => {
    countries.push({ id, name: id.toUpperCase() });
    const ids: string[] = [];
    for (let k = 0; k < config.playable[c]; k++) {
      const rid = `${id}-p${k + 1}`;
      ids.push(rid);
      regions.push({ id: rid, name: `${id.toUpperCase()} province ${k + 1}`, ownerId: id, adjacentRegionIds: [] });
      profiles[rid] = { population: 2 + random() * 12, technology: 1 + random() * 0.8, populationGrowth: 0.002, advantage: advantage() };
    }
    // Land graph inside the country: a chain plus chords, about 3 neighbours per province.
    for (let k = 1; k < ids.length; k++) link(ids[k], ids[k - 1]);
    for (let k = 2; k < ids.length; k += 2) link(ids[k], ids[k - 2]);
    if (config.links === 'dense') for (let k = 3; k < ids.length; k++) link(ids[k], ids[k - 3]);
    provinces.push(ids);
  });
  for (const [a, b] of BORDERS) {
    link(provinces[a][provinces[a].length - 1], provinces[b][0]);
    link(provinces[a][provinces[a].length - 2], provinces[b][1]);
  }
  const allProvinces = provinces.flat();
  for (let k = 0; k < config.simulated; k++) {
    const id = `sim${k + 1}`;
    countries.push({ id, name: `Simulated ${k + 1}` });
    const rid = `${id}-z`;
    regions.push({ id: rid, name: `Simulated ${k + 1} (national zone)`, ownerId: id, adjacentRegionIds: [] });
    profiles[rid] = { population: 3 + random() * 14, technology: 1 + random() * 0.8, populationGrowth: 0.002, advantage: advantage() };
    const touches = config.links === 'dense' ? 4 : 2;
    for (let t = 0; t < touches; t++) link(rid, allProvinces[Math.floor(random() * allProvinces.length)]);
    if (k > 0) link(rid, `sim${k}-z`);
  }
  for (let k = 0; k < config.blocs; k++) {
    const id = `bloc${k + 1}`;
    countries.push({ id, name: `Bloc ${k + 1}` });
    const rid = `${id}-z`;
    regions.push({ id: rid, name: `Bloc ${k + 1} (aggregate zone)`, ownerId: id, adjacentRegionIds: [] });
    profiles[rid] = { population: 40 + random() * 160, technology: 0.6 + random() * 0.6, populationGrowth: 0.004, advantage: advantage() };
    // Blocs trade by sea with several coastal provinces and with each other.
    const touches = config.links === 'dense' ? 10 : 5;
    for (let t = 0; t < touches; t++) link(rid, allProvinces[Math.floor(random() * allProvinces.length)]);
    for (let other = 1; other <= k; other++) link(rid, `bloc${other}-z`);
  }
  for (const edge of edges) {
    const [a, b] = edge.split('|');
    regions.find(r => r.id === a)!.adjacentRegionIds.push(b);
    regions.find(r => r.id === b)!.adjacentRegionIds.push(a);
  }
  return { world: { seed, playerCountryId: 'fra', countries, regions }, profiles, zones: regions.length, lanes: edges.size };
}

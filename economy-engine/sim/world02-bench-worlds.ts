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
import { readFileSync } from 'node:fs';

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

/**
 * Zone-budget comparison (WORLD-02 finalisation, owner decision D1: Corsica is its own province, so
 * France has 9 provinces and the roster 46). Option A = 61 zones, B = 60 (one neighbour fewer, or two
 * blocs merged: same zone count), C = the smaller fallback (50: the earlier 49-zone merges with Corsica
 * kept separate). The 45+10+5 world is kept for continuity with the first WORLD-02 run.
 */
export const BUDGET_CONFIGS: BenchConfig[] = [
  { name: 'C: 50 zones (35+10+5)', playable: [7, 5, 6, 5, 5, 7], simulated: 10, blocs: 5, links: 'normal' },
  { name: '60 zones (45+10+5)', playable: [8, 7, 8, 6, 7, 9], simulated: 10, blocs: 5, links: 'normal' },
  { name: 'B: 60 zones (46+9+5)', playable: [9, 7, 8, 6, 7, 9], simulated: 9, blocs: 5, links: 'normal' },
  { name: 'A: 61 zones (46+10+5)', playable: [9, 7, 8, 6, 7, 9], simulated: 10, blocs: 5, links: 'normal' },
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

/**
 * Option A on the REAL draft topology: the 46 provinces of docs/world/data/world02-provinces.json with
 * their real land adjacency (world02-province-adjacency.json), the sea and fixed links proposed for
 * version 1 (world02-sea-links.json), the 10 simulated neighbours with their land borders, and 5 blocs.
 * Province populations are the sourced sizing values (Eurostat 2025 / ONS mid-2025, in millions);
 * technology, advantages, neighbour and bloc populations and bloc links are SYNTHETIC (seeded draw),
 * because no calibration has been done. Node only (reads files); the browser benchmark uses its save.
 */
export function realTopologyWorld(seed = 2401): { world: GameWorldInput; profiles: Record<string, RegionProfile>; zones: number; lanes: number } {
  const data = (name: string) => JSON.parse(readFileSync(new URL(`../../docs/world/data/${name}`, import.meta.url), 'utf8'));
  const provinces = (data('world02-provinces.json') as { id: string; name: string; country: string; population: number; simulated_in_v1: boolean }[])
    .filter(p => p.simulated_in_v1);
  const adjacency = data('world02-province-adjacency.json') as Record<string, Record<string, number>>;
  const sea = (data('world02-sea-links.json') as { a: string; b: string; proposal: string }[]).filter(l => l.proposal === 'include');
  const neighbourLand: Record<string, string[]> = {
    IRL: ['GBR-NIR'], ESP: ['FRA-NAQ', 'FRA-OCC'], NLD: ['DEU-NRW', 'DEU-NOR'], BEL: ['FRA-NE', 'DEU-NRW', 'DEU-MIT'],
    CHE: ['FRA-ARA', 'FRA-NE', 'DEU-BW', 'ITA-NO'], AUT: ['DEU-BY', 'ITA-NE'], CZE: ['DEU-BY', 'DEU-MO', 'POL-PDZ', 'POL-POL'],
    NOR: [], GRC: ['TUR-MAR'], BGR: ['TUR-MAR'],
  };
  const random = rng(seed);
  const advantage = () => ({
    food: 0.3 + random() * 2.2, energy: 0.2 + random() * 2, materials: 0.2 + random() * 2,
    industrial: 0.4 + random() * 1.8, consumer: 0.5 + random() * 1.5, military: 0.2 + random() * 1,
  });
  const countries = [...new Set(provinces.map(p => p.country))].map(id => ({ id: id.toLowerCase(), name: id }));
  const regions: { id: string; name: string; ownerId: string; adjacentRegionIds: string[] }[] = [];
  const profiles: Record<string, RegionProfile> = {};
  const zoneId = (code: string) => code.toLowerCase();
  for (const p of provinces) {
    regions.push({ id: zoneId(p.id), name: p.name, ownerId: p.country.toLowerCase(), adjacentRegionIds: [] });
    profiles[zoneId(p.id)] = { population: p.population / 1e6, technology: 1 + random() * 0.8, populationGrowth: 0.002, advantage: advantage() };
  }
  for (const n of Object.keys(neighbourLand)) {
    countries.push({ id: zoneId(n), name: n });
    regions.push({ id: `${zoneId(n)}-z`, name: `${n} (national zone)`, ownerId: zoneId(n), adjacentRegionIds: [] });
    profiles[`${zoneId(n)}-z`] = { population: 3 + random() * 14, technology: 1 + random() * 0.8, populationGrowth: 0.002, advantage: advantage() };
  }
  const edges = new Set<string>();
  const link = (a: string, b: string) => { if (a !== b) edges.add(a < b ? `${a}|${b}` : `${b}|${a}`); };
  const simulated = new Set(provinces.map(p => p.id));
  for (const [a, others] of Object.entries(adjacency)) for (const b of Object.keys(others)) if (simulated.has(a) && simulated.has(b)) link(zoneId(a), zoneId(b));
  const node = (code: string) => (code in neighbourLand ? `${zoneId(code)}-z` : zoneId(code));
  for (const [n, list] of Object.entries(neighbourLand)) for (const p of list) link(node(n), zoneId(p));
  for (const l of sea) link(node(l.a), node(l.b));
  const provinceIds = provinces.map(p => zoneId(p.id));
  for (let k = 0; k < 5; k++) {
    const id = `bloc${k + 1}`;
    countries.push({ id, name: `Bloc ${k + 1}` });
    regions.push({ id: `${id}-z`, name: `Bloc ${k + 1} (aggregate zone)`, ownerId: id, adjacentRegionIds: [] });
    profiles[`${id}-z`] = { population: 40 + random() * 160, technology: 0.6 + random() * 0.6, populationGrowth: 0.004, advantage: advantage() };
    for (let t = 0; t < 5; t++) link(`${id}-z`, provinceIds[Math.floor(random() * provinceIds.length)]);
    for (let other = 1; other <= k; other++) link(`${id}-z`, `bloc${other}-z`);
  }
  for (const edge of edges) {
    const [a, b] = edge.split('|');
    regions.find(r => r.id === a)!.adjacentRegionIds.push(b);
    regions.find(r => r.id === b)!.adjacentRegionIds.push(a);
  }
  return { world: { seed, playerCountryId: 'fra', countries, regions }, profiles, zones: regions.length, lanes: edges.size };
}

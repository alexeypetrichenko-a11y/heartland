import type { CountrySpec, LaneSpec, WorldSpec, ZoneSpec } from '../types.ts';
import { toCatalogueSpec } from '../world/testWorld.ts';

/**
 * How the game's world is described to the economic engine (ECON-05).
 *
 * The game's countries become the engine's countries and its regions become
 * the engine's zones, with the same identifiers (no translation table to keep
 * in sync). Every pair of adjacent regions is joined by one road lane. The
 * economy then runs on the provisional ten-sector, 31-good catalogue.
 *
 * Only the identifiers, names, owners and adjacency come from the game. What a
 * region is like economically (population, technology, what it is good at) is
 * not in the game's data, so it is supplied as a region profile. The profiles
 * for the six fictional regions below are invented illustrations, not approved
 * game data.
 */

/** The fields of the game's `GameState` the economy needs (a real `GameState` fits this shape). */
export interface GameWorldInput {
  seed: number;
  /** The human player's country, or null before a country is chosen. */
  playerCountryId: string | null;
  countries: readonly { id: string; name: string }[];
  regions: readonly { id: string; name: string; ownerId: string; adjacentRegionIds: readonly string[] }[];
}

/**
 * Economic character of one region. Population is in millions; technology 1 is
 * the reference economy. `advantage` is the region's relative strength in the
 * engine's broad goods (food, energy, materials, industrial, consumer,
 * military); it is spread over the catalogue's 31 goods automatically.
 */
export interface RegionProfile {
  population: number;
  technology: number;
  populationGrowth?: number;
  advantage?: Partial<Record<'food' | 'energy' | 'materials' | 'industrial' | 'consumer' | 'military', number>>;
}

/**
 * Proposed profiles for the six regions of the game's fictional scenario
 * (`src/game/initialState.ts`): Alden is a balanced industrial economy, Belora
 * a farming and mining one, Cyrin an energy exporter with an industrial ridge.
 * Invented for the demonstration; owner approval needed before any real use.
 */
export const FICTIONAL_REGION_PROFILES: Readonly<Record<string, RegionProfile>> = {
  'alden-vale': { population: 30, technology: 1.6, populationGrowth: 0.003, advantage: { food: 2, energy: 0.3, materials: 0.5, industrial: 1.2, consumer: 1.5, military: 0.6 } },
  'reed-coast': { population: 18, technology: 1.4, populationGrowth: 0.003, advantage: { food: 0.8, energy: 1.5, materials: 0.4, industrial: 1, consumer: 1.2, military: 0.3 } },
  'amber-plain': { population: 28, technology: 1.2, populationGrowth: 0.004, advantage: { food: 3, energy: 0.2, materials: 0.8, industrial: 0.6, consumer: 0.8, military: 0.2 } },
  'silver-hills': { population: 16, technology: 1.3, populationGrowth: 0.002, advantage: { food: 0.4, energy: 0.4, materials: 3, industrial: 1.5, consumer: 0.6, military: 1 } },
  'cedar-basin': { population: 22, technology: 1.1, populationGrowth: 0.004, advantage: { food: 1, energy: 2.5, materials: 1, industrial: 0.5, consumer: 1, military: 0.2 } },
  'dawn-ridge': { population: 14, technology: 1.5, populationGrowth: 0.003, advantage: { food: 0.6, energy: 0.6, materials: 0.6, industrial: 2, consumer: 1.5, military: 1.2 } },
};

/** Provisional length of a road between two adjacent regions (the engine's distance units). */
export const ADJACENT_ROAD_DISTANCE = 0.8;

/** Identifier of the road lane between two adjacent regions (order-independent). */
export function roadLaneId(a: string, b: string): string {
  return `road-${[a, b].sort().join('|')}`;
}

/**
 * Check that the game's world can be mapped one-to-one onto an economy, and
 * throw a clear error otherwise: unique identifiers, existing owners,
 * symmetric adjacency, at least one region per country, a profile per region.
 */
export function validateGameWorld(world: GameWorldInput, profiles: Readonly<Record<string, RegionProfile>>): void {
  if (!Number.isInteger(world.seed) || world.seed < 0 || world.seed > 4294967295) throw new Error('The game seed must be a whole number from 0 to 4294967295.');
  const countryIds = new Set<string>();
  for (const country of world.countries) {
    if (typeof country.id !== 'string' || country.id.length === 0 || countryIds.has(country.id)) throw new Error(`Country id ${String(country.id)} is empty or duplicated.`);
    countryIds.add(country.id);
  }
  if (world.playerCountryId !== null && !countryIds.has(world.playerCountryId)) throw new Error(`Unknown player country ${world.playerCountryId}.`);
  const regionIds = new Set<string>();
  for (const region of world.regions) {
    if (typeof region.id !== 'string' || region.id.length === 0 || regionIds.has(region.id) || countryIds.has(region.id)) {
      throw new Error(`Region id ${String(region.id)} is empty, duplicated or used by a country.`);
    }
    regionIds.add(region.id);
  }
  const owned = new Set<string>();
  for (const region of world.regions) {
    if (!countryIds.has(region.ownerId)) throw new Error(`Region ${region.id} belongs to unknown country ${region.ownerId}.`);
    owned.add(region.ownerId);
    const profile = profiles[region.id];
    if (!profile) throw new Error(`No economic profile for region ${region.id}.`);
    if (!(profile.population > 0) || !(profile.technology > 0)) throw new Error(`Region ${region.id}: population and technology must be positive.`);
    for (const other of region.adjacentRegionIds) {
      const neighbour = world.regions.find(entry => entry.id === other);
      if (!neighbour) throw new Error(`Region ${region.id} is adjacent to unknown region ${other}.`);
      if (!neighbour.adjacentRegionIds.includes(region.id)) throw new Error(`Adjacency between ${region.id} and ${other} is not symmetric.`);
    }
  }
  for (const id of countryIds) if (!owned.has(id)) throw new Error(`Country ${id} has no region.`);
}

/** Engine world description for the game's world (31-good catalogue, one road per adjacent pair). */
export function worldSpecFromGame(world: GameWorldInput, profiles: Readonly<Record<string, RegionProfile>> = FICTIONAL_REGION_PROFILES): WorldSpec {
  validateGameWorld(world, profiles);
  const countries: CountrySpec[] = world.countries.map(country => ({ id: country.id, name: country.name }));
  const zones: ZoneSpec[] = world.regions.map(region => {
    const profile = profiles[region.id];
    return {
      id: region.id, name: region.name, countryId: region.ownerId, population: profile.population, technology: profile.technology,
      ...(profile.populationGrowth === undefined ? {} : { populationGrowth: profile.populationGrowth }),
      ...(profile.advantage === undefined ? {} : { advantage: { ...profile.advantage } as Record<string, number> }),
    };
  });
  const lanes: LaneSpec[] = [];
  const seen = new Set<string>();
  for (const region of world.regions) {
    for (const other of region.adjacentRegionIds) {
      const id = roadLaneId(region.id, other);
      if (seen.has(id)) continue;
      seen.add(id);
      lanes.push({ id, from: region.id, to: other, distance: ADJACENT_ROAD_DISTANCE });
    }
  }
  return toCatalogueSpec({ seed: world.seed, countries, zones, lanes });
}

/**
 * The game's fictional scenario as of `src/game/initialState.ts` on main
 * (Alden, Belora, Cyrin; six regions), with Alden as the player. A copy for
 * tests and the example: the real game passes its own `GameState`.
 */
export function fictionalGameWorld(playerCountryId: string | null = 'alden'): GameWorldInput {
  return {
    seed: 2401,
    playerCountryId,
    countries: [
      { id: 'alden', name: 'Alden' },
      { id: 'belora', name: 'Belora' },
      { id: 'cyrin', name: 'Cyrin' },
    ],
    regions: [
      { id: 'alden-vale', name: 'Alden Vale', ownerId: 'alden', adjacentRegionIds: ['reed-coast', 'amber-plain'] },
      { id: 'reed-coast', name: 'Reed Coast', ownerId: 'alden', adjacentRegionIds: ['alden-vale', 'silver-hills'] },
      { id: 'amber-plain', name: 'Amber Plain', ownerId: 'belora', adjacentRegionIds: ['alden-vale', 'silver-hills', 'cedar-basin'] },
      { id: 'silver-hills', name: 'Silver Hills', ownerId: 'belora', adjacentRegionIds: ['reed-coast', 'amber-plain', 'dawn-ridge'] },
      { id: 'cedar-basin', name: 'Cedar Basin', ownerId: 'cyrin', adjacentRegionIds: ['amber-plain', 'dawn-ridge'] },
      { id: 'dawn-ridge', name: 'Dawn Ridge', ownerId: 'cyrin', adjacentRegionIds: ['silver-hills', 'cedar-basin'] },
    ],
  };
}

/** 64-bit FNV-style hash of a text, as 16 hexadecimal characters (32-bit integer operations only). */
function hashText(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b + code, 0x85ebca6b);
    b ^= b >>> 15;
  }
  const hex = (value: number) => (value >>> 0).toString(16).padStart(8, '0');
  return hex(a) + hex(b);
}

/**
 * Fingerprint of everything the starting economy is built from: the seed, the countries, the
 * regions (names, owners, adjacency in any order) and their profiles. Two worlds with the same
 * fingerprint get the same starting economy; a starting save only fits a world with its fingerprint.
 */
export function worldFingerprint(world: GameWorldInput, profiles: Readonly<Record<string, RegionProfile>> = FICTIONAL_REGION_PROFILES): string {
  const profile = (id: string) => {
    const entry = profiles[id];
    if (!entry) return null;
    const advantage = entry.advantage ? Object.keys(entry.advantage).sort().map(key => [key, entry.advantage![key as keyof typeof entry.advantage]]) : null;
    return [entry.population, entry.technology, entry.populationGrowth ?? null, advantage];
  };
  return hashText(JSON.stringify([
    world.seed,
    world.countries.map(country => [country.id, country.name]),
    world.regions.map(region => [region.id, region.name, region.ownerId, [...region.adjacentRegionIds].sort(), profile(region.id)]),
  ]));
}

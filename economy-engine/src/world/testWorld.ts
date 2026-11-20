import type { CountrySpec, LaneSpec, WorldSpec, ZoneSpec } from '../types.ts';
import { RANDOM_STREAM, randomUnit } from '../core/rng.ts';

/**
 * Fictional worlds for testing the engine.
 *
 * Nothing here is real-world data or a proposal for the game's final map. The
 * "Meridian" world is a small cast of economic archetypes (a petro-state, a
 * breadbasket, an arms maker, an import-dependent island, a poor developing
 * country, ...) chosen so that every mandatory scenario has a meaningful
 * subject. It is unrelated to the six-region fixture in the main game.
 */

const COUNTRIES: CountrySpec[] = [
  { id: 'norland', name: 'Norland', debtToGdp: 0.8, spendMilitary: 0.03, reserveWeeks: { energy: 6, food: 4 } },
  { id: 'sundara', name: 'Sundara', debtToGdp: 0.5, reserveWeeks: { food: 4 } },
  { id: 'khazir', name: 'Khazir', debtToGdp: 0.2, spendMilitary: 0.04 },
  { id: 'verdania', name: 'Verdania', debtToGdp: 0.45 },
  { id: 'ostmark', name: 'Ostmark', debtToGdp: 0.6, spendMilitary: 0.035, reserveWeeks: { energy: 6 } },
  { id: 'tavros', name: 'Tavros', debtToGdp: 0.5 },
  { id: 'lirane', name: 'Lirane', debtToGdp: 0.4, reserveWeeks: { food: 8, energy: 8 } },
  { id: 'morvaine', name: 'Morvaine', debtToGdp: 0.4 },
  { id: 'halcyon', name: 'Halcyon', debtToGdp: 0.35 },
];

const ZONES: ZoneSpec[] = [
  { id: 'norland-core', name: 'Norland Core', countryId: 'norland', population: 60, technology: 2.4, populationGrowth: 0.002,
    advantage: { food: 0.6, energy: 0.3, materials: 0.4, industrial: 2.0, consumer: 1.2, military: 1.5 } },
  { id: 'norland-coast', name: 'Norland Coast', countryId: 'norland', population: 40, technology: 2.2, populationGrowth: 0.002,
    advantage: { food: 0.8, energy: 0.5, materials: 0.3, industrial: 1.0, consumer: 1.5, military: 0.5 } },
  { id: 'sundara-delta', name: 'Sundara Delta', countryId: 'sundara', population: 150, technology: 0.9, populationGrowth: 0.005,
    advantage: { food: 1.0, energy: 0.2, materials: 0.6, industrial: 1.2, consumer: 2.5, military: 0.3 } },
  { id: 'sundara-inland', name: 'Sundara Inland', countryId: 'sundara', population: 120, technology: 0.7, populationGrowth: 0.005,
    advantage: { food: 1.6, energy: 0.3, materials: 1.0, industrial: 0.6, consumer: 1.2, military: 0.2 } },
  { id: 'khazir', name: 'Khazir', countryId: 'khazir', population: 30, technology: 1.2, populationGrowth: 0.004,
    advantage: { food: 0.15, energy: 12, materials: 0.5, industrial: 0.2, consumer: 0.2, military: 0.1 } },
  { id: 'verdania', name: 'Verdania', countryId: 'verdania', population: 45, technology: 1.1, populationGrowth: 0.002,
    advantage: { food: 5, energy: 0.4, materials: 0.6, industrial: 0.5, consumer: 0.6, military: 0.2 } },
  { id: 'ostmark', name: 'Ostmark', countryId: 'ostmark', population: 50, technology: 1.8, populationGrowth: 0.002,
    advantage: { food: 0.5, energy: 0.1, materials: 1.0, industrial: 2.5, consumer: 0.6, military: 4 } },
  { id: 'tavros', name: 'Tavros', countryId: 'tavros', population: 35, technology: 0.8, populationGrowth: 0.01,
    advantage: { food: 0.8, energy: 1.0, materials: 6, industrial: 0.4, consumer: 0.3, military: 0.1 } },
  { id: 'lirane', name: 'Lirane', countryId: 'lirane', population: 6, technology: 2.6, populationGrowth: 0.003,
    advantage: { food: 0.05, energy: 0, materials: 0.05, industrial: 2.0, consumer: 2.5, military: 0.3 } },
  { id: 'morvaine', name: 'Morvaine', countryId: 'morvaine', population: 80, technology: 0.55, populationGrowth: 0.015,
    advantage: { food: 2.0, energy: 0.4, materials: 1.0, industrial: 0.2, consumer: 0.5, military: 0.05 } },
  { id: 'halcyon', name: 'Halcyon', countryId: 'halcyon', population: 25, technology: 1.5, populationGrowth: 0.002,
    advantage: { food: 1.0, energy: 4, materials: 0.8, industrial: 0.8, consumer: 0.8, military: 0.5 } },
];

/** Distances are in abstract units (roughly 1,000 km of ordinary transport). */
const LANES: LaneSpec[] = [
  { id: 'norland-rail', from: 'norland-core', to: 'norland-coast', distance: 0.6 },
  { id: 'ostmark-rail', from: 'norland-core', to: 'ostmark', distance: 0.8 },
  { id: 'verdania-road', from: 'norland-core', to: 'verdania', distance: 1.0 },
  { id: 'coast-verdania', from: 'norland-coast', to: 'verdania', distance: 1.2 },
  { id: 'north-sea-norland', from: 'norland-coast', to: 'north-sea', distance: 0.8 },
  { id: 'north-sea-halcyon', from: 'halcyon', to: 'north-sea', distance: 0.6 },
  { id: 'north-sea-ostmark', from: 'ostmark', to: 'north-sea', distance: 1.2 },
  { id: 'ocean-west', from: 'norland-coast', to: 'mid-ocean', distance: 2.5 },
  { id: 'lirane-link', from: 'lirane', to: 'mid-ocean', distance: 0.8 },
  { id: 'ocean-east', from: 'mid-ocean', to: 'sundara-delta', distance: 3.0 },
  { id: 'sundara-rail', from: 'sundara-delta', to: 'sundara-inland', distance: 0.8 },
  { id: 'morvaine-road', from: 'sundara-inland', to: 'morvaine', distance: 1.2 },
  { id: 'morvaine-port', from: 'morvaine', to: 'cape-route', distance: 1.5 },
  { id: 'tavros-rail', from: 'sundara-inland', to: 'tavros', distance: 1.5 },
  { id: 'tavros-port', from: 'tavros', to: 'sundara-delta', distance: 1.8 },
  { id: 'kell-west', from: 'kell-strait', to: 'verdania', distance: 2.0 },
  { id: 'kell-east', from: 'kell-strait', to: 'sundara-delta', distance: 2.5 },
  { id: 'kell-ocean', from: 'kell-strait', to: 'mid-ocean', distance: 2.2 },
  { id: 'khazir-gulf', from: 'khazir', to: 'kell-strait', distance: 0.7 },
  { id: 'khazir-desert', from: 'khazir', to: 'morvaine', distance: 3.0 },
  { id: 'cape-west', from: 'cape-route', to: 'verdania', distance: 4.5 },
  { id: 'cape-east', from: 'cape-route', to: 'sundara-delta', distance: 3.5 },
  { id: 'north-passage', from: 'north-sea', to: 'tavros', distance: 5.0 },
];

/** Lanes that pass through the Strait of Kell, the test world's chokepoint. */
export const KELL_STRAIT_LANES = ['kell-west', 'kell-east', 'kell-ocean', 'khazir-gulf'] as const;

/** Fresh copy of the nine-country, eleven-zone "Meridian" test world. */
export function createTestWorldSpec(seed = 2401): WorldSpec {
  return {
    seed,
    countries: COUNTRIES.map(country => ({ ...country, reserveWeeks: country.reserveWeeks ? { ...country.reserveWeeks } : undefined })),
    zones: ZONES.map(zone => ({ ...zone, advantage: { ...zone.advantage } })),
    waypoints: [
      { id: 'north-sea', name: 'North Sea' },
      { id: 'mid-ocean', name: 'Central Ocean' },
      { id: 'kell-strait', name: 'Strait of Kell' },
      { id: 'cape-route', name: 'Southern Cape' },
    ],
    lanes: LANES.map(lane => ({ ...lane })),
  };
}

/**
 * Procedurally generated world of any size, used only to measure how the
 * engine scales. Zones sit on a ring with a few long-distance shortcuts.
 */
export function createGeneratedWorldSpec(zoneCount: number, seed = 7, zonesPerCountry = 1): WorldSpec {
  if (!Number.isInteger(zoneCount) || zoneCount < 2) throw new Error('A generated world needs at least two zones.');
  const tradable = ['food', 'energy', 'materials', 'industrial', 'consumer', 'military'];
  const countries: CountrySpec[] = [];
  const zones: ZoneSpec[] = [];
  const lanes: LaneSpec[] = [];
  const draw = (index: number) => randomUnit(seed, 0, RANDOM_STREAM.worldBuilder, index);
  const countryCount = Math.ceil(zoneCount / zonesPerCountry);
  for (let c = 0; c < countryCount; c++) {
    countries.push({ id: `c${c}`, name: `Country ${c}`, debtToGdp: 0.2 + 0.6 * draw(c * 31 + 1) });
  }
  for (let z = 0; z < zoneCount; z++) {
    const advantage: Record<string, number> = {};
    tradable.forEach((good, g) => {
      const roll = draw(z * 97 + g * 13 + 5);
      // Most zones are ordinary at most things and strong at one or two.
      advantage[good] = roll > 0.8 ? 2 + 6 * draw(z * 97 + g * 13 + 6) : 0.3 + roll;
    });
    zones.push({
      id: `z${z}`, name: `Zone ${z}`, countryId: `c${Math.floor(z / zonesPerCountry)}`,
      population: 5 + 95 * draw(z * 97 + 2), technology: 0.6 + 1.9 * draw(z * 97 + 3),
      populationGrowth: 0.01 * draw(z * 97 + 4), advantage,
    });
    lanes.push({ id: `ring${z}`, from: `z${z}`, to: `z${(z + 1) % zoneCount}`, distance: 0.5 + 1.5 * draw(z * 97 + 7) });
  }
  const shortcuts = Math.floor(zoneCount / 4);
  for (let k = 0; k < shortcuts; k++) {
    const a = Math.floor(draw(k * 53 + 11) * zoneCount);
    const b = Math.floor(draw(k * 53 + 12) * zoneCount);
    if (a !== b) lanes.push({ id: `sea${k}`, from: `z${a}`, to: `z${b}`, distance: 2 + 4 * draw(k * 53 + 13) });
  }
  return { seed, countries, zones, lanes };
}

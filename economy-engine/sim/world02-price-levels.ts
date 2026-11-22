/**
 * WORLD-02 (D2) analysis: does the engine create different price levels between countries that differ
 * only in productivity? Four synthetic countries (two regions each, a chain of road links), identical
 * except for `technology` (1, 1.5, 2, 3). After 104 weeks the script prints GDP per person at current
 * and constant prices and their ratio (an implicit price level). Synthetic world; not a scenario.
 *
 * Run: node --experimental-strip-types sim/world02-price-levels.ts
 */
import { createEconomySession, advanceEconomyWeek, getCountryEconomy } from '../src/integration/index.ts';
import type { GameWorldInput, RegionProfile } from '../src/integration/index.ts';

const technology: Record<string, number> = { a: 1, b: 1.5, c: 2, d: 3 };
const advantage = { food: 1, energy: 1, materials: 1, industrial: 1, consumer: 1, military: 0.3 };
const ids = Object.keys(technology);
const regions: { id: string; name: string; ownerId: string; adjacentRegionIds: string[] }[] = [];
const profiles: Record<string, RegionProfile> = {};
ids.forEach((country, i) => {
  for (const k of [0, 1]) {
    const id = `${country}${k}`;
    const adjacentRegionIds = [k === 0 ? `${country}1` : `${country}0`];
    if (k === 1 && i + 1 < ids.length) adjacentRegionIds.push(`${ids[i + 1]}0`);
    if (k === 0 && i > 0) adjacentRegionIds.push(`${ids[i - 1]}1`);
    regions.push({ id, name: id, ownerId: country, adjacentRegionIds });
    profiles[id] = { population: 10, technology: technology[country], populationGrowth: 0, advantage };
  }
});
const world: GameWorldInput = { seed: 7, playerCountryId: 'a', countries: ids.map(id => ({ id, name: id })), regions };
let session = createEconomySession(world, { profiles });
for (let week = 0; week < 104; week++) session = advanceEconomyWeek(session);
const base = getCountryEconomy(session, 'a');
console.log('| Country | Technology | GDP per person, current prices | GDP per person, constant prices | Price level (current / constant) | Real GDP per person relative to A |');
console.log('|---|---:|---:|---:|---:|---:|');
for (const id of ids) {
  const v = getCountryEconomy(session, id);
  console.log(`| ${id.toUpperCase()} | ${technology[id]} | ${(v.gdpNominal / v.population).toFixed(4)} | ${(v.gdpReal / v.population).toFixed(4)} | ${(v.gdpNominal / v.gdpReal).toFixed(3)} | ${((v.gdpReal / v.population) / (base.gdpReal / base.population)).toFixed(2)} |`);
}

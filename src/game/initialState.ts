import type { GameState } from './models.ts';

/**
 * Small fictional test world, unrelated to real borders. All numbers are temporary
 * fixture data, not simulation formulas or final balancing decisions.
 * Each call returns independent, JSON-compatible data. No selection or AI runs.
 */
export function createInitialState(): GameState {
  return {
    week: 1,
    seed: 2401,
    playerCountryId: null,
    standingOrders: [],
    countries: [
      { id: 'alden', name: 'Alden', controller: 'ai', economy: { treasury: 100, weeklyIncome: 12, weeklyExpenses: 8 } },
      { id: 'belora', name: 'Belora', controller: 'ai', economy: { treasury: 90, weeklyIncome: 11, weeklyExpenses: 7 } },
      { id: 'cyrin', name: 'Cyrin', controller: 'ai', economy: { treasury: 110, weeklyIncome: 13, weeklyExpenses: 9 } },
    ],
    regions: [
      { id: 'alden-vale', name: 'Alden Vale', ownerId: 'alden', adjacentRegionIds: ['reed-coast', 'amber-plain'] },
      { id: 'reed-coast', name: 'Reed Coast', ownerId: 'alden', adjacentRegionIds: ['alden-vale', 'silver-hills'] },
      { id: 'amber-plain', name: 'Amber Plain', ownerId: 'belora', adjacentRegionIds: ['alden-vale', 'silver-hills', 'cedar-basin'] },
      { id: 'silver-hills', name: 'Silver Hills', ownerId: 'belora', adjacentRegionIds: ['reed-coast', 'amber-plain', 'dawn-ridge'] },
      { id: 'cedar-basin', name: 'Cedar Basin', ownerId: 'cyrin', adjacentRegionIds: ['amber-plain', 'dawn-ridge'] },
      { id: 'dawn-ridge', name: 'Dawn Ridge', ownerId: 'cyrin', adjacentRegionIds: ['silver-hills', 'cedar-basin'] },
    ],
    relations: [
      { countryIds: ['alden', 'belora'], value: 0 },
      { countryIds: ['alden', 'cyrin'], value: 0 },
      { countryIds: ['belora', 'cyrin'], value: 0 },
    ],
    divisions: [
      { id: 'alden-first', name: 'Alden First Division', ownerId: 'alden', regionId: 'alden-vale', manpower: 1000 },
      { id: 'belora-first', name: 'Belora First Division', ownerId: 'belora', regionId: 'amber-plain', manpower: 1000 },
      { id: 'cyrin-first', name: 'Cyrin First Division', ownerId: 'cyrin', regionId: 'cedar-basin', manpower: 1000 },
    ],
  };
}

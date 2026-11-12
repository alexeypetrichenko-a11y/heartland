import type { GameState, RegionId } from '../game/models';
import { regionShapes } from './mapGeometry.ts';
import type { Point } from './mapViewport';

type DivisionSummary = { id: string; name: string; countryName: string; regionId: RegionId; regionName: string; position: Point };
export type MapDivision = DivisionSummary & ({ visibility: 'own'; manpower: number } | { visibility: 'combat-report' });

// A region illustration, never a geographical unit position or an input to rules.
export function illustrativeDivisionPosition(regionId: RegionId): Point | null {
  const shape = regionShapes[regionId];
  return shape ? { x: shape.x + 42, y: shape.y + 26 } : null;
}

// UI-only disclosure policy. The renderer receives only the fields allowed here.
// Other units are limited to defenders named in the player's latest combat report;
// this is not a detection system or a rule that all enemy positions are visible.
export function selectMapDivisions(state: GameState): MapDivision[] {
  const player = state.playerCountryId;
  if (!player || !state.countries.some(country => country.id === player)) return [];
  const reportedRegions = new Map<string, RegionId>();
  for (const result of state.militaryResults) {
    if (result.kind !== 'combat' || !state.divisions.some(division => division.id === result.divisionId && division.ownerId === player)) continue;
    for (const defender of result.defenderCasualties) reportedRegions.set(defender.divisionId, result.targetRegionId);
  }
  return state.divisions.flatMap((division): MapDivision[] => {
    const region = state.regions.find(candidate => candidate.id === division.regionId);
    if (division.manpower <= 0 || !region) return [];
    const position = illustrativeDivisionPosition(division.regionId);
    const country = state.countries.find(country => country.id === division.ownerId);
    if (!position || !country) return [];
    const summary = { id: division.id, name: division.name, countryName: country.name, regionId: division.regionId, regionName: region.name, position };
    if (division.ownerId === player) return [{ ...summary, visibility: 'own', manpower: division.manpower }];
    if (reportedRegions.get(division.id) === division.regionId) return [{ ...summary, visibility: 'combat-report' }];
    return [];
  });
}

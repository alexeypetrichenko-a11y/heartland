import type { CountryId, GameState, MilitaryOrder, MilitaryResult } from './models.ts';

/** T07 demo constants only. See STATUS.md for the complete provisional rules. */
export const COMBAT_PARAMETERS = { attackDamageDivisor: 2, defenceDamageDivisor: 4 } as const;

/** Normalize runtime commands into independent, serializable orders. */
export function parseMilitaryOrder(value: unknown): MilitaryOrder {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const order = value as Record<string, unknown>;
    if (order.kind === 'defend') return { kind: 'defend' };
    if ((order.kind === 'move' || order.kind === 'attack') && typeof order.targetRegionId === 'string' && order.targetRegionId.trim()) {
      return { kind: order.kind, targetRegionId: order.targetRegionId };
    }
  }
  throw new Error('Invalid military order.');
}

export function validateMilitaryOrder(state: GameState, countryId: CountryId, divisionId: string, order: MilitaryOrder) {
  const division = state.divisions.find(division => division.id === divisionId);
  if (!division) throw new Error('Select an available division.');
  if (division.ownerId !== countryId) throw new Error('Military orders must use your own division.');
  if (!Number.isSafeInteger(division.manpower) || division.manpower <= 0) throw new Error('Division has no available personnel.');
  const origin = state.regions.find(region => region.id === division.regionId);
  if (!origin || origin.ownerId !== countryId) throw new Error('Division must be in a friendly region.');
  if (order.kind === 'defend') return;
  const target = state.regions.find(region => region.id === order.targetRegionId);
  if (!target) throw new Error('Target region does not exist.');
  if (target.id === origin.id || !origin.adjacentRegionIds.includes(target.id)) throw new Error('Target must be an adjacent region.');
  if (order.kind === 'move' && target.ownerId !== countryId) throw new Error('Move requires a friendly target region.');
  if (order.kind === 'attack' && target.ownerId === countryId) throw new Error('Attack requires an enemy-controlled target region.');
}

const byId = (a: { id: string }, b: { id: string }) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * Resolve player orders in stable division-ID order; other countries only defend.
 * Casualties in a combat round use pre-round manpower and apply simultaneously.
 * Positive attacker damage = max(1, floor(A / 2)), allocated by defender ID.
 * Return damage = ceil(total defenders / 4). All losses are capped by manpower.
 * A surviving attacker captures only when every defender is at zero; otherwise
 * it stays at its origin and attacks again next week. No retreat or reinforcement.
 */
export function resolveMilitary(state: GameState): Pick<GameState, 'divisions' | 'regions' | 'militaryResults'> {
  const divisions = state.divisions.map(division => ({ ...division, order: { ...division.order } }));
  const regions = state.regions.map(region => ({ ...region }));
  const militaryResults: MilitaryResult[] = [];
  for (const division of divisions) {
    if (!Number.isSafeInteger(division.manpower) || division.manpower < 0) throw new Error('Division manpower must be a nonnegative safe integer.');
  }

  for (const division of divisions.filter(division => division.ownerId === state.playerCountryId).sort(byId)) {
    if (division.manpower === 0 || division.order.kind === 'defend') continue;
    const order = division.order;
    try {
      validateMilitaryOrder({ ...state, divisions, regions }, division.ownerId, division.id, order);
    } catch (error) {
      // A previously valid standing order may become obsolete after another unit
      // captures its target. Cancel visibly instead of trapping future turns.
      division.order = { kind: 'defend' };
      militaryResults.push({ kind: 'cancelled', divisionId: division.id, reason: (error as Error).message });
      continue;
    }
    if (order.kind === 'move') {
      militaryResults.push({ kind: 'moved', divisionId: division.id, fromRegionId: division.regionId, targetRegionId: order.targetRegionId });
      division.regionId = order.targetRegionId;
      division.order = { kind: 'defend' };
      continue;
    }

    const target = regions.find(region => region.id === order.targetRegionId)!;
    const defenders = divisions.filter(other => other.regionId === target.id && other.ownerId !== division.ownerId && other.manpower > 0).sort(byId);
    const totalDefenders = defenders.reduce((total, defender) => total + defender.manpower, 0);
    if (!Number.isSafeInteger(totalDefenders)) throw new Error('Defender manpower exceeds the safe integer limit.');
    const attackerCasualties = Math.min(division.manpower, Math.ceil(totalDefenders / COMBAT_PARAMETERS.defenceDamageDivisor));
    let damage = Math.max(1, Math.floor(division.manpower / COMBAT_PARAMETERS.attackDamageDivisor));
    const defenderCasualties = defenders.map(defender => {
      const losses = Math.min(defender.manpower, damage);
      defender.manpower -= losses;
      damage -= losses;
      if (defender.manpower === 0) defender.order = { kind: 'defend' };
      return { divisionId: defender.id, losses };
    });
    division.manpower -= attackerCasualties;
    const captured = division.manpower > 0 && defenders.every(defender => defender.manpower === 0);
    if (captured) {
      target.ownerId = division.ownerId;
      division.regionId = target.id;
    }
    if (captured || division.manpower === 0) division.order = { kind: 'defend' };
    militaryResults.push({ kind: 'combat', divisionId: division.id, targetRegionId: target.id, attackerCasualties, defenderCasualties, captured });
  }
  return { divisions, regions, militaryResults };
}

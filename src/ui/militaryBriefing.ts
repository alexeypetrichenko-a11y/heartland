import type { GameState } from '../game/models.ts';

/** Only observations already disclosed by the player's last battle report. */
export function militaryBriefing(state: GameState, targetId: string) {
  const ours = new Set(state.divisions.filter(unit => unit.ownerId === state.playerCountryId).map(unit => unit.id));
  const defenders = new Set(state.militaryResults.flatMap(result => result.kind === 'combat'
    && result.targetRegionId === targetId && ours.has(result.divisionId)
    ? result.defenderCasualties.map(defender => defender.divisionId) : []));
  return {
    enemy: defenders.size ? `${defenders.size} defending ${defenders.size === 1 ? 'division was' : 'divisions were'} reported last week. Current strength is unknown.`
      : 'No recent defender report for this province. Current strength is unknown.',
    ratio: 'Unknown · current defender strength is unavailable.',
    risk: 'High uncertainty. Repeated attacks can destroy a division. There is no automatic retreat.',
  };
}

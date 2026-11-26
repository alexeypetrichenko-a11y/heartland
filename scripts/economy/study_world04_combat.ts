import { createInitialState } from '../../src/game/initialState.ts';
import { resolveMilitary } from '../../src/game/military.ts';
import type { Division, GameState } from '../../src/game/models.ts';

const origin = 'alden-vale';
const target = 'amber-plain';
const full = 25_000;

function side(ownerId: string, regionId: string, strengths: number[]): Division[] {
  return strengths.map((manpower, index) => ({
    id: `${ownerId}-${index}`, name: `${ownerId} ${index + 1}`, ownerId, regionId, manpower,
    order: ownerId === 'alden' ? { kind: 'attack', targetRegionId: target } : { kind: 'defend' },
  }));
}

for (const [label, attackers, defenders, limit] of [
  ['1 vs 1, one week', [full], [full], 1],
  ['1 vs 2, one week', [full], [full, full], 1],
  ['1 vs 3, one week', [full], [full, full, full], 1],
  ['3 vs 1, standing orders', [full, full, full], [full], 100],
  ['1 vs 1, repeated', [full], [full], 100],
  ['1 vs 2, repeated', [full], [full, full], 100],
  ['1 vs 3, repeated', [full], [full, full, full], 100],
  ['3 vs 2, standing orders', [full, full, full], [full, full], 100],
  ['2 vs 2, standing orders', [full, full], [full, full], 100],
  ['Two unequal attackers, full strength first', [full, 10_000], [full, full], 100],
  ['Two unequal attackers, depleted first', [10_000, full], [full, full], 100],
] as const) {
  let game: GameState = { ...createInitialState(), playerCountryId: 'alden',
    divisions: [...side('alden', origin, [...attackers]), ...side('belora', target, [...defenders])] };
  let weeks = 0;
  let captureWeek: number | null = null;
  while (weeks < limit && game.divisions.some(unit => unit.order.kind === 'attack')) {
    game = { ...game, ...resolveMilitary(game), week: game.week + 1 };
    weeks++;
    if (captureWeek === null && game.militaryResults.some(result => result.kind === 'combat' && result.captured)) captureWeek = weeks;
  }
  const remaining = (countryId: string) => game.divisions.filter(unit => unit.ownerId === countryId).map(unit => unit.manpower);
  const sum = (numbers: readonly number[]) => numbers.reduce((total, number) => total + number, 0);
  const a = remaining('alden'), d = remaining('belora');
  console.log(JSON.stringify({
    label, weeks, captureWeek, attackerLosses: sum(attackers) - sum(a), defenderLosses: sum(defenders) - sum(d),
    attackerSurvivors: a, defenderSurvivors: d,
    controller: game.regions.find(region => region.id === target)?.ownerId,
    continuing: game.divisions.filter(unit => unit.order.kind === 'attack').length,
  }));
}

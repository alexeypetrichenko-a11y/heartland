import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInitialState } from '../game/initialState.ts';
import { selectCountry } from '../game/selectCountry.ts';
import { militaryBriefing } from './militaryBriefing.ts';

test('order briefing never reads hidden defender counts or strength', () => {
  const game = selectCountry(createInitialState(), 'alden');
  const before = militaryBriefing(game, 'amber-plain');
  const altered = { ...game, divisions: game.divisions.filter(unit => unit.ownerId === 'alden') };
  assert.deepEqual(before, militaryBriefing(altered, 'amber-plain'));
  assert.match(before.ratio, /Unknown/);
  assert.match(before.risk, /no automatic retreat/);
});

test('only the player’s latest relevant combat observations are disclosed', () => {
  const game = selectCountry(createInitialState(), 'alden');
  game.militaryResults = [
    { kind: 'combat', divisionId: 'alden-first', targetRegionId: 'amber-plain', attackerCasualties: 100,
      defenderCasualties: [{ divisionId: 'belora-first', losses: 20 }], captured: false },
    { kind: 'combat', divisionId: 'cyrin-first', targetRegionId: 'amber-plain', attackerCasualties: 100,
      defenderCasualties: [{ divisionId: 'unobserved', losses: 4 }], captured: false },
  ];
  assert.match(militaryBriefing(game, 'amber-plain').enemy, /^1 defending division was reported/);
  assert.match(militaryBriefing(game, 'silver-hills').enemy, /^No recent defender report/);
});

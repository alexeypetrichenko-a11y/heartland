import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SCENARIOS, runHorizon } from './horizon-scenarios.ts';

/**
 * Regime changes and the defeat rule (Milestone 4 review). GAME_DESIGN.md section 6: the
 * first regime overthrow defeats a human player. The engine does not know which countries
 * are human, so it keeps simulating every country and reports every regime change; each
 * event carries the country's running regime count, so the host can recognise the first one
 * (regime 1) and end that player's game there. Later changes only concern AI countries.
 */
test('every regime change is reported with a running count, the first being regime 1, at least the immunity period apart', () => {
  const scenario = SCENARIOS.find(s => s.name.startsWith('capacity destruction'))!;
  const { state, stats } = runHorizon('7-good', scenario, 156);
  const immunity = state.config.params.regimeImmunityWeeks;
  const changes = stats.events.filter(e => e.type === 'regime-change');
  assert.ok(changes.length >= 2, 'the scenario has several regime changes in one country');
  const last = new Map<string, { regime: number; turn: number }>();
  for (const event of changes) {
    if (event.type !== 'regime-change') continue;
    const previous = last.get(event.countryId);
    if (!previous) assert.equal(event.regime, 1, `${event.countryId}: the first change is regime 1 (the defeat of a human player)`);
    else {
      assert.equal(event.regime, previous.regime + 1);
      assert.ok(event.turn - previous.turn >= immunity, `${event.turn - previous.turn} weeks between changes`);
    }
    last.set(event.countryId, { regime: event.regime, turn: event.turn });
  }
  // The engine itself never ends the game: the week counter ran to the end.
  assert.equal(state.turn, 156);
});

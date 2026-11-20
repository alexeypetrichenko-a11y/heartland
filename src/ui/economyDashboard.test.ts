import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceTurn } from '../game/advanceTurn.ts';
import { calculateWeeklyBudget } from '../game/economy.ts';
import { createInitialState } from '../game/initialState.ts';
import { selectCountry } from '../game/selectCountry.ts';
import { readEconomyDashboard } from './economyDashboard.ts';

test('the dashboard reads the current treasury and active weekly budget for each scenario country', () => {
  const state = createInitialState();
  for (const country of state.countries) {
    assert.deepEqual(readEconomyDashboard(country, state.week, null), {
      treasury: country.economy.treasury,
      weeklyBudget: calculateWeeklyBudget(country.economy, country.economicPolicy),
      lastWeek: null,
    });
  }
});

test('the latest-week view reports treasury values from the committed turn', () => {
  const state = selectCountry(createInitialState(), 'alden');
  const player = state.countries.find(country => country.id === state.playerCountryId)!;
  const start = { countryId: player.id, week: state.week, treasury: player.economy.treasury };
  const next = advanceTurn(state, [{ type: 'set-economic-policy', countryId: player.id, policy: 'tax-relief' }]);
  const updated = next.countries.find(country => country.id === player.id)!;
  assert.equal(updated.economicPolicy, 'tax-relief');
  assert.deepEqual(readEconomyDashboard(updated, next.week, start), {
    treasury: updated.economy.treasury,
    weeklyBudget: calculateWeeklyBudget(updated.economy, updated.economicPolicy),
    lastWeek: { week: state.week, openingTreasury: player.economy.treasury, closingTreasury: updated.economy.treasury },
  });
  assert.equal(readEconomyDashboard(player, state.week, start).lastWeek, null, 'an unsettled week has no new result');
  assert.equal(readEconomyDashboard(updated, next.week + 1, start).lastWeek, null, 'a stale start is ignored');
  const other = next.countries.find(country => country.id !== player.id)!;
  assert.equal(readEconomyDashboard(other, next.week, start).lastWeek, null, 'the result belongs to its own country');
});

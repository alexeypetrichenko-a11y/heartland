import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { advanceGameWeek, startEconomy, type EconomyRuntime } from '../game/economyBridge.ts';
import { createInitialState } from '../game/initialState.ts';
import { selectCountry } from '../game/selectCountry.ts';
import { economyNews, formatMoney, formatPercent, formatSignedMoney, headlineNotice, readEconomyDashboard, UNAVAILABLE } from './economyDashboard.ts';

/** INT-01: the economy panel shows the engine's figures, formatted, and nothing else. */
const runtime: EconomyRuntime = {
  api: await import('../../economy-engine/src/integration/index.ts'),
  startingSave: readFileSync(new URL('../../economy-engine/scenarios/fictional-week1.economy.json', import.meta.url), 'utf8'),
};

test('the dashboard shows the engine\'s budget and indicators for each scenario country, with unavailable data marked', () => {
  for (const countryId of ['alden', 'belora', 'cyrin']) {
    const game = selectCountry(createInitialState(), countryId);
    const economy = startEconomy(runtime, game);
    const view = economy.player;
    const dashboard = readEconomyDashboard(view, null, game.week);
    assert.deepEqual(dashboard.budget.map(row => row.value), [view.treasury, view.budget.revenue, view.budget.expenditure].map(formatMoney)
      .concat(formatSignedMoney(view.budget.balance)));
    const indicator = (label: string) => dashboard.indicators.find(row => row.label === label)!;
    assert.equal(indicator('GDP').value, formatMoney(view.gdpReal));
    assert.equal(indicator('Economic growth').value, UNAVAILABLE, 'growth is explicitly unavailable in week 1');
    assert.equal(indicator('Inflation').value, formatPercent(view.inflation));
    assert.equal(indicator('Unemployment').value, formatPercent(view.unemployment));
    assert.equal(indicator('Political stability').value, `${Math.round(view.stability)} / 100`);
    assert.equal(indicator('Public debt').value, formatMoney(view.debt));
    assert.equal(indicator('Central-bank policy rate').value, formatPercent(view.centralBank.policyRate));
    assert.equal(dashboard.latestWeek, null, 'no week has settled at week 1');
    assert.equal(dashboard.sectors.length, 3);
  }
});

test('after weeks are played the dashboard reports the settled week, growth and the changed figures', () => {
  let game = selectCountry(createInitialState(), 'alden');
  let economy = startEconomy(runtime, game);
  const first = readEconomyDashboard(economy.player, economy.previous, game.week);
  for (let k = 0; k < 30; k++) ({ game, economy } = advanceGameWeek(runtime, game, economy, []));
  const later = readEconomyDashboard(economy.player, economy.previous, game.week);
  assert.deepEqual(later.latestWeek, { week: 30, openingTreasury: formatMoney(economy.previous!.treasury), closingTreasury: formatMoney(economy.player.treasury) });
  assert.notEqual(later.indicators.find(row => row.label === 'Economic growth')!.value, UNAVAILABLE);
  assert.notDeepEqual(later.budget, first.budget, 'the figures changed');
  assert.notDeepEqual(later.indicators, first.indicators);
});

test('money is shown with one decimal, signed balances, and never as -0.0', () => {
  assert.equal(formatMoney(85.73), '85.7');
  assert.equal(formatMoney(-0.04), '0.0');
  assert.equal(formatMoney(1174.66), '1,174.7');
  assert.equal(formatSignedMoney(4.62), '+4.6');
  assert.equal(formatSignedMoney(-0.03), '0.0');
  assert.equal(formatSignedMoney(-3.6), '-3.6');
});

test('economic news shows the player\'s notices and others\' critical ones; the header alert prefers defeat', () => {
  const game = selectCountry(createInitialState(), 'alden');
  const economy = startEconomy(runtime, game);
  const notice = (severity: 'defeat' | 'critical' | 'warning' | 'info', concernsPlayer: boolean) =>
    ({ ...economy.notices[0], severity, concernsPlayer, title: severity, message: severity });
  const list = [notice('info', false), notice('warning', true), notice('critical', false), notice('critical', true), notice('defeat', true)];
  assert.deepEqual(economyNews(list).map(entry => entry.title), ['warning', 'critical', 'critical', 'defeat']);
  assert.equal(headlineNotice(list)!.severity, 'defeat');
  assert.equal(headlineNotice(list.slice(0, 4))!.concernsPlayer, true);
  assert.equal(headlineNotice(list.slice(0, 3)), null, 'other countries\' crises are not a header alert');
});

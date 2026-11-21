import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { advanceGameWeek, countryEconomy, startEconomy, type EconomyRuntime } from '../game/economyBridge.ts';
import { createInitialState } from '../game/initialState.ts';
import { selectCountry } from '../game/selectCountry.ts';
import type { TurnCommand } from '../game/models.ts';
import { formatFiscalPercent, reviewFiscalDraft } from './fiscalDraft.ts';

const runtime: EconomyRuntime = {
  api: await import('../../economy-engine/src/integration/index.ts'),
  startingSave: readFileSync(new URL('../../economy-engine/scenarios/fictional-week1.economy.json', import.meta.url), 'utf8'),
};
const { api } = runtime;
const start = () => {
  const game = selectCountry(createInitialState(), 'alden');
  return { game, economy: startEconomy(runtime, game) };
};

test('all seven typed fiscal proposals become one atomic batch and stay in effect', () => {
  const startWeek = start();
  const draft = reviewFiscalDraft(api, startWeek.economy, {
    income: '23,175', consumption: '12.5', corporate: '30.25',
    administration: '13', social: '12.625', military: '3.25', infrastructure: '4.75',
  })!;
  const expected = {
    taxes: { income: 0.23175, consumption: 0.125, corporate: 0.3025 },
    spending: { administration: 0.13, social: 0.12625, military: 0.0325, infrastructure: 0.0475 },
  };
  assert.equal(draft.error, null);
  assert.equal(draft.commands.length, 7);
  assert.deepEqual(draft.commands, api.fiscalCommands('alden', expected));
  assert.deepEqual(draft.groups.map(group => group.fields.map(field => field.current)), [
    Object.values(startWeek.economy.player.fiscal.taxes), Object.values(startWeek.economy.player.fiscal.spending),
  ]);
  const unchanged = advanceGameWeek(runtime, startWeek.game, startWeek.economy, []);
  let { game, economy } = advanceGameWeek(runtime, startWeek.game, startWeek.economy, [], draft.commands);
  assert.equal(game.week, 2);
  assert.equal(economy.session.week, game.week);
  assert.deepEqual(economy.player.fiscal, expected);
  assert.notEqual(economy.player.budget.revenue, unchanged.economy.player.budget.revenue);
  assert.notEqual(startWeek.economy.player.fiscal.taxes.income, expected.taxes.income);

  for (const id of ['belora', 'cyrin'] as const) {
    const view = countryEconomy(runtime, economy, id);
    assert.equal(view.controller, 'ai');
    assert.deepEqual(view.fiscal, countryEconomy(runtime, unchanged.economy, id).fiscal);
    assert.notDeepEqual(view.fiscal, expected);
  }
  for (let week = 3; week <= 5; week++) {
    ({ game, economy } = advanceGameWeek(runtime, game, economy, []));
    assert.equal(game.week, week);
    assert.equal(economy.session.week, week);
    assert.deepEqual(economy.player.fiscal, expected);
  }
});

test('blank and unchanged rates emit no commands and untouched rates stay exact', () => {
  const { game, economy } = start();
  const draft = reviewFiscalDraft(api, economy, {
    income: ' ', consumption: ' 10,0 ', corporate: '20', administration: '12.', military: '2.5',
  })!;
  assert.deepEqual(draft.commands, api.fiscalCommands('alden', { spending: { military: 0.025 } }));
  const next = advanceGameWeek(runtime, game, economy, [], draft.commands);
  assert.deepEqual(next.economy.player.fiscal, {
    taxes: economy.player.fiscal.taxes,
    spending: { ...economy.player.fiscal.spending, military: 0.025 },
  });
  assert.deepEqual(reviewFiscalDraft(api, next.economy, { military: '2.500', corporate: '' })!.commands, []);
  assert.equal(formatFiscalPercent(0.13725), '13.725%');
});

test('rates use the engine limits and keep rejected input visible', () => {
  const { economy } = start();
  const { maxTaxRate, maxSpendingShare } = api.fiscalLimits(economy.session);
  const limits = reviewFiscalDraft(api, economy, {
    income: String(maxTaxRate * 100), corporate: '0', social: String(maxSpendingShare * 100), military: '0',
  })!;
  assert.deepEqual(limits.groups.map(group => group.maximum), [maxTaxRate, maxSpendingShare]);
  assert.equal(limits.error, null);
  assert.deepEqual(limits.commands, api.fiscalCommands('alden', {
    taxes: { income: maxTaxRate, corporate: 0 }, spending: { social: maxSpendingShare, military: 0 },
  }));
  const invalid = reviewFiscalDraft(api, economy, {
    income: '1e1', corporate: String(maxTaxRate * 100 + 0.01),
    social: '-1', military: String(maxSpendingShare * 100 + 0.01),
  })!;
  assert.equal(invalid.error, api.checkEconomyCommands(economy.session, invalid.commands));
  assert.ok(invalid.error);
  assert.deepEqual(Object.keys(invalid.fieldErrors).sort(), ['corporate', 'income', 'military', 'social']);
  assert.equal(invalid.groups[0].fields[0].proposed, '1e1');
});

test('rejected fiscal or military input keeps both states and the complete draft', () => {
  const { game, economy } = start();
  const before = structuredClone(game);
  const fingerprint = api.economyFingerprint(economy.session);
  const proposals = { corporate: '31.25', infrastructure: '5' };
  const fiscal = reviewFiscalDraft(api, economy, proposals)!;
  const wrong = reviewFiscalDraft(api, economy, { ...proposals, income: '71' })!;
  const attack: TurnCommand = {
    type: 'set-military-order', countryId: 'alden', divisionId: 'alden-first',
    order: { kind: 'attack', targetRegionId: 'dawn-ridge' },
  };
  assert.throws(() => advanceGameWeek(runtime, game, economy, [], wrong.commands), /Tax rate/);
  assert.throws(() => advanceGameWeek(runtime, game, economy, [attack], fiscal.commands), /adjacent/);
  assert.deepEqual(game, before);
  assert.equal(api.economyFingerprint(economy.session), fingerprint);
  assert.deepEqual(proposals, { corporate: '31.25', infrastructure: '5' });
  const retry = advanceGameWeek(runtime, game, economy, [], fiscal.commands);
  assert.equal(retry.economy.player.fiscal.taxes.corporate, 0.3125);
  assert.equal(retry.economy.player.fiscal.spending.infrastructure, 0.05);
});

test('a foreign economy view cannot be used to build player proposals', () => {
  const { game, economy } = start();
  const foreign = countryEconomy(runtime, economy, 'belora');
  assert.equal(reviewFiscalDraft(api, { ...economy, player: foreign }, { income: '25' }), null);
  assert.throws(() => advanceGameWeek(runtime, game, economy, [], api.fiscalCommands('belora', { taxes: { income: 0.25 } })),
    /player's country/);
});

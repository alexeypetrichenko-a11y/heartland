import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { advanceTurn } from './advanceTurn.ts';
import { advanceGameWeek, countryEconomy, regionEconomy, startEconomy } from './economyBridge.ts';
import type { EconomyRuntime, EconomySnapshot } from './economyBridge.ts';
import { createInitialState } from './initialState.ts';
import type { CountryId, GameState, TurnCommand } from './models.ts';
import { selectCountry } from './selectCountry.ts';

/**
 * INT-01: the game's weekly turn and the economic engine together. The runtime is the real
 * integration API and the committed week-1 save, read from disk instead of downloaded.
 */
const runtime: EconomyRuntime = {
  api: await import('../../economy-engine/src/integration/index.ts'),
  startingSave: readFileSync(new URL('../../economy-engine/scenarios/fictional-week1.economy.json', import.meta.url), 'utf8'),
};
const fingerprint = (economy: EconomySnapshot) => runtime.api.economyFingerprint(economy.session);
const begin = (countryId: CountryId) => {
  const game = selectCountry(createInitialState(), countryId);
  return { game, economy: startEconomy(runtime, game) };
};
const attackAmber: TurnCommand = { type: 'set-military-order', countryId: 'alden', divisionId: 'alden-first', order: { kind: 'attack', targetRegionId: 'amber-plain' } };

test('each of the three fictional countries starts from the pre-built week-1 economy, in step with the game', () => {
  for (const countryId of ['alden', 'belora', 'cyrin']) {
    const { game, economy } = begin(countryId);
    assert.equal(game.week, 1);
    assert.equal(economy.session.week, game.week);
    assert.equal(economy.player.countryId, countryId);
    assert.equal(economy.player.controller, 'player');
    assert.equal(economy.previous, null);
    assert.equal(economy.defeated, false);
    for (const value of [economy.player.gdpReal, economy.player.treasury, economy.player.debt, economy.player.budget.revenue, economy.player.budget.expenditure]) {
      assert.ok(Number.isFinite(value) && value > 0);
    }
    // Identical to building the economy from scratch for this game.
    assert.equal(fingerprint(economy), runtime.api.economyFingerprint(runtime.api.createEconomySession(game)));
  }
  assert.throws(() => startEconomy(runtime, createInitialState()), /player country/);
  assert.throws(() => startEconomy(runtime, { ...selectCountry(createInitialState(), 'alden'), week: 2 }), /week 1/);
});

test('52 weeks of the complete flow for each country: weeks stay in step, indicators move, one treasury only', () => {
  for (const countryId of ['alden', 'belora', 'cyrin']) {
    let { game, economy } = begin(countryId);
    let moved = 0;
    for (let week = 2; week <= 53; week++) {
      const commands: TurnCommand[] = week === 3 ? [{ type: 'declare', countryId, targetId: countryId === 'alden' ? 'belora' : 'alden', stance: 'goodwill' }] : [];
      const before = economy.player;
      ({ game, economy } = advanceGameWeek(runtime, game, economy, commands));
      assert.equal(game.week, week);
      assert.equal(economy.session.week, game.week, 'game and economy weeks are identical');
      assert.equal(economy.previous, before);
      // The economy really moved this week.
      if (economy.player.gdpReal !== before.gdpReal && economy.player.treasury !== before.treasury) moved++;
      // One treasury: the game state holds none; the treasury shown is the session's.
      assert.equal(JSON.stringify(game).includes('treasury'), false);
      assert.ok(game.countries.every(country => !('economy' in country) && !('economicPolicy' in country)));
      assert.equal(economy.player.treasury, countryEconomy(runtime, economy, countryId).treasury);
      const b = economy.player.budget;
      assert.ok(Math.abs(economy.player.treasury - (before.treasury + b.revenue - b.expenditure + b.borrowed - b.repaid)) <= 1e-9 * Math.max(1, b.revenue),
        'the treasury changes only through the economy\'s own budget');
    }
    assert.equal(moved, 52, `${countryId}: GDP and treasury change every week`);
    assert.ok(economy.player.gdpGrowth !== null, 'growth is available after half a year');
    assert.equal(economy.defeated, false);
  }
});

test('a military capture becomes an economic occupation, not an annexation', () => {
  let { game, economy } = begin('alden');
  ({ game, economy } = advanceGameWeek(runtime, game, economy, [attackAmber]));
  for (let k = 0; k < 4 && game.regions.find(region => region.id === 'amber-plain')!.ownerId !== 'alden'; k++) {
    ({ game, economy } = advanceGameWeek(runtime, game, economy, []));
  }
  assert.equal(game.regions.find(region => region.id === 'amber-plain')!.ownerId, 'alden', 'the game captured Amber Plain');
  const amber = regionEconomy(runtime, economy, 'amber-plain');
  assert.equal(amber.controllerId, 'alden');
  assert.equal(amber.legalOwnerId, 'belora');
  assert.equal(amber.occupied, true);
  assert.ok(economy.player.regionIds.includes('amber-plain'));
  const notice = economy.notices.find(entry => entry.event.type === 'zone-occupied');
  assert.ok(notice, 'the occupation is reported in the week of the capture');
  assert.equal(notice.severity, 'critical');
  assert.equal(notice.concernsPlayer, true);
  assert.equal(economy.session.week, game.week);
});

test('an invalid command rejects the whole week atomically; the next valid week is unaffected', () => {
  let { game, economy } = begin('alden');
  for (let k = 0; k < 3; k++) ({ game, economy } = advanceGameWeek(runtime, game, economy, []));
  const gameBefore = structuredClone(game);
  const economyBefore = fingerprint(economy);
  // Invalid military order (the game rejects it).
  assert.throws(() => advanceGameWeek(runtime, game, economy, [{ ...attackAmber, order: { kind: 'attack', targetRegionId: 'dawn-ridge' } } as TurnCommand]), /adjacent/);
  // Invalid economic command (the economy rejects it before the game turn runs).
  assert.throws(() => advanceGameWeek(runtime, game, economy, [], [{ type: 'set-tax', countryId: 'alden', tax: 'income', rate: 2 }]), /Tax rate/);
  // An economic command for another country.
  assert.throws(() => advanceGameWeek(runtime, game, economy, [], [{ type: 'set-tax', countryId: 'belora', tax: 'income', rate: 0.2 }]), /player's country/);
  // Too many diplomatic actions in one week (the game rejects it after nothing has been committed).
  assert.throws(() => advanceGameWeek(runtime, game, economy, [
    { type: 'declare', countryId: 'alden', targetId: 'belora', stance: 'goodwill' },
    { type: 'declare', countryId: 'alden', targetId: 'cyrin', stance: 'goodwill' },
  ]), /one diplomatic action/);
  assert.deepEqual(game, gameBefore, 'the game state is unchanged');
  assert.equal(fingerprint(economy), economyBefore, 'the economy is unchanged');
  const next = advanceGameWeek(runtime, game, economy, []);
  const reference = begin('alden');
  let referenceGame: GameState = reference.game;
  let referenceEconomy = reference.economy;
  for (let k = 0; k < 4; k++) ({ game: referenceGame, economy: referenceEconomy } = advanceGameWeek(runtime, referenceGame, referenceEconomy, []));
  assert.equal(fingerprint(next.economy), fingerprint(referenceEconomy), 'as if the refused weeks never happened');
  assert.deepEqual(next.game, referenceGame);
});

test('diplomacy, military movement and combat play exactly as before the integration', () => {
  const script: TurnCommand[][] = [
    [attackAmber, { type: 'declare', countryId: 'alden', targetId: 'belora', stance: 'condemnation' }],
    [{ type: 'declare', countryId: 'alden', targetId: 'cyrin', stance: 'goodwill' }], [], [], [],
    [{ type: 'set-military-order', countryId: 'alden', divisionId: 'alden-first', order: { kind: 'move', targetRegionId: 'alden-vale' } }], [], [],
  ];
  let { game, economy } = begin('alden');
  let plain: GameState = selectCountry(createInitialState(), 'alden');
  for (const commands of script) {
    ({ game, economy } = advanceGameWeek(runtime, game, economy, commands));
    plain = advanceTurn(plain, commands);
    assert.deepEqual(game, plain, `week ${game.week}: the game half of the combined turn is the game's own turn`);
  }
  assert.equal(game.regions.find(region => region.id === 'amber-plain')!.ownerId, 'alden', 'combat captured the region');
  assert.ok(game.diplomaticMessages.length > 0, 'diplomacy took place');
});

test('a defeated player cannot advance further weeks', () => {
  const { game, economy } = begin('cyrin');
  assert.throws(() => advanceGameWeek(runtime, game, { ...economy, defeated: true }, []), /game is over/);
});

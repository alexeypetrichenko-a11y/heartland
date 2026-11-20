import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { EconomyEvent, EconomySession, GameTurnState } from '../src/integration/index.ts';
import {
  advanceEconomyWeek, advanceWeekTogether, checkEconomyCommands, createEconomySession, describeEconomyEvent, economyFingerprint,
  fictionalGameWorld, FICTIONAL_REGION_PROFILES, fiscalCommands, fiscalLimits, getCountryEconomy, getRegionEconomy, legacyEconomyView,
  loadEconomySession, saveEconomySession, SPENDING_CATEGORIES, startEconomyFromSave, TAX_KINDS, weeklyEconomyNotices, worldFingerprint,
} from '../src/integration/index.ts';
import { totalIssued, totalMoney } from '../src/core/stats.ts';
import { buildStartingSave, STARTING_SAVE_PATH } from '../sim/build-starting-save.ts';
// The game's own fixture (read only).
import { createInitialState } from '../../src/game/initialState.ts';
import { selectCountry } from '../../src/game/selectCountry.ts';

/**
 * Handoff (A1 approved): the pre-built starting economy, the direct fiscal controls, the combined
 * weekly turn with rollback, the single authoritative treasury and debt, and the event notices.
 */
const committed = readFileSync(STARTING_SAVE_PATH, 'utf8');
const fresh = createEconomySession(fictionalGameWorld('alden'));

test('the committed starting save is exactly what the generator builds (deterministic, up to date)', () => {
  assert.equal(buildStartingSave(), committed, 'run "npm run starting-save" after changing the engine or the scenario');
  const parsed = JSON.parse(committed);
  assert.equal(parsed.format, 'heartland-economy-session');
  assert.equal(parsed.version, 2);
  assert.equal(parsed.playerCountryId, null, 'the save serves every choice of player country');
  assert.equal(parsed.economy.turn, 1);
  assert.equal(parsed.worldFingerprint, worldFingerprint(fictionalGameWorld()));
});

test('starting from the save is identical to building the economy, for every player country', () => {
  for (const player of ['alden', 'belora', 'cyrin']) {
    const built = player === 'alden' ? fresh : createEconomySession(fictionalGameWorld(player));
    const loaded = startEconomyFromSave(committed, fictionalGameWorld(player));
    assert.equal(loaded.playerCountryId, player);
    assert.equal(economyFingerprint(loaded), economyFingerprint(built));
    assert.deepEqual(loaded.summary, built.summary);
    // And they stay identical when played.
    const commands = fiscalCommands(player, { taxes: { income: 0.2 } });
    let a = built, b = loaded;
    for (let week = 0; week < 20; week++) {
      a = advanceEconomyWeek(a, { playerCommands: week === 0 ? commands : [] });
      b = advanceEconomyWeek(b, { playerCommands: week === 0 ? commands : [] });
    }
    assert.equal(economyFingerprint(a), economyFingerprint(b));
  }
});

test('the real game state starts from the save; a save for another world or week is refused', () => {
  const game = selectCountry(createInitialState(), 'belora');
  const session = startEconomyFromSave(committed, game);
  assert.equal(session.week, game.week);
  assert.equal(getCountryEconomy(session, 'belora').controller, 'player');
  const changed = (edit: (world: ReturnType<typeof fictionalGameWorld>) => void) => {
    const world = structuredClone(fictionalGameWorld('alden'));
    edit(world);
    return () => startEconomyFromSave(committed, world);
  };
  assert.throws(changed(world => { world.seed = 7; }), /different game world/);
  assert.throws(changed(world => { (world.regions as unknown as { ownerId: string }[])[0].ownerId = 'cyrin'; }), /different game world/);
  assert.throws(changed(world => { (world.countries as unknown as { name: string }[])[0].name = 'Aldenia'; }), /different game world/);
  assert.throws(() => startEconomyFromSave(committed, fictionalGameWorld('alden'), { profiles: { ...FICTIONAL_REGION_PROFILES, 'alden-vale': { population: 31, technology: 1.6 } } }), /different game world/);
  assert.throws(() => startEconomyFromSave(saveEconomySession(advanceEconomyWeek(fresh)), fictionalGameWorld('alden')), /must be at week 1/);
  assert.throws(() => startEconomyFromSave('not json', fictionalGameWorld('alden')), /not valid JSON/);
  // Adjacency order does not matter.
  const reordered = structuredClone(fictionalGameWorld('alden'));
  (reordered.regions as unknown as { adjacentRegionIds: string[] }[])[2].adjacentRegionIds.reverse();
  assert.equal(worldFingerprint(reordered), worldFingerprint(fictionalGameWorld()));
});

test('direct fiscal controls: three taxes and four spending categories, in force from the next week', () => {
  const limits = fiscalLimits(fresh);
  assert.deepEqual(limits, { maxTaxRate: 0.7, maxSpendingShare: 0.5 });
  const before = getCountryEconomy(fresh, 'alden').fiscal;
  assert.deepEqual(Object.keys(before.taxes), [...TAX_KINDS]);
  assert.deepEqual(Object.keys(before.spending), [...SPENDING_CATEGORIES]);
  const target = {
    taxes: { income: 0.24, consumption: 0.12, corporate: 0.21 },
    spending: { administration: 0.05, social: 0.13, military: 0.03, infrastructure: 0.04 },
  };
  const commands = fiscalCommands('alden', target);
  assert.equal(commands.length, 7);
  assert.deepEqual(commands[0], { type: 'set-tax', countryId: 'alden', tax: 'income', rate: 0.24 });
  assert.deepEqual(commands[6], { type: 'set-spending', countryId: 'alden', category: 'infrastructure', share: 0.04 });
  assert.equal(checkEconomyCommands(fresh, commands), null);
  const next = advanceEconomyWeek(fresh, { playerCommands: commands });
  assert.deepEqual(getCountryEconomy(next, 'alden').fiscal, target);
  // Only what is given changes.
  const one = advanceEconomyWeek(next, { playerCommands: fiscalCommands('alden', { spending: { social: 0.15 } }) });
  assert.deepEqual(getCountryEconomy(one, 'alden').fiscal, { ...target, spending: { ...target.spending, social: 0.15 } });
  // Limits are the engine's, with a reason the UI can show.
  assert.match(checkEconomyCommands(fresh, fiscalCommands('alden', { taxes: { corporate: 0.71 } })) ?? '', /Tax rate must be a number from 0 to 0.7/);
  assert.match(checkEconomyCommands(fresh, fiscalCommands('alden', { spending: { military: 0.6 } })) ?? '', /Spending share must be a number from 0 to 0.5/);
  assert.match(checkEconomyCommands(fresh, fiscalCommands('alden', { taxes: { income: -0.1 } })) ?? '', /Tax rate/);
  assert.match(checkEconomyCommands(fresh, fiscalCommands('cyrin', { taxes: { income: 0.1 } })) ?? '', /player's country/);
});

/** A stand-in for the game's own turn (after the migration: diplomacy, AI, military; no T06). */
interface StubGame extends GameTurnState { week: number; regions: { id: string; ownerId: string }[] }
const stubGame = (): StubGame => ({ week: 1, regions: fictionalGameWorld().regions.map(region => ({ id: region.id, ownerId: region.ownerId })) });
const capture = (game: StubGame): StubGame => ({ week: game.week + 1, regions: game.regions.map(region => (region.id === 'amber-plain' ? { ...region, ownerId: 'alden' } : region)) });
const quiet = (game: StubGame): StubGame => ({ ...game, week: game.week + 1 });

test('combined weekly turn: game first, economy with the new region owners, both returned together', () => {
  const result = advanceWeekTogether({ game: stubGame(), session: fresh, advanceGame: capture, economyCommands: fiscalCommands('alden', { taxes: { income: 0.22 } }) });
  assert.equal(result.game.week, 2);
  assert.equal(result.session.week, 2);
  const amber = getRegionEconomy(result.session, 'amber-plain');
  assert.equal(amber.controllerId, 'alden');
  assert.equal(amber.legalOwnerId, 'belora', 'capture is occupation, not annexation');
  assert.equal(getCountryEconomy(result.session, 'alden').fiscal.taxes.income, 0.22);
});

test('combined weekly turn rolls back as a whole: nothing changes when any step fails', () => {
  const game = stubGame();
  const before = economyFingerprint(fresh);
  let gameRan = false;
  const spy = (g: StubGame) => { gameRan = true; return quiet(g); };
  // 1. An invalid economic command: refused before the game turn even runs.
  assert.throws(() => advanceWeekTogether({ game, session: fresh, advanceGame: spy, economyCommands: fiscalCommands('alden', { taxes: { income: 2 } }) }), /Tax rate/);
  assert.equal(gameRan, false);
  // 2. The game turn fails (for example an invalid military order).
  assert.throws(() => advanceWeekTogether({ game, session: fresh, advanceGame: () => { throw new Error('Invalid military order.'); } }), /military/);
  // 3. The economy fails after the game turn ran (an invalid effect).
  assert.throws(() => advanceWeekTogether({ game, session: fresh, advanceGame: quiet, effects: [{ type: 'destroy-stock', zoneId: 'reed-coast', goodId: 'all', fraction: 3 }] }), /Fraction/);
  // 4. Out of step, or a game turn that does not advance one week.
  assert.throws(() => advanceWeekTogether({ game: { ...game, week: 2 }, session: fresh, advanceGame: quiet }), /differ/);
  assert.throws(() => advanceWeekTogether({ game, session: fresh, advanceGame: g => g }), /exactly one week/);
  assert.equal(game.week, 1);
  assert.equal(economyFingerprint(fresh), before);
  // The next valid week is as if the refused attempts never happened.
  assert.equal(economyFingerprint(advanceWeekTogether({ game, session: fresh, advanceGame: quiet }).session), economyFingerprint(advanceEconomyWeek(fresh)));
});

test('one authoritative treasury and debt: every change is explained by the budget, also through deficits, missed payments and default', () => {
  let session = fresh;
  const record: string[] = [];
  for (let week = 2; week <= 156; week++) {
    const before = session.summary.countries.map(view => ({ treasury: view.treasury, debt: view.debt }));
    // Alden runs a large deficit, then stops borrowing (missed payments), then defaults.
    const playerCommands = week === 10 ? fiscalCommands('alden', { taxes: { income: 0, consumption: 0, corporate: 0 }, spending: { social: 0.3 } })
      : week === 20 ? [{ type: 'set-borrowing' as const, countryId: 'alden', enabled: false }]
        : week === 120 ? [{ type: 'declare-default' as const, countryId: 'alden' }] : [];
    session = advanceEconomyWeek(session, { playerCommands });
    for (const event of session.summary.events) if (event.countryId === 'alden' && /default|missed/.test(event.type)) record.push(event.type);
    session.summary.countries.forEach((view, c) => {
      const b = view.budget;
      const tolerance = 1e-9 * Math.max(1, b.revenue, before[c].debt);
      assert.ok(Math.abs(view.treasury - (before[c].treasury + b.revenue - b.expenditure + b.borrowed - b.repaid)) <= tolerance, `${view.countryId} treasury, week ${week}`);
      const writtenOff = session.summary.events.reduce((total, e) => total + (e.type === 'sovereign-default' && e.countryId === view.countryId ? e.debtWrittenOff : 0), 0);
      const expectedDebt = before[c].debt + b.borrowed - b.repaid - writtenOff + b.detail.unpaidInterest;
      assert.ok(Math.abs(view.debt - expectedDebt) <= tolerance, `${view.countryId} debt, week ${week}: ${view.debt} vs ${expectedDebt}`);
      assert.equal(legacyEconomyView(view).treasury, view.treasury, 'the legacy panel shows the same treasury, not a second one');
    });
    // All money in circulation (households, firms, treasuries) is money issued by the central banks: none appears from nowhere.
    assert.ok(Math.abs(totalMoney(session.state) - totalIssued(session.state)) <= 1e-9 * totalIssued(session.state));
  }
  assert.ok(record.includes('missed-payment'), 'the stress phase produced missed payments');
  assert.ok(record.includes('sovereign-default'), 'and a default');
});

test('every economy event has a notice; the player\'s regime change is the defeat notice', () => {
  const sample: EconomyEvent[] = [
    { type: 'sovereign-default', turn: 5, countryId: 'alden', forced: true, haircut: 0.55, debtWrittenOff: 10 },
    { type: 'market-access-lost', turn: 5, countryId: 'alden', rate: 0.21 },
    { type: 'market-access-restored', turn: 5, countryId: 'alden', rate: 0.13 },
    { type: 'unrest-started', turn: 5, countryId: 'belora', tier: 1 },
    { type: 'unrest-escalated', turn: 5, countryId: 'belora', tier: 3 },
    { type: 'unrest-ended', turn: 5, countryId: 'belora' },
    { type: 'regime-survived', turn: 5, countryId: 'belora', tier: 2, probability: 0.5 },
    { type: 'regime-change', turn: 5, countryId: 'belora', tier: 3, probability: 1, regime: 1 },
    { type: 'regime-change', turn: 5, countryId: 'alden', tier: 2, probability: 0.5, regime: 1 },
    { type: 'missed-payment', turn: 5, countryId: 'alden', consecutive: 2 },
    { type: 'money-created', turn: 5, countryId: 'alden', amount: 4 },
    { type: 'firm-bankruptcy', turn: 5, countryId: 'cyrin', zoneId: 'dawn-ridge', sectorId: 'heavy_industry', ownership: 'private', capacityShare: 0.2, debt: 1, recovered: 0.5, writtenOff: 0.5, assetsSold: 0, assetsHeld: 0 },
    { type: 'zone-occupied', turn: 5, countryId: 'cyrin', zoneId: 'reed-coast', occupierId: 'cyrin', sovereignId: 'alden', policy: 'moderate' },
    { type: 'zone-liberated', turn: 5, countryId: 'alden', zoneId: 'reed-coast', sovereignId: 'alden', formerOccupierId: 'cyrin' },
    { type: 'zone-annexed', turn: 5, countryId: 'cyrin', zoneId: 'reed-coast', ownerId: 'cyrin', formerOwnerId: 'alden' },
    { type: 'sabotage', turn: 5, countryId: 'cyrin', zoneId: 'reed-coast', occupierId: 'cyrin', goodId: 'steel', capacity: 0.1, share: 0.03 },
    { type: 'occupation-revolt', turn: 5, countryId: 'cyrin', zoneId: 'reed-coast', occupierId: 'cyrin', resistance: 0.72 },
    { type: 'occupation-revolt-ended', turn: 5, countryId: 'cyrin', zoneId: 'reed-coast', occupierId: 'cyrin', resistance: 0.45 },
  ];
  const severities = sample.map(event => describeEconomyEvent(fresh, event).severity);
  assert.deepEqual(severities, ['critical', 'critical', 'info', 'warning', 'critical', 'info', 'warning', 'critical', 'defeat', 'warning', 'warning',
    'warning', 'critical', 'info', 'critical', 'warning', 'critical', 'info']);
  for (const event of sample) {
    const notice = describeEconomyEvent(fresh, event);
    assert.ok(notice.title.length > 0 && notice.message.length > 0 && !notice.message.includes('undefined'), event.type);
  }
  const occupied = describeEconomyEvent(fresh, sample[12]);
  assert.equal(occupied.regionId, 'reed-coast');
  assert.equal(occupied.concernsPlayer, true, 'the occupation of a region Alden legally owns concerns the player');
  assert.match(occupied.message, /Cyrin now controls the economy of Reed Coast, which legally remains part of Alden/);
  // In a real game: the player's regime falls, the summary flags defeat and the defeat notice comes first.
  let session: EconomySession = fresh;
  for (let week = 0; week < 60 && !session.summary.playerRegimeFell; week++) {
    session = advanceEconomyWeek(session, { effects: [{ type: 'stability-modifier', countryId: 'alden', value: -100 }] });
  }
  assert.ok(session.summary.playerRegimeFell);
  const notices = weeklyEconomyNotices(session);
  assert.equal(notices[0].severity, 'defeat');
  assert.equal(notices[0].countryId, 'alden');
});

test('save and load are equivalent at any week, including the starting save', () => {
  let session = startEconomyFromSave(committed, fictionalGameWorld('cyrin'));
  for (let week = 0; week < 40; week++) {
    session = advanceEconomyWeek(session, { playerCommands: week === 3 ? fiscalCommands('cyrin', { spending: { infrastructure: 0.05 } }) : [] });
    if (week % 13 === 0) {
      const restored = loadEconomySession(saveEconomySession(session));
      assert.deepEqual(restored.summary, session.summary);
      assert.equal(restored.worldFingerprint, session.worldFingerprint);
      assert.equal(economyFingerprint(advanceEconomyWeek(restored)), economyFingerprint(advanceEconomyWeek(session)));
    }
  }
});

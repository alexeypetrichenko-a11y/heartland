import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as api from '../../economy-engine/src/integration/index.ts';
import { advanceTurn } from '../game/advanceTurn.ts';
import { advanceGameWeek, economySnapshot, startEconomy, type EconomySnapshot } from '../game/economyBridge.ts';
import { createInitialState } from '../game/initialState.ts';
import type { GameState, TurnCommand } from '../game/models.ts';
import { emptyDrafts } from '../game/playerDrafts.ts';
import { decodeGameSave, encodeGameSave, restoreGameSave } from '../game/saveFormat.ts';
import { selectCountry } from '../game/selectCountry.ts';
import { formatMoney, formatPercent, formatSignedMoney, UNAVAILABLE } from './economyDashboard.ts';
import { readWeeklyReport } from './weeklyReport.ts';

const runtime = {
  api,
  startingSave: readFileSync(new URL('../../economy-engine/scenarios/fictional-week1.economy.json', import.meta.url), 'utf8'),
};
const capture: TurnCommand = { type: 'set-military-order', countryId: 'alden', divisionId: 'alden-first', order: { kind: 'attack', targetRegionId: 'amber-plain' } };
const begin = () => {
  const game = selectCountry(createInitialState(), 'alden');
  return { game, economy: startEconomy(runtime, game) };
};

test('a committed week reports authoritative figures and the seven observed fiscal changes', () => {
  const { game, economy } = begin();
  const commands = api.fiscalCommands('alden', {
    taxes: { income: .23175, consumption: .14, corporate: .255 },
    spending: { administration: .13, social: .12, military: .0325, infrastructure: .04 },
  });
  assert.equal(readWeeklyReport(game, economy), null, 'the initial engine snapshot is not a player turn');
  assert.throws(() => advanceGameWeek(runtime, game, economy, [], [
    ...commands, { type: 'set-tax', countryId: 'alden', tax: 'income', rate: 2 },
  ]), /Tax rate/);
  assert.equal(readWeeklyReport(game, economy), null, 'a refused turn leaves no report');

  const next = advanceGameWeek(runtime, game, economy, [], commands);
  const report = readWeeklyReport(next.game, next.economy)!;
  const player = next.economy.player;
  assert.equal(report.week, 1);
  assert.deepEqual(report.overview.map(row => row.value), [formatMoney(player.gdpReal), formatMoney(player.treasury), formatSignedMoney(player.budget.balance)]);
  assert.deepEqual(report.indicators.slice(0, 7).map(row => row.value), [
    formatMoney(player.budget.revenue), formatMoney(player.budget.expenditure), formatMoney(player.debt),
    formatPercent(player.debtToGdp), formatPercent(player.inflation), formatPercent(player.unemployment), `${formatMoney(player.stability)} / 100`,
  ]);
  assert.equal(report.applied.length, 7);
  assert.deepEqual(report.applied[0], { label: 'Income tax', before: economy.player.fiscal.taxes.income, rate: .23175 });
  assert.equal(report.fiscal.spending.find(rate => rate.label === 'Military spending')?.rate, .0325);
  assert.ok(!report.indicators.some(row => row.label === 'Annualised GDP growth'));
  const settledAgain = advanceGameWeek(runtime, next.game, next.economy, []);
  const standing = readWeeklyReport(settledAgain.game, settledAgain.economy)!;
  assert.deepEqual(standing.applied, []);
  assert.equal(standing.fiscal.taxes[0].rate, .23175);
  assert.equal(readWeeklyReport(next.game, settledAgain.economy), null, 'a mismatched snapshot is never a report');
});

test('the report uses the settled week’s diplomacy with private visibility and reports combat and occupation', () => {
  const prior = begin();
  let { game, economy } = advanceGameWeek(runtime, prior.game, prior.economy, [
    capture, { type: 'declare', countryId: 'alden', targetId: 'cyrin', stance: 'goodwill' },
  ]);
  const privateFixture = {
    ...game,
    diplomaticMessages: [...game.diplomaticMessages, {
      id: 'private-test', week: 1, visibility: 'private' as const, fromId: 'belora', toId: 'cyrin', status: 'pending' as const,
      relationshipChange: 0, reason: 'Bilateral offer.',
    }],
  };
  const first = readWeeklyReport(privateFixture, economy)!;
  assert.ok(first.politicalEvents.some(event => event.title === 'Alden declared goodwill toward Cyrin' && event.message === 'Relationship +5 points.'));
  assert.ok(first.politicalEvents.every(event => event.title !== 'Belora sent Cyrin a private cooperation offer'));
  assert.ok(first.militaryEvents.some(event => event.title === 'Battle at Amber Plain' && /Attacker losses \d/.test(event.message)));

  for (let i = 0; i < 4 && game.regions[2].ownerId !== 'alden'; i++) {
    ({ game, economy } = advanceGameWeek(runtime, game, economy, []));
  }
  const occupation = readWeeklyReport(game, economy)!;
  assert.ok(occupation.alerts.some(event => event.title === 'Amber Plain occupied' && event.severity === 'critical'));
  assert.ok(occupation.militaryEvents.some(event => /legally remains part of Belora/.test(event.message)));
  assert.ok(occupation.militaryEvents.some(event => event.title === 'Amber Plain captured'));
  assert.equal(occupation.territoryChanged, true);
  assert.equal(occupation.overview[0].change?.tone, 'neutral', 'control changes make the GDP comparison contextual');
  assert.ok(occupation.politicalEvents.every(event => event.title !== 'Alden declared goodwill toward Cyrin'));
});

test('authoritative defaults, credit disruption, instability and defeat keep the engine severity', () => {
  const initial = begin();
  const failure = advanceGameWeek(runtime, initial.game, initial.economy, [], [{ type: 'declare-default', countryId: 'alden' }]);
  const defaultReport = readWeeklyReport(failure.game, failure.economy)!;
  assert.equal(defaultReport.defeated, false);
  assert.ok(defaultReport.alerts.some(event => event.severity === 'critical' && /defaults on its debt/.test(event.title)));

  let { game, economy } = initial;
  let unrestWarning = false;
  for (let i = 0; i < 50 && !economy.defeated; i++) {
    const next = api.advanceWeekTogether({
      game, session: economy.session, advanceGame: advanceTurn,
      effects: [{ type: 'stability-modifier', countryId: 'alden', value: -100 }],
    });
    game = next.game;
    economy = economySnapshot(runtime, next.session, economy.player);
    unrestWarning ||= readWeeklyReport(game, economy)!.politicalEvents.some(event =>
      /Unrest/.test(event.title) && (event.severity === 'warning' || event.severity === 'critical'));
  }
  assert.ok(unrestWarning);
  const defeat = readWeeklyReport(game, economy)!;
  assert.equal(defeat.defeated, true);
  assert.equal(defeat.alerts[0]?.severity, 'defeat');
  assert.match(defeat.alerts[0].title, /Regime overthrown in Alden/);
  assert.throws(() => advanceGameWeek(runtime, game, economy, []), /game is over/);

  const accessEvent = api.describeEconomyEvent(economy.session, {
    type: 'market-access-lost', countryId: 'alden', rate: .35, turn: economy.session.week,
  });
  assert.equal(readWeeklyReport(game, { ...economy, notices: [accessEvent] })!.alerts[0].severity, 'critical');
});

test('unavailable fields stay unavailable and quiet weeks have no empty event groups', () => {
  const initial = begin();
  const { game, economy } = advanceGameWeek(runtime, initial.game, initial.economy, []);
  const partial = {
    ...economy,
    player: { ...economy.player, gdpReal: NaN, inflation: null, budget: undefined, fiscal: undefined, sectors: undefined },
    previous: { countryId: 'alden', treasury: economy.player.treasury },
    notices: [],
  } as unknown as EconomySnapshot;
  const report = readWeeklyReport({ ...game, diplomaticMessages: [] }, partial)!;
  assert.equal(report.overview[0].value, UNAVAILABLE);
  assert.equal(report.overview[0].change, undefined);
  assert.deepEqual(report.overview[1].change, { text: 'No change', tone: 'neutral' });
  assert.equal(report.overview[2].value, UNAVAILABLE);
  assert.ok(!report.indicators.some(row => /inflation|revenue/.test(row.label)));
  for (const entries of [report.alerts, report.shortages, report.applied, report.economyEvents, report.politicalEvents, report.militaryEvents]) {
    assert.deepEqual(entries, []);
  }
});

test('latest report survives restore and a legacy save only reports available comparisons', async () => {
  const first = begin();
  const next = advanceGameWeek(runtime, first.game, first.economy, [], api.fiscalCommands('alden', { taxes: { income: .234 } }));
  const encoded = JSON.parse(await encodeGameSave(runtime, { ...next, drafts: emptyDrafts() }));
  const saved = restoreGameSave(runtime, await decodeGameSave(JSON.stringify(encoded)));
  assert.deepEqual(readWeeklyReport(saved.game, saved.economy), readWeeklyReport(next.game, next.economy));
  assert.equal(encoded.version, 1);

  const data = JSON.parse(encoded.payload);
  function legacyReport(change: (data: { previous: object; game: GameState }) => void) {
    change(data);
    const payload = JSON.stringify(data);
    return decodeGameSave(JSON.stringify({ ...encoded, payload, checksum: createHash('sha256').update(payload).digest('hex') }))
      .then(record => {
        const restored = restoreGameSave(runtime, record);
        assert.equal(api.economyFingerprint(restored.economy.session), api.economyFingerprint(next.economy.session));
        return readWeeklyReport(restored.game, restored.economy)!;
      });
  }
  const missing = await legacyReport(data => { Reflect.deleteProperty(data.previous, 'comparison'); });
  const future = await legacyReport(data => { Object.assign(data.previous, { comparison: { version: 2 } }); });
  assert.deepEqual(missing, future);
  assert.deepEqual(missing.applied, []);
  assert.equal(missing.overview[0].change, undefined);
  assert.ok(missing.overview[1].change);
  assert.equal(missing.fiscal.taxes[0].rate, .234);
});

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as api from '../../economy-engine/src/integration/index.ts';
import { advanceTurn } from './advanceTurn.ts';
import { advanceGameWeek, economySnapshot, startEconomy } from './economyBridge.ts';
import { createInitialState } from './initialState.ts';
import type { MilitaryCommand, TurnCommand } from './models.ts';
import { emptyDrafts } from './playerDrafts.ts';
import { decodeGameSave, encodeGameSave, restoreGameSave, type PlayableSession } from './saveFormat.ts';
import { selectCountry } from './selectCountry.ts';

const runtime = { api, startingSave: readFileSync(new URL('../../economy-engine/scenarios/fictional-week1.economy.json', import.meta.url), 'utf8') };
const loadingRuntime = { api: { ...api, startEconomyFromSave() { throw new Error('Restore tried to start a different game.'); } } };
const capture: MilitaryCommand = { type: 'set-military-order', countryId: 'alden', divisionId: 'alden-first', order: { kind: 'attack', targetRegionId: 'amber-plain' } };

function begin(countryId = 'alden'): PlayableSession {
  const game = selectCountry(createInitialState(), countryId);
  return { game, economy: startEconomy(runtime, game), drafts: emptyDrafts() };
}

async function roundTrip(session: PlayableSession) {
  const record = await encodeGameSave(runtime, session);
  const restored = restoreGameSave(loadingRuntime, await decodeGameSave(record));
  assert.deepEqual(restored.game, session.game);
  assert.deepEqual(restored.drafts, session.drafts);
  assert.deepEqual(restored.economy.player, session.economy.player);
  assert.deepEqual(restored.economy.notices, session.economy.notices);
  assert.equal(restored.economy.previous?.treasury, session.economy.previous?.treasury);
  assert.equal(restored.economy.defeated, session.economy.defeated);
  assert.equal(restored.game.week, restored.economy.session.week);
  assert.equal(api.economyFingerprint(restored.economy.session), api.economyFingerprint(session.economy.session));
  return restored;
}

test('one slot keeps all active policies, control, diplomacy, standing orders and drafts after 1, 10, 52 and 104 turns', async () => {
  let session = begin();
  for (let turns = 1; turns <= 104; turns++) {
    const commands: TurnCommand[] = turns === 1 ? [
      capture, { type: 'declare', countryId: 'alden', targetId: 'belora', stance: 'condemnation' },
      { type: 'set-standing-order', order: { id: 'sample', countryId: 'alden', kind: 'placeholder', label: 'Maintain watch' } },
    ] : [];
    const fiscal = turns === 1 ? api.fiscalCommands('alden', {
      taxes: { income: .235, consumption: .12, corporate: .31 },
      spending: { administration: .12, social: .14, military: .04, infrastructure: .05 },
    }) : [];
    const next = advanceGameWeek(runtime, session.game, session.economy, commands, fiscal);
    session = { ...next, drafts: session.drafts };
    if (![1, 10, 52, 104].includes(turns)) continue;
    const restored = await roundTrip({
      ...session,
      drafts: {
        military: [{ ...capture, order: { kind: 'defend' } }],
        diplomacy: { type: 'declare', countryId: 'alden', targetId: 'cyrin', stance: 'goodwill' },
        fiscal: { income: '25,125', social: '105' },
      },
    });
    assert.equal(restored.game.week, turns + 1);
    assert.equal(restored.game.standingOrders[0]?.id, 'sample');
    assert.equal(restored.economy.player.fiscal.taxes.income, .235);
    assert.equal(restored.economy.player.fiscal.spending.infrastructure, .05);
    assert.ok(restored.game.diplomaticMessages.some(message => message.fromId === 'alden' && message.toId === 'belora'));
    if (turns >= 10) {
      const amber = api.getRegionEconomy(restored.economy.session, 'amber-plain');
      assert.equal(amber.legalOwnerId, 'belora');
      assert.equal(amber.controllerId, 'alden');
      assert.equal(amber.occupied, true);
    }
  }
});

test('deterministic continuation matches an uninterrupted game for 20 weeks', async () => {
  let live = begin('belora');
  for (let i = 0; i < 10; i++) {
    live = { ...advanceGameWeek(runtime, live.game, live.economy, []), drafts: emptyDrafts() };
  }
  let resumed = await roundTrip(live);
  for (let i = 0; i < 20; i++) {
    const commands: TurnCommand[] = i % 2 === 0 ? [{ type: 'declare', countryId: 'belora', targetId: 'alden', stance: 'goodwill' }] : [];
    const fiscal = i === 4 || i === 13 ? api.fiscalCommands('belora', { taxes: { income: i === 4 ? .16 : .215 } }) : [];
    live = { ...advanceGameWeek(runtime, live.game, live.economy, commands, fiscal), drafts: emptyDrafts() };
    resumed = { ...advanceGameWeek(runtime, resumed.game, resumed.economy, commands, fiscal), drafts: emptyDrafts() };
    assert.deepEqual(resumed.game, live.game);
    assert.equal(api.saveEconomySession(resumed.economy.session), api.saveEconomySession(live.economy.session));
  }
});

test('a regime overthrow restores the final week and prevents advancement', async () => {
  let { game, economy } = begin();
  for (let i = 0; i < 50 && !economy.defeated; i++) {
    const next = api.advanceWeekTogether({
      game, session: economy.session, advanceGame: advanceTurn,
      effects: [{ type: 'stability-modifier', countryId: 'alden', value: -100 }],
    });
    game = next.game;
    economy = economySnapshot(runtime, next.session, economy.player);
  }
  assert.equal(economy.defeated, true);
  const restored = await roundTrip({ game, economy, drafts: emptyDrafts() });
  assert.ok(restored.economy.notices.some(notice => notice.severity === 'defeat'));
  assert.throws(() => advanceGameWeek(runtime, restored.game, restored.economy, []), /game is over/);
});

test('damaged, unsupported and inconsistent saves are rejected before play', async () => {
  const session = begin();
  const record = await encodeGameSave(runtime, session);
  const envelope = JSON.parse(record);
  await assert.rejects(() => decodeGameSave(record.slice(0, -8)), /could not be read/);
  await assert.rejects(() => decodeGameSave(JSON.stringify({ ...envelope, version: 999 })), /version is unsupported/);
  await assert.rejects(() => decodeGameSave(JSON.stringify({ ...envelope, payload: '{}' })), /is damaged/);
  const malformed = JSON.parse(envelope.payload);
  malformed.game.divisions.pop();
  const payload = JSON.stringify(malformed);
  await assert.rejects(() => decodeGameSave(JSON.stringify({
    ...envelope, payload, checksum: createHash('sha256').update(payload).digest('hex'),
  })), /state is incomplete/);

  const save = await decodeGameSave(record);
  const foreign = await decodeGameSave(await encodeGameSave(runtime, begin('cyrin')));
  assert.throws(() => restoreGameSave(runtime, { ...save, economy: foreign.economy }), /do not match/);
  const later = await encodeGameSave(runtime, { ...advanceGameWeek(runtime, session.game, session.economy, []), drafts: emptyDrafts() });
  assert.throws(() => restoreGameSave(runtime, { ...save, economy: JSON.parse(JSON.parse(later).payload).economy }), /do not match/);
  assert.throws(() => restoreGameSave(runtime, { ...save, defeated: true }), /inconsistent game ending/);
  const incompatibleEngine = { ...JSON.parse(save.economy), version: 999 };
  assert.throws(() => restoreGameSave(runtime, { ...save, economy: JSON.stringify(incompatibleEngine) }), /not supported/);
  const wrongControl = structuredClone(session);
  wrongControl.game.regions[0].ownerId = 'belora';
  await assert.rejects(() => encodeGameSave(runtime, wrongControl), /territorial control/);
});

test('successful checkpoint metadata preserves its saved time without changing legacy payloads', async () => {
  const session = begin();
  const savedAt = 1795718400123;
  const legacy = await decodeGameSave(await encodeGameSave(runtime, session));
  assert.equal(legacy.savedAt, undefined);
  const current = await decodeGameSave(await encodeGameSave(runtime, session, savedAt));
  assert.equal(current.savedAt, savedAt);
  assert.deepEqual(restoreGameSave(runtime, current).game, session.game);
});

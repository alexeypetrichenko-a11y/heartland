import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as api from '../src/integration/index.ts';
import { DEFAULT_PARAMS } from '../src/config/defaults.ts';
import { STATE_VERSION } from '../src/core/state.ts';
import { advanceGameWeek, startEconomy } from '../../src/game/economyBridge.ts';
import { createInitialState } from '../../src/game/initialState.ts';
import { decodeGameSave, encodeGameSave, restoreGameSave, type PlayableSession } from '../../src/game/saveFormat.ts';
import { selectCountry } from '../../src/game/selectCountry.ts';

/**
 * ECON-07 and SAVE-01: a game saved by the pre-ECON-07 game and engine (main at fde1c90, engine state v5) is
 * restored by the current game code and engine, checked field by field, and played 20 more turns. The fixture
 * holds the SAVE-01 record, the exact commands of those 20 turns, and what the old engine produced for them.
 * The game's own files are only read (as in handoff.test.ts).
 */
interface Figures { week: number; treasury: number; debt: number; stability: number; gdpReal: number; fiscal: unknown; defeated: boolean; economyDigest: string; gameSha: string }
const fixture = JSON.parse(readFileSync(new URL('./fixtures/save01-pre-econ07.json', import.meta.url), 'utf8')) as {
  record: string; atSave: Figures; phase2: { commands: never[]; fiscal: api.EconomyCommand[] }[]; after: Record<string, Figures>;
};
const runtime = { api, startingSave: readFileSync(new URL('../scenarios/fictional-week1.economy.json', import.meta.url), 'utf8') };
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const ECON07_PARAMS = ['spendingBaseFall', 'treasuryReserveWeeks', 'surplusReturnShare', 'voluntaryDefaultWeight', 'socialStabilityCap'];

/** Digest of the economy state with every ECON-07 addition removed (as computed for the fixture). */
function economyDigest(session: api.EconomySession): string {
  const state = JSON.parse(JSON.stringify(session.state));
  delete state.country.spendingBase;
  for (const key of ECON07_PARAMS) delete state.config.params[key];
  state.version = 5;
  return sha(JSON.stringify(state));
}

function figures(session: PlayableSession): Figures {
  const player = session.economy.player;
  return {
    week: session.economy.session.week, treasury: player.treasury, debt: player.debt, stability: player.stability, gdpReal: player.gdpReal,
    fiscal: player.fiscal, defeated: session.economy.defeated, economyDigest: economyDigest(session.economy.session), gameSha: sha(JSON.stringify(session.game)),
  };
}

/** The economic calibration a v5 economy keeps: legacy values for the new parameters, its own for the rest. */
function assertPreEcon07Calibration(session: api.EconomySession): void {
  const p = session.state.config.params;
  assert.equal(session.state.version, STATE_VERSION);
  assert.equal(p.spendingBaseFall, p.gdpSmoothing, 'the budget base follows GDP as before');
  assert.equal(p.surplusReturnShare, 0);
  assert.equal(p.voluntaryDefaultWeight, 0);
  assert.equal(p.socialStabilityCap, 0);
  assert.equal(p.defaultOutputShock, 0.06);
  assert.equal(p.defaultShockRecoveryWeeks, 52);
  assert.equal(p.reputationDecayWeeks, 156);
}

test('a SAVE-01 game saved before ECON-07 restores completely in the current game and engine', async () => {
  const save = await decodeGameSave(fixture.record);
  const restored = restoreGameSave(runtime, save);
  // Game half: country, week, military state, diplomacy, standing orders, drafts.
  assert.deepEqual(restored.game, save.game);
  assert.equal(restored.game.playerCountryId, 'alden');
  assert.equal(restored.game.week, 31);
  assert.equal(sha(JSON.stringify(restored.game)), fixture.atSave.gameSha);
  assert.equal(restored.game.regions.find(region => region.id === 'amber-plain')?.ownerId, 'alden', 'the captured region is still held');
  assert.ok(restored.game.divisions.length > 0);
  assert.ok(restored.game.diplomaticMessages.some(message => message.fromId === 'alden' && message.toId === 'belora'));
  assert.equal(restored.game.standingOrders[0]?.id, 'watch');
  assert.deepEqual(restored.drafts.fiscal, { income: '25,125', social: '105' });
  assert.deepEqual(restored.drafts.diplomacy, { type: 'declare', countryId: 'alden', targetId: 'cyrin', stance: 'goodwill' });
  // Economy half: same week, treasury, debt, policies; occupation; and the same economy apart from ECON-07 fields.
  const atSave = figures(restored);
  for (const key of ['week', 'treasury', 'debt', 'stability', 'gdpReal', 'defeated', 'economyDigest'] as const) assert.equal(atSave[key], fixture.atSave[key], key);
  assert.deepEqual(atSave.fiscal, fixture.atSave.fiscal);
  const amber = api.getRegionEconomy(restored.economy.session, 'amber-plain');
  assert.equal(amber.controllerId, 'alden');
  assert.equal(amber.legalOwnerId, 'belora');
  assert.equal(amber.occupied, true);
  assertPreEcon07Calibration(restored.economy.session);
});

test('20 more turns of the restored game match the pre-ECON-07 engine exactly, and the game and economy stay in step', async () => {
  let session = restoreGameSave(runtime, await decodeGameSave(fixture.record));
  for (const [index, step] of fixture.phase2.entries()) {
    session = { ...advanceGameWeek(runtime, session.game, session.economy, step.commands, step.fiscal), drafts: session.drafts };
    assert.equal(session.game.week, session.economy.session.week, 'game and economy are on the same week');
    const expected = fixture.after[String(index + 1)];
    if (!expected) continue;
    const actual = figures(session);
    for (const key of ['week', 'treasury', 'debt', 'stability', 'gdpReal', 'defeated', 'economyDigest', 'gameSha'] as const) {
      assert.equal(actual[key], expected[key], `${key} after ${index + 1} turns`);
    }
    assert.deepEqual(actual.fiscal, expected.fiscal);
  }
  // Saving and restoring again keeps the original calibration (no silent rebalancing), and SAVE-01's own checks
  // (checksum, game/economy agreement on week, player, scenario and territorial control) pass.
  const again = restoreGameSave(runtime, await decodeGameSave(await encodeGameSave(runtime, session)));
  assert.equal(api.economyFingerprint(again.economy.session), api.economyFingerprint(session.economy.session));
  assertPreEcon07Calibration(again.economy.session);
});

test('a SAVE-01 record damaged after ECON-07 is still rejected by its checksum', async () => {
  const envelope = JSON.parse(fixture.record);
  await assert.rejects(() => decodeGameSave(JSON.stringify({ ...envelope, payload: envelope.payload.replace('"week":31', '"week":32') })), /is damaged/);
  await assert.rejects(() => decodeGameSave(fixture.record.slice(0, -10)), /could not be read/);
});

test('a newly started game uses the ECON-07 economic parameters and the current starting economy', async () => {
  const game = selectCountry(createInitialState(), 'belora');
  const economy = startEconomy(runtime, game);
  const p = economy.session.state.config.params;
  assert.equal(economy.session.state.version, STATE_VERSION);
  for (const key of [...ECON07_PARAMS, 'defaultOutputShock', 'defaultShockRecoveryWeeks', 'reputationDecayWeeks']) {
    assert.equal((p as unknown as Record<string, number>)[key], (DEFAULT_PARAMS as unknown as Record<string, number>)[key], key);
  }
  assert.equal(p.spendingBaseFall, 1 / 104);
  assert.equal(p.socialStabilityCap, 8);
  assert.equal(p.voluntaryDefaultWeight, 0.5);
  // It survives a SAVE-01 round trip unchanged.
  const session: PlayableSession = { game, economy, drafts: { military: [], diplomacy: null, fiscal: {} } };
  const restored = restoreGameSave(runtime, await decodeGameSave(await encodeGameSave(runtime, session)));
  assert.equal(api.economyFingerprint(restored.economy.session), api.economyFingerprint(economy.session));
  assert.equal(restored.economy.session.state.config.params.socialStabilityCap, 8);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as api from '../../economy-engine/src/integration/index.ts';
import { readEuropeScenario, startEuropeGame } from './europeScenario.ts';
import { advanceGameWeek } from './economyBridge.ts';
import { emptyDrafts } from './playerDrafts.ts';
import { decodeGameSave, encodeGameSave, restoreGameSave } from './saveFormat.ts';

const root = new URL('../../scenarios/europe-2023/1.0.0-draft.2/', import.meta.url);
const read = async (name: string) => Uint8Array.from(await readFile(new URL(name, root)));
const load = () => readEuropeScenario({ api }, read);
const europe = await load();
const runtime = { api, europe };

test('loads the immutable opening for all six playable countries without changing fiscal figures', () => {
  assert.deepEqual(europe.countries.map(country => country.id), ['fra', 'deu', 'gbr', 'ita', 'pol', 'tur']);
  for (const { id } of europe.countries) {
    const { game, economy } = startEuropeGame(runtime, id);
    assert.equal(game.playerCountryId, id);
    assert.equal(economy.session.playerCountryId, id);
    assert.equal(game.week, 1);
    assert.deepEqual(economy.player, { ...api.getCountryEconomy(europe.opening, id), controller: 'player' });
    const turn = advanceGameWeek(runtime, game, economy, []);
    assert.equal(turn.game.week, 2);
    assert.equal(turn.economy.session.week, 2);
    assert.equal(turn.economy.player.countryId, id);
  }
  assert.throws(() => startEuropeGame(runtime, 'irl'), /playable/);
});

test('preserves distinct land, maritime and military edges, including Corsica', () => {
  const corsica = europe.provinces.find(region => region.id === 'fra-cor')!;
  assert.deepEqual(corsica.landAdjacentRegionIds, []);
  assert.ok(corsica.maritimeLinkedRegionIds.includes('fra-se'));
  assert.deepEqual(corsica.movementAdjacentRegionIds, []);
  for (const region of europe.provinces) {
    const legal = europe.fixture.regions.find(entry => entry.id === region.id)!.adjacentRegionIds;
    assert.deepEqual(legal, region.movementAdjacentRegionIds);
    assert.ok(legal.every(id => region.landAdjacentRegionIds.includes(id)));
  }
});

test('rejects damaged assets and an incompatible version before opening a game', async () => {
  await assert.rejects(readEuropeScenario({ api }, async name => {
    const data = await read(name);
    if (name === 'scenario.json') data[0] = 0;
    return data;
  }), /integrity check/);
  await assert.rejects(readEuropeScenario({ api }, async name => name === 'manifest.json'
    ? new TextEncoder().encode(JSON.stringify({ id: 'europe-2023', version: '1.0.0-draft.1' })) : read(name)), /unsupported/);
});

test('European saves retain ownership and drafts and replay a fiscal and diplomatic week exactly', async () => {
  const start = startEuropeGame(runtime, 'fra');
  const decisions = [{ type: 'declare', countryId: 'fra', targetId: 'deu', stance: 'goodwill' }] as const;
  const drafts = { ...emptyDrafts(), fiscal: { income: '27' }, diplomacy: decisions[0] };
  const data = await encodeGameSave(runtime, { ...start, drafts });
  await assert.rejects(decodeGameSave(data), /restricted Europe 2023/);
  const save = await decodeGameSave(data, load);
  const restored = restoreGameSave(runtime, save);
  assert.deepEqual(restored.drafts, drafts);
  assert.equal(save.scenario?.worldFingerprint, europe.identity.worldFingerprint);
  assert.throws(() => restoreGameSave(runtime, { ...save, scenario: { ...save.scenario!, economyFingerprint: '0000000000000000' } }), /fingerprint/);
  assert.throws(() => restoreGameSave(runtime, { ...save, game: { ...save.game,
    regions: save.game.regions.map(region => region.id === 'fra-cor' ? { ...region, ownerId: 'ita' } : region),
  } }), /invalid/);
  const fiscal = [{ type: 'set-tax', countryId: 'fra', tax: 'income', rate: 0.27 }] as const;
  const first = advanceGameWeek(runtime, start.game, start.economy, decisions, fiscal);
  const replay = advanceGameWeek(runtime, restored.game, restored.economy, [restored.drafts.diplomacy!], fiscal);
  assert.deepEqual(replay.game, first.game);
  assert.equal(api.economyFingerprint(replay.economy.session), api.economyFingerprint(first.economy.session));
  assert.equal(replay.economy.player.fiscal.taxes.income, 0.27);
  assert.equal(replay.game.diplomaticMessages[0].toId, 'deu');
  assert.throws(() => advanceGameWeek(runtime, start.game, start.economy, [], [{ ...fiscal[0], rate: 3 }]));
  assert.equal(start.game.week, 1);
  assert.equal(start.economy.session.week, 1);
});

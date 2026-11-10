import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideDiplomacy } from './ai.ts';
import { advanceTurn } from './advanceTurn.ts';
import { applyDiplomaticCommand, relationshipValue } from './diplomacy.ts';
import { createInitialState } from './initialState.ts';
import { selectCountry } from './selectCountry.ts';

const start = (id = 'alden') => selectCountry(createInitialState(), id);

test('each non-player country takes exactly one meaningful diplomatic action each week for all player choices', () => {
  for (const selected of ['alden', 'belora', 'cyrin']) {
    let state = start(selected);
    for (let week = 1; week <= 12; week++) {
      const result = advanceTurn(state);
      const actions = result.diplomaticMessages.filter(message => !state.diplomaticMessages.some(previous => previous.id === message.id))
        .map(message => message.fromId);
      for (const message of result.diplomaticMessages) {
        const before = state.diplomaticMessages.find(previous => previous.id === message.id);
        if (message.visibility === 'private' && message.resolvedWeek === state.week
          && (!before || (before.visibility === 'private' && before.status === 'pending'))) actions.push(message.toId);
      }
      assert.deepEqual(actions.sort(), state.countries.filter(country => country.controller === 'ai').map(country => country.id).sort());
      state = result;
    }
    assert.ok(state.relations.some(relation => relation.value > 0));
    assert.throws(() => decideDiplomacy(state, selected), /fictional AI/);
  }
});

test('national priorities select stronger partnerships for Alden and weaker relationships for Belora/Cyrin', () => {
  const alden = start('cyrin'); alden.relations[0].value = 20; alden.relations[1].value = -20;
  assert.deepEqual(decideDiplomacy(alden, 'alden').command, { type: 'offer-cooperation', countryId: 'alden', targetId: 'belora' });
  const state = start(); state.relations[0].value = 20; state.relations[2].value = -20;
  const belora = decideDiplomacy(state, 'belora');
  assert.deepEqual(belora.command, { type: 'offer-cooperation', countryId: 'belora', targetId: 'cyrin' });
  const cyrin = decideDiplomacy(state, 'cyrin');
  assert.deepEqual(cyrin.command, { type: 'declare', countryId: 'cyrin', targetId: 'belora', stance: 'goodwill' });
});

test('AI offer acceptance follows each provisional threshold including boundaries', () => {
  for (const [id, threshold] of [['alden', -10], ['belora', -30], ['cyrin', 0]] as const) {
    const sender = id === 'alden' ? 'belora' : 'alden';
    for (const value of [threshold - 1, threshold, threshold + 1]) {
      const state = start(sender);
      state.relations.find(relation => relation.countryIds.includes(id) && relation.countryIds.includes(sender))!.value = value;
      const pending = applyDiplomaticCommand(state, { type: 'offer-cooperation', countryId: sender, targetId: id });
      const decision = decideDiplomacy(pending, id);
      assert.deepEqual(decision.command, { type: 'respond-offer', countryId: id, offerId: pending.diplomaticMessages[0].id, response: value >= threshold ? 'accept' : 'reject' });
      assert.match(decision.reason, /minimum/);
    }
  }
});

test('AI visibly reacts to current player declarations and not stale public messages', () => {
  for (const stance of ['goodwill', 'condemnation'] as const) {
    const result = advanceTurn(start(), [{ type: 'declare', countryId: 'alden', targetId: 'belora', stance }]);
    const reaction = result.diplomaticMessages.find(message => message.fromId === 'belora');
    assert.ok(reaction?.visibility === 'public');
    assert.equal(reaction.toId, 'alden'); assert.equal(reaction.stance, stance);
    assert.equal(relationshipValue(result, 'alden', 'belora'), stance === 'goodwill' ? 10 : -20);
    assert.doesNotMatch(decideDiplomacy(result, 'belora').reason, /Responding to/);
  }
});

test('player condemnation changes a cautious AI response to subsequent private cooperation', () => {
  const friendly = advanceTurn(start(), [{ type: 'offer-cooperation', countryId: 'alden', targetId: 'cyrin' }]);
  assert.equal(friendly.diplomaticMessages[0].visibility === 'private' && friendly.diplomaticMessages[0].status, 'accepted');
  const condemned = advanceTurn(start(), [{ type: 'declare', countryId: 'alden', targetId: 'cyrin', stance: 'condemnation' }]);
  const result = advanceTurn(condemned, [{ type: 'offer-cooperation', countryId: 'alden', targetId: 'cyrin' }]);
  const offer = result.diplomaticMessages.find(message => message.visibility === 'private' && message.fromId === 'alden' && message.toId === 'cyrin');
  assert.equal(offer?.visibility === 'private' && offer.status, 'rejected');
});

test('AI ignores other countries’ private offers and answers its own oldest pending offer first', () => {
  const state = start();
  const baseline = decideDiplomacy(state, 'cyrin');
  const secret = applyDiplomaticCommand(state, { type: 'offer-cooperation', countryId: 'alden', targetId: 'belora' });
  assert.deepEqual(decideDiplomacy(secret, 'cyrin'), baseline);
  const own = applyDiplomaticCommand(secret, { type: 'offer-cooperation', countryId: 'alden', targetId: 'cyrin' });
  const next = applyDiplomaticCommand({ ...own, week: 2 }, { type: 'offer-cooperation', countryId: 'belora', targetId: 'cyrin' });
  assert.deepEqual(decideDiplomacy(next, 'cyrin').command, { type: 'respond-offer', countryId: 'cyrin', offerId: own.diplomaticMessages[1].id, response: 'accept' });
});

test('AI public explanations never disclose that a bilateral offer is pending', () => {
  const pending = applyDiplomaticCommand(start(), { type: 'offer-cooperation', countryId: 'belora', targetId: 'alden' });
  const decision = decideDiplomacy(pending, 'belora');
  assert.equal(decision.command.type, 'declare');
  assert.equal(decision.reason, 'Repair weak relationships.');
  const result = advanceTurn(pending);
  const outsiders = result.diplomaticMessages.filter(message => message.visibility === 'public' && message.fromId === 'belora');
  assert.equal(outsiders.length, 1);
  assert.doesNotMatch(outsiders[0].reason, /offer|pending|private/);
});

test('AI diplomatic outcomes do not change fixed budgets, player policy, movement or exact combat outcomes', () => {
  const state = start();
  let result = advanceTurn(state, [
    { type: 'set-economic-policy', countryId: 'alden', policy: 'tax-relief' },
    { type: 'set-military-order', countryId: 'alden', divisionId: 'alden-first', order: { kind: 'attack', targetRegionId: 'amber-plain' } },
    { type: 'declare', countryId: 'alden', targetId: 'belora', stance: 'condemnation' },
  ]);
  assert.deepEqual(result.divisions.map(division => division.manpower), [750, 500, 1000]);
  result = advanceTurn(advanceTurn(result));
  assert.deepEqual(result.divisions.map(division => division.manpower), [593, 0, 1000]);
  assert.equal(result.regions.find(region => region.id === 'amber-plain')!.ownerId, 'alden');
  assert.deepEqual(result.countries.map(country => country.economy.treasury), [94, 102, 122]);
  assert.equal(result.countries[0].economicPolicy, 'tax-relief');
  assert.ok(result.divisions.filter(division => division.ownerId !== 'alden').every(division => division.order.kind === 'defend'));
  const moved = advanceTurn(start(), [{ type: 'set-military-order', countryId: 'alden', divisionId: 'alden-first', order: { kind: 'move', targetRegionId: 'reed-coast' } }]);
  assert.equal(moved.divisions[0].regionId, 'reed-coast');
});

test('AI decisions use stable country IDs rather than country/relationship array order', () => {
  const state = start('cyrin');
  const reordered = { ...state, countries: [...state.countries].reverse(), relations: [...state.relations].reverse() };
  assert.deepEqual(advanceTurn(state).diplomaticMessages, advanceTurn(reordered).diplomaticMessages);
});

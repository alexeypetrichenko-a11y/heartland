import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInitialState } from './initialState.ts';
import { selectCountry } from './selectCountry.ts';

test('each country can be the sole player without changing the fixture statistics or world', () => {
  const initial = createInitialState();
  const baseline = JSON.stringify(initial);
  for (const country of initial.countries) {
    const selected = selectCountry(initial, country.id);
    assert.equal(selected.playerCountryId, country.id);
    assert.deepEqual(selected.countries.filter(c => c.controller === 'player').map(c => c.id), [country.id]);
    assert.equal(selected.countries.filter(c => c.controller === 'ai').length, 2);
    assert.deepEqual({ ...selected, playerCountryId: null, countries: selected.countries.map(c => ({ ...c, controller: 'ai' })) }, initial);
    assert.deepEqual(JSON.parse(JSON.stringify(selected)), selected);
  }
  assert.equal(JSON.stringify(initial), baseline);
});

test('a replacement choice leaves exactly one player and rejects unavailable IDs', () => {
  const selected = selectCountry(createInitialState(), 'alden');
  const replaced = selectCountry(selected, 'cyrin');
  assert.deepEqual(replaced.countries.map(c => c.controller), ['ai', 'ai', 'player']);
  const baseline = JSON.stringify(selected);
  for (const id of ['', 'missing']) assert.throws(() => selectCountry(selected, id), /available country/);
  assert.equal(JSON.stringify(selected), baseline);
});

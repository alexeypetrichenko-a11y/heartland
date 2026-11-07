import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInitialState } from './initialState.ts';
import type { GameState } from './models.ts';

function assertOwnership(state: GameState) {
  const players = state.countries.filter(country => country.controller === 'player');
  assert.deepEqual(players.map(country => country.id), state.playerCountryId === null ? [] : [state.playerCountryId]);
}

test('fictional countries, regions and divisions have unique IDs and valid owners', () => {
  const state = createInitialState();
  assert.equal(state.countries.length, 3);
  assert.equal(state.regions.length, 6);
  for (const entries of [state.countries, state.regions, state.divisions]) {
    assert.equal(new Set(entries.map(entry => entry.id)).size, entries.length);
    for (const entry of entries) {
      assert.ok(entry.id.length > 0);
      assert.ok(entry.name.length > 0);
    }
  }
  const countries = new Set(state.countries.map(country => country.id));
  for (const region of state.regions) assert.ok(countries.has(region.ownerId));
  for (const country of state.countries) {
    assert.ok(state.regions.some(region => region.ownerId === country.id));
    for (const value of Object.values(country.economy)) {
      assert.ok(Number.isFinite(value) && value >= 0);
    }
  }
  for (const division of state.divisions) {
    assert.ok(countries.has(division.ownerId));
    const region = state.regions.find(region => region.id === division.regionId);
    assert.ok(region);
    assert.equal(region.ownerId, division.ownerId);
    assert.ok(Number.isInteger(division.manpower) && division.manpower > 0);
  }
});

test('adjacency is explicit, reciprocal, connected and has no missing or self references', () => {
  const { regions } = createInitialState();
  for (const region of regions) {
    assert.ok(region.adjacentRegionIds.length > 0);
    assert.equal(new Set(region.adjacentRegionIds).size, region.adjacentRegionIds.length);
    for (const id of region.adjacentRegionIds) {
      assert.notEqual(id, region.id);
      const neighbor = regions.find(candidate => candidate.id === id);
      assert.ok(neighbor);
      assert.ok(neighbor.adjacentRegionIds.includes(region.id));
    }
  }
  const visited = new Set<string>();
  const pending = [regions[0].id];
  while (pending.length) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    pending.push(...regions.find(region => region.id === id)!.adjacentRegionIds);
  }
  assert.equal(visited.size, regions.length);
});

test('every country pair has exactly one neutral relation', () => {
  const { countries, relations } = createInitialState();
  const pairs = new Set<string>();
  for (const relation of relations) {
    const [first, second] = relation.countryIds;
    assert.notEqual(first, second);
    for (const id of relation.countryIds) assert.ok(countries.some(country => country.id === id));
    const key = [...relation.countryIds].sort().join(':');
    assert.ok(!pairs.has(key));
    pairs.add(key);
    assert.equal(relation.value, 0);
  }
  assert.equal(pairs.size, countries.length * (countries.length - 1) / 2);
});

test('initial week, seed and unselected ownership are explicit and stable', () => {
  const state = createInitialState();
  assert.equal(state.week, 1);
  assert.equal(state.seed, 2401);
  assert.equal(state.playerCountryId, null);
  assert.ok(state.countries.every(country => country.controller === 'ai'));
  assertOwnership(state);
  assert.deepEqual(createInitialState(), state);
});

test('JSON round trips preserve all data, including a representable player selection', () => {
  const initial = createInitialState();
  assert.deepEqual(JSON.parse(JSON.stringify(initial)), initial);
  const selected = createInitialState();
  selected.playerCountryId = selected.countries[0].id;
  selected.countries[0].controller = 'player';
  const restored: GameState = JSON.parse(JSON.stringify(selected));
  assert.deepEqual(restored, selected);
  assertOwnership(restored);
});

test('fresh states share no mutable fixture data', () => {
  const state = createInitialState();
  const baseline = JSON.stringify(state);
  state.countries[0].economy.treasury = 0;
  state.regions[0].adjacentRegionIds.pop();
  state.relations[0].countryIds[0] = 'changed';
  state.divisions[0].manpower = 0;
  assert.equal(JSON.stringify(createInitialState()), baseline);
});

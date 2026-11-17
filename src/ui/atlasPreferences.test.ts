import assert from 'node:assert/strict';
import test from 'node:test';
import { readTerrainPreference, writeTerrainPreference } from './atlasPreferences.ts';

test('Terrain defaults on for missing or unrecognized stored preferences', () => {
  for (const value of [null, '', 'invalid', 'true']) {
    assert.equal(readTerrainPreference(() => ({ getItem: () => value, setItem: () => {} })), true);
  }
});

test('Terrain writes one UI preference that survives a new read', () => {
  const values = new Map<string, string>();
  const storage = () => ({ getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } });
  writeTerrainPreference(false, storage); assert.equal(readTerrainPreference(storage), false);
  writeTerrainPreference(true, storage); assert.equal(readTerrainPreference(storage), true);
  assert.equal(values.size, 1);
});

test('Safari-style denied localStorage access cannot break globe startup', () => {
  const denied = () => { throw new Error('SecurityError'); };
  assert.equal(readTerrainPreference(denied), true);
  assert.doesNotThrow(() => writeTerrainPreference(false, denied));
});

test('blocked reads and quota failures fall back without changing application state', () => {
  const storage = () => ({ getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceededError'); } });
  assert.equal(readTerrainPreference(storage), true);
  assert.doesNotThrow(() => writeTerrainPreference(false, storage));
});

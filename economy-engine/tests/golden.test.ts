import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceEconomyInPlace, autopilotCommands, createEconomy, createTestWorldSpec, hashEconomy } from '../src/index.ts';

/**
 * Golden fingerprint: pins the exact behaviour of the engine for the default test world.
 * If this fails after an intentional model change, update GOLDEN deliberately (and note why in the commit).
 * It is also the value to compare against on other JavaScript engines (Safari/JavaScriptCore) to verify
 * cross-engine determinism: it was identical in Node 22 (V8) and headless Chromium (V8).
 */
const GOLDEN_WEEKS = 672; // 100 warm-up + 520 + 52, as in sim/browser-bench.cjs
const GOLDEN = '61f628925444b0e0';

test(`golden: the default test world after ${GOLDEN_WEEKS} weeks has the pinned fingerprint`, () => {
  const state = createEconomy(createTestWorldSpec());
  assert.equal(hashEconomy(state), hashEconomy(createEconomy(createTestWorldSpec())), 'world creation is deterministic');
  for (let week = 0; week < GOLDEN_WEEKS; week++) advanceEconomyInPlace(state, { commands: autopilotCommands(state) }, { report: 'none' });
  assert.equal(hashEconomy(state), GOLDEN);
});

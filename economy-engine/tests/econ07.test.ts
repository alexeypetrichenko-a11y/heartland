import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { EconomySession } from '../src/integration/index.ts';
import {
  advanceEconomyWeek, fictionalGameWorld, fiscalCommands, getCountryEconomy, loadEconomySession,
  saveEconomySession, startEconomyFromSave,
} from '../src/integration/index.ts';
import { STATE_VERSION, upgradeEconomy } from '../src/core/state.ts';

/**
 * ECON-07 balance corrections: save compatibility and the behaviour of each correction.
 * The fixture is the week-1 starting economy as it was committed before ECON-07 (state version 5).
 */
const V5_SAVE = readFileSync(new URL('./fixtures/fictional-week1.v5.economy.json', import.meta.url), 'utf8');
const CURRENT_SAVE = readFileSync(new URL('../scenarios/fictional-week1.economy.json', import.meta.url), 'utf8');
const NEW_PARAMS = ['spendingBaseFall', 'treasuryReserveWeeks', 'surplusReturnShare'];

/** The FNV-style text hash of hashEconomy, over a state with every ECON-07 addition removed. */
function digestWithoutEcon07(session: EconomySession): string {
  const state = JSON.parse(JSON.stringify(session.state));
  delete state.country.spendingBase;
  for (const key of NEW_PARAMS) delete state.config.params[key];
  state.version = 5;
  const text = JSON.stringify(state);
  let a = 0x811c9dc5, b = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b + code, 0x85ebca6b);
    b ^= b >>> 15;
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

test('a version-5 save is upgraded on load and continues exactly as the version-5 engine did', () => {
  // Reference: 60 weeks of this script run by the engine on main before ECON-07 (commit 608c48b) from the same
  // save give the digest below. Tax rise, welfare, tax cut and a declared default exercise all three corrections.
  let session = startEconomyFromSave(V5_SAVE, fictionalGameWorld('alden'));
  assert.equal(session.state.version, STATE_VERSION);
  assert.deepEqual(session.state.country.spendingBase, session.state.country.gdp, 'the budget base starts at the smoothed GDP');
  const script: Record<number, ReturnType<typeof fiscalCommands> | { type: 'declare-default'; countryId: string }[]> = {
    2: fiscalCommands('alden', { taxes: { income: 0.3, consumption: 0.2 }, spending: { social: 0.2 } }),
    20: fiscalCommands('alden', { taxes: { income: 0.137, consumption: 0.1 } }),
    30: [{ type: 'declare-default', countryId: 'alden' }],
  };
  for (let week = 2; week <= 60; week++) session = advanceEconomyWeek(session, { playerCommands: script[week] ?? [] });
  assert.equal(digestWithoutEcon07(session), '2a254f59fbe5e339');
});

test('upgrading does not modify the caller\'s data and leaves current saves alone', () => {
  const parsed = JSON.parse(V5_SAVE).economy;
  const copy = JSON.stringify(parsed);
  const upgraded = upgradeEconomy(parsed) as { version: number };
  assert.equal(JSON.stringify(parsed), copy);
  assert.equal(upgraded.version, STATE_VERSION);
  const current = JSON.parse(CURRENT_SAVE).economy;
  assert.equal(upgradeEconomy(current), current);
});

test('the committed starting save is version 6 with the corrected parameters, and round-trips', () => {
  const session = startEconomyFromSave(CURRENT_SAVE, fictionalGameWorld('belora'));
  assert.equal(session.state.version, 6);
  const p = session.state.config.params;
  for (const key of NEW_PARAMS) assert.equal(typeof (p as unknown as Record<string, number>)[key], 'number', key);
  const again = loadEconomySession(saveEconomySession(session));
  assert.equal(saveEconomySession(again), saveEconomySession(session));
});

test('(A) a slump no longer cuts the budget: the spending base falls far more slowly than GDP', () => {
  let session = startEconomyFromSave(CURRENT_SAVE, fictionalGameWorld('alden'));
  session = advanceEconomyWeek(session, { playerCommands: fiscalCommands('alden', { taxes: { income: 0.7, consumption: 0.7, corporate: 0.7 } }) });
  for (let week = 3; week <= 10; week++) session = advanceEconomyWeek(session, {});
  const c = session.state.countries.findIndex(country => country.id === 'alden');
  const { gdp, spendingBase } = session.state.country;
  assert.ok(spendingBase[c] > gdp[c] * 1.15, `base ${spendingBase[c]} vs smoothed GDP ${gdp[c]}`);
});

test('(A) a debt-free treasury keeps a strategic reserve and returns only the cash above it', () => {
  // Maximum taxes repay all of Belora's debt within about two years; after that the surplus has nowhere to go.
  let session = startEconomyFromSave(CURRENT_SAVE, fictionalGameWorld('belora'));
  session = advanceEconomyWeek(session, { playerCommands: fiscalCommands('belora', { taxes: { income: 0.7, consumption: 0.7, corporate: 0.7 } }) });
  let returned = 0, debtFreeWeek = 0;
  for (let week = 3; week <= 156; week++) {
    session = advanceEconomyWeek(session, {});
    const view = getCountryEconomy(session, 'belora');
    if (!debtFreeWeek && view.debt === 0) debtFreeWeek = week;
    const b = view.budget.detail;
    returned += b.surplusReturned;
    if (b.surplusReturned > 0) {
      assert.equal(view.debt, 0, 'cash is returned only once the debt is repaid');
      const core = b.administration + b.social + b.military + b.infrastructure;
      assert.ok(view.treasury > 26 * core, `the treasury keeps at least its 26-week reserve (${view.treasury} vs ${26 * core})`);
    }
  }
  assert.ok(debtFreeWeek > 0, 'the debt was repaid');
  assert.ok(returned > 0, 'surplus cash above the reserve went back to households');
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { EconomySession } from '../src/integration/index.ts';
import {
  advanceEconomyWeek, fictionalGameWorld, fiscalCommands, getCountryEconomy, loadEconomySession,
  saveEconomySession, startEconomyFromSave,
} from '../src/integration/index.ts';
import { STATE_VERSION, upgradeEconomy } from '../src/core/state.ts';
import { socialStability } from '../src/core/politics.ts';

/**
 * ECON-07 balance corrections: save compatibility and the behaviour of each correction.
 * The fixture is the week-1 starting economy as it was committed before ECON-07 (state version 5).
 */
const V5_SAVE = readFileSync(new URL('./fixtures/fictional-week1.v5.economy.json', import.meta.url), 'utf8');
const CURRENT_SAVE = readFileSync(new URL('../scenarios/fictional-week1.economy.json', import.meta.url), 'utf8');
const NEW_PARAMS = ['spendingBaseFall', 'treasuryReserveWeeks', 'surplusReturnShare', 'voluntaryDefaultWeight', 'socialStabilityCap'];

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

/** Starting session for `country`, advanced `weeks` weeks with no player decision. */
function startAt(country: string, weeks: number): EconomySession {
  let session = startEconomyFromSave(CURRENT_SAVE, fictionalGameWorld(country));
  for (let week = 2; week <= weeks; week++) session = advanceEconomyWeek(session, {});
  return session;
}

test('(B) a default declared while able to pay is voluntary: heavier consequences, same 55% write-off', () => {
  let session = startAt('alden', 10);
  const c = session.state.countries.findIndex(country => country.id === 'alden');
  const p = session.state.config.params;
  const before = { debt: session.state.country.debt[c], stability: session.state.country.stability[c], spread: session.state.country.reputationSpread[c] };
  session = advanceEconomyWeek(session, { playerCommands: [{ type: 'declare-default', countryId: 'alden' }] });
  const event = session.summary.events.find(e => e.type === 'sovereign-default');
  assert.ok(event && event.type === 'sovereign-default' && event.voluntary === true && event.forced === false);
  assert.ok(Math.abs(event.haircut - p.defaultHaircut) < 1e-12, 'the write-off is the approved first-default share');
  const weight = 1 + p.voluntaryDefaultWeight;
  // Exclusion: 78 weeks x (1 + 0.5 x 0.5), less the week that has already passed.
  assert.equal(session.state.country.exclusionWeeks[c], Math.round(p.defaultExclusionWeeks * (1 + 0.5 * p.voluntaryDefaultWeight)) - 1);
  assert.ok(session.state.country.reputationSpread[c] > before.spread + p.defaultReputationSpread * weight * 0.99, 'a larger reputation premium');
  assert.ok(session.state.country.stability[c] < before.stability - p.defaultStabilityShock, 'a larger stability shock');
  assert.equal(session.state.country.marketAccess[c], 0);
});

test('(B) a default declared after lenders have shut the country out is not voluntary', () => {
  // Low taxes and high spending lose market access; declaring then is a default of necessity.
  let session = startEconomyFromSave(CURRENT_SAVE, fictionalGameWorld('alden'));
  session = advanceEconomyWeek(session, { playerCommands: fiscalCommands('alden', { taxes: { income: 0.05, consumption: 0.03, corporate: 0.05 }, spending: { social: 0.2, administration: 0.16 } }) });
  let week = 3;
  for (; week <= 104 && getCountryEconomy(session, 'alden').marketAccess; week++) session = advanceEconomyWeek(session, {});
  assert.equal(getCountryEconomy(session, 'alden').marketAccess, false, 'market access was lost');
  session = advanceEconomyWeek(session, { playerCommands: [{ type: 'declare-default', countryId: 'alden' }] });
  const event = session.summary.events.find(e => e.type === 'sovereign-default');
  assert.ok(event && event.type === 'sovereign-default' && event.voluntary === false);
});

test('(B) a default is never a defeat by itself', () => {
  for (const country of ['alden', 'belora', 'cyrin']) {
    let session = startAt(country, 25);
    session = advanceEconomyWeek(session, { playerCommands: [{ type: 'declare-default', countryId: country }] });
    for (let week = 27; week <= 78; week++) {
      session = advanceEconomyWeek(session, {});
      assert.equal(session.summary.playerRegimeFell, false, `${country}: no regime change after a single default (week ${week})`);
      assert.ok(getCountryEconomy(session, country).unrestTier === 0, `${country}: the default alone opens no crisis`);
    }
  }
});

test('(C) social spending above the norm has diminishing returns and a ceiling; cuts below it hurt fully', () => {
  const weight = 150, cap = 8;
  let previous = 0, previousGain = Infinity;
  for (let gap = 0.02; gap <= 0.4 + 1e-9; gap += 0.02) {
    const value = socialStability(weight, cap, gap);
    assert.ok(value > previous && value < cap, 'more spending helps, but never beyond the cap');
    assert.ok(value - previous < previousGain, 'each further step helps less');
    previousGain = value - previous;
    previous = value;
  }
  assert.ok(Math.abs(socialStability(weight, cap, 1e-6) - 75e-6) < 1e-9, 'the first points cost what they always did');
  assert.ok(Math.abs(socialStability(weight, cap, 0.08) - 6 / 1.75) < 1e-12, '+3.4 at 18% of GDP (was +6)');
  assert.ok(Math.abs(socialStability(weight, cap, 0.4) - 30 / 4.75) < 1e-12, '+6.3 at the 50% limit (was +30)');
  assert.equal(socialStability(weight, cap, -0.04), -6, 'spending below the norm loses the full weight');
  assert.equal(socialStability(weight, 0, 0.4), 30, 'cap 0 is the legacy straight line');
});

test('(C) maximum social spending does not protect a regime from a ruinous tax policy', () => {
  let fallen = 0;
  for (const country of ['alden', 'belora', 'cyrin']) {
    let session = startEconomyFromSave(CURRENT_SAVE, fictionalGameWorld(country));
    session = advanceEconomyWeek(session, { playerCommands: fiscalCommands(country, { taxes: { income: 0.7, consumption: 0.7, corporate: 0.7 }, spending: { social: 0.5 } }) });
    for (let week = 3; week <= 52 && !session.summary.playerRegimeFell; week++) session = advanceEconomyWeek(session, {});
    if (session.summary.playerRegimeFell) fallen++;
  }
  assert.equal(fallen, 3, 'every regime fell within a year despite social spending at its limit');
});

test('(C) cutting social spending back costs stability', () => {
  const run = (cut: boolean) => {
    let session = startEconomyFromSave(CURRENT_SAVE, fictionalGameWorld('belora'));
    session = advanceEconomyWeek(session, { playerCommands: fiscalCommands('belora', { spending: { social: 0.18 } }) });
    for (let week = 3; week <= 78; week++) {
      session = advanceEconomyWeek(session, { playerCommands: week === 53 && cut ? fiscalCommands('belora', { spending: { social: 0.1 } }) : [] });
    }
    return getCountryEconomy(session, 'belora').stability;
  };
  const kept = run(false), cut = run(true);
  assert.ok(cut < kept - 4, `stability ${cut.toFixed(1)} after the cut vs ${kept.toFixed(1)} without it`);
});

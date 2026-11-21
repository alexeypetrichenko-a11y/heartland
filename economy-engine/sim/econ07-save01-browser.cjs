/*
 * ECON-07 x SAVE-01 production check (analysis tool; not part of `npm test`).
 *   npm run build && npx vite preview --port 4173      (in the repository root)
 *   node economy-engine/sim/econ07-save01-browser.cjs economy-engine/tests/fixtures/save01-pre-econ07.json
 * Needs Playwright with Chromium. Uses its own browser profile, so it never touches a real save.
 */
// ECON-07 x SAVE-01 in the production build: a save written by the pre-ECON-07 game resumes and keeps its
// calibration; a new game is saved with the ECON-07 calibration. Run against `vite preview` on port 4173.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { chromium } = require('playwright');
const url = 'http://127.0.0.1:4173/heartland/';
const fixture = JSON.parse(readFileSync(process.argv[2], 'utf8'));

const idb = {
  put: (page, value) => page.evaluate(record => new Promise((resolve, reject) => {
    const open = indexedDB.open('heartland-game', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('saves');
    open.onsuccess = () => { const tx = open.result.transaction('saves', 'readwrite'); tx.objectStore('saves').put(record, 'active'); tx.oncomplete = () => { open.result.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
    open.onerror = () => reject(open.error);
  }), value),
  get: page => page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('heartland-game', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('saves');
    open.onsuccess = () => { const tx = open.result.transaction('saves', 'readonly'); const req = tx.objectStore('saves').get('active'); req.onsuccess = () => { open.result.close(); resolve(req.result ?? null); }; };
    open.onerror = () => reject(open.error);
  })),
};
const economyOf = record => { const payload = JSON.parse(JSON.parse(record).payload); return { game: payload.game, economy: JSON.parse(payload.economy).economy }; };
const week = page => page.locator('.game-meta dd').first();
const button = (page, name) => page.getByRole('button', { name, exact: true });

(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  // 1. A save written by the pre-ECON-07 game (week 31, engine state v5) resumes in the production build.
  await page.goto(url);
  await page.locator('.atlas-frame[aria-busy="false"]').waitFor({ timeout: 60000 });
  await idb.put(page, fixture.record);
  await page.reload();
  await page.locator('.atlas-frame[aria-busy="false"]').waitFor({ timeout: 60000 });
  await button(page, 'Resume game').tap();
  await week(page).filter({ hasText: /^Week 31$/ }).waitFor({ timeout: 60000 });
  console.log('resumed the pre-ECON-07 save at', await week(page).textContent());
  // The save holds the player's uncorrected fiscal drafts (income "25,125", social "105" = above the 50% limit).
  await button(page, 'Economy').tap();
  assert.equal(await page.locator('#fiscal-income').inputValue(), '25,125', 'fiscal drafts restored');
  assert.equal(await page.locator('#fiscal-social').inputValue(), '105', 'invalid draft restored for correction');
  await button(page, 'Next week').tap();
  await page.waitForTimeout(1500);
  assert.equal(await week(page).textContent(), 'Week 31', 'a week with an invalid draft is rejected and nothing changes');
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  const alert = await page.locator('[role=alert], .alert, .error').allTextContents();
  console.log('after rejection:', JSON.stringify(alert).slice(0, 300));
  await page.getByRole('button', { name: /Fiscal policy/ }).first().tap();
  await page.locator('#fiscal-social').fill('14');
  console.log('invalid draft rejected the week as designed; corrected social spending to 14%');
  await button(page, 'Next week').tap();
  await week(page).filter({ hasText: /^Week 32$/ }).waitFor({ timeout: 60000 });
  // Autosave runs after the turn; wait until the slot holds week 32.
  let saved = null;
  for (let i = 0; i < 100 && !(saved && economyOf(saved).game.week === 32); i++) { await page.waitForTimeout(100); saved = await idb.get(page); }
  const old = economyOf(saved);
  assert.equal(old.game.week, 32);
  assert.equal(old.economy.version, 6, 'the re-saved economy uses the current state format');
  assert.equal(old.economy.turn, 32);
  assert.equal(old.economy.config.params.spendingBaseFall, old.economy.config.params.gdpSmoothing, 'legacy budget base kept');
  assert.equal(old.economy.config.params.socialStabilityCap, 0, 'legacy social curve kept');
  assert.equal(old.economy.config.params.voluntaryDefaultWeight, 0, 'legacy default rules kept');
  assert.equal(old.economy.config.params.defaultOutputShock, 0.06, 'own saved default parameters kept');
  assert.equal(old.economy.countries.length, 3);
  const alden = old.economy.countries.findIndex(c => c.id === 'alden');
  assert.ok(Math.abs(old.economy.country.spendSocial[alden] - 0.14) < 1e-12, 'the corrected draft was applied once');
  assert.ok(Math.abs(old.economy.country.taxIncome[alden] - 0.25125) < 1e-12, 'the income-tax draft was applied');
  console.log('re-saved at week 32: state v6 with the original (pre-ECON-07) calibration');

  // 2. A new game in the production build starts from the new starting save with the ECON-07 calibration.
  await page.evaluate(() => new Promise(resolve => { const r = indexedDB.deleteDatabase('heartland-game'); r.onsuccess = r.onerror = r.onblocked = () => resolve(); }));
  await page.goto(url);
  await page.locator('.atlas-frame[aria-busy="false"]').waitFor({ timeout: 60000 });
  await button(page, 'Fictional game').tap();
  await page.locator('#player-country').selectOption('cyrin');
  await button(page, 'Start local scenario').tap();
  await week(page).filter({ hasText: /^Week 1$/ }).waitFor({ timeout: 60000 });
  saved = null;
  for (let i = 0; i < 100 && !saved; i++) { await page.waitForTimeout(100); saved = await idb.get(page); }
  const fresh = economyOf(saved);
  const p = fresh.economy.config.params;
  assert.equal(fresh.economy.version, 6);
  assert.equal(p.spendingBaseFall, 1 / 104);
  assert.equal(p.surplusReturnShare, 0.1);
  assert.equal(p.voluntaryDefaultWeight, 0.5);
  assert.equal(p.socialStabilityCap, 8);
  assert.equal(p.defaultOutputShock, 0.08);
  assert.equal(p.reputationDecayWeeks, 260);
  console.log('new game saved with the ECON-07 calibration (state v6)');
  await button(page, 'Next week').tap();
  await week(page).filter({ hasText: /^Week 2$/ }).waitFor({ timeout: 60000 });
  assert.deepEqual(errors, [], 'no page errors');
  console.log('ECON-07 x SAVE-01 production check passed');
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });

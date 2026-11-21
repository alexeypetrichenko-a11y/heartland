/* Run against the production build with an external Playwright installation. */
const assert = require('node:assert/strict');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const playwright = require(process.env.HEARTLAND_PLAYWRIGHT_MODULE || 'playwright');

const engine = process.env.HEARTLAND_BROWSER || 'chromium';
const url = process.env.HEARTLAND_PREVIEW_URL || 'http://127.0.0.1:4173/heartland/';
const launchOptions = engine === 'chromium' ? {
  executablePath: process.env.HEARTLAND_CHROMIUM_EXECUTABLE,
  args: ['--enable-unsafe-swiftshader'],
} : {};
const mobile = (width, height) => ({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const button = (page, name) => page.getByRole('button', { name, exact: true });
const tap = (page, name) => button(page, name).tap();
const week = page => page.locator('.game-meta dd').first();
const income = page => page.locator('#fiscal-income');

function watch(page) {
  const requests = [];
  const errors = [];
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push(`${response.status()} ${response.url()}`);
  });
  return { requests, errors };
}

async function globe(page, requests) {
  await page.locator('.atlas-frame[aria-busy="false"]').waitFor();
  assert.ok(await page.getByRole('heading', { name: 'World', exact: true }).isVisible());
  if (requests) {
    assert.equal(requests.filter(path => /\/assets\/index-.*\.js$/.test(path)).length, 1, 'atlas does not fetch the economy engine');
    assert.ok(!requests.some(path => /economyRuntime|fictional-week1\.economy/.test(path)));
  }
}

async function fit(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1
    && document.documentElement.scrollHeight <= innerHeight + 1), 'active game and atlas fit the viewport');
}

function slot(page, replacement) {
  return page.evaluate(replacement => new Promise((resolve, reject) => {
    const request = indexedDB.open('heartland-game', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', replacement === undefined ? 'readonly' : 'readwrite');
      const store = tx.objectStore('saves');
      const entry = replacement === undefined ? store.get('active') : store.put(replacement, 'active');
      tx.oncomplete = () => { db.close(); resolve(replacement === undefined ? entry.result : undefined); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }), replacement);
}

async function committed(page, expectedWeek, draftIncome) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const record = await slot(page);
    const data = record && JSON.parse(JSON.parse(record).payload);
    if (data?.game.week === expectedWeek && data.drafts.fiscal.income === draftIncome) return { record, data };
    await new Promise(resolve => setTimeout(resolve, 75));
  }
  assert.fail(`Week ${expectedWeek} with draft ${draftIncome} was not committed`);
}

async function start(page, country) {
  await page.locator('#player-country').selectOption(country);
  await tap(page, 'Start local scenario');
  await week(page).filter({ hasText: /^Week 1$/ }).waitFor();
}

async function returnToGlobe(page) {
  await tap(page, 'Scenario menu');
  await tap(page, 'Return to globe');
  await globe(page);
}

async function fiscal(page) {
  await tap(page, 'Economy');
  await page.locator('button[aria-controls="fiscal-policy-details"]').tap();
  await income(page).waitFor();
}

async function weekIs(page, number) {
  await week(page).filter({ hasText: new RegExp(`^Week ${number}$`) }).waitFor();
}

function expectConfirmation(page, accept) {
  page.once('dialog', dialog => {
    assert.equal(dialog.type(), 'confirm');
    assert.match(dialog.message(), /replace the local save/);
    return accept ? dialog.accept() : dialog.dismiss();
  });
}

async function stageOrders(page) {
  await tap(page, 'Military');
  await page.locator('button[aria-controls="orders-details"]').tap();
  await page.locator('#military-division').selectOption('alden-first');
  await page.locator('#military-order').selectOption('attack');
  await page.locator('#military-target').selectOption('amber-plain');
  await tap(page, 'Stage military order');
  await tap(page, 'Back from Military orders');
  await tap(page, 'Diplomacy');
  await tap(page, 'Compose diplomacy');
  await page.locator('#diplomatic-target').selectOption('cyrin');
  await tap(page, 'Stage diplomatic action');
  await tap(page, 'Back from Diplomatic action');
}

async function portrait(profile) {
  const context = await playwright[engine].launchPersistentContext(profile, { ...launchOptions, ...mobile(390, 844) });
  try {
    const [page] = context.pages();
    const { requests, errors } = watch(page);
    await page.goto(url);
    await globe(page, requests);
    await fit(page);
    await tap(page, 'Fictional game');
    await start(page, 'alden');
    await committed(page, 1);
    await stageOrders(page);
    await fiscal(page);
    await income(page).fill('71');
    await returnToGlobe(page);
    const rejected = await committed(page, 1, '71');
    expectConfirmation(page, false);
    await tap(page, 'New game');
    assert.equal(await slot(page), rejected.record, 'cancel cannot replace the live save');
    requests.length = 0;
    await page.reload();
    await button(page, 'Resume game').waitFor();
    await globe(page, requests);
    await tap(page, 'Resume game');
    await weekIs(page, 1);
    assert.ok(!requests.some(path => /fictional-week1\.economy/.test(path)), 'resume does not fetch the starting save');
    await page.getByText('Drafts · 1 military · 1 diplomacy · 1 fiscal', { exact: true }).waitFor();
    await fiscal(page);
    assert.equal(await income(page).inputValue(), '71');
    await tap(page, 'Next week');
    await page.getByRole('alert').filter({ hasText: /Tax rate.*Week not advanced/ }).waitFor();
    assert.equal(await slot(page), rejected.record, 'refusal leaves the whole checkpoint unchanged');
    await income(page).fill('23,175');
    for (const n of [2, 3, 4]) {
      await tap(page, 'Next week');
      await weekIs(page, n);
      await committed(page, n);
    }
    await tap(page, 'Back from Week 3 report');
    await income(page).fill('30');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new PageTransitionEvent('pagehide'));
      delete document.visibilityState;
    });
    const { data } = await committed(page, 4, '30');
    assert.equal(data.game.regions.find(region => region.id === 'amber-plain').ownerId, 'alden');
    assert.ok(data.game.diplomaticMessages.some(message => message.fromId === 'alden' && message.toId === 'cyrin'));
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

async function landscape(profile) {
  const context = await playwright[engine].launchPersistentContext(profile, { ...launchOptions, ...mobile(844, 390) });
  try {
    const [page] = context.pages();
    const { requests, errors } = watch(page);
    await page.goto(url);
    await button(page, 'Resume game').waitFor();
    await globe(page, requests);
    await fit(page);
    await tap(page, 'Resume game');
    await weekIs(page, 4);
    await fiscal(page);
    assert.equal(await income(page).inputValue(), '30');
    assert.match(await page.locator('#fiscal-income-current').textContent(), /23\.175%/);
    await fit(page);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await globe(page);
    await tap(page, 'Resume game');
    assert.equal(await income(page).inputValue(), '30');

    const other = await context.newPage();
    await other.goto(url);
    await tap(other, 'Resume game');
    await weekIs(other, 4);
    await tap(page, 'Next week');
    await weekIs(page, 5);
    const saved = await committed(page, 5);
    await tap(other, 'Next week');
    await other.getByRole('alert').filter({ hasText: 'Another tab changed the local save' }).waitFor();
    assert.equal(await slot(page), saved.record);
    await other.close();
    await page.bringToFront();
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (window.saveFault === 'full') throw new DOMException('Simulated quota', 'QuotaExceededError');
        const request = put.apply(this, args);
        if (window.saveFault === 'abort') request.addEventListener('success', () => this.transaction.abort());
        return request;
      };
      window.saveFault = 'full';
    });
    await tap(page, 'Next week');
    await weekIs(page, 6);
    await page.getByRole('alert').filter({ hasText: 'Local storage is full' }).waitFor();
    assert.equal(await slot(page), saved.record);
    await page.evaluate(() => { window.saveFault = 'abort'; });
    await tap(page, 'Next week');
    await weekIs(page, 7);
    await page.getByRole('alert').filter({ hasText: 'Local save failed' }).waitFor();
    assert.equal(await slot(page), saved.record, 'an interrupted write retains the previous complete checkpoint');
    await page.reload();
    await tap(page, 'Resume game');
    await weekIs(page, 5);
    await tap(page, 'Next week');
    await weekIs(page, 6);
    const recovered = await committed(page, 6);

    for (const damaged of ['{damaged', JSON.stringify({ ...JSON.parse(recovered.record), version: 999 })]) {
      await slot(page, damaged);
      await page.reload();
      await page.getByRole('alert').filter({ hasText: /could not be read|unsupported/ }).waitFor();
      assert.equal(await button(page, 'Resume game').count(), 0);
      expectConfirmation(page, true);
      await tap(page, 'New game');
      await page.locator('#player-country').waitFor();
      assert.equal(await slot(page), damaged);
      await tap(page, 'Back to globe');
      assert.equal(await slot(page), damaged);
    }
    expectConfirmation(page, true);
    await tap(page, 'New game');
    await start(page, 'belora');
    assert.equal((await committed(page, 1)).data.game.playerCountryId, 'belora');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

async function blocked() {
  const browser = await playwright[engine].launch(launchOptions);
  try {
    const context = await browser.newContext(mobile(390, 844));
    await context.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', { get() { throw new DOMException('Storage blocked', 'SecurityError'); } });
    });
    const page = await context.newPage();
    await page.goto(url);
    await page.getByRole('alert').filter({ hasText: 'Local storage is unavailable' }).waitFor();
    await tap(page, 'Fictional game');
    await start(page, 'cyrin');
    await tap(page, 'Next week');
    await weekIs(page, 2);
    await page.getByRole('alert').filter({ hasText: 'Local save failed' }).waitFor();
    await returnToGlobe(page);
    await tap(page, 'Resume game');
    await weekIs(page, 2);
  } finally {
    await browser.close();
  }
}

(async () => {
  const profile = await mkdtemp(join(tmpdir(), 'heartland-save-'));
  try {
    await portrait(profile);
    await landscape(profile);
    await blocked();
    console.log(`SAVE-01 passed in ${engine} at 390×844 and 844×390.`);
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

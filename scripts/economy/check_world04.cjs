// Run against loopback production builds. Set HEARTLAND_BROWSER_OUTPUT to capture local screenshots.
const assert = require('node:assert/strict');
const { mkdir } = require('node:fs/promises');
const { join } = require('node:path');
const { chromium } = require(process.env.HEARTLAND_PLAYWRIGHT_MODULE || 'playwright');

const privateUrl = 'http://127.0.0.1:4174/heartland/';
const publicUrl = 'http://127.0.0.1:4173/heartland/';
const reviewPath = 'review/europe-2023/1.0.0-draft.2/';
const roster = { fra: 'France', deu: 'Germany', gbr: 'United Kingdom', ita: 'Italy', pol: 'Poland', tur: 'Türkiye' };
const button = (page, name) => page.getByRole('button', { name, exact: true });
const income = page => page.locator('#fiscal-income');
const saveStatus = (page, week) => page.getByText(`Saved locally · Week ${week}`, { exact: true });
const report = (page, week) => page.getByRole('heading', { name: `Week ${week} report`, exact: true });
const openFiscal = async page => {
  await button(page, 'Economy').click();
  const editor = page.locator('#fiscal-policy-details');
  if (!(await editor.isVisible())) await page.locator('button[aria-controls="fiscal-policy-details"]').click();
  assert.equal(await editor.locator('input').count(), 7);
};
async function start(page, country, fictional = false) {
  await button(page, 'Fictional game').or(button(page, 'New game')).click();
  if (!fictional) await page.getByLabel('Scenario', { exact: true }).selectOption('europe-2023');
  await page.getByLabel('Player country').selectOption(country);
  await button(page, 'Start local scenario').click();
}
async function capture(page, file) {
  const directory = process.env.HEARTLAND_BROWSER_OUTPUT;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, file), scale: 'css' });
}
async function play(browser, width, height, id) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(privateUrl);
    await start(page, id);
    await page.getByLabel(`${roster[id]} status`).waitFor();
    await page.getByRole('group', { name: 'Map of the 46 playable provinces' }).waitFor();
    assert.equal(await page.locator('.europe-provinces path[data-province]').count(), 46);
    for (const province of await page.locator('.europe-provinces path[data-province]').all()) assert.ok((await province.getAttribute('d')).length > 0);
    if (id === 'fra') {
      await capture(page, `world04-europe-${width}x${height}.png`);
      await page.getByLabel('Map view').selectOption('fra');
      await page.getByLabel('Province', { exact: true }).selectOption('fra-cor');
      await page.getByText('Province connections', { exact: true }).click();
      const corsica = page.locator('.europe-map .data-list');
      assert.equal(await corsica.locator('dd').nth(0).textContent(), 'None');
      assert.match(await corsica.locator('dd').nth(1).textContent(), /Provence-Alpes-Côte d'Azur/);
      const movement = corsica.locator('dd').nth(2);
      assert.equal(await movement.textContent(), 'None');
      await movement.scrollIntoViewIfNeeded();
      const box = await movement.boundingBox();
      assert.ok(box && box.y >= 0 && box.y + box.height <= height);
      await capture(page, `world04-provinces-${width}x${height}.png`);
    }
    if (id === 'tur') {
      await button(page, 'Military').click();
      await page.locator('#section-military').getByText(/Türkiye’s starting force is unresolved/).waitFor();
    }
    await openFiscal(page);
    await income(page).fill('27');
    await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('heartland-game');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const deadline = performance.now() + 8000;
        while (performance.now() < deadline) {
          const record = await new Promise((resolve, reject) => {
            const request = db.transaction('saves').objectStore('saves').get('active');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          if (record && JSON.parse(JSON.parse(record).payload).drafts.fiscal.income === '27') return;
          await new Promise(resolve => setTimeout(resolve, 60));
        }
        throw new Error('The staged tax was not saved.');
      } finally { db.close(); }
    });
    await button(page, 'Scenario menu').click();
    await saveStatus(page, 1).waitFor();
    await page.reload();
    await button(page, 'Resume game').click();
    await page.getByLabel(`${roster[id]} status`).waitFor();
    await openFiscal(page);
    await page.waitForFunction(() => document.querySelector('#fiscal-income')?.value === '27');
    assert.equal(await income(page).inputValue(), '27');
    await button(page, 'Next week').click();
    await report(page, 1).waitFor();
    const changes = page.locator('#weekly-report summary').filter({ hasText: 'Fiscal policy after this week' });
    await changes.click();
    assert.match(await page.locator('#weekly-report .report-current-rate').first().textContent(), /27/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await button(page, 'Scenario menu').click();
    await saveStatus(page, 2).waitFor();
    await page.reload();
    await button(page, 'Resume game').click();
    await page.getByText('Week 2', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(`PASS ${roster[id]} ${width}×${height}: provinces, fiscal draft, turn report, save and reload`);
  } finally {
    await context.close();
  }
}

async function preservation(browser) {
  const page = await browser.newPage();
  page.on('dialog', dialog => dialog.accept());
  await page.goto(privateUrl);
  await start(page, 'alden', true);
  await button(page, 'Scenario menu').click();
  await saveStatus(page, 1).waitFor();
  await button(page, 'Return to globe').click();
  await page.route(`**/${reviewPath}scenario.json`, route => route.fulfill({ status: 404 }));
  await button(page, 'New game').click();
  await page.getByLabel('Scenario', { exact: true }).selectOption('europe-2023');
  await page.getByRole('alert').filter({ hasText: 'missing scenario.json' }).waitFor();
  await page.reload();
  await button(page, 'Resume game').click();
  await page.getByLabel('Alden status').waitFor();
  await page.goto(publicUrl);
  await button(page, 'Fictional game').click();
  await page.getByLabel('Player country').waitFor();
  assert.equal(await page.getByLabel('Scenario', { exact: true }).count(), 0);
  assert.deepEqual(await page.locator('#player-country option').allTextContents(), ['Select a country', 'Alden', 'Belora', 'Cyrin']);
  for (const filename of ['manifest.json', 'scenario.json', 'week1.session.json', 'provenance.json', 'world-spec.json', 'calibration-report.json']) {
    const response = await page.request.get(publicUrl + reviewPath + filename);
    assert.ok(!response.ok() || response.headers()['content-type']?.includes('text/html'), filename);
  }
  await page.close();
  console.log('PASS failed Europe load preserves the fictional save; public build contains no scenario assets or selector');
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HEARTLAND_CHROMIUM });
  try {
    await preservation(browser);
    for (const [width, height] of [[390, 844], [844, 390]]) {
      for (const id of Object.keys(roster)) await play(browser, width, height, id);
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

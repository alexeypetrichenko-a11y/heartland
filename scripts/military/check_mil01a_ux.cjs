// Run both Vite production previews before running this suite.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.HEARTLAND_PLAYWRIGHT_MODULE || 'playwright');
const review = 'http://127.0.0.1:4185/heartland/';
const fictional = 'http://127.0.0.1:4183/heartland/';
const button = (page, name) => page.getByRole('button', { name, exact: true });
const rosterItem = (page, name) => page.getByRole('list', { name: 'Division status' }).locator('li').filter({ hasText: name });
const first = 'Alden First Division';

async function stored(page, database, condition = {}) {
  return page.evaluate(async ({ database, condition }) => {
    const expires = Date.now() + 6000;
    while (Date.now() < expires) {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(database);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      let record;
      try {
        if (db.objectStoreNames.contains('saves')) record = await new Promise((resolve, reject) => {
          const request = db.transaction('saves').objectStore('saves').get('active');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        });
      } finally { db.close(); }
      if (record) {
        const payload = JSON.parse(JSON.parse(record).payload);
        const core = payload.gameSave ? JSON.parse(JSON.parse(payload.gameSave).payload) : payload;
        if ((condition.week === undefined || core.game.week === condition.week)
          && (condition.drafts === undefined || payload.drafts.length === condition.drafts)
          && (condition.journey === undefined || payload.mobility.journeys[0]?.status === condition.journey)) return record;
      }
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    throw new Error(`Save not committed for ${database}.`);
  }, { database, condition });
}
async function stage(page, division, route) {
  await page.getByLabel('Division', { exact: true }).selectOption(division);
  const option = page.getByLabel('Maritime destination');
  assert.match(await option.locator(`[value="${route}"]`).textContent(), route === 'island-outbound' ? /1 week/ : /2 weeks/);
  await option.selectOption(route);
  await button(page, 'Stage transport').click();
}
async function settle(page, week, text) {
  await button(page, 'Next week').click();
  await page.getByRole('heading', { name: `Week ${week} report`, exact: true }).waitFor();
  if (text) {
    await page.locator('#weekly-report summary').filter({ hasText: 'Military and territorial control' }).click();
    await page.getByRole('list', { name: 'Military and territorial events' }).getByText(text, { exact: true }).waitFor();
  }
  await button(page, `Back from Week ${week} report`).click();
}
async function reload(page) {
  await page.reload();
  await button(page, 'Resume maritime game').click();
}

async function mobile(browser, width, height) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(review);
    await button(page, 'Start maritime scenario').click();
    await stage(page, 'alden-first', 'island-outbound');
    await stage(page, 'alden-second', 'island-outbound');
    await page.getByText(/0 of 1 slots unclaimed/).waitFor();
    await stored(page, 'heartland-mil01a', { week: 1, drafts: 2 });
    await reload(page);
    const restoredDrafts = page.getByText('Transport staged · Reed Island', { exact: true });
    await restoredDrafts.nth(1).waitFor();
    assert.equal(await restoredDrafts.count(), 2);
    await settle(page, 1, 'No departure slots remain.');
    await rosterItem(page, first).getByText('Traveling · Reed Island', { exact: true }).waitFor();
    await rosterItem(page, first).getByText('Expected arrival · Week 2', { exact: true }).waitFor();
    assert.deepEqual(await page.getByRole('list', { name: 'Divisions present' }).locator('li').allTextContents(), ['Alden Second Division']);

    await page.getByLabel('Division', { exact: true }).selectOption('alden-first');
    await button(page, 'Request return').click();
    await page.getByText('Return staged', { exact: true }).waitFor();
    await button(page, 'Cancel staged order').click();
    await stored(page, 'heartland-mil01a', { week: 2, drafts: 0, journey: 'traveling' });
    await reload(page);
    await rosterItem(page, first).getByText('Traveling · Reed Island', { exact: true }).waitFor();
    await button(page, 'Latest weekly report').click();
    await page.getByRole('heading', { name: 'Week 1 report', exact: true }).waitFor();
    await page.locator('#weekly-report summary').filter({ hasText: 'Military and territorial control' }).click();
    await page.getByText('No departure slots remain.', { exact: true }).waitFor();
    await button(page, 'Back from Week 1 report').click();
    await settle(page, 2, `Arrived · ${first}`);
    await rosterItem(page, first).getByText('Arrived · Reed Island', { exact: true }).waitFor();

    await stage(page, 'alden-first', 'island-inbound');
    await settle(page, 3, `Departed · ${first}`);
    await settle(page, 4);
    await rosterItem(page, first).getByText('Expected arrival · Week 5', { exact: true }).waitFor();
    await settle(page, 5, `Arrived · ${first}`);
    await rosterItem(page, first).getByText('Arrived · Alden Vale', { exact: true }).waitFor();

    await stage(page, 'alden-first', 'island-outbound');
    await settle(page, 6, `Departed · ${first}`);
    await page.getByText('Route availability', { exact: true }).click();
    await button(page, 'Close crossing').click();
    await settle(page, 7, `Waiting · ${first}`);
    await stored(page, 'heartland-mil01a', { week: 8, journey: 'waiting' });
    await reload(page);
    await rosterItem(page, first).getByText('Waiting · Reed Island', { exact: true }).waitFor();
    await page.getByText('Route availability', { exact: true }).click();
    await button(page, 'Reopen crossing').click();
    await page.getByLabel('Division', { exact: true }).selectOption('alden-first');
    await button(page, 'Request return').click();
    await settle(page, 8, `Returning · ${first}`);
    await rosterItem(page, first).getByText('Returning · Alden Vale', { exact: true }).waitFor();
    await settle(page, 9, `Returned · ${first}`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.ok((await button(page, 'Next week').boundingBox()).height >= 44);
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}×${height} · capacity, reports, one/two weeks, cancellation, recovery and resume`);
  } finally { await context.close(); }
}

async function isolation(browser) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(fictional);
    await button(page, 'Fictional game').click();
    await page.getByLabel('Player country').selectOption('alden');
    await button(page, 'Start local scenario').click();
    const before = await stored(page, 'heartland-game', { week: 1 });
    // Serve the review build on the same browser origin to prove the database names isolate the records.
    await page.route(`${fictional}**`, async route => {
      const response = await route.fetch({ url: route.request().url().replace(fictional, review) });
      await route.fulfill({ response });
    });
    await page.reload();
    await button(page, 'Start maritime scenario').click();
    await stage(page, 'alden-first', 'island-outbound');
    await stored(page, 'heartland-mil01a', { week: 1, drafts: 1 });
    await settle(page, 1, `Departed · ${first}`);
    await stored(page, 'heartland-mil01a', { week: 2, journey: 'traveling' });
    assert.equal(await stored(page, 'heartland-game', { week: 1 }), before);
    await page.unroute(`${fictional}**`);
    await page.reload();
    await button(page, 'Resume game').click();
    await page.getByLabel('Alden status').waitFor();
    assert.equal(await stored(page, 'heartland-game', { week: 1 }), before);
    assert.equal(await page.getByRole('heading', { name: 'Maritime transport' }).count(), 0);
    console.log('PASS same-origin storage isolation and original fictional resume');
  } finally { await context.close(); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HEARTLAND_CHROMIUM });
  try {
    for (const [width, height] of [[390, 844], [844, 390]]) await mobile(browser, width, height);
    await isolation(browser);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

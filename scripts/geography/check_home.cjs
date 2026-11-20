/* Production-preview checks; use an external Playwright installation. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.HEARTLAND_PLAYWRIGHT_MODULE || 'playwright-core');
const URL_BASE = process.env.HEARTLAND_TEST_URL || 'http://localhost:4173/heartland/';
const OUTPUT = process.env.HEARTLAND_BROWSER_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'heartland-home-'));
fs.mkdirSync(OUTPUT, { recursive: true });
const issues = [];
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function ready(page) {
  await page.locator('.atlas-viewport').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('.atlas-frame')?.getAttribute('aria-busy') === 'false');
  await settle(page);
}
async function noOverflow(page) {
  assert.deepEqual(await page.evaluate(() => [document.documentElement.scrollWidth <= innerWidth, document.documentElement.scrollHeight <= innerHeight, scrollX, scrollY]), [true, true, 0, 0]);
}
async function contextPage(browser, width, height, init) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: width < 900, hasTouch: width < 900 });
  if (init) await context.addInitScript(init);
  const page = await context.newPage(); page.on('pageerror', error => issues.push(String(error)));
  const requests = []; page.on('request', request => requests.push(request.url()));
  return { context, page, requests };
}
async function pose(page) {
  return page.locator('.atlas-viewport').evaluate(e => ({ zoom: e.dataset.zoom, lon: e.dataset.longitude, lat: e.dataset.latitude, bearing: e.dataset.bearing }));
}
async function explore(page) {
  await page.getByRole('button', { name: 'Scenario menu', exact: true }).click();
  await page.getByRole('button', { name: 'Return to globe', exact: true }).click(); await ready(page);
}
async function section(page, name) { await page.getByRole('button', { name, exact: true }).click(); }
async function capture(page, name) { await page.screenshot({ path: path.join(OUTPUT, name), scale: 'css' }); }

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HEARTLAND_CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  try {
    for (const [width, height] of (process.env.HEARTLAND_VIEWPORTS ? JSON.parse(process.env.HEARTLAND_VIEWPORTS) : [[320,568],[390,844],[844,390],[568,320],[1024,768],[1440,900]])) {
      const { context, page, requests } = await contextPage(browser, width, height);
      await page.goto(URL_BASE); await ready(page);
      assert.equal(await page.locator('.atlas-viewport').getAttribute('data-projection'), 'globe');
      assert.equal(await page.locator('.country-setup').count(), 0); assert.equal(await page.locator('.map-region').count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Next week', exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Open local prototype', exact: true }).count(), 0);
      assert.ok(requests.every(r => !r.includes('PrototypePage-') && !r.includes('/countries/') && !r.includes('/regions/') && !r.includes('50m')), 'startup loads only exploration and coarse data');
      assert.deepEqual(await pose(page), { zoom: '1', lon: '12', lat: '20', bearing: '0' });
      await noOverflow(page); await capture(page, `home-${width}x${height}.png`);
      const targets = await page.locator('.atlas-home button:visible').evaluateAll(buttons => buttons.map(b => { const r = b.getBoundingClientRect(); return [r.width, r.height]; }));
      assert.ok(targets.every(([w,h]) => w >= 44 && h >= 44));
      await page.getByRole('button', { name: 'Physical terrain', exact: true }).click();
      await page.waitForFunction(() => localStorage.getItem('heartland.atlas.terrain') === 'false');
      await page.getByRole('button', { name: 'Zoom in atlas', exact: true }).click(); await settle(page);
      await page.locator('.atlas-viewport').focus(); await page.keyboard.press('ArrowRight'); await settle(page);
      const camera = await pose(page), geographicCount = requests.filter(r => /\/atlas\/|\/geography\//.test(r)).length;
      await page.getByRole('button', { name: 'Fictional game', exact: true }).click();
      assert.equal(await page.getByLabel('Player country').inputValue(), ''); assert.ok(await page.getByRole('button', { name: 'Start local scenario', exact: true }).isDisabled());
      await page.getByLabel('Player country').selectOption('alden'); await page.getByRole('button', { name: 'Start local scenario', exact: true }).click();
      assert.equal(await page.locator('.game-meta dd').first().textContent(), 'Week 1');
      await page.getByRole('button', { name: 'Amber Plain, Belora', exact: true }).click();
      await section(page, 'Economy');
      await page.getByLabel('Tax policy for next week').selectOption('tax-relief');
      await section(page, 'Military'); await page.getByRole('button', { name: /^Military orders / }).click();
      await page.getByLabel('Division', { exact: true }).selectOption('alden-first'); await page.getByRole('button', { name: 'Stage military order', exact: true }).click();
      await section(page, 'Diplomacy'); await page.getByRole('button', { name: 'Compose diplomacy', exact: true }).click();
      await page.getByLabel('Diplomatic counterpart').selectOption('belora'); await page.locator('#diplomatic-action').selectOption('goodwill');
      await page.getByRole('button', { name: 'Stage diplomatic action', exact: true }).click();
      await page.getByLabel('Diplomatic counterpart').selectOption('cyrin');
      assert.match(await page.locator('.turn-status').textContent(), /1 military · 1 diplomacy · Tax relief/);
      assert.equal(requests.filter(r => /\/atlas\/|\/geography\//.test(r)).length, geographicCount, 'hidden exploration makes no additional geographic requests');
      await explore(page); assert.deepEqual(await pose(page), camera);
      assert.equal(await page.getByRole('button', { name: 'Physical terrain', exact: true }).getAttribute('aria-pressed'), 'false');
      assert.equal(await page.locator('.atlas-globe').count(), 1); assert.equal(await page.getByRole('button', { name: 'Next week', exact: true }).count(), 0);
      await noOverflow(page); await page.getByRole('button', { name: 'Resume game', exact: true }).click();
      assert.equal(await page.getByLabel('Diplomatic counterpart').inputValue(), 'cyrin');
      assert.match(await page.locator('.turn-status').textContent(), /1 military · 1 diplomacy · Tax relief/);
      assert.equal(await page.locator('#region-details-title').textContent(), 'Amber Plain');
      await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))); await ready(page);
      assert.deepEqual(await pose(page), camera); await page.getByRole('button', { name: 'Resume game', exact: true }).click();
      assert.equal(await page.getByLabel('Diplomatic counterpart').inputValue(), 'cyrin');
      await page.getByRole('button', { name: 'Next week', exact: true }).click();
      assert.equal(await page.locator('.game-meta dd').first().textContent(), 'Week 2'); const budget = await page.locator('.game-meta').textContent();
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      assert.equal(await page.getByRole('button', { name: 'Next week', exact: true }).count(), 1, 'normal browser tab resume does not change the current screen');
      await explore(page); await page.getByRole('button', { name: 'Resume game', exact: true }).click();
      assert.equal(await page.locator('.game-meta').textContent(), budget); await noOverflow(page);
      await page.reload(); await ready(page);
      assert.equal(await page.getByRole('button', { name: 'Physical terrain', exact: true }).getAttribute('aria-pressed'), 'false');
      assert.equal(await page.locator('.country-setup').count(), 0); assert.equal(await page.locator('.map-region').count(), 0);
      assert.deepEqual(await pose(page), { zoom: '1', lon: '12', lat: '20', bearing: '0' });
      await page.getByRole('button', { name: 'Fictional game', exact: true }).click(); assert.equal(await page.getByLabel('Player country').inputValue(), '');
      await page.getByRole('button', { name: 'Back to globe', exact: true }).click(); await ready(page); await noOverflow(page);
      console.log(`PASS home ${width}x${height}: automatic globe, refresh, explicit game setup, camera/Terrain, drafts/forms/selection/week/budget, restoration, no overflow`);
      await context.close();
    }
    {
      const { context, page } = await contextPage(browser, 390, 844); let release;
      const blocked = new Promise(resolve => { release = resolve; });
      await page.route('**/geography/**/overview-110m.geojson', async route => { await blocked; await route.continue().catch(() => {}); });
      await page.goto(URL_BASE); await page.locator('.atlas-frame[aria-busy="true"] .atlas-loading').waitFor();
      await page.waitForTimeout(200); await capture(page, 'startup-loading-390.png');
      assert.equal(await page.locator('.map-region').count(), 0); assert.equal(await page.locator('.country-setup').count(), 0);
      await noOverflow(page); release(); await ready(page); await context.close(); console.log('PASS slow startup: loading indicator without fictional-map flash');
    }
    {
      const { context, page } = await contextPage(browser, 390, 844); let fail = true;
      await page.route('**/atlas/political.json', route => fail ? route.fulfill({ status: 503, body: 'unavailable' }) : route.continue());
      await page.goto(URL_BASE); await page.getByText('Earth data unavailable', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Fictional game', exact: true }).click(); assert.equal(await page.getByLabel('Player country').inputValue(), '');
      await page.getByRole('button', { name: 'Back to globe', exact: true }).click(); fail = false;
      await page.getByRole('button', { name: 'Retry map data', exact: true }).click(); await ready(page); await context.close();
      console.log('PASS geographic failure/retry preserves explicit game access');
    }
    {
      const { context, page } = await contextPage(browser, 390, 844);
      await page.route('**/assets/AtlasMap-*.js', route => route.fulfill({ status: 503, body: 'unavailable' }));
      await page.goto(URL_BASE); await page.getByRole('alert').waitFor();
      await page.getByRole('button', { name: 'Fictional game', exact: true }).click();
      assert.equal(await page.getByLabel('Player country').inputValue(), '');
      await page.getByLabel('Player country').selectOption('alden'); await page.getByRole('button', { name: 'Start local scenario', exact: true }).click();
      assert.equal(await page.locator('.game-meta dd').first().textContent(), 'Week 1');
      await context.close(); console.log('PASS atlas code-load failure keeps the secondary game accessible');
    }
    {
      const { context, page } = await contextPage(browser, 390, 844, () => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Denied', 'SecurityError'); } }); });
      await page.goto(URL_BASE); await ready(page); await page.getByRole('button', { name: 'Physical terrain', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: 'Physical terrain', exact: true }).getAttribute('aria-pressed'), 'false');
      await page.getByRole('button', { name: 'Fictional game', exact: true }).click(); await page.getByRole('button', { name: 'Back to globe', exact: true }).click(); await ready(page);
      assert.equal(await page.getByRole('button', { name: 'Physical terrain', exact: true }).getAttribute('aria-pressed'), 'false'); await context.close(); console.log('PASS storage denied: startup and current-tab Terrain preference remain functional');
    }
    {
      const { context, page } = await contextPage(browser, 390, 844, () => {
        Object.defineProperty(navigator, 'standalone', { value: true }); const original = matchMedia;
        window.matchMedia = query => query === '(display-mode: standalone)' ? { ...original(query), matches: true, media: query } : original(query);
      });
      await page.goto(URL_BASE); await ready(page); assert.equal(await page.locator('.atlas-viewport').getAttribute('data-projection'), 'globe');
      assert.equal(await page.getByRole('button', { name: 'Next week', exact: true }).count(), 0);
      await page.getByRole('button', { name: 'Fictional game', exact: true }).click();
      await page.getByLabel('Player country').selectOption('alden'); await page.getByRole('button', { name: 'Start local scenario', exact: true }).click();
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await ready(page);
      await page.getByRole('button', { name: 'Resume game', exact: true }).click();
      assert.equal(await page.locator('.game-meta dd').first().textContent(), 'Week 1');
      await page.reload(); await ready(page);
      await context.close(); console.log('PASS standalone flag emulation launches/reloads/resumes on globe with game retained (physical home-screen launch unverified)');
    }
    assert.deepEqual(issues, []); console.log('PASS no startup/runtime errors; captures:', OUTPUT);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });

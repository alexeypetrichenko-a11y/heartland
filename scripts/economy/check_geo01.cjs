const assert = require('node:assert/strict');
const { mkdir } = require('node:fs/promises');
const { join } = require('node:path');
const { chromium } = require(process.env.HEARTLAND_PLAYWRIGHT_MODULE || 'playwright');

const url = process.env.HEARTLAND_PREVIEW_URL || 'http://127.0.0.1:4195/heartland/';
const screenshotDirectory = process.env.HEARTLAND_BROWSER_OUTPUT;
const button = (page, name) => page.getByRole('button', { name, exact: true });
const wait = (page, expression) => page.waitForFunction(expression, null, { timeout: 30000 });
const screenshot = (page, name) => screenshotDirectory
  ? page.screenshot({ path: join(screenshotDirectory, name + '.png') }) : Promise.resolve();

async function run(browser, width, height, rate) {
  const page = await browser.newPage({ viewport: { width, height }, isMobile: width < 850, hasTouch: width < 850 });
  const cdp = await page.context().newCDPSession(page);
  if (rate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    for (const name of ['indexedDB', 'localStorage', 'sessionStorage']) {
      Object.defineProperty(window, name, { get() { throw new Error('Unexpected access to ' + name); } });
    }
    let draws = 0;
    const observer = requestAnimationFrame;
    window.requestAnimationFrame = callback => observer(time => { draws++; callback(time); });
    window.geoFrames = () => draws;
    window.geoBlends = [];
    new MutationObserver(records => {
      for (const { target } of records) window.geoBlends.push(Number(target.getAttribute('data-flat-blend')));
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-flat-blend'] });
  });
  const started = performance.now();
  await page.goto(url);
  await wait(page, () => document.querySelector('.atlas-frame')?.getAttribute('aria-busy') === 'false');
  const initialMs = performance.now() - started;
  const viewport = page.locator('.atlas-viewport');
  const globe = await viewport.elementHandle();
  const firstLon = Number(await viewport.getAttribute('data-longitude'));
  const box = await viewport.boundingBox();
  await page.mouse.move(box.x + box.width * .40, box.y + box.height * .42);
  const rotated = performance.now();
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .60, box.y + box.height * .42, { steps: 8 });
  await page.mouse.up();
  assert.notEqual(Number(await viewport.getAttribute('data-longitude')), firstLon);
  const dragMs = performance.now() - rotated;
  const wheelMs = await viewport.evaluate(node => new Promise(resolve => {
    const rect = node.getBoundingClientRect();
    const start = performance.now();
    node.dispatchEvent(new WheelEvent('wheel', { deltaY: -60, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2, cancelable: true }));
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - start)));
  }));
  await button(page, 'Reset atlas view').click();

  await button(page, 'New game').click();
  const country = page.getByLabel('Player country', { exact: true });
  await country.locator('option[value=fra]').waitFor({ state: 'attached' });
  await viewport.scrollIntoViewIfNeeded();
  const hit = await viewport.evaluate(node => {
    const rect = node.getBoundingClientRect();
    const radians = Math.PI / 180;
    const lon = (2 - Number(node.getAttribute('data-longitude'))) * radians;
    const lat = 46 * radians, focus = Number(node.getAttribute('data-latitude')) * radians;
    const radius = Math.min(rect.width, rect.height) * .42 * Number(node.getAttribute('data-zoom'));
    return { x: rect.x + rect.width / 2 + radius * Math.cos(lat) * Math.sin(lon),
      y: rect.y + rect.height / 2 - radius * (Math.sin(lat) * Math.cos(focus) - Math.cos(lat) * Math.cos(lon) * Math.sin(focus)) };
  });
  await page.touchscreen.tap(hit.x, hit.y);
  await page.waitForFunction(() => document.querySelector('#player-country')?.value === 'fra');
  assert.equal(await viewport.evaluate((node, initial) => node === initial, globe), true);
  const transition = performance.now();
  await button(page, 'Start local scenario').click();
  await page.locator('.europe-provinces path[data-province]').first().waitFor({ state: 'visible' });
  await wait(page, () => document.querySelector('.atlas-viewport')?.getAttribute('data-flat-blend') === '1');
  await page.locator('[data-geo-counter]').first().waitFor();
  const detailMs = performance.now() - transition;
  const intermediateBlend = await page.evaluate(() => window.geoBlends.some(value => value > 0 && value < 1));
  if (rate === 1) assert.ok(intermediateBlend);
  assert.equal(await page.locator('.europe-provinces path[data-province]').count(), 46);
  assert.equal(await viewport.evaluate((node, initial) => node === initial, globe), true);
  assert.equal(await page.locator('[data-geo-order]').count(), 0);
  assert.equal(await page.locator('[data-geo-counter]').count() > 0, true);
  await screenshot(page, `geo01-detail-${width}x${height}`);

  const tapped = performance.now();
  await page.locator('[data-geo-counter]').first().click();
  await page.locator('.geo-counter-detail').waitFor();
  const selectionMs = performance.now() - tapped;
  const roster = page.locator('.geo-counter-detail li button');
  for (const entry of (await roster.all()).slice(0, 2)) if (await entry.getAttribute('aria-pressed') === 'false') await entry.click();
  const selected = await page.locator('.geo-counter-detail li button[aria-pressed=true]').count();
  assert.ok(selected >= 1);
  await screenshot(page, `geo01-selection-${width}x${height}`);
  await button(page, 'Close formations').click();
  await button(page, 'Show orders').click();
  assert.ok(await page.locator('[data-geo-order=reinforce]').count());
  assert.ok(await page.locator('[data-geo-order=retreat]').count());
  assert.ok(await page.locator('[data-geo-counter]').count());
  await screenshot(page, `geo01-orders-${width}x${height}`);
  await button(page, 'Hide orders').click();
  assert.equal(await page.locator('[data-geo-order]').count(), 0);

  await page.waitForTimeout(600);
  const beforeIdle = await page.evaluate(() => window.geoFrames());
  await page.waitForTimeout(350);
  const idleFrames = await page.evaluate(() => window.geoFrames()) - beforeIdle;
  const beforeZoom = performance.now();
  while (await viewport.getAttribute('data-projection') === 'flat') await button(page, 'Zoom out atlas').click();
  await wait(page, () => document.querySelector('.atlas-viewport')?.getAttribute('data-flat-blend') === '0');
  const zoomOutMs = performance.now() - beforeZoom;
  assert.equal(await page.locator('[data-geo-counter]').count(), 0);
  assert.equal(await button(page, 'Show orders').count(), 0);
  await screenshot(page, `geo01-globe-near-${width}x${height}`);
  await button(page, 'Reset atlas view').click();
  await wait(page, () => document.querySelector('.atlas-viewport')?.getAttribute('data-zoom') === '1');
  await screenshot(page, `geo01-globe-${width}x${height}`);

  await button(page, 'Military').click();
  const selectedBefore = await page.locator('.geo-military-selection summary').textContent();
  assert.match(selectedBefore, /[1-9]/);
  await page.locator('.geo-military-selection summary').click();
  const checked = page.locator('.geo-military-selection input:checked');
  assert.ok(await checked.count());
  await page.locator('.geo-military-selection li button').first().click();
  await wait(page, () => document.querySelector('.atlas-viewport')?.getAttribute('data-flat-blend') === '1');
  await page.locator('[data-geo-counter]').first().waitFor();
  const currentProvince = await page.getByLabel('Province', { exact: true }).inputValue();
  const oldWidth = (await viewport.boundingBox()).width;
  const resized = performance.now();
  await page.setViewportSize({ width: height, height: width });
  await page.waitForFunction(width => {
    const rect = document.querySelector('.atlas-viewport')?.getBoundingClientRect();
    return rect && Math.abs(rect.width - width) > 20;
  }, oldWidth);
  const resizeMs = performance.now() - resized;
  assert.equal(await page.getByLabel('Province', { exact: true }).inputValue(), currentProvince);
  assert.deepEqual(errors, []);
  const memory = await cdp.send('Runtime.getHeapUsage');
  console.log(JSON.stringify({ width, height, rate, initialMs, dragMs, wheelMs, detailMs, selectionMs, zoomOutMs, resizeMs, idleFrames,
    intermediateBlend, heapMiB: memory.usedSize / 1048576 }));
  await page.close();
}

(async () => {
  if (screenshotDirectory) await mkdir(screenshotDirectory, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.HEARTLAND_CHROMIUM, args: ['--enable-unsafe-swiftshader'] });
  try {
    await run(browser, 375, 667, 1);
    await run(browser, 667, 375, 1);
    if (process.argv.includes('--throttled')) await run(browser, 375, 667, 6);
    const page = await browser.newPage({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
    await page.goto(url + '?marker-stress=90');
    await button(page, 'New game').click();
    await page.getByLabel('Player country', { exact: true }).selectOption('fra');
    const markerStart = performance.now();
    await button(page, 'Start local scenario').click();
    const counters = page.locator('.geo-counters[data-marker-roster="90"]');
    await counters.waitFor();
    await page.waitForFunction(() => Number(document.querySelector('[data-marker-roster="90"]')?.getAttribute('data-marker-visible')) > 0);
    console.log(JSON.stringify({ stress: 'synthetic 90 markers', detailMs: performance.now() - markerStart,
      visible: Number(await counters.getAttribute('data-marker-visible')) }));
    await page.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

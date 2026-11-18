/* Playwright production-preview tests, using an external browser installation. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.HEARTLAND_PLAYWRIGHT_MODULE || 'playwright-core');

const url = process.env.HEARTLAND_TEST_URL || 'http://localhost:4173/heartland/';
const output = process.env.HEARTLAND_BROWSER_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'heartland-countries-'));
const sizes = process.env.HEARTLAND_VIEWPORTS ? JSON.parse(process.env.HEARTLAND_VIEWPORTS) : [[320, 568], [390, 844], [844, 390], [568, 320], [1440, 900]];
const errors = [];
let math;
fs.mkdirSync(output, { recursive: true });

const viewport = page => page.locator('.atlas-viewport');
const panel = page => page.locator('.atlas-country-panel');
const settle = page => page.evaluate(async () => {
  for (let i = 0; i < 4; i++) await new Promise(resolve => requestAnimationFrame(resolve));
});
const button = (page, name) => page.getByRole('button', { name, exact: true });
const capture = (page, name) => page.screenshot({ path: path.join(output, name), scale: 'css' });

async function open(browser, width, height, init) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: width < 900, hasTouch: width < 900 });
  await context.addInitScript(() => {
    const upload = WebGLRenderingContext.prototype.texImage2D;
    window.worldUploads = 0;
    WebGLRenderingContext.prototype.texImage2D = function (...args) {
      if (args[2] === this.RGBA && args[5] instanceof HTMLCanvasElement) window.worldUploads++;
      return upload.apply(this, args);
    };
  });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto(url);
  await page.locator('.atlas-frame[aria-busy="false"]').waitFor();
  await settle(page);
  return { context, page, requests };
}

async function pose(page) {
  return viewport(page).evaluate(element => {
    const { x, y, width, height } = element.getBoundingClientRect();
    const { longitude, latitude, projection, zoom } = element.dataset;
    return {
      x, y, width, height,
      camera: { focus: [+longitude, +latitude], zoom: +zoom, projection: projection === 'globe' ? 'globe' : 'flat', flatOnly: projection === 'flat-fallback' },
    };
  });
}

async function coordinates(page, geographic) {
  const view = await pose(page);
  const point = math.projectWorld(view.camera, view, geographic);
  assert.ok(point, 'test point must be on the visible hemisphere');
  return { x: view.x + point.x, y: view.y + point.y };
}

async function tap(page, geographic, touch) {
  const { x, y } = await coordinates(page, geographic);
  assert.equal(await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('.atlas-viewport')), { x, y }), true, 'test point unobstructed');
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function selected(page, code) {
  await panel(page).getByText(`ne:admin0:${code}`, { exact: true }).waitFor();
  await settle(page);
  assert.match(await panel(page).innerText(), /Playability undecided/);
}

async function clear(page) {
  await button(page, 'Clear country selection').click();
  await panel(page).waitFor({ state: 'detached' });
}

async function moveTo(page, longitude, latitude) {
  await button(page, 'Reset atlas view').click();
  await settle(page);
  for (let attempt = 0; attempt < 32; attempt++) {
    const view = await pose(page);
    const [lon, lat] = view.camera.focus;
    const dx = math.wrapLongitude(longitude - lon), dy = latitude - lat;
    if (Math.abs(dx) < .05 && Math.abs(dy) < .05) return;
    const scale = math.northScale(view.camera, view);
    const limit = (pixels, size) => Math.max(-size * .35, Math.min(size * .35, pixels));
    const x = view.x + view.width / 2, y = view.y + view.height / 2;
    const nextX = x + limit(-dx * scale * Math.max(.1, Math.cos(lat * Math.PI / 180)), view.width);
    const nextY = y + limit(dy * scale, view.height);
    await page.mouse.move(x, y);
    await page.mouse.down();
    if (Math.hypot(nextX - x, nextY - y) < 7) await page.mouse.move(x + 8, y);
    await page.mouse.move(nextX, nextY);
    await page.mouse.up();
    await settle(page);
  }
  assert.fail(`could not navigate to ${longitude}, ${latitude}`);
}

async function zoom(page, target) {
  for (let attempt = 0; attempt < 15; attempt++) {
    const view = await pose(page);
    if (Math.abs(view.camera.zoom - target) < .0001) return;
    await viewport(page).dispatchEvent('wheel', { clientX: view.x + view.width / 2, clientY: view.y + view.height / 2,
      deltaY: -Math.log(target / view.camera.zoom) / .003, cancelable: true, bubbles: true });
    await settle(page);
  }
  assert.fail(`could not zoom to ${target}`);
}

async function globePixel(page, geographic) {
  const view = await pose(page);
  const point = math.projectWorld(view.camera, view, geographic);
  return page.locator('.atlas-globe').evaluate((canvas, { x, y, width, height }) => {
    const gl = canvas.getContext('webgl');
    const pixel = new Uint8Array(4);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, 96 * 64 * 6, gl.UNSIGNED_SHORT, 0);
    gl.readPixels(Math.floor(x / width * canvas.width), Math.floor((1 - y / height) * canvas.height), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    if (gl.getError() !== gl.NO_ERROR) throw new Error('globe shader error');
    return [...pixel];
  }, { ...point, width: view.width, height: view.height });
}

async function layout(page) {
  const box = await panel(page).boundingBox();
  const close = await button(page, 'Clear country selection').boundingBox();
  const map = await viewport(page).boundingBox();
  assert.ok(close.width >= 44 && close.height >= 44, 'touch-sized dismissal');
  assert.ok(box.x >= map.x && box.x + box.width <= map.x + map.width && box.y >= map.y && box.y + box.height <= map.y + map.height, 'panel stays within map');
  assert.ok(box.width * box.height < map.width * map.height * .35, 'compact panel leaves most of the map available');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight));
}

async function verifyGlobeAndFlat(browser, width, height) {
  const { context, page, requests } = await open(browser, width, height);
  const touch = width < 900;
  const france = [2.19, 46.71], germany = [10.48, 51.08];
  assert.ok(requests.every(request => !request.endsWith('/countries.json')));
  await button(page, 'Physical terrain').click();
  await settle(page);
  const before = await pose(page), baseline = await globePixel(page, france), uploads = await page.evaluate(() => window.worldUploads);
  const germanyBefore = await globePixel(page, germany);
  await tap(page, france, touch);
  await selected(page, 'FRA');
  await panel(page).getByText('Western Europe', { exact: true }).waitFor();
  assert.equal(await panel(page).getByRole('heading').innerText(), 'France');
  assert.deepEqual(await pose(page), before, 'selection never changes the globe camera or layout');
  const tint = await globePixel(page, france);
  assert.ok(tint[0] > baseline[0] + 20, `globe texture highlights France ${baseline} -> ${tint}`);
  assert.deepEqual(await globePixel(page, germany), germanyBefore, 'other country colors stay unchanged');
  assert.equal(await page.evaluate(() => window.worldUploads), uploads, 'tapping does not rebuild the world texture');
  assert.equal(requests.filter(request => request.endsWith('/countries.json')).length, 1);
  await button(page, 'Physical terrain').click();
  await settle(page);
  await layout(page);
  if (width === 390 || width === 844) await capture(page, `selected-globe-${width}.png`);
  await tap(page, germany, touch);
  await selected(page, 'DEU');

  if (touch) {
    const cdp = await context.newCDPSession(page);
    const start = await coordinates(page, france);
    const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
    await send('touchStart', [[start.x, start.y]]);
    await send('touchMove', [[start.x + 28, start.y + 18]]);
    await send('touchMove', [[start.x, start.y]]);
    await send('touchEnd', []);
    await selected(page, 'DEU');
    await send('touchStart', [[start.x, start.y]]);
    await send('touchCancel', []);
    await selected(page, 'DEU');
    await send('touchStart', [[start.x - 15, start.y], [start.x + 15, start.y]]);
    await send('touchMove', [[start.x - 25, start.y], [start.x + 25, start.y]]);
    await send('touchEnd', []);
    await selected(page, 'DEU');
    assert.ok((await pose(page)).camera.zoom > 1, 'pinch zoom remains functional');
  }

  await moveTo(page, ...france);
  await tap(page, france, touch);
  await selected(page, 'FRA');
  const local = await pose(page), threshold = math.transitionZoom(local.camera, local);
  for (let step = 0; step < 12 && (await pose(page)).camera.zoom < threshold * 1.3; step++) {
    await button(page, 'Zoom in atlas').click();
    await settle(page);
  }
  await page.locator('.atlas-viewport[data-flat-blend="1"]').waitFor();
  await selected(page, 'FRA');
  assert.ok(await page.locator('.atlas-country-borders [data-selected-country="ne:admin0:FRA"] use').count() >= 2);
  assert.ok(Math.hypot(...(await pose(page)).camera.focus.map((v, i) => v - local.camera.focus[i])) < .01);
  if (width === 390 || width === 844) await capture(page, `selected-flat-${width}.png`);
  await tap(page, [6.08, 49.8], touch);
  await selected(page, 'LUX');
  await zoom(page, 1);
  await page.locator('.atlas-viewport[data-flat-blend="0"]').waitFor();
  await selected(page, 'LUX');
  await clear(page);
  await viewport(page).focus();
  await page.keyboard.press('Enter');
  await selected(page, 'FRA');
  await page.keyboard.press('Escape');
  await panel(page).waitFor({ state: 'detached' });
  console.log(`PASS ${width}×${height} globe and flat picks, GPU highlight, touch/mouse, compact panel, zoom persistence, keyboard and dismissal`);
  await context.close();
}

async function verifySourceEdges(browser) {
  const { context, page, requests } = await open(browser, 390, 844);
  await moveTo(page, 7.40293, 43.74161);
  const monaco = page.waitForResponse(response => response.url().endsWith('/countries/MCO.geojson') && response.ok());
  await zoom(page, 48);
  await monaco;
  await page.waitForFunction(() => [...document.querySelectorAll('[data-political-stage^="1-"] [data-country="ne:admin0:MCO"]')]
    .some(node => node.getBoundingClientRect().width > 5));
  await page.waitForFunction(() => document.querySelector('.atlas-viewport').dataset.flatBlend === '1');
  await page.waitForFunction(() => document.querySelector('#atlas-status')?.textContent?.startsWith('Map ·'));
  assert.ok(requests.some(request => request.endsWith('/countries/MCO.geojson')));
  await tap(page, [7.40293, 43.74161], true);
  await selected(page, 'MCO');
  await capture(page, 'selected-monaco-390.png');
  await clear(page);
  await moveTo(page, 28.16, -29.62);
  await zoom(page, 3);
  await page.waitForTimeout(600);
  await tap(page, [28.16436, -29.6153], true);
  await selected(page, 'LSO');
  await tap(page, [26.12, -28.47], true);
  await selected(page, 'ZAF');
  await clear(page);

  await moveTo(page, 179.6, -16.7);
  const fiji = await pose(page), threshold = math.transitionZoom(fiji.camera, fiji);
  await zoom(page, threshold * .97);
  await page.waitForTimeout(650);
  await tap(page, [179.22, -16.57], true);
  await selected(page, 'FJI');
  await clear(page);
  await tap(page, [-179.9304, -16.8373], true);
  await selected(page, 'FJI');
  await zoom(page, threshold * 1.7);
  await page.locator('.atlas-viewport[data-flat-blend="1"]').waitFor();
  await selected(page, 'FJI');
  const copies = await page.locator('.atlas-country-borders [data-world-offset]:has([data-selected-country="ne:admin0:FJI"])').count();
  assert.equal(copies, 2, 'polygon highlights wrap with the map');
  await clear(page);
  await tap(page, [179.22, -16.57], true);
  await selected(page, 'FJI');
  await clear(page);
  await tap(page, [-179.9304, -16.8373], true);
  await selected(page, 'FJI');
  await capture(page, 'selected-fiji-390.png');
  await button(page, 'Fictional game').click();
  assert.equal(await page.getByLabel('Player country').inputValue(), '');
  await page.getByLabel('Player country').selectOption('alden');
  await button(page, 'Start local scenario').click();
  await button(page, 'Next week').click();
  await button(page, 'Scenario menu').click();
  await button(page, 'Return to globe').click();
  await selected(page, 'FJI');
  await button(page, 'Resume game').click();
  assert.equal(await page.locator('.game-meta dd').first().innerText(), 'Week 2');
  console.log('PASS Monaco at 10m detail, Lesotho enclave, both Fiji date-line sides in both views and retained fictional game');
  await context.close();
}

(async () => {
  math = await import(pathToFileURL(path.resolve(__dirname, '../../src/geography/worldCamera.ts')).href);
  const browser = await chromium.launch({ executablePath: process.env.HEARTLAND_CHROMIUM || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  try {
    for (const [width, height] of sizes) await verifyGlobeAndFlat(browser, width, height);
    await verifySourceEdges(browser);
    const { context, page } = await open(browser, 390, 844, () => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type === 'webgl' ? null : get.call(this, type, ...args); };
    });
    assert.ok((await pose(page)).camera.flatOnly);
    await tap(page, [2.19, 46.71], true);
    await selected(page, 'FRA');
    await clear(page);
    await context.close();
    assert.deepEqual(errors, []);
    console.log('PASS flat fallback selection and no runtime errors. Captures:', output);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });

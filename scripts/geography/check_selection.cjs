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
const regionPanel = page => page.locator('.atlas-region-panel');
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
  page.setDefaultTimeout(20000);
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

// Center the zoom exactly when testing small source features. MouseEvent client
// coordinates are rounded by browsers, which matters on an overview globe.
async function zoomWithButtons(page, target) {
  for (let attempt = 0; attempt < 13; attempt++) {
    if ((await pose(page)).camera.zoom >= target) return;
    await button(page, 'Zoom in atlas').click();
    await settle(page);
  }
  assert.fail(`could not reach ${target}× with the zoom buttons`);
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

async function expectRegions(page, country, region) {
  await page.locator(`.atlas-regions[data-region-country="ne:admin0:${country}"] [data-region-id="ne:admin1:${region}"]`).first().waitFor({ state: 'attached' });
  await viewport(page).and(page.locator('[data-region-status="ready"], [data-region-status="limited"], [data-region-status="incomplete"]')).waitFor();
  await settle(page);
}

async function expectRegionPanel(page, country, name, id, sourceCode) {
  await regionPanel(page).getByText(`ne:admin1:${id}`, { exact: true }).waitFor();
  assert.equal(await regionPanel(page).getByRole('heading').innerText(), name);
  await regionPanel(page).getByText(`Parent country ${country}`, { exact: true }).waitFor();
  assert.ok((await regionPanel(page).innerText()).includes(sourceCode));
  if ((await pose(page)).camera.projection === 'globe') {
    await page.locator(`.atlas-globe[data-selected-region="ne:admin1:${id}"]`).waitFor();
    return;
  }
  const mark = page.locator(`.atlas-regions [data-selected-region="ne:admin1:${id}"]`).first();
  assert.equal(await mark.locator('path[fill="#ffe19a"]').count(), 1);
  assert.equal(await mark.locator('path[stroke="#ffe19a"]').count(), 1);
  assert.ok((await mark.boundingBox())?.width > 0);
}

async function waitForFit(page) {
  await page.waitForFunction(() => /Loading (more )?regions|Regions in|Partial regional coverage|Some source region geometry/.test(document.querySelector('#atlas-status')?.textContent || ''));
  await settle(page);
}

async function clearMapPoint(page, geographic) {
  const point = await coordinates(page, geographic);
  assert.ok(await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('.atlas-viewport')), point),
    `${geographic.join(', ')} is visible with room for the controls`);
}

async function zoomToFlat(page, geographic) {
  for (let step = 0; step < 12; step++) {
    if ((await pose(page)).camera.projection === 'flat') break;
    const { x, y } = await coordinates(page, geographic);
    await viewport(page).dispatchEvent('wheel', { clientX: x, clientY: y, deltaY: -120, cancelable: true, bubbles: true });
    await settle(page);
  }
  await viewport(page).and(page.locator('[data-flat-blend="1"]')).waitFor();
}

async function verifyRegionShortcut(browser, width, height) {
  const { context, page, requests } = await open(browser, width, height);
  const touch = width < 900;
  await tap(page, [2.19, 46.71], touch);
  await panel(page).getByText('Western Europe', { exact: true }).waitFor();
  const action = panel(page).getByRole('button', { name: 'Regions', exact: true });
  assert.equal(await action.isEnabled(), true, 'Regions is available on the opening globe');
  const start = await pose(page);
  assert.equal(start.camera.zoom, 1);
  assert.ok(requests.every(request => !request.includes('/regions/')), 'country inspection does not fetch regional files');
  const target = await action.boundingBox();
  const card = await panel(page).boundingBox();
  assert.ok(target.width >= 44 && target.height >= 44);
  assert.ok(target.y >= card.y && target.y + target.height <= card.y + card.height);
  if (width === 390 || width === 844) await capture(page, `regions-action-${width}.png`);
  await viewport(page).evaluate(element => {
    const samples = [];
    window.regionCameraSamples = samples;
    const observer = new MutationObserver(() => {
      const { zoom, longitude, latitude, bearing } = element.dataset;
      samples.push([+zoom, +longitude, +latitude, +bearing]);
    });
    observer.observe(element, { attributes: true, attributeFilter: ['data-zoom', 'data-longitude', 'data-latitude', 'data-bearing'] });
  });
  if (touch) await action.tap();
  else await action.press('Space');
  await waitForFit(page);
  const end = await pose(page);
  assert.ok(end.camera.zoom > 1);
  const samples = await page.evaluate(() => window.regionCameraSamples);
  assert.ok(samples.some(([zoom, lon, lat]) => zoom === 1 && Math.hypot(lon - start.camera.focus[0], lat - start.camera.focus[1]) > .1), 'the camera centers before zooming');
  assert.ok(samples.every(([, , , bearing]) => bearing === 0), 'the map stays north-up');
  for (const [zoom, lon, lat] of samples) {
    if (zoom > 1.001) assert.ok(Math.hypot(lon - end.camera.focus[0], lat - end.camera.focus[1]) < .001, 'the zoom keeps the new center');
  }
  for (const point of [[-4.48, 48.38], [7.75, 48.58], [9.1, 42.15], [3.05, 50.62]]) await clearMapPoint(page, point);
  if (width === 390 || width === 844) await capture(page, `fitted-france-${width}.png`);
  if (end.camera.projection === 'globe') await page.locator('.atlas-globe[data-region-count]').waitFor();
  else await expectRegions(page, 'FRA', '1159316799');
  assert.equal((await pose(page)).camera.zoom, end.camera.zoom, 'the layer appears at the fitted scale');
  assert.ok(requests.filter(request => request.includes('/regions/')).every(request => /\/regions\/FRA[.-]/.test(request)));
  await tap(page, [2.35018, 48.856], touch);
  await expectRegionPanel(page, 'France', 'Paris', '1159316799', 'FRA-5333');
  await button(page, 'Clear region selection').click();
  await selected(page, 'FRA');
  assert.equal(await action.isVisible(), true);
  await layout(page);
  console.log(`PASS Regions shortcut ${width}×${height}: immediate 44px control, centered north-up move, selection and country return`);
  await context.close();
}

// Derive a tap from the actual downloaded source polygons. The widest
// interior segment at a ring's mid-latitude avoids coastline rounding.
function regionTapPoints(feature) {
  const { geometry } = feature;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.flatMap(polygon => {
    const latitudes = polygon[0].map(vertex => vertex[1]);
    const lat = (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
    const crossings = polygon.flatMap(ring => ring.slice(1).flatMap(([x, y], i) => {
      const [px, py] = ring[i];
      return (y > lat) !== (py > lat) ? [px + (x - px) * (lat - py) / (y - py)] : [];
    })).sort((a, b) => a - b);
    return crossings.slice(0, -1).flatMap((west, i) => i % 2 === 0 ?
      [{ point: [(west + crossings[i + 1]) / 2, lat], width: (crossings[i + 1] - west) * Math.cos(lat * Math.PI / 180) }] : []);
  });
}

async function tapLoadedRegion(page, code, requests, touch) {
  const root = path.resolve(__dirname, '../../public/geography/natural-earth-5.1.1/regions');
  const read = filename => JSON.parse(fs.readFileSync(path.join(root, filename), 'utf8'));
  const records = new Map(read(`${code}.index.json`).regions.map(record => [record.id, record]));
  const files = new Set(requests.filter(url => new RegExp(`/regions/${code}-[0-9]{3}\\.geojson$`).test(url)).map(url => path.basename(url)));
  const view = await pose(page);
  const candidates = [...files].flatMap(file => read(file).features.flatMap(feature => {
    const record = records.get(feature.id);
    if (!record || record.geometryStatus !== 'valid') return [];
    return regionTapPoints(feature).map(sample => ({ ...sample, record }));
  })).sort((a, b) => b.width - a.width);
  for (const { point, record } of candidates) {
    const projected = math.projectWorld(view.camera, view, point);
    if (!projected || projected.x < 6 || projected.x > view.width - 6 || projected.y < 6 || projected.y > view.height - 6) continue;
    const x = view.x + projected.x, y = view.y + projected.y;
    if (!await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('.atlas-viewport')), { x, y })) continue;
    await tap(page, point, touch);
    return record;
  }
  assert.fail(`No visible region tap point for ${code}`);
}

async function verifyFittedCountries(browser, width, height) {
  const { context, page, requests } = await open(browser, width, height);
  const touch = width < 900;
  const cases = [
    ['FRA', [-53.23, 3.92], 'France', [[-4.48, 48.38], [7.75, 48.58], [9.1, 42.15]]],
    ['DEU', [13.39, 52.5], 'Germany', [[9.98, 53.55], [6.96, 50.93], [11.58, 48.13]]],
    ['USA', [-155.45329, 19.59369], 'United States of America', [[-122.42, 37.77], [-80.19, 25.76], [-71.06, 42.36]]],
    ['RUS', [89.5, 57], 'Russia', [[37.62, 55.75], [89.5, 57], [131.88, 43.11], [-171, 65.9]]],
    ['CHN', [104.06, 30.66], 'China', [[104.06, 30.66], [114.3, 30.58]]],
    ['CAN', [-114.07, 51.05], 'Canada', [[-114.07, 51.05], [-79.38, 43.65]]],
    ['BRA', [-47.88, -15.8], 'Brazil', [[-47.88, -15.8], [-43.94, -19.92]]],
    ['AUS', [133.87, -23.7], 'Australia', [[133.87, -23.7], [151.2, -33.86]]],
    ['IDN', [110.37, -7.8], 'Indonesia', [[101, 0], [113, -1], [110, -7.5], [121, -3], [139, -5]]],
    ['JPN', [138.18, 36.65], 'Japan', [[138.18, 36.65], [141.35, 43.06]]],
    ['LUX', [6.08, 49.8], 'Luxembourg', [[5.73, 49.55], [6.48, 49.82], [6.09, 50.15]]],
    ['FJI', [177.98577, -17.79201], 'Fiji', [[177.99, -17.79], [179.20293, -16.57802], [-179.93079, -16.82277]]],
  ];
  for (const [code, at, name, points] of cases) {
    await moveTo(page, ...at);
    if (code === 'LUX') await zoomWithButtons(page, 5);
    await tap(page, at, touch);
    await selected(page, code);
    const before = requests.length;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const slowAssets = '**/regions/USA-*.geojson';
    const slowUS = code === 'USA' && width === 390;
    if (slowUS) await page.route(slowAssets, async route => { await gate; await route.continue(); });
    await panel(page).getByRole('button', { name: 'Regions', exact: true }).click();
    await waitForFit(page);
    if (slowUS) {
      assert.match(await page.locator('#atlas-status').innerText(), /Loading regions/);
      release();
    }
    for (const point of points) await clearMapPoint(page, point);
    const view = await pose(page);
    assert.ok(view.camera.zoom <= 64.01);
    const status = viewport(page).and(page.locator('[data-region-status="ready"], [data-region-status="limited"], [data-region-status="incomplete"]'));
    await status.waitFor();
    if (code === 'RUS' || await status.getAttribute('data-region-status') === 'limited') {
      assert.match(await page.locator('#atlas-status').innerText(), /Partial regional coverage/);
    }
    if (code === 'BRA') assert.match(await page.locator('#atlas-status').innerText(), /Some source region geometry unavailable/);
    if (view.camera.projection === 'globe') await page.locator('.atlas-globe[data-region-count]').waitFor();
    else await page.locator('.atlas-regions').waitFor();
    assert.equal((await pose(page)).camera.zoom, view.camera.zoom, 'the layer loads without changing the fitted zoom');
    const regionRequests = requests.slice(before).filter(url => url.includes('/regions/'));
    assert.ok(regionRequests.length && regionRequests.every(url => url.includes(`/regions/${code}`)));
    assert.ok(new Set(regionRequests.filter(url => url.endsWith('.geojson'))).size <= 4);
    if (['USA', 'RUS', 'IDN'].includes(code)) await capture(page, `regions-${code.toLowerCase()}-${width}.png`);
    const record = await tapLoadedRegion(page, code, regionRequests, touch);
    await expectRegionPanel(page, name, record.name || record.names.english || 'Unnamed region', record.id.split(':').at(-1), record.source.adm1_code);
    if (code === 'USA') {
      const zoomStart = (await pose(page)).camera.zoom;
      await zoomToFlat(page, [-98.1, 38.2]);
      await page.locator('.atlas-regions').waitFor();
      assert.ok((await pose(page)).camera.zoom > zoomStart);
      await panel(page).waitFor({ state: 'hidden' });
      assert.match(await regionPanel(page).innerText(), new RegExp(record.id));
    }
    await button(page, 'Clear region selection').click();
    console.log(`PASS ${code} ${width}×${height}: regions drawn and selected at fitted ${view.camera.zoom.toFixed(1)}× (${view.camera.projection}) without extra zoom`);
    await clear(page);
  }

  if (width !== 390) { await context.close(); return; }
  await moveTo(page, 2.19, 46.71);
  await tap(page, [2.19, 46.71], true);
  await selected(page, 'FRA');
  await panel(page).getByText('Western Europe', { exact: true }).waitFor();
  await panel(page).getByRole('button', { name: 'Regions', exact: true }).tap();
  await waitForFit(page);
  const portrait = await pose(page);
  const resizing = page.locator('#atlas-status').filter({ hasText: 'Opening regions…' });
  const style = await page.addStyleTag({ content: '.atlas-country-panel { min-height: 335px; }' });
  await resizing.waitFor();
  await waitForFit(page);
  assert.ok((await pose(page)).camera.zoom < portrait.camera.zoom);
  for (const point of [[-4.48, 48.38], [9.1, 42.15]]) await clearMapPoint(page, point);
  await style.evaluate(element => element.remove());
  await page.setViewportSize({ width: 844, height: 390 });
  await resizing.waitFor();
  await waitForFit(page);
  const landscape = await pose(page);
  assert.ok(landscape.width > portrait.width && landscape.height < portrait.height);
  assert.ok(Math.abs(landscape.camera.zoom - portrait.camera.zoom) > .1);
  for (const point of [[-4.48, 48.38], [7.75, 48.58], [9.1, 42.15]]) await clearMapPoint(page, point);
  await button(page, 'Zoom in atlas').click();
  await settle(page);
  const manuallyZoomed = await pose(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);
  assert.equal((await pose(page)).camera.zoom, manuallyZoomed.camera.zoom, 'manual zoom stops following the viewport');
  console.log('PASS fitted country recalculates for card and orientation, and manual navigation takes over');
  await context.close();
}

async function verifyRegionHierarchy(browser, width, height) {
  const { context, page, requests } = await open(browser, width, height);
  const touch = width < 900;
  const paris = [2.35018, 48.856];
  const nearby = [2.19088, 48.84715];
  assert.ok(requests.every(request => !request.includes('/regions/')));
  await moveTo(page, ...paris);
  await tap(page, paris, touch);
  await selected(page, 'FRA');
  const initial = await pose(page);
  await zoom(page, math.transitionZoom(initial.camera, initial) * 1.2);
  await viewport(page).and(page.locator('[data-flat-blend="1"]')).waitFor();
  await selected(page, 'FRA');
  assert.ok(requests.every(request => !request.includes('/regions/')), 'shallow flat zoom still uses only countries');
  await zoom(page, 50);
  await expectRegions(page, 'FRA', '1159316799');
  assert.equal(await button(page, 'Administrative regions').getAttribute('aria-pressed'), 'true');
  assert.ok(requests.filter(r => r.includes('/regions/')).every(r => /\/regions\/FRA[.-]/.test(r)));

  await tap(page, paris, touch);
  await expectRegionPanel(page, 'France', 'Paris', '1159316799', 'FRA-5333');
  await tap(page, nearby, touch);
  await expectRegionPanel(page, 'France', 'Hauts-de-Seine', '1159316797', 'FRA-5306');
  if (touch) {
    const cdp = await context.newCDPSession(page);
    const start = await coordinates(page, paris);
    const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
    await send('touchStart', [[start.x, start.y]]);
    await send('touchMove', [[start.x + 26, start.y - 13]]);
    await send('touchMove', [[start.x, start.y]]);
    await send('touchEnd', []);
    await expectRegionPanel(page, 'France', 'Hauts-de-Seine', '1159316797', 'FRA-5306');
    await send('touchStart', [[start.x - 14, start.y], [start.x + 14, start.y]]);
    await send('touchMove', [[start.x - 21, start.y], [start.x + 21, start.y]]);
    await send('touchEnd', []);
    await expectRegionPanel(page, 'France', 'Hauts-de-Seine', '1159316797', 'FRA-5306');
  }
  await zoom(page, 1);
  await viewport(page).and(page.locator('[data-flat-blend="0"]')).waitFor();
  await selected(page, 'FRA');
  assert.equal(await page.locator('.atlas-regions').count(), 0);
  await zoom(page, 50);
  await expectRegions(page, 'FRA', '1159316797');
  await expectRegionPanel(page, 'France', 'Hauts-de-Seine', '1159316797', 'FRA-5306');
  await button(page, 'Administrative regions').click();
  assert.equal(await button(page, 'Administrative regions').getAttribute('aria-pressed'), 'false');
  await tap(page, paris, touch);
  await selected(page, 'FRA');
  assert.equal(await page.locator('.atlas-regions').count(), 0);
  await button(page, 'Administrative regions').click();
  await expectRegions(page, 'FRA', '1159316799');
  await tap(page, paris, touch);
  await expectRegionPanel(page, 'France', 'Paris', '1159316799', 'FRA-5333');
  const target = await button(page, 'Clear region selection').boundingBox();
  const card = await regionPanel(page).boundingBox();
  const map = await viewport(page).boundingBox();
  assert.ok(target.width >= 44 && target.height >= 44);
  assert.ok(card.width * card.height < map.width * map.height * .35, 'region card leaves the map visible');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight));
  if (width === 390 || width === 844) await capture(page, `region-paris-${width}.png`);
  await button(page, 'Clear region selection').click();
  await selected(page, 'FRA');
  assert.equal(await regionPanel(page).count(), 0);
  console.log(`PASS regions ${width}×${height}: Paris, nearby department, gestures, handoff, selection mode, dismissal and layout`);
  await context.close();
}

async function verifyRegionalSources(browser) {
  const { context, page, requests } = await open(browser, 390, 844);
  const cases = [
    { code: 'DEU', parent: 'Germany', at: [13.39245, 52.50261], zoom: 30, name: 'Berlin', id: '1159312769', source: 'DEU-1599' },
    { code: 'USA', parent: 'United States of America', at: [-119.98368, 37.26058], zoom: 26, name: 'California', id: '1159308415', source: 'USA-3521' },
    { code: 'USA', parent: 'United States of America', at: [-98.1, 38.2], zoom: 32, name: 'Kansas', id: '1159315359', source: 'USA-3530' },
    { code: 'USA', parent: 'United States of America', at: [-155.45329, 19.59369], zoom: 31, name: 'Hawaii', id: '1159308409', source: 'USA-3517' },
    { code: 'FRA', parent: 'France', at: [-53.23, 3.92], zoom: 30, name: 'Guyane française', id: '1159311355', source: 'FRA-2000' },
    { code: 'SGP', parent: 'Singapore', at: [103.84903, 1.34689], zoom: 55, name: 'Central Singapore', id: '1159315513', source: 'SGP-4871' },
    { code: 'AIA', parent: 'Anguilla', at: [-63.25212, 18.27914], zoom: 100, name: 'Unnamed region', id: '1159315561', source: 'AIA+99?' },
  ];
  for (const item of cases) {
    await moveTo(page, ...item.at);
    const before = requests.length;
    await zoomWithButtons(page, item.zoom);
    await expectRegions(page, item.code, item.id);
    await tap(page, item.at, true);
    await expectRegionPanel(page, item.parent, item.name, item.id, item.source);
    const regional = requests.slice(before).filter(r => r.includes('/regions/'));
    assert.ok(regional.length > 0 && regional.every(r => r.includes(`/regions/${item.code}`)), `${item.name} requested ${regional.join(', ')}`);
    assert.ok(new Set(regional.filter(r => r.endsWith('.geojson'))).size <= 4);
    if (item.code === 'DEU') {
      await capture(page, 'region-berlin-390.png');
      await tap(page, [12.68092, 52.44566], true);
      await expectRegionPanel(page, 'Germany', 'Brandenburg', '1159315451', 'DEU-3487');
    }
    if (item.name === 'Hawaii') await capture(page, 'region-hawaii-390.png');
    await button(page, 'Clear region selection').click();
    if (item.code === 'SGP') {
      const before = (await pose(page)).camera.zoom;
      await button(page, 'Administrative regions').click();
      await panel(page).getByRole('button', { name: 'Regions', exact: true }).tap();
      await expectRegions(page, 'SGP', item.id);
      assert.ok((await pose(page)).camera.zoom > before, 'the shortcut fits a small landmass and reactivates regions');
      await tap(page, item.at, true);
      await expectRegionPanel(page, item.parent, item.name, item.id, item.source);
      await button(page, 'Clear region selection').click();
    }
    await clear(page);
  }

  for (const [code, name, at] of [['MCO', 'Monaco', [7.40293, 43.74161]], ['BRT', 'Bir Tawil', [33.70112, 21.8518]]]) {
    await moveTo(page, ...at);
    const before = requests.length;
    await zoomWithButtons(page, 54);
    await viewport(page).and(page.locator(`[data-region-status="${code === 'BRT' ? 'missing' : 'unavailable'}"]`)).waitFor();
    assert.match(await page.locator('#atlas-status').innerText(), code === 'BRT' ? new RegExp(`No mapped regions in ${name}`) : /No usable region geometry/);
    assert.equal(await page.locator('.atlas-regions').count(), 0);
    await tap(page, at, true);
    await selected(page, code);
    assert.equal(await panel(page).getByRole('button', { name: 'Regions', exact: true }).isDisabled(), true);
    await panel(page).getByText(code === 'BRT' ? 'No mapped regions' : 'No usable region boundaries', { exact: true }).waitFor();
    assert.ok(requests.slice(before).every(r => !r.endsWith(`/${code}-000.geojson`)));
    await clear(page);
  }

  await moveTo(page, 179.6, -16.7);
  let failChunk = true;
  await page.route('**/regions/FJI-000.geojson', route => failChunk ? route.fulfill({ status: 503, body: '' }) : route.continue());
  await zoom(page, 19);
  await viewport(page).and(page.locator('[data-region-status="error"]')).waitFor();
  await tap(page, [179.20293, -16.57802], true);
  await selected(page, 'FJI');
  failChunk = false;
  await button(page, 'Retry region data').click();
  await expectRegions(page, 'FJI', '1159313293');
  for (const point of [[179.20293, -16.57802], [-179.93079, -16.82277]]) {
    await tap(page, point, true);
    await expectRegionPanel(page, 'Fiji', 'Northern', '1159313293', 'FJI-2619');
    assert.equal(await page.locator('.atlas-regions [data-region-offset]:has([data-selected-region])').count(), 2);
    await button(page, 'Clear region selection').click();
  }
  await tap(page, [-179.93079, -16.82277], true);
  await expectRegionPanel(page, 'Fiji', 'Northern', '1159313293', 'FJI-2619');
  await capture(page, 'region-fiji-390.png');
  console.log('PASS Berlin/Brandenburg, California, Kansas, Hawaii, French Guiana, Singapore, unnamed Anguilla, Monaco, Bir Tawil, Fiji date line and retry');
  await context.close();
}

(async () => {
  math = await import(pathToFileURL(path.resolve(__dirname, '../../src/geography/worldCamera.ts')).href);
  const browser = await chromium.launch({ executablePath: process.env.HEARTLAND_CHROMIUM || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  try {
    if (process.env.HEARTLAND_CHECK_FRAMING_ONLY === '1') {
      for (const [width, height] of sizes) await verifyRegionShortcut(browser, width, height);
      for (const [width, height] of [[390, 844], [844, 390]]) await verifyFittedCountries(browser, width, height);
      assert.deepEqual(errors, []);
      console.log('PASS country framing without runtime errors. Captures:', output);
      return;
    }
    if (process.env.HEARTLAND_CHECK_REGIONS_ONLY === '1') {
      for (const [width, height] of sizes) {
        await verifyRegionShortcut(browser, width, height);
        await verifyRegionHierarchy(browser, width, height);
      }
      await verifyRegionalSources(browser);
      assert.deepEqual(errors, []);
      console.log('PASS regional selection without runtime errors. Captures:', output);
      return;
    }
    for (const [width, height] of sizes) await verifyGlobeAndFlat(browser, width, height);
    await verifySourceEdges(browser);
    const { context, page } = await open(browser, 390, 844, () => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type === 'webgl' ? null : get.call(this, type, ...args); };
    });
    assert.ok((await pose(page)).camera.flatOnly);
    await tap(page, [2.19, 46.71], true);
    await selected(page, 'FRA');
    await panel(page).getByRole('button', { name: 'Regions', exact: true }).tap();
    await expectRegions(page, 'FRA', '1159316799');
    await tap(page, [2.35018, 48.856], true);
    await expectRegionPanel(page, 'France', 'Paris', '1159316799', 'FRA-5333');
    await button(page, 'Clear region selection').click();
    await clear(page);
    await context.close();
    assert.deepEqual(errors, []);
    console.log('PASS flat fallback selection and no runtime errors. Captures:', output);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });

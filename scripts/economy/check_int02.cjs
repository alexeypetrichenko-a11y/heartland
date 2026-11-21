/* Production-preview checks. Use an external Playwright installation. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.HEARTLAND_PLAYWRIGHT_MODULE || 'playwright');

const url = process.env.HEARTLAND_PREVIEW_URL || 'http://127.0.0.1:4173/heartland/';
const proposals = {
  income: '23,175', consumption: '12.5', corporate: '30.25',
  administration: '13', social: '12.625', military: '3.25', infrastructure: '4.75',
};
const expected = Object.values(proposals).map(value => `Current ${value.replace(',', '.')}%`);
const button = (page, name) => page.getByRole('button', { name, exact: true });
const rate = (page, field) => page.locator(`#fiscal-${field}`);
const week = page => page.locator('.game-meta dd').first();
const treasury = page => page.locator('.game-meta dd').nth(1);
const current = page => Promise.all(Object.keys(proposals).map(key => page.locator(`#fiscal-${key}-current`).textContent()));
const budget = page => page.locator('.economy-budget dd').allTextContents();
const entered = page => Promise.all(Object.keys(proposals).map(key => rate(page, key).inputValue()));

async function layout(page, twoColumns) {
  const result = await page.locator('#fiscal-policy-details .detail-scroll').evaluate(editor => {
    const groups = [...editor.querySelectorAll('.fiscal-group')].map(g => g.getBoundingClientRect());
    return {
      fits: document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1,
      editorFits: editor.scrollWidth <= editor.clientWidth + 1,
      twoColumns: groups[1].left > groups[0].left,
      heights: [...editor.querySelectorAll('input')].map(field => field.getBoundingClientRect().height),
    };
  });
  assert.ok(result.fits && result.editorFits, 'the page and editor have no overflow across the screen');
  assert.equal(result.twoColumns, twoColumns);
  assert.equal(result.heights.length, 7);
  assert.ok(result.heights.every(height => height >= 44));
}

async function roundTrip(page, press) {
  await press(button(page, 'Scenario menu'));
  await press(button(page, 'Return to globe'));
  await page.locator('.atlas-home .atlas-viewport').waitFor();
  await press(button(page, 'Resume game'));
  await page.getByRole('region', { name: 'Fiscal policy details' }).waitFor();
}

async function stageOtherOrders(page, press) {
  await press(button(page, 'Military'));
  await press(page.locator('button[aria-controls="orders-details"]'));
  await page.locator('#military-division').selectOption('alden-first');
  await page.locator('#military-order').selectOption('attack');
  await page.locator('#military-target').selectOption('amber-plain');
  await press(button(page, 'Stage military order'));
  await press(button(page, 'Back from Military orders'));
  await press(button(page, 'Diplomacy'));
  await press(button(page, 'Compose diplomacy'));
  await page.locator('#diplomatic-target').selectOption('cyrin');
  await press(button(page, 'Stage diplomatic action'));
  await press(button(page, 'Back from Diplomatic action'));
  await press(button(page, 'Economy'));
}

async function check(browser, width, height, country) {
  const touch = width < 900;
  const context = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch, deviceScaleFactor: 2 });
  try {
    const page = await context.newPage();
    const press = locator => touch ? locator.tap() : locator.click();
    const issues = [];
    const requests = [];
    page.on('pageerror', error => issues.push(error.message));
    page.on('request', request => requests.push(new URL(request.url()).pathname));
    page.on('response', response => {
      const pathname = new URL(response.url()).pathname;
      if (response.status() >= 400 && pathname !== '/favicon.ico') issues.push(`${response.status()} ${pathname}`);
    });
    await page.goto(url);
    await page.locator('.atlas-frame[aria-busy="false"]').waitFor();
    await press(button(page, 'Fictional game'));
    await page.locator('#player-country').selectOption(country);
    assert.equal(requests.filter(r => /\/assets\/index-.*\.js$/.test(r)).length, 1);
    assert.ok(!requests.some(r => /economyRuntime|fictional-week1\.economy/.test(r)));
    await press(button(page, 'Start local scenario'));
    await press(button(page, 'Economy'));
    const openFiscal = page.locator('button[aria-controls="fiscal-policy-details"]');
    await openFiscal.waitFor();
    const entry = await openFiscal.boundingBox();
    assert.ok(entry && entry.y + entry.height <= height, 'Fiscal policy starts above the fold');
    await press(openFiscal);
    const editor = page.getByRole('region', { name: 'Fiscal policy details' });
    await editor.waitFor();
    assert.equal(await editor.locator('input[inputmode="decimal"]').count(), 7);
    await layout(page, width >= 704 || (width > height && width >= 560));
    const before = [await week(page).textContent(), await treasury(page).textContent(), await budget(page), await current(page)];
    await rate(page, 'consumption').fill('10.0');
    assert.equal(await rate(page, 'consumption').getAttribute('data-pending'), null);
    for (const [field, value] of Object.entries(proposals)) await rate(page, field).fill(value);
    assert.deepEqual(await entered(page), Object.values(proposals));
    assert.deepEqual([await week(page).textContent(), await treasury(page).textContent(), await budget(page), await current(page)], before);
    await page.getByText('Drafts · 7 fiscal', { exact: true }).waitFor();
    await press(button(page, 'Back from Fiscal policy'));
    assert.match(await openFiscal.innerText(), /7 pending · Next week/);
    await press(openFiscal);

    if (country === 'alden' && width === 390) {
      await stageOtherOrders(page, press);
      await rate(page, 'income').fill('70.01');
      await rate(page, 'social').fill('-1');
      assert.equal(await rate(page, 'income').getAttribute('aria-invalid'), 'true');
      assert.equal(await rate(page, 'social').getAttribute('aria-invalid'), 'true');
      assert.match(await page.locator('#fiscal-income-error').textContent(), /Tax rate/);
      assert.match(await page.locator('#fiscal-social-error').textContent(), /Spending share/);
      const rejected = await entered(page);
      await press(button(page, 'Next week'));
      await page.getByRole('alert').filter({ hasText: /Tax rate.*Week not advanced/ }).waitFor();
      assert.deepEqual([await week(page).textContent(), await treasury(page).textContent(), await budget(page), await current(page)], before);
      await page.getByText('Drafts · 1 military · 1 diplomacy · 7 fiscal', { exact: true }).waitFor();
      await roundTrip(page, press);
      assert.deepEqual(await entered(page), rejected);
      await rate(page, 'income').fill(proposals.income);
      await rate(page, 'social').fill(proposals.social);
    } else {
      await roundTrip(page, press);
      assert.deepEqual(await entered(page), Object.values(proposals));
    }

    if (process.env.HEARTLAND_BROWSER_OUTPUT && (width === 390 || width === 844)) {
      fs.mkdirSync(process.env.HEARTLAND_BROWSER_OUTPUT, { recursive: true });
      await page.screenshot({ path: path.join(process.env.HEARTLAND_BROWSER_OUTPUT, `fiscal-${width}x${height}.png`), scale: 'css' });
    }
    await press(button(page, 'Next week'));
    await week(page).filter({ hasText: /^Week 2$/ }).waitFor();
    assert.deepEqual(await current(page), expected);
    assert.ok((await entered(page)).every(value => value === ''));
    assert.notDeepEqual(await budget(page), before[2]);
    if (country === 'alden' && width === 390) {
      await press(button(page, 'Diplomacy'));
      await press(button(page, 'Public declarations'));
      await page.getByText(/Alden → Cyrin: goodwill/).waitFor();
      await press(button(page, 'Back from Public declarations'));
      await press(button(page, 'Military'));
      await page.getByText('Combat at Amber Plain', { exact: false }).waitFor();
      await press(button(page, 'Economy'));
    }
    for (const count of [3, 4]) {
      await press(button(page, 'Next week'));
      await week(page).filter({ hasText: new RegExp(`^Week ${count}$`) }).waitFor();
      assert.deepEqual(await current(page), expected);
    }
    if (country === 'alden' && width === 390) await page.getByText(/Amber Plain occupied/).first().waitFor();
    await rate(page, 'consumption').fill('0');
    await press(button(page, 'Next week'));
    await week(page).filter({ hasText: /^Week 5$/ }).waitFor();
    const replaced = expected.map((value, index) => index === 1 ? 'Current 0%' : value);
    assert.deepEqual(await current(page), replaced);
    await roundTrip(page, press);
    assert.equal(await week(page).textContent(), 'Week 5');
    assert.deepEqual(await current(page), replaced);
    await layout(page, width >= 704 || (width > height && width >= 560));
    assert.deepEqual(issues, []);
    console.log(`PASS ${width}×${height} ${country}: seven controls, exact drafts, weekly application, standing rates and resumption`);
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const [width, height, country] of [[320, 568, 'cyrin'], [390, 844, 'alden'], [568, 320, 'alden'], [844, 390, 'belora'], [1440, 900, 'belora']]) {
      await check(browser, width, height, country);
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

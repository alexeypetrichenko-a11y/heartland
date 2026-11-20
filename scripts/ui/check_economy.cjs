/* Browser checks against the production build using an existing Playwright installation. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.HEARTLAND_PLAYWRIGHT_MODULE || 'playwright-core');

const url = process.env.HEARTLAND_TEST_URL || 'http://localhost:4173/heartland/';
const output = process.env.HEARTLAND_BROWSER_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'heartland-economy-'));
const sizes = process.env.HEARTLAND_VIEWPORTS ? JSON.parse(process.env.HEARTLAND_VIEWPORTS)
  : [[320, 568], [390, 844], [568, 320], [844, 390], [1440, 900]];
const missingFields = ['GDP', 'Economic growth', 'Inflation', 'Unemployment', 'Public debt', 'Political stability',
  'Key economic sectors', 'Significant shortages', 'Economic events'];
const unavailableControls = ['Income tax', 'Consumption tax', 'Corporate profit tax', 'Public spending priorities'];

fs.mkdirSync(output, { recursive: true });
const button = (page, name) => page.getByRole('button', { name, exact: true });
const dashboard = page => page.getByRole('region', { name: 'Economic dashboard' });
const row = (scope, label) => scope.locator('dl > div').filter({ has: scope.page().getByText(label, { exact: true }) });
const value = (scope, label) => row(scope, label).locator('dd').innerText();
const capture = (page, name) => page.screenshot({ path: path.join(output, name), scale: 'css' });

async function noOverflow(page) {
  assert.deepEqual(await dashboard(page).evaluate(element => {
    const root = document.documentElement;
    return [root.scrollWidth <= innerWidth, root.scrollHeight <= innerHeight, element.scrollWidth <= element.clientWidth];
  }), [true, true, true]);
  assert.ok(await button(page, 'Next week').isVisible());
  assert.ok(await page.getByRole('navigation', { name: 'Game sections' }).isVisible());
}

async function check(browser, width, height) {
  const touch = width < 900;
  const context = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(18000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.locator('.atlas-frame[aria-busy="false"] .atlas-viewport[data-projection="globe"]').waitFor();
    await button(page, 'Fictional game').click();
    await page.getByLabel('Player country').selectOption('alden');
    await button(page, 'Start local scenario').click();
    await button(page, 'Economy').click();

    const economy = dashboard(page);
    const policy = page.getByLabel('Tax policy for next week', { exact: true });
    const select = await policy.boundingBox();
    assert.ok(select.width >= 44 && select.height >= 44, 'touch-sized policy input');
    await noOverflow(page);
    assert.equal(await value(economy, 'Treasury'), '100');
    assert.equal(await value(economy, 'Current tax policy'), 'Standard taxation');
    assert.equal(await value(economy, 'Weekly balance'), '+4');
    await economy.getByText('No week has settled yet.', { exact: true }).waitFor();
    for (const field of missingFields) assert.equal(await value(economy, field), 'Unavailable');
    const disclosure = economy.getByText('Tax rates and spending priorities', { exact: true });
    if (touch) await disclosure.tap();
    else await disclosure.press('Enter');
    for (const name of unavailableControls) {
      const control = economy.getByLabel(name, { exact: true });
      assert.equal(await control.isDisabled(), true);
      assert.deepEqual(await control.locator('option').allTextContents(), ['Unavailable']);
      assert.equal(await control.evaluate(element => { element.focus(); return document.activeElement === element; }), false);
    }
    await noOverflow(page);
    await disclosure.click();

    await policy.selectOption('tax-relief');
    await economy.getByText('Draft · Tax relief', { exact: true }).waitFor();
    assert.equal(await value(economy, 'Current tax policy'), 'Standard taxation');
    assert.equal(await value(economy, 'Weekly balance'), '+4', 'draft leaves the in-force budget unchanged');
    assert.equal(await value(economy, 'Treasury'), '100');
    assert.equal(await page.locator('.game-meta dd').first().innerText(), 'Week 1');
    if (touch) await button(page, 'Next week').tap();
    else await button(page, 'Next week').press('Space');

    await economy.getByText('Week 1 settled', { exact: true }).waitFor();
    assert.equal(await value(economy, 'Opening treasury'), '100');
    assert.equal(await value(economy, 'Closing treasury'), '98');
    assert.equal(await value(economy, 'Treasury'), '98');
    assert.equal(await value(economy, 'Weekly balance'), '-2');
    assert.equal(await value(economy, 'Current tax policy'), 'Tax relief');
    assert.equal(await page.locator('.game-meta dd').first().innerText(), 'Week 2');
    assert.equal(await economy.locator('.economy-draft').innerText(), '');
    assert.equal(await value(economy, 'Economic events'), 'Unavailable');

    await policy.selectOption('standard');
    await button(page, 'Scenario menu').click();
    await button(page, 'Return to globe').click();
    await page.locator('.atlas-frame[aria-busy="false"] .atlas-viewport[data-projection="globe"]').waitFor();
    await button(page, 'Resume game').click();
    assert.equal(await policy.inputValue(), 'standard');
    assert.equal(await value(economy, 'Current tax policy'), 'Tax relief');
    assert.equal(await value(economy, 'Closing treasury'), '98');
    assert.equal(await page.locator('.game-meta dd').first().innerText(), 'Week 2');
    await noOverflow(page);
    if (width === 1440) await disclosure.click();
    if ([390, 844, 1440].includes(width)) {
      await economy.evaluate(element => { element.scrollTop = 0; });
      await capture(page, `economy-${width}x${height}.png`);
    }

    await button(page, 'World').click();
    await page.locator('.region-summary').waitFor();
    await button(page, 'Military').click();
    await page.getByRole('button', { name: /^Military orders / }).waitFor();
    await button(page, 'Economy').click();
    await button(page, 'Next week').click();
    await economy.getByText('Week 2 settled', { exact: true }).waitFor();
    assert.equal(await value(economy, 'Closing treasury'), '102');
    assert.deepEqual(errors, []);
    console.log(`PASS economy ${width}×${height}: live figures, disabled controls, draft, weekly result, globe round trip and viewport fit`);
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.HEARTLAND_CHROMIUM || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  try {
    for (const [width, height] of sizes) await check(browser, width, height);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

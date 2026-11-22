/* Production-build report checks. Pass an external Playwright install if needed. */
const assert = require('node:assert/strict');
const { readFile, mkdir } = require('node:fs/promises');
const { join } = require('node:path');
const { chromium } = require(process.env.HEARTLAND_PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.HEARTLAND_PREVIEW_URL || 'http://127.0.0.1:4173/heartland/';
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
const report = page => page.locator('#weekly-report');
const input = (page, field) => page.locator(`#fiscal-${field}`);
const summary = (page, label) => report(page).locator('summary').filter({ hasText: label });
const week = page => page.locator('.game-meta dd').first();
const viewport = (width, height) => ({ viewport: { width, height }, hasTouch: width < 900, isMobile: width < 900, deviceScaleFactor: 2 });

async function visibleReport(page, number) {
  await report(page).getByRole('heading', { name: `Week ${number} report`, exact: true }).waitFor();
}

async function fit(page) {
  const layout = await report(page).evaluate(panel => {
    const scroll = panel.querySelector('.detail-scroll');
    const heading = panel.querySelector('h2');
    const back = panel.querySelector('button');
    const pageSize = [document.documentElement.scrollWidth, document.documentElement.scrollHeight];
    return {
      pageSize,
      viewport: [innerWidth, innerHeight],
      fits: document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1,
      contentFits: scroll.scrollWidth <= scroll.clientWidth + 1,
      headingVisible: heading.getBoundingClientRect().bottom < innerHeight,
      controlsFit: [...panel.querySelectorAll('summary'), back].filter(node => node.getClientRects().length)
        .every(node => node.getBoundingClientRect().height >= 44),
    };
  });
  assert.ok(layout.fits && layout.contentFits && layout.headingVisible && layout.controlsFit, JSON.stringify(layout));
}

async function capture(page, name) {
  const output = process.env.HEARTLAND_BROWSER_OUTPUT;
  if (!output) return;
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: join(output, name), scale: 'css' });
}

async function rates(changed, label, before, after) {
  const row = changed.locator('dl > div').filter({ hasText: label });
  assert.equal(await row.locator('.report-old-rate').textContent(), before);
  assert.equal(await row.locator('.report-current-rate').textContent(), after);
}

async function stageMilitaryAndDiplomacy(page, press) {
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
}

async function check(browser, width, height) {
  const context = await browser.newContext(viewport(width, height));
  try {
    const page = await context.newPage();
    const press = width < 900 ? locator => locator.tap() : locator => locator.click();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push(`${response.status()} ${response.url()}`);
    });
    await page.goto(url);
    await page.locator('.atlas-frame[aria-busy="false"]').waitFor();
    await press(button(page, 'Fictional game'));
    await page.locator('#player-country').selectOption('alden');
    await press(button(page, 'Start local scenario'));
    assert.equal(await report(page).count(), 0);
    const full = width === 390;
    if (full) await stageMilitaryAndDiplomacy(page, press);
    await press(button(page, 'Economy'));
    await press(page.locator('button[aria-controls="fiscal-policy-details"]'));
    const openingIncome = (await page.locator('#fiscal-income-current').textContent()).replace('Current ', '');
    const openingInfrastructure = (await page.locator('#fiscal-infrastructure-current').textContent()).replace('Current ', '');
    await input(page, 'income').fill('23,175');
    await input(page, 'infrastructure').fill('4.75');
    assert.equal(await report(page).count(), 0);
    await press(button(page, 'Next week'));
    await visibleReport(page, 1);
    assert.equal(await week(page).textContent(), 'Week 2');
    const changed = report(page).getByRole('region', { name: 'Fiscal changes applied', exact: true });
    await rates(changed, 'Income tax', openingIncome, '23.175%');
    await rates(changed, 'Infrastructure investment', openingInfrastructure, '4.75%');
    assert.equal(await report(page).locator('.report-summary .report-change').count(), 3);
    assert.equal(await report(page).locator('details[open]').count(), 0);
    await fit(page);
    if (width === 390 || width === 844) await capture(page, `weekly-report-${width}x${height}.png`);

    await press(summary(page, /^Economy/));
    for (const label of ['Government revenue', 'Government expenditure', 'Public debt', 'Debt / annual GDP', 'Unemployment', 'Political stability']) {
      await report(page).locator('dt').filter({ hasText: label }).first().waitFor();
    }
    await fit(page);
    if (full) {
      await press(summary(page, 'Politics and diplomacy'));
      await report(page).getByText('Alden declared goodwill toward Cyrin', { exact: true }).waitFor();
      await report(page).getByText('Relationship +5 points.', { exact: true }).first().waitFor();
      await press(summary(page, 'Military and territorial control'));
      await report(page).getByRole('list', { name: 'Military and territorial events' }).getByText('Battle at Amber Plain', { exact: true }).waitFor();
    }
    await page.keyboard.press('Escape');
    assert.equal(await report(page).count(), 0);
    await input(page, 'income').fill('81');
    await press(button(page, 'Next week'));
    await page.getByRole('alert').filter({ hasText: 'Week not advanced' }).waitFor();
    assert.equal(await report(page).count(), 0, 'a rejected week does not open a new report');
    assert.equal(await week(page).textContent(), 'Week 2');
    assert.equal(await input(page, 'income').inputValue(), '81');

    await input(page, 'income').fill('');
    await press(button(page, 'Next week'));
    await visibleReport(page, 2);
    assert.equal(await changed.count(), 0);
    await press(summary(page, 'Fiscal policy after this week'));
    await report(page).getByText('23.175%', { exact: true }).waitFor();
    await press(summary(page, 'Recent reports'));
    await press(button(report(page), 'Week 1'));
    await visibleReport(page, 1);
    await changed.getByText('23.175%', { exact: false }).waitFor();
    assert.equal(await week(page).textContent(), 'Week 3');
    await press(button(page, 'Back from Week 1 report'));

    if (full) {
      await input(page, 'income').fill('24.25');
      await press(button(page, 'Next week'));
      await visibleReport(page, 3);
      await report(page).getByText('Amber Plain occupied', { exact: true }).first().waitFor();
      await press(button(page, 'Scenario menu'));
      await page.getByRole('status').filter({ hasText: 'Saved locally · Week 4' }).waitFor();
      await press(button(page, 'Return to globe'));
      await page.reload();
      await press(button(page, 'Resume game'));
      assert.equal(await week(page).textContent(), 'Week 4');
      await press(button(page, 'Scenario menu'));
      await press(button(page, 'Open weekly report'));
      await visibleReport(page, 3);
      await rates(changed, 'Income tax', '23.175%', '24.25%');
      await report(page).getByText('Amber Plain occupied', { exact: true }).first().waitFor();
      assert.equal(await summary(page, 'Recent reports').count(), 0, 'only the latest report survives reload');
      await fit(page);
      await press(button(report(page).getByRole('list', { name: 'Priority alerts' }), 'View Amber Plain'));
      const region = page.locator('#region-more-details');
      await region.getByText('Amber Plain', { exact: true }).waitFor();
      await region.getByText('Alden', { exact: true }).waitFor();
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}×${height}: report, details, fiscal feedback, rejection and recent weeks${full ? ', battle, diplomacy, occupation and reload' : ''}`);
  } finally {
    await context.close();
  }
}

async function defeat(browser) {
  const api = await import('../../economy-engine/src/integration/index.ts');
  const { economySnapshot, startEconomy } = await import('../../src/game/economyBridge.ts');
  const { advanceTurn } = await import('../../src/game/advanceTurn.ts');
  const { createInitialState } = await import('../../src/game/initialState.ts');
  const { selectCountry } = await import('../../src/game/selectCountry.ts');
  const { encodeGameSave } = await import('../../src/game/saveFormat.ts');
  const runtime = { api, startingSave: await readFile(join(__dirname, '../../economy-engine/scenarios/fictional-week1.economy.json'), 'utf8') };
  let game = selectCountry(createInitialState(), 'alden');
  let economy = startEconomy(runtime, game);
  for (let i = 0; i < 50 && !economy.defeated; i++) {
    const next = api.advanceWeekTogether({
      game, session: economy.session, advanceGame: advanceTurn,
      effects: [{ type: 'stability-modifier', countryId: 'alden', value: -100 }],
    });
    game = next.game;
    economy = economySnapshot(runtime, next.session, economy.player);
  }
  assert.ok(economy.defeated);
  const record = await encodeGameSave(runtime, { game, economy, drafts: { fiscal: {}, military: [], diplomacy: null } });
  const context = await browser.newContext(viewport(844, 390));
  try {
    const page = await context.newPage();
    await page.goto(url);
    await page.evaluate(record => new Promise((resolve, reject) => {
      const request = indexedDB.open('heartland-game', 1);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => request.result.createObjectStore('saves');
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('saves', 'readwrite');
        tx.objectStore('saves').put(record, 'active');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = () => { db.close(); reject(tx.error); };
      };
    }), record);
    await page.reload();
    await button(page, 'Resume game').tap();
    await page.getByRole('alert').filter({ hasText: 'Your regime has been overthrown' }).waitFor();
    assert.ok(await button(page, 'Next week').isDisabled());
    await button(page, 'Scenario menu').tap();
    await button(page, 'Open weekly report').tap();
    await visibleReport(page, game.week - 1);
    await report(page).getByRole('list', { name: 'Priority alerts' }).getByText('Regime overthrown in Alden', { exact: true }).waitFor();
    assert.ok(await button(page, 'Next week').isDisabled());
    await fit(page);
    console.log('PASS restored defeat report and disabled advancement');
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1440, 900]]) await check(browser, width, height);
    await defeat(browser);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

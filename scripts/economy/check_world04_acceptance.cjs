const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.HEARTLAND_PLAYWRIGHT_MODULE || 'playwright');
const url = 'http://127.0.0.1:4174/heartland/';
const button = (page, name) => page.getByRole('button', { name, exact: true });

async function check(browser, width, height) {
  const page = await browser.newPage({ viewport: { width, height }, isMobile: true, hasTouch: true });
  try {
    await page.addInitScript(() => {
      const descriptor = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
      Object.defineProperty(IDBTransaction.prototype, 'oncomplete', {
        ...descriptor,
        set(handler) {
          descriptor.set.call(this, event => {
            if (this.mode === 'readwrite' && window.holdSave) window.finishSave = () => handler.call(this, event);
            else handler.call(this, event);
          });
        },
      });
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (window.failSave) throw new DOMException('Test quota reached', 'QuotaExceededError');
        return put.apply(this, args);
      };
    });
    const indicator = page.locator('.save-indicator');
    await page.goto(url);
    await button(page, 'New game').click();
    await page.getByLabel('Scenario', { exact: true }).selectOption('europe-2023');
    await page.getByLabel('Player country').selectOption('fra');
    await page.evaluate(() => { window.holdSave = true; });
    await button(page, 'Start local scenario').click();
    await indicator.getByText('Saving locally…', { exact: true }).waitFor();
    await page.waitForFunction(() => typeof window.finishSave === 'function');
    assert.equal(await indicator.getByText(/Saved locally/).count(), 0);
    await page.evaluate(() => { window.holdSave = false; window.finishSave(); });
    await indicator.getByText('Saved locally · Week 1', { exact: true }).waitFor();
    const firstTime = await indicator.locator('time').getAttribute('datetime');
    await page.reload();
    await button(page, 'Resume game').click();
    await indicator.getByText('Saved locally · Week 1', { exact: true }).waitFor();
    assert.equal(await indicator.locator('time').getAttribute('datetime'), firstTime);

    await page.evaluate(() => { window.failSave = true; });
    await button(page, 'Scenario menu').click();
    await button(page, 'Save now').click();
    await button(page, 'Back from Scenario information').click();
    await indicator.getByText(/Save failed. Local storage is full/).waitFor();
    await indicator.getByText('Last saved · Week 1', { exact: true }).waitFor();
    assert.equal(await indicator.locator('time').getAttribute('datetime'), firstTime);
    await page.evaluate(() => { window.failSave = false; });

    await button(page, 'Military').click();
    await page.locator('button[aria-controls="orders-details"]').click();
    await page.locator('#military-division').selectOption('fra-ne-division-1');
    await page.locator('#military-order').selectOption('attack');
    await page.locator('#military-target').selectOption('deu-bw');
    const preview = page.getByRole('region', { name: 'Order preview' });
    assert.match(await preview.innerText(), /25,000 personnel equivalents/);
    assert.match(await preview.innerText(), /Week 1 · when you tap Next week/);
    assert.match(await preview.innerText(), /Persistent · repeats each week/);
    assert.match(await preview.innerText(), /No recent defender report/);
    assert.match(await preview.innerText(), /Unknown · current defender strength/);
    assert.match(await preview.innerText(), /There is no automatic retreat/);
    const confirm = page.locator('.military-confirmation');
    await confirm.getByText('Executes in Week 1', { exact: true }).waitFor();
    assert.equal(await confirm.getByRole('button', { name: 'Stage military order' }).getAttribute('aria-describedby'), 'military-execution');
    await button(page, 'Stage military order').click();
    await page.getByText('Pending military orders for Week 1').waitFor();
    await page.getByRole('button', { name: /Remove pending order for/ }).click();
    assert.equal(await page.getByText('Pending military orders for Week 1').count(), 0);
    await button(page, 'Stage military order').click();
    // Settle while the order sheet is still open, as on the physical phone.
    await button(page, 'Next week').click();
    await page.getByRole('heading', { name: 'Week 1 report', exact: true }).waitFor();
    await indicator.getByText('Saved locally · Week 2', { exact: true }).waitFor();
    await button(page, 'Back from Week 1 report').click();
    const attacks = page.getByRole('region', { name: 'Active attacks' });
    await attacks.getByText('Continues when Week 2 settles.', { exact: true }).waitFor();
    assert.match(await attacks.innerText(), /Origin[\s\S]+Nord-Est[\s\S]+Destination[\s\S]+Baden-Württemberg[\s\S]+Current strength[\s\S]+12,500 personnel equivalents/);
    const top = await attacks.boundingBox();
    assert.ok(top && top.y >= 0 && top.y < height / 2, 'continuing attacks starts in the visible overview');
    await attacks.getByRole('button', { name: /Stage stop/ }).click();
    await attacks.getByText(/Pending replacement for Week 2 · Defend/).waitFor();
    await button(page, 'Next week').click();
    await page.getByRole('heading', { name: 'Week 2 report', exact: true }).waitFor();
    await button(page, 'Back from Week 2 report').click();
    await attacks.getByText('No attacks are currently active.', { exact: true }).waitFor();
    assert.equal(await attacks.getByRole('button', { name: /Stage stop/ }).count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    console.log(`PASS ${width}×${height} · order preview, persistent attack, cancellation, committed save and quota failure`);
  } finally { await page.context().close(); }
}

(async () => {
  const browser = process.env.HEARTLAND_BROWSER === 'webkit' ? await webkit.launch()
    : await chromium.launch({ executablePath: process.env.HEARTLAND_CHROMIUM });
  try {
    await check(browser, 390, 844);
    await check(browser, 844, 390);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

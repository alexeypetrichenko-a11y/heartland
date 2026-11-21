/*
 * INT-01 browser checks against the production preview (Chromium via Playwright).
 *
 *   npm run build && npx vite preview --host 127.0.0.1 --port 4173
 *   node scripts/economy/check_int01.cjs            (another shell)
 *
 * Checks, for every fictional country and several screen sizes:
 * - opening the globe and the country-selection screen downloads no economy code;
 * - starting a game downloads the engine and the week-1 save, and shows engine figures;
 * - 52 weeks through Next week: the week advances once per press, the treasury and GDP
 *   come from the engine and change, growth becomes available, no runtime errors;
 * - Alden's attack captures Amber Plain, reported as an occupation;
 * - no horizontal overflow.
 * Then measures startup and weekly-turn times at 1x, 4x and 6x CPU throttling.
 * Set HEARTLAND_PLAYWRIGHT_MODULE to use another Playwright installation.
 */
const { chromium } = require(process.env.HEARTLAND_PLAYWRIGHT_MODULE || 'playwright');

const BASE = process.env.HEARTLAND_PREVIEW_URL || 'http://127.0.0.1:4173/heartland/';
const DEFAULT_ICON = new URL('/favicon.ico', BASE).href;
const median = values => values.slice().sort((a, b) => a - b)[values.length >> 1];

async function play(browser, { country, width, height, touch, weeks, attack, throttle }) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    // Chromium asks for a default icon even when the app declares none.
    const { url } = message.location();
    if (url === DEFAULT_ICON && message.text().includes('404 (Not Found)')) return;
    errors.push(`${message.text()} ${url}`);
  });
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  const economyRequests = () => requests.filter(url => /economyRuntime|fictional-week1\.economy/.test(url));
  if (throttle > 1) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: throttle });

  await page.goto(BASE);
  await page.getByRole('button', { name: /Fictional game/ }).waitFor();
  await page.waitForTimeout(1500);
  const entryChunks = requests.filter(url => /assets\/index-.*\.js$/.test(url));
  if (economyRequests().length || entryChunks.length !== 1) throw new Error(`economy downloaded with the globe: ${requests.join(', ')}`);
  await page.getByRole('button', { name: /Fictional game/ }).click();
  await page.locator('#player-country').waitFor();
  if (economyRequests().length) throw new Error('economy downloaded before a game starts');

  await page.locator('#player-country').selectOption(country);
  const started = Date.now();
  await page.getByRole('button', { name: 'Start local scenario' }).click();
  const treasury = page.locator('.game-meta dd').nth(1);
  await page.waitForFunction(() => /\d/.test(document.querySelectorAll('.game-meta dd')[1]?.textContent ?? ''), null, { timeout: 30000 });
  const startupMs = Date.now() - started;
  if (economyRequests().length < 2) throw new Error(`economy chunks not loaded at game start: ${economyRequests().join(', ')}`);

  await page.getByRole('button', { name: 'Economy' }).click();
  const panel = page.locator('.economy-dashboard');
  for (const label of ['Treasury', 'Weekly revenue', 'Weekly expenditure', 'Weekly balance', 'GDP', 'Economic growth', 'Inflation', 'Unemployment', 'Political stability', 'Public debt', 'Central-bank policy rate']) {
    if (!(await panel.locator('dt').filter({ hasText: new RegExp(`^${label}`) }).count())) throw new Error(`missing ${label}`);
  }
  const growthValue = () => panel.locator('.economy-indicators dl > div').filter({ hasText: /^Economic growth/ }).locator('dd').textContent();
  if ((await growthValue()) !== 'Unavailable') throw new Error('growth should be unavailable in week 1');

  if (attack) {
    await page.getByRole('button', { name: 'Military' }).click();
    await page.locator('button[aria-controls="orders-details"]').click();
    await page.locator('#military-division').selectOption('alden-first');
    await page.locator('#military-order').selectOption('attack');
    await page.locator('#military-target').selectOption('amber-plain');
    await page.getByRole('button', { name: 'Stage military order' }).click();
    await page.getByRole('button', { name: 'Back from Military orders' }).click();
  }

  const gdp = () => panel.locator('.economy-indicators dl > div').filter({ hasText: /^GDP/ }).locator('dd').textContent();
  const times = [];
  const treasuries = [await treasury.textContent()];
  const gdps = [await gdp()];
  let settled = 0;
  let occupation = false;
  for (let week = 2; week <= weeks + 1; week++) {
    const pressed = Date.now();
    await page.getByRole('button', { name: 'Next week', exact: true }).click();
    await page.getByText(`Week ${week}`, { exact: true }).first().waitFor();
    times.push(Date.now() - pressed);
    treasuries.push(await treasury.textContent());
    gdps.push(await gdp());
    if (await panel.getByText(`Week ${week - 1} settled`, { exact: true }).count()) settled++;
    if (await page.getByText(/Amber Plain occupied/).count()) occupation = true;
  }
  // Shown to one decimal, a weekly change can round away near a steady state (the exact figures change
  // every week: src/game/economyBridge.test.ts). The panel's own week report proves it refreshed each week.
  const changed = treasuries.slice(1).filter((value, index) => value !== treasuries[index] || gdps[index + 1] !== gdps[index]).length;
  if (changed < weeks * 0.75) throw new Error(`${country} ${width}x${height}: the figures changed in only ${changed} of ${weeks} weeks`);
  if (settled !== weeks) throw new Error(`the economy panel reported ${settled} of ${weeks} settled weeks`);
  await page.getByRole('button', { name: 'Economy' }).click();
  const growth = await growthValue();
  if (weeks >= 26 && growth === 'Unavailable') throw new Error('growth should be available after 26 weeks');
  if (attack && !occupation) throw new Error('the capture of Amber Plain was not reported as an occupation');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (overflow) throw new Error('horizontal overflow');
  if (errors.length) throw new Error(`runtime errors: ${errors.join(' | ')}`);
  await context.close();
  return { country, size: `${width}×${height}`, throttle, changed, startupMs, weekMedianMs: median(times), weekWorstMs: Math.max(...times), weeks, treasuryFirst: treasuries[0], treasuryLast: treasuries.at(-1), growth, occupation };
}

(async () => {
  const browser = await chromium.launch();
  const rows = [];
  for (const country of ['alden', 'belora', 'cyrin']) {
    rows.push(await play(browser, { country, width: 390, height: 844, touch: true, weeks: 52, attack: country === 'alden', throttle: 1 }));
  }
  rows.push(await play(browser, { country: 'alden', width: 844, height: 390, touch: true, weeks: 52, attack: true, throttle: 1 }));
  rows.push(await play(browser, { country: 'belora', width: 1440, height: 900, touch: false, weeks: 52, attack: false, throttle: 1 }));
  rows.push(await play(browser, { country: 'cyrin', width: 320, height: 568, touch: true, weeks: 12, attack: false, throttle: 1 }));
  for (const throttle of [4, 6]) rows.push(await play(browser, { country: 'alden', width: 390, height: 844, touch: true, weeks: 12, attack: false, throttle }));
  await browser.close();
  console.log('| Country | Size | CPU | Startup (ms) | Week median (ms) | Week worst (ms) | Weeks | Weeks with visible change | Treasury week 1 → last | Growth at end | Occupation reported |');
  console.log('|---|---|---|---:|---:|---:|---:|---:|---|---|---|');
  for (const r of rows) console.log(`| ${r.country} | ${r.size} | ${r.throttle}x | ${r.startupMs} | ${r.weekMedianMs} | ${r.weekWorstMs} | ${r.weeks} | ${r.changed} | ${r.treasuryFirst} → ${r.treasuryLast} | ${r.growth} | ${r.occupation ? 'yes' : '—'} |`);
  console.log('ALL INT-01 BROWSER CHECKS PASSED');
})().catch(error => { console.error(error); process.exit(1); });

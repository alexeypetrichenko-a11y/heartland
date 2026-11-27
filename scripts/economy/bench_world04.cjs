// Generate a local harness. Add --browser to measure Chromium at native speed and 6× throttling.
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { buildSync } = require('esbuild');
const root = join(__dirname, '../..');
const code = buildSync({ entryPoints: [join(__dirname, 'bench_world04.ts')], bundle: true, minify: true, write: false,
  target: 'safari16' }).outputFiles[0].text;
writeFileSync(join(root, 'dist-world04.local/benchmark.html'), `<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Heartland WORLD-04 performance</title>
<h1>WORLD-04 performance</h1><p>Keep this page in front with the screen on until the run completes.</p>
<button type="button">Run 156 turns</button><pre></pre><script>${code}</script>`);

if (process.argv.includes('--browser')) {
  const { chromium } = require(process.env.HEARTLAND_PLAYWRIGHT_MODULE || 'playwright');
  (async () => {
    const browser = await chromium.launch({ executablePath: process.env.HEARTLAND_CHROMIUM });
    try {
      for (const rate of [1, 6]) {
        const page = await browser.newPage();
        const client = await page.context().newCDPSession(page);
        await client.send('Emulation.setCPUThrottlingRate', { rate });
        const query = process.argv.includes('--mil00') ? '?mil00' : '';
        await page.goto(`${process.env.HEARTLAND_BENCH_ORIGIN ?? "http://127.0.0.1:4174"}/heartland/benchmark.html${query}`);
        await page.getByRole('button', { name: 'Run 156 turns' }).click();
        const result = page.locator('pre[data-result]');
        await result.waitFor({ timeout: 180000 });
        const content = await result.textContent();
        if (await result.getAttribute('data-result') === 'error') throw new Error(content);
        console.log(JSON.stringify({ cpuThrottle: rate, ...JSON.parse(content) }));
        await page.close();
      }
    } finally { await browser.close(); }
  })().catch(error => { console.error(error); process.exitCode = 1; });
}

/*
 * Browser benchmark: runs the engine inside headless Chromium with CPU throttling
 * as a rough stand-in for a phone. Chromium (V8) is NOT Safari (JavaScriptCore):
 * treat results as an order-of-magnitude estimate, not a device measurement.
 *
 *   node sim/browser-bench.cjs        (needs Playwright + Chromium; esbuild is taken from the game's node_modules)
 */
const path = require('node:path');
const fs = require('node:fs');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const esbuild = path.resolve(root, '..', 'node_modules', '.bin', 'esbuild');
const out = path.join(process.env.TMPDIR || '/tmp', `heartland-economy-bundle-${process.pid}.js`);
execFileSync(esbuild, [path.join(root, 'src', 'index.ts'), '--bundle', '--minify', '--format=iife', '--global-name=Economy', '--target=es2020', `--outfile=${out}`], { stdio: 'pipe' });
const code = fs.readFileSync(out, 'utf8');
const gz = zlib.gzipSync(code).length;
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const lines = [];
  const results = [];
  for (const rate of [1, 4, 6]) {
    const page = await browser.newPage();
    const client = await page.context().newCDPSession(page);
    await page.setContent('<html><body></body></html>');
    await page.addScriptTag({ content: code });
    await client.send('Emulation.setCPUThrottlingRate', { rate });
    const result = await page.evaluate(() => {
      const E = window.Economy;
      const t0 = performance.now();
      const state = E.createEconomy(E.createTestWorldSpec());
      const buildMs = performance.now() - t0;
      const heap0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
      const run = (weeks) => {
        const s = performance.now();
        for (let w = 0; w < weeks; w++) E.advanceEconomyInPlace(state, { commands: E.autopilotCommands(state) }, { report: 'none' });
        return (performance.now() - s) / weeks;
      };
      run(100); // warm up the JIT
      const perWeek = run(520);
      let worst = 0;
      const s1 = performance.now();
      for (let w = 0; w < 52; w++) { const r = E.advanceEconomyInPlace(state, { commands: E.autopilotCommands(state) }, { report: 'full' }); worst = Math.max(worst, performance.now() - s1); void r; }
      const withReport = (performance.now() - s1) / 52;
      const saveStart = performance.now();
      const text = E.serializeEconomy(state);
      const saveMs = performance.now() - saveStart;
      const loadStart = performance.now();
      const restored = E.deserializeEconomy(text);
      const loadMs = performance.now() - loadStart;
      const fingerprint = E.hashEconomy(state);
      void restored;
      const heap1 = performance.memory ? performance.memory.usedJSHeapSize : 0;
      return { buildMs, perWeek, withReport, saveMs, loadMs, saveKb: text.length / 1024, heapMb: (heap1 - heap0) / 1048576, heapTotalMb: heap1 / 1048576, fingerprint, turn: state.turn };
    });
    results.push({ rate, ...result });
    await page.close();
  }
  await browser.close();
  lines.push('| CPU throttle | build world (ms) | ms / week (no report) | ms / week (full report) | save (ms) | restore (ms) | save size (KB) | JS heap in use (MB) |', '|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of results) lines.push(`| ${r.rate}x | ${r.buildMs.toFixed(0)} | ${r.perWeek.toFixed(2)} | ${r.withReport.toFixed(2)} | ${r.saveMs.toFixed(1)} | ${r.loadMs.toFixed(1)} | ${r.saveKb.toFixed(0)} | ${r.heapTotalMb.toFixed(1)} |`);
  const text = ['# Browser benchmark (headless Chromium, CPU throttled)', '',
    `Bundle: ${(code.length / 1024).toFixed(0)} KB minified, ${(gz / 1024).toFixed(0)} KB gzip (engine + test world + autopilot, no dependencies).`, '',
    'Nine countries, eleven zones, seven goods; 520 simulated weeks after a 100-week warm-up. Chromium is not Safari: this is an order-of-magnitude proxy for a phone, not a device measurement.', '',
    ...lines, '',
    `State fingerprint after ${results[0].turn} weeks: ${results[0].fingerprint}${results.every(r => r.fingerprint === results[0].fingerprint) ? ' (identical at every throttle level)' : ' (**differs between runs**)'}.`, ''].join('\n');
  fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(root, 'reports', 'BROWSER_BENCHMARK.md'), text);
  fs.writeFileSync(path.join(root, 'reports', 'browser-benchmark.json'), JSON.stringify({ bundleKb: code.length / 1024, gzipKb: gz / 1024, results }, null, 2));
  console.log(text);
  fs.unlinkSync(out);
})().catch(e => { console.error(e); process.exit(1); });

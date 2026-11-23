/*
 * WORLD-02 performance feasibility benchmark, browser part (analysis only).
 *
 *   node economy-engine/sim/world02-browser-bench.cjs <dir with world02-week1-*.json> [--html out.html] [--rates 1,4,6]
 *
 * 1. Runs each pre-built week-1 save (written by world02-bench.ts) in headless Chromium at the given
 *    CPU-throttling rates: start from the save (production path), 155 weekly turns through
 *    advanceEconomyWeek, save and restore. Writes <dir>/world02-bench-browser.json.
 * 2. With --html, also writes ONE self-contained page (engine bundle + the 60-zone save) to open in
 *    Safari on a physical iPhone. The page runs the same measurement and prints the results; see
 *    docs/world/WORLD-02-PERFORMANCE.md for the acceptance procedure.
 * Chromium is not Safari: throttled Chromium is a proxy, not an iPhone measurement.
 */
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const engineRoot = path.resolve(__dirname, '..');
const esbuild = path.resolve(engineRoot, '..', 'node_modules', '.bin', 'esbuild');

const args = process.argv.slice(2);
const dir = path.resolve(args[0] || path.join(engineRoot, '..', 'docs', 'world', 'data'));
const htmlOut = args.includes('--html') ? path.resolve(args[args.indexOf('--html') + 1]) : null;
const rates = (args.includes('--rates') ? args[args.indexOf('--rates') + 1] : '1,4,6').split(',').map(Number);
// --set budget: use the zone-budget saves (world02-week1-budget-N.json) and write world02-bench-browser-budget.json.
// --repeats N: run each world N times per rate (fresh page each time); every run is reported.
const budget = args.includes('--set') && args[args.indexOf('--set') + 1] === 'budget';
const repeats = args.includes('--repeats') ? Math.max(1, Number(args[args.indexOf('--repeats') + 1])) : 1;

function bundle() {
  const out = path.join(process.env.TMPDIR || '/tmp', `world02-bench-${process.pid}.js`);
  execFileSync(esbuild, [path.join(engineRoot, 'src', 'integration', 'index.ts'), '--bundle', '--minify', '--format=iife',
    '--global-name=EconomyIntegration', '--target=es2020', `--outfile=${out}`], { stdio: 'pipe' });
  const code = fs.readFileSync(out, 'utf8');
  fs.unlinkSync(out);
  return code;
}

/** The measurement, run inside the page. Kept self-contained (no closure) so it can be serialised. */
function measure(input) {
  const E = window.EconomyIntegration;
  const sorted = values => values.slice().sort((a, b) => a - b);
  const median = values => sorted(values)[values.length >> 1];
  const p95 = values => sorted(values)[Math.min(values.length - 1, Math.floor(values.length * 0.95))];
  const heap = () => (performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null);
  let t = performance.now();
  // Synthetic worlds start from their pre-built save through startEconomyFromSave (the fictional path); a WORLD-03
  // scenario package's week-1 session is loaded directly (the current startEconomyFromSave refuses it by design).
  let session = input.session
    ? E.withPlayerCountry(E.loadEconomySession(input.session), input.player)
    : E.startEconomyFromSave(input.save, input.world, { profiles: input.profiles });
  const startMs = performance.now() - t;
  const weeks = [];
  const cumulative = {};
  let total = 0;
  for (let week = 2; week <= 157; week++) {
    t = performance.now();
    session = E.advanceEconomyWeek(session, {});
    const ms = performance.now() - t;
    weeks.push(ms);
    total += ms;
    if (week === 53 || week === 105 || week === 157) cumulative[week - 1] = total / 1000;
  }
  t = performance.now();
  const saved = E.saveEconomySession(session);
  const saveMs = performance.now() - t;
  t = performance.now();
  E.loadEconomySession(saved);
  const restoreMs = performance.now() - t;
  return {
    config: input.config.name, startFromSaveMs: startMs,
    weekMs: { median: median(weeks), p95: p95(weeks), max: Math.max(...weeks), mean: total / weeks.length },
    cumulativeSeconds: cumulative, saveMs, restoreMs, week156SaveKb: saved.length / 1024, heapMb: heap(),
  };
}

// --scenario <package dir>: benchmark a WORLD-03 scenario package (week1.session.json) instead of synthetic worlds;
// results go to <package dir>/benchmark-browser.json and the iPhone page uses the package.
const scenarioDir = args.includes('--scenario') ? path.resolve(args[args.indexOf('--scenario') + 1]) : null;
const files = scenarioDir ? ['week1.session.json']
  : fs.readdirSync(dir).filter(name => (budget ? /^world02-week1-budget-\d+\.json$/ : /^world02-week1-\d+\.json$/).test(name)).sort();
const loadInput = name => scenarioDir
  ? JSON.stringify({ config: { name: `${path.basename(path.dirname(scenarioDir))} ${path.basename(scenarioDir)} (calibrated scenario)` }, session: fs.readFileSync(path.join(scenarioDir, name), 'utf8'), player: 'fra' })
  : fs.readFileSync(path.join(dir, name), 'utf8');
const code = bundle();
console.log(`engine bundle ${(code.length / 1024).toFixed(0)} KB; ${files.length} worlds; rates ${rates.join(', ')}`);

if (htmlOut) {
  // The iPhone page uses the largest proposed world: option A on the real draft topology when present.
  const preferred = ['A: 61 zones, real draft topology', 'A: 61 zones (46+10+5)', '60 zones'];
  const named = files.map(name => ({ name, config: JSON.parse(loadInput(name)).config.name }));
  const pick = preferred.map(p => named.find(f => f.config === p)).find(Boolean) || named[0];
  const input = loadInput(pick.name);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Heartland WORLD-02 benchmark</title><style>body{font:16px -apple-system,system-ui,sans-serif;margin:16px;background:#fff;color:#111}pre{white-space:pre-wrap;font-size:13px}button{font-size:18px;padding:12px 20px}</style></head>
<body><h1>WORLD-02 engine benchmark</h1><p>${JSON.parse(input).config.name} (synthetic economy values): start from the pre-built save, 156 weekly turns, save and restore. Keep the screen on and the page in front until it finishes (about one to three minutes).</p>
<button id="run">Run benchmark</button><pre id="out">Not started.</pre>
<script>${code}</script>
<script>const INPUT=${input};const measure=${measure.toString()};
document.getElementById('run').onclick=()=>{const out=document.getElementById('out');out.textContent='Running…';setTimeout(()=>{try{const r=measure(INPUT);r.userAgent=navigator.userAgent;out.textContent=JSON.stringify(r,null,2);}catch(e){out.textContent='Error: '+e.message;}},50);};</script>
</body></html>`;
  fs.writeFileSync(htmlOut, html);
  console.log(`wrote ${htmlOut} (${(html.length / 1048576).toFixed(1)} MB)`);
}

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const results = [];
  for (const file of files) {
    const input = JSON.parse(loadInput(file));
    for (const rate of rates) for (let run = 0; run < repeats; run++) {
      const page = await browser.newPage();
      const client = await page.context().newCDPSession(page);
      await page.setContent('<html><body></body></html>');
      await page.addScriptTag({ content: code });
      await client.send('Emulation.setCPUThrottlingRate', { rate });
      const result = await page.evaluate(measure, input);
      result.cpuThrottle = rate;
      result.run = run + 1;
      results.push(result);
      console.log(`${result.config} @${rate}x run ${run + 1}: start ${result.startFromSaveMs.toFixed(0)} ms | week median ${result.weekMs.median.toFixed(0)} ms, p95 ${result.weekMs.p95.toFixed(0)} | 156 weeks ${result.cumulativeSeconds[156].toFixed(1)} s | save ${result.saveMs.toFixed(0)} ms, restore ${result.restoreMs.toFixed(0)} ms | heap ${result.heapMb === null ? 'n/a' : result.heapMb.toFixed(0) + ' MB'}`);
      await page.close();
    }
  }
  await browser.close();
  fs.writeFileSync(scenarioDir ? path.join(scenarioDir, 'benchmark-browser.json') : path.join(dir, budget ? 'world02-bench-browser-budget.json' : 'world02-bench-browser.json'), JSON.stringify({ engine: 'Chromium (Playwright, headless)', results }, null, 1));
})().catch(error => { console.error(error); process.exit(1); });

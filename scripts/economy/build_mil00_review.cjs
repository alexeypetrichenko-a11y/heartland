// Run after the audited world04-local build. Writes to a fresh directory.
const { execFileSync } = require('node:child_process');
const { cpSync, mkdirSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { buildSync } = require('esbuild');

const root = resolve(__dirname, '../..');
if (!process.argv[2]) throw new Error('Provide a new output directory.');
const output = resolve(process.argv[2]);
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
if (git('status', '--porcelain')) throw new Error('Build from a clean, committed source tree.');
const commit = git('rev-parse', 'HEAD');
execFileSync('python3', [resolve(__dirname, 'audit_world04_artifact.py')], { stdio: 'inherit' });
mkdirSync(output);
buildSync({ entryPoints: [resolve(__dirname, 'bench_mil00_review.ts')], bundle: true,
  minify: true, target: 'safari16', outfile: resolve(output, 'benchmark.js') });
cpSync(resolve(root, 'dist-world04.local/review'), resolve(output, 'review'), { recursive: true });
writeFileSync(resolve(output, 'index.html'), `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MIL-00-ENGINE · iPhone benchmark</title>
<style>
body{font:1rem/1.5 system-ui,sans-serif;background:#f4f6f9;color:#192531;margin:0;padding:clamp(1rem,4vw,3rem)}
main{max-width:40rem;margin:auto} h1{line-height:1.1} code{overflow-wrap:anywhere}
button{font:inherit;min-height:44px;margin:0 .4rem .5rem 0;padding:.6rem 1rem;background:#194875;color:white;border:0;border-radius:.35rem}
button:disabled{opacity:.6} output{display:block;margin:1rem 0;padding:.9rem;background:white;border:1px solid #c5cdd5}
output div{padding:.25rem 0} a{color:#194875}
</style>
<main><h1>MIL-00-ENGINE</h1><p>iPhone benchmark · Europe 2023 draft.3 · 156 turns · 61 economic zones · 90 divisions</p>
<p>Build <code>${commit}</code></p>
<p>Keep Safari in front and the screen on. Each run starts fresh and uses only memory.</p>
<button data-mode="calm">Run calm</button><button data-mode="heavy">Run heavy orders</button>
<output aria-live="polite">Choose a run.</output>
<p><a href="review/europe-2023/1.0.0-draft.3/NOTICE.md">Sources and licences</a> ·
<a href="review/europe-2023/1.0.0-draft.3/ATTRIBUTION.json">Attribution</a></p>
</main><script src="benchmark.js" defer></script></html>`);

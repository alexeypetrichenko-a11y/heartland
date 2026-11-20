import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createEconomy, createGeneratedWorldSpec, createTestWorldSpec, hashEconomy } from '../src/index.ts';
import { advance } from './helpers.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : path.endsWith('.ts') ? [path] : [];
  });
}

test('engine source is offline, deterministic and free of platform APIs', () => {
  const forbidden: [RegExp, string][] = [
    [/Math\.random/, 'Math.random'], [/\bDate\b/, 'Date'], [/performance\.now/, 'performance.now'], [/\bfetch\s*\(/, 'fetch'],
    [/XMLHttpRequest|WebSocket|EventSource/, 'network API'], [/\bprocess\./, 'process'], [/\brequire\s*\(/, 'require'],
    [/from\s+['"]node:/, 'node: import'], [/setTimeout|setInterval|requestAnimationFrame/, 'timers'],
    [/localStorage|sessionStorage|indexedDB|document\.|window\./, 'browser storage/DOM'], [/\bimport\s*\(/, 'dynamic import'],
    [/Intl\.|toLocale/, 'locale-dependent formatting'],
    [/Math\.(pow|exp|log|log2|log10|sin|cos|tan|atan|atan2|cbrt|hypot|expm1|log1p|sinh|cosh|tanh|asin|acos)\b/, 'transcendental Math function (not bit-identical across engines)'],
    [/[0-9a-zA-Z_)\]] ?\*\* ?[0-9a-zA-Z_(]/, '** operator (exponentiation is not bit-identical across engines)'],
  ];
  const files = sources(join(root, 'src'));
  assert.ok(files.length > 15);
  for (const file of files) {
    const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const [pattern, name] of forbidden) assert.ok(!pattern.test(text), `${file.slice(root.length + 1)} uses ${name}`);
  }
});

test('the package has no runtime dependencies', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies, undefined);
});

test('the engine does not touch the existing game: nothing outside economy-engine is imported', () => {
  for (const file of sources(join(root, 'src'))) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/from\s+'([^']+)'/g)) assert.ok(match[1].startsWith('.'), `${file}: ${match[1]}`);
    for (const match of text.matchAll(/from\s+'(\.[^']*)'/g)) {
      const target = resolve(dirname(file), match[1]);
      assert.ok(target.startsWith(join(root, 'src')), `${file} imports outside the engine: ${match[1]}`);
    }
  }
});

test('scales to larger worlds: a 60-zone generated world is consistent, deterministic and fast enough', () => {
  const spec = createGeneratedWorldSpec(60, 5, 2);
  spec.warmupTurns = 60;
  const a = createEconomy(spec), b = createEconomy(spec);
  assert.equal(hashEconomy(a), hashEconomy(b));
  const started = performance.now();
  advance(a, 60);
  const perTurn = (performance.now() - started) / 60;
  assert.ok(perTurn < 60, `${perTurn} ms per week with the audit on (loose bound for slow CI machines)`);
});

test('performance: the Meridian test world runs far faster than real time (loose bound)', () => {
  const state = createEconomy(createTestWorldSpec());
  const started = performance.now();
  for (let w = 0; w < 300; w++) advance(state, 1);
  const perTurn = (performance.now() - started) / 300;
  assert.ok(perTurn < 25, `${perTurn} ms per week`);
});

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * INT-01: the economic engine must not be downloaded when the globe first opens. Everything the
 * app loads at start-up is reached through static imports from `src/main.tsx`; the engine and its
 * week-1 save must only be reachable through a dynamic `import()` (executed when a game starts).
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function staticImports(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const found: string[] = [];
  // `import x from '...'`, `import { x } from '...'`, `import '...'`, `export ... from '...'`; never `import type`/`export type`.
  for (const match of text.matchAll(/^\s*(import|export)\s+(?!type\b)(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)) found.push(match[2]);
  return found;
}

function resolveModule(from: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null; // packages (react) are not ours
  const base = resolve(dirname(from), specifier.replace(/\?.*$/, ''));
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) if (existsSync(candidate) && !candidate.endsWith('/')) {
    if (/\.(tsx?|json)$/.test(candidate)) return candidate;
  }
  return null;
}

function staticGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.tsx?$/.test(file)) continue;
    for (const specifier of staticImports(file)) {
      const target = resolveModule(file, specifier);
      if (target) queue.push(target);
    }
  }
  return seen;
}

test('opening the app (globe) statically loads no economic engine code or economy save', () => {
  const graph = [...staticGraph(join(root, 'src', 'main.tsx'))].map(file => relative(root, file));
  assert.ok(graph.includes('src/app/App.tsx'), 'the walk reaches the app');
  assert.deepEqual(graph.filter(file => file.startsWith('economy-engine/')), [], 'no engine module is in the start-up graph');
  assert.ok(!graph.includes('src/game/economyRuntime.ts'), 'the runtime loader is only imported dynamically');
});

test('the engine and the week-1 save are loaded only by the runtime loader, through dynamic imports', () => {
  const loader = readFileSync(join(root, 'src', 'game', 'economyRuntime.ts'), 'utf8');
  assert.match(loader, /import\('\.\.\/\.\.\/economy-engine\/src\/integration\/index\.ts'\)/);
  assert.match(loader, /import\('\.\.\/\.\.\/economy-engine\/scenarios\/fictional-week1\.economy\.json\?raw'\)/);
  assert.deepEqual(staticImports(join(root, 'src', 'game', 'economyRuntime.ts')).filter(specifier => !specifier.startsWith('./')), []);
  const app = readFileSync(join(root, 'src', 'app', 'App.tsx'), 'utf8');
  assert.match(app, /await import\('\.\.\/game\/economyRuntime'\)/, 'the app loads the runtime when a game starts');
  // The bridge, statically used by the app, imports only types from the engine.
  const bridge = staticImports(join(root, 'src', 'game', 'economyBridge.ts'));
  assert.ok(bridge.every(specifier => !specifier.includes('economy-engine')));
});

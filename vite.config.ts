import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { EUROPE_ID, EUROPE_VERSION, EUROPE_MANIFEST_SHA, EUROPE_DATA_FILES, EUROPE_LICENCE_FILES } from './src/game/europePackage.ts';

const packageUrl = new URL(`./scenarios/${EUROPE_ID}/${EUROPE_VERSION}/`, import.meta.url);
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

// The regular Pages build has no route that copies a scenario package.
export default defineConfig(({ mode }) => {
  const privateReview = mode === 'world04-local' || mode === 'geo01-local';
  return {
    base: '/heartland/',
    build: { outDir: privateReview ? 'dist-world04.local' : 'dist' },
    server: { fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/scenarios/europe-2023/**', '**/dist-world04.local/**'] } },
    preview: { host: 'localhost' },
    plugins: [react(), {
      name: 'world04-local-package',
      apply: 'build',
      generateBundle() {
        if (!privateReview) return;
        if (process.env.CI) throw new Error('The WORLD-04 review build is for local review only.');
        const manifestBytes = readFileSync(new URL('manifest.json', packageUrl));
        if (digest(manifestBytes) !== EUROPE_MANIFEST_SHA) throw new Error('The Europe review manifest is outside the allowlist.');
        const manifest = JSON.parse(manifestBytes.toString('utf8'));
        if (manifest.id !== EUROPE_ID || manifest.version !== EUROPE_VERSION || manifest.immutable !== true
          || manifest.distributable !== true || manifest.notDistributableBecause.length !== 0
          || manifest.licences.some((entry: { status: string }) => entry.status !== 'cleared')) {
          throw new Error('The Europe review package is not cleared for this build.');
        }

        const entries = EUROPE_DATA_FILES.map(path => manifest.files.find((entry: { path: string }) => entry.path === path));
        for (const [key, path] of Object.entries(EUROPE_LICENCE_FILES)) {
          if (manifest[key]?.path !== path) throw new Error(`Missing approved attribution file ${path}.`);
          entries.push(manifest[key]);
        }
        const assets = new Map<string, Buffer>([['manifest.json', manifestBytes]]);
        for (const entry of entries) {
          const source = readFileSync(new URL(entry.path, packageUrl));
          if (digest(source) !== entry.sha256 || (entry.bytes !== undefined && source.length !== entry.bytes)) {
            throw new Error(`Europe review asset integrity check failed for ${entry.path}.`);
          }
          assets.set(entry.path, source);
        }
        for (const [name, source] of assets) {
          this.emitFile({ type: 'asset', fileName: `review/${EUROPE_ID}/${EUROPE_VERSION}/${name}`, source });
        }
      },
    }],
  };
});

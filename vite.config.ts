import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const packageUrl = new URL('./scenarios/europe-2023/1.0.0-draft.2/', import.meta.url);

// The standard build and Pages workflow never read or emit restricted scenario assets.
export default defineConfig(({ mode }) => {
  const privateReview = mode === 'world04-local';
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
        if (process.env.CI) throw new Error('The restricted WORLD-04 build is for local review only.');
        const manifest = readFileSync(new URL('manifest.json', packageUrl));
        for (const name of ['manifest.json', 'calibration-report.json', 'provenance.json', 'scenario.json', 'week1.session.json', 'world-spec.json']) {
          this.emitFile({
            type: 'asset', fileName: `review/europe-2023/1.0.0-draft.2/${name}`,
            source: name === 'manifest.json' ? manifest : readFileSync(new URL(name, packageUrl)),
          });
        }
      },
    }],
  };
});

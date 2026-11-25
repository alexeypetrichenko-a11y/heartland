import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const maritimeReview = mode === 'mil01a-review';
  return {
    base: '/heartland/',
    publicDir: maritimeReview ? false : 'public',
    build: { outDir: maritimeReview ? 'dist-mil01a.local' : 'dist' },
    plugins: [react(), {
      name: 'mil01a-review-entry',
      transformIndexHtml: {
        order: 'pre',
        handler: html => maritimeReview ? html
          .replace('/src/main.tsx', '/src/maritimeMain.tsx')
          .replace('<title>Heartland</title>', '<title>Heartland · Maritime transport</title>') : html,
      },
    }],
  };
});

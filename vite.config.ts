/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { bundleBudget, pwa } from './src/pwa/vite-plugins.mjs';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Service worker + %SITE_URL% for social cards (SITE_URL env var, or Netlify's URL).
    pwa(),
    // Warns (never fails) when the main page's JS outgrows these gzip budgets.
    bundleBudget({ initialJsKb: 200, totalJsKb: 450 }),
  ],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        // Developer labs for auditioning each subsystem in isolation.
        'lab-music': 'lab/music.html',
        'lab-director': 'lab/director.html',
        'lab-scenes': 'lab/scenes.html',
        'lab-onboarding': 'lab/onboarding.html',
      },
    },
  },
  test: {
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    // Playwright specs run with `npm run test:e2e`, never under vitest.
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
  },
});

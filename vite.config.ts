/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so the build works under any GitLab Pages subpath (e.g. /games/ballistics/).
// The language is in the path: /cs/ and /en/ are the app, and the root index only redirects to one of them (src/lang.ts).
// /cs/changelog/ and /en/changelog/ are the what's-new page (src/changelog/).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        cs: 'cs/index.html',
        en: 'en/index.html',
        // The what's-new page, a page of its own beside each language's app.
        'cs-changelog': 'cs/changelog/index.html',
        'en-changelog': 'en/changelog/index.html',
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // The GitHub runner is about ten times slower than a laptop: a test that renders the app four times took over the
    // default 5 s there (0.1.5's first deploy).
    testTimeout: 20_000,
  },
})

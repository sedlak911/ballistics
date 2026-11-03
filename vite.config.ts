/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so the build works under any GitLab Pages subpath (e.g. /games/ballistics/).
// The language is in the path: /cs/ and /en/ are the app, and the root index only redirects to one of them (src/lang.ts).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: { main: 'index.html', cs: 'cs/index.html', en: 'en/index.html' },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})

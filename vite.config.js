import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * VocabMaster is a static multi-script SPA under public/ (no bundler entry).
 * Vite is a local static file server; do not add a rollup app entry.
 * Vitest uses repo root so tests/unit still resolve correctly.
 */
export default defineConfig({
  root: path.resolve(__dirname, 'public'),
  publicDir: false,
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    open: false
  },
  preview: {
    port: 5173,
    strictPort: true
  },
  appType: 'mpa',
  test: {
    root: __dirname,
    environment: 'node',
    include: ['tests/unit/**/*.{test,spec}.js']
  }
});

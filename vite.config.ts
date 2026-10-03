import tailwindcss from '@tailwindcss/vite';
import { fileRoutes } from 'filesystem-routing/vite';
import { defineConfig } from 'vitest/config';
import solid from '@solidjs/vite-plugin';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';

function localeCatalogs() {
  return {
    name: 'plasain-locale-catalogs',
    enforce: 'pre' as const,
    async load(id: string) {
      const file = id.split('?')[0];
      if (!file.endsWith('.yaml') || !file.includes('/src/lib/locales/')) return null;
      const catalog = parse(await readFile(file, 'utf8'));
      return `export default ${JSON.stringify(catalog)};`;
    },
  };
}

export default defineConfig({
  // Turnkey client mode: no index.html and no mount file — the plugin generates
  // the entries around src/App.tsx (wrapped in src/Document.tsx) and `vite build`
  // prerenders the shell into a purely static dist/client.
  plugins: [
    // YAML is parsed by Vite and emitted as an inlined JSON module. The browser
    // receives catalogs only; it never downloads or parses YAML at runtime.
    localeCatalogs(),
    // `extensions` makes @solidjs/vite-plugin also compile the `?pick=` route
    // modules the fileRoutes plugin emits (their ids end in a query string).
    solid({ start: true, extensions: ['.jsx', '.tsx'], diagnostics: true }), // add `ssr: true` for streaming SSR
    fileRoutes({ types: true }),
    tailwindcss(),
  ],
  server: {
    port: 3000,
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./vitest-setup.ts'],
    // if you have few tests, try commenting this
    // out to improve performance:
    isolate: false,
  },
  build: {
    target: 'esnext',
    assetsInlineLimit: 0,
  },
});

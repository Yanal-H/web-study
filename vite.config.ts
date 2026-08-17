/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * Emit an offline precache manifest into the built service worker so a freshly
 * installed app can reach every route and read the shipped content fully offline.
 * It scans the real dist output (which includes public/ copies), so it needs no
 * hand-kept list of hashed filenames, and it rewrites CACHE_VERSION with a build
 * hash so a new deploy re-installs the SW and repopulates the cache. Strictly
 * additive: the SW's existing network-first/cache-first behaviour is untouched.
 */
function precacheManifest(): Plugin {
  return {
    name: 'foundation-precache-manifest',
    apply: 'build',
    closeBundle() {
      const dist = resolve('dist');
      const swPath = join(dist, 'sw.js');
      if (!existsSync(swPath)) return;

      const urls: string[] = [];
      const walk = (dir: string, base: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const rel = `${base}/${entry.name}`;
          if (entry.isDirectory()) walk(join(dir, entry.name), rel);
          else if (!rel.endsWith('.map')) urls.push(rel);
        }
      };
      // Every route/vendor/content chunk (assets), the self-hosted fonts, and the UI
      // icons — enough to boot every page and study shipped content with no network.
      for (const top of ['assets', 'fonts', 'icons']) {
        const d = join(dist, top);
        if (existsSync(d)) walk(d, `/${top}`);
      }

      const manifest = urls.sort();
      const hash = createHash('sha1').update(manifest.join('|')).digest('hex').slice(0, 8);

      let sw = readFileSync(swPath, 'utf8');
      sw = sw.replace("'foundation-v3' /*__BUILD_ID__*/", `'foundation-${hash}'`);
      sw = sw.replace(
        'SHELL_URL /*__PRECACHE__*/',
        `SHELL_URL, ${manifest.map((u) => JSON.stringify(u)).join(', ')}`
      );
      writeFileSync(swPath, sw);
    },
  };
}

// Foundation · Med School Toolkit — Vite build.
// Static, offline-first single-page app. No runtime third-party network fetches.
export default defineConfig({
  plugins: [react(), precacheManifest()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Hashed asset filenames so they can be cached immutably (see vercel.json headers).
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        // Keep the shipped chapter data (~1.5 MB of JSON) and the vendor libraries in
        // their own immutable chunks, so app-code changes never rebust their cache and
        // the shell script parses without the content payload inlined.
        manualChunks(id) {
          if (id.includes('/content/') && id.endsWith('.json')) return 'content-data';
          if (id.includes('node_modules')) return 'vendor';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // api/ is deployed as Edge Functions and compiled by Vercel rather than by
    // our tsconfig, but its auth and storage logic still has to be tested here.
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'api/**/*.{test,spec}.ts'],
  },
});

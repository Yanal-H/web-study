/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Foundation · Med School Toolkit — Vite build.
// Static, offline-first single-page app. No runtime third-party network fetches.
export default defineConfig({
  plugins: [react()],
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
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});

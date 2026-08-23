import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:8787';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // `--host` exposes the dev server on the LAN so a real phone can open it.
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
  test: {
    // happy-dom rather than jsdom: blobs round-tripped through IndexedDB come
    // back as Node blobs, which jsdom's FormData refuses to accept.
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
  },
});

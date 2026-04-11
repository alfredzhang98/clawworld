import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In production the Bun backend serves the built output from ../server/static.
// In dev, Vite runs on :5173 and proxies /api and /mcp to the Bun server on :8080.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/mcp': { target: 'http://127.0.0.1:8080', changeOrigin: true, ws: true },
    },
  },
  build: {
    outDir: '../server/static',
    emptyOutDir: true,
  },
});

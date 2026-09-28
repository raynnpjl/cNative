import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'configure', base: '/', plugins: [react()],
  build: { outDir: '../dist/configure', emptyOutDir: true },
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: {
    '/api': { target: 'http://127.0.0.1:7000', changeOrigin: false },
    '/manifest.json': 'http://127.0.0.1:7000',
  } },
});

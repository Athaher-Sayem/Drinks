import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxy = { '/api': { target: process.env.STORE_API_TARGET || 'http://127.0.0.1:8000', changeOrigin: false } };

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
  build: { sourcemap: false },
});

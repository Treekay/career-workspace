import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readConfig } from './config/runtime.js';
const config = readConfig();
const proxy = { '/api': { target: `http://127.0.0.1:${config.apiPort}` } };
export default defineConfig({
  plugins: [react()],
  server: { host: config.host, port: config.webPort, strictPort: true, proxy },
  preview: { host: config.host, port: config.webPort, strictPort: true, proxy },
  build: { outDir: 'dist/client' },
});

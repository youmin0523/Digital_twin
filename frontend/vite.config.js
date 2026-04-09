import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';

export default defineConfig({
  plugins: [react(), cesium()],
  server: {
    port: 5173,
    proxy: {
      '/ai-api': {
        target: 'http://localhost:8001',
        rewrite: (path) => path.replace(/^\/ai-api/, '/api'),
      },
      '/api/rl': 'http://localhost:8001',
      '/api/report': 'http://localhost:8002',
      '/api': 'http://localhost:8000',
      '/proxy': 'http://localhost:8000',
      '/nsidc-proxy': 'http://localhost:8000',
      '/cop-proxy': 'http://localhost:8000',
      '/sentinel-proxy': 'http://localhost:8000',
      '/data': 'http://localhost:8000',
      '/scripts': 'http://localhost:8000',
    },
  },
});

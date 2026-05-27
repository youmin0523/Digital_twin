import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';

// AI 백엔드 4종(rl/report/fuel/sar)은 HF Space 배포본 사용.
// 로컬 8001/8002/8003/8005 를 직접 띄우고 싶으면 아래 상수만 'http://localhost' 로 바꿔두면 됨.
const AI_BACKEND = 'https://heejin-oh-arctic-digital-twin-backend.hf.space';

const aiProxy = {
  target: AI_BACKEND,
  changeOrigin: true,
  secure: true,
};

export default defineConfig({
  plugins: [react(), cesium()],
  server: {
    port: 5173,
    proxy: {
      '/ai-api': {
        ...aiProxy,
        rewrite: (path) => path.replace(/^\/ai-api/, '/api'),
      },
      '/api/rl':     aiProxy,
      '/api/report': aiProxy,
      '/api/fuel':   aiProxy,
      '/api/sar':    aiProxy,
      // 그 외 일반 /api/* 와 정적 자원은 로컬 node 백엔드(8000) 가 처리
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

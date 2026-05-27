import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';

// AI 백엔드 라우팅 (서비스별 개별 설정 가능)
// - 기본값은 HF Space 배포본. 로컬에서 띄우면 해당 상수만 'http://localhost:<port>' 로 바꾸면 됨.
// - SAR 은 HF 에 모델이 없어서 기본값을 로컬(8005) 로 둠.
const HF_BACKEND = 'https://heejin-oh-arctic-digital-twin-backend.hf.space';
const RL_BACKEND     = HF_BACKEND;                  // 또는 'http://localhost:8001'
const REPORT_BACKEND = HF_BACKEND;                  // 또는 'http://localhost:8002'
const FUEL_BACKEND   = HF_BACKEND;                  // 또는 'http://localhost:8003'
const SAR_BACKEND    = 'http://localhost:8005';     // 또는 HF_BACKEND

const mkProxy = (target) => ({
  target,
  changeOrigin: true,
  secure: target.startsWith('https'),
});

export default defineConfig({
  plugins: [react(), cesium()],
  server: {
    port: 5173,
    proxy: {
      '/ai-api': {
        ...mkProxy(RL_BACKEND),
        rewrite: (path) => path.replace(/^\/ai-api/, '/api'),
      },
      '/api/rl':     mkProxy(RL_BACKEND),
      '/api/report': mkProxy(REPORT_BACKEND),
      '/api/fuel':   mkProxy(FUEL_BACKEND),
      '/api/sar':    mkProxy(SAR_BACKEND),
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

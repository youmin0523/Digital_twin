// vite.config.js
import { defineConfig } from "file:///C:/Hijin/pjbingha/Digital_twin/frontend/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Hijin/pjbingha/Digital_twin/frontend/node_modules/@vitejs/plugin-react/dist/index.js";
import cesium from "file:///C:/Hijin/pjbingha/Digital_twin/frontend/node_modules/vite-plugin-cesium/dist/index.mjs";
var vite_config_default = defineConfig({
  plugins: [react(), cesium()],
  server: {
    port: 5173,
    proxy: {
      "/ai-api": {
        target: "http://localhost:8001",
        rewrite: (path) => path.replace(/^\/ai-api/, "/api")
      },
      "/api/rl": "http://localhost:8001",
      "/api/report": "http://localhost:8002",
      "/api/fuel": "http://localhost:8003",
      "/api": "http://localhost:8000",
      "/proxy": "http://localhost:8000",
      "/nsidc-proxy": "http://localhost:8000",
      "/cop-proxy": "http://localhost:8000",
      "/sentinel-proxy": "http://localhost:8000",
      "/data": "http://localhost:8000",
      "/scripts": "http://localhost:8000"
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxIaWppblxcXFxwamJpbmdoYVxcXFxEaWdpdGFsX3R3aW5cXFxcZnJvbnRlbmRcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXEhpamluXFxcXHBqYmluZ2hhXFxcXERpZ2l0YWxfdHdpblxcXFxmcm9udGVuZFxcXFx2aXRlLmNvbmZpZy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovSGlqaW4vcGpiaW5naGEvRGlnaXRhbF90d2luL2Zyb250ZW5kL3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XHJcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XHJcbmltcG9ydCBjZXNpdW0gZnJvbSAndml0ZS1wbHVnaW4tY2VzaXVtJztcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XHJcbiAgcGx1Z2luczogW3JlYWN0KCksIGNlc2l1bSgpXSxcclxuICBzZXJ2ZXI6IHtcclxuICAgIHBvcnQ6IDUxNzMsXHJcbiAgICBwcm94eToge1xyXG4gICAgICAnL2FpLWFwaSc6IHtcclxuICAgICAgICB0YXJnZXQ6ICdodHRwOi8vbG9jYWxob3N0OjgwMDEnLFxyXG4gICAgICAgIHJld3JpdGU6IChwYXRoKSA9PiBwYXRoLnJlcGxhY2UoL15cXC9haS1hcGkvLCAnL2FwaScpLFxyXG4gICAgICB9LFxyXG4gICAgICAnL2FwaS9ybCc6ICdodHRwOi8vbG9jYWxob3N0OjgwMDEnLFxyXG4gICAgICAnL2FwaS9yZXBvcnQnOiAnaHR0cDovL2xvY2FsaG9zdDo4MDAyJyxcclxuICAgICAgJy9hcGkvZnVlbCc6ICdodHRwOi8vbG9jYWxob3N0OjgwMDMnLFxyXG4gICAgICAnL2FwaSc6ICdodHRwOi8vbG9jYWxob3N0OjgwMDAnLFxyXG4gICAgICAnL3Byb3h5JzogJ2h0dHA6Ly9sb2NhbGhvc3Q6ODAwMCcsXHJcbiAgICAgICcvbnNpZGMtcHJveHknOiAnaHR0cDovL2xvY2FsaG9zdDo4MDAwJyxcclxuICAgICAgJy9jb3AtcHJveHknOiAnaHR0cDovL2xvY2FsaG9zdDo4MDAwJyxcclxuICAgICAgJy9zZW50aW5lbC1wcm94eSc6ICdodHRwOi8vbG9jYWxob3N0OjgwMDAnLFxyXG4gICAgICAnL2RhdGEnOiAnaHR0cDovL2xvY2FsaG9zdDo4MDAwJyxcclxuICAgICAgJy9zY3JpcHRzJzogJ2h0dHA6Ly9sb2NhbGhvc3Q6ODAwMCcsXHJcbiAgICB9LFxyXG4gIH0sXHJcbn0pO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQWlULFNBQVMsb0JBQW9CO0FBQzlVLE9BQU8sV0FBVztBQUNsQixPQUFPLFlBQVk7QUFFbkIsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUyxDQUFDLE1BQU0sR0FBRyxPQUFPLENBQUM7QUFBQSxFQUMzQixRQUFRO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsTUFDTCxXQUFXO0FBQUEsUUFDVCxRQUFRO0FBQUEsUUFDUixTQUFTLENBQUMsU0FBUyxLQUFLLFFBQVEsYUFBYSxNQUFNO0FBQUEsTUFDckQ7QUFBQSxNQUNBLFdBQVc7QUFBQSxNQUNYLGVBQWU7QUFBQSxNQUNmLGFBQWE7QUFBQSxNQUNiLFFBQVE7QUFBQSxNQUNSLFVBQVU7QUFBQSxNQUNWLGdCQUFnQjtBQUFBLE1BQ2hCLGNBQWM7QUFBQSxNQUNkLG1CQUFtQjtBQUFBLE1BQ25CLFNBQVM7QUFBQSxNQUNULFlBQVk7QUFBQSxJQUNkO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==

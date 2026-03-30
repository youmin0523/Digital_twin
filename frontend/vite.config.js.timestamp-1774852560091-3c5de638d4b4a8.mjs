// vite.config.js
import { defineConfig } from "file:///C:/Hijin/pjbingha/Digital_twin/frontend/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Hijin/pjbingha/Digital_twin/frontend/node_modules/@vitejs/plugin-react/dist/index.js";
import cesium from "file:///C:/Hijin/pjbingha/Digital_twin/frontend/node_modules/vite-plugin-cesium/dist/index.mjs";
var vite_config_default = defineConfig({
  plugins: [react(), cesium()],
  server: {
    port: 5173,
    proxy: {
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxIaWppblxcXFxwamJpbmdoYVxcXFxEaWdpdGFsX3R3aW5cXFxcZnJvbnRlbmRcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXEhpamluXFxcXHBqYmluZ2hhXFxcXERpZ2l0YWxfdHdpblxcXFxmcm9udGVuZFxcXFx2aXRlLmNvbmZpZy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovSGlqaW4vcGpiaW5naGEvRGlnaXRhbF90d2luL2Zyb250ZW5kL3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3QnO1xuaW1wb3J0IGNlc2l1bSBmcm9tICd2aXRlLXBsdWdpbi1jZXNpdW0nO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBwbHVnaW5zOiBbcmVhY3QoKSwgY2VzaXVtKCldLFxuICBzZXJ2ZXI6IHtcbiAgICBwb3J0OiA1MTczLFxuICAgIHByb3h5OiB7XG4gICAgICAnL2FwaSc6ICdodHRwOi8vbG9jYWxob3N0OjgwMDAnLFxuICAgICAgJy9wcm94eSc6ICdodHRwOi8vbG9jYWxob3N0OjgwMDAnLFxuICAgICAgJy9uc2lkYy1wcm94eSc6ICdodHRwOi8vbG9jYWxob3N0OjgwMDAnLFxuICAgICAgJy9jb3AtcHJveHknOiAnaHR0cDovL2xvY2FsaG9zdDo4MDAwJyxcbiAgICAgICcvc2VudGluZWwtcHJveHknOiAnaHR0cDovL2xvY2FsaG9zdDo4MDAwJyxcbiAgICAgICcvZGF0YSc6ICdodHRwOi8vbG9jYWxob3N0OjgwMDAnLFxuICAgICAgJy9zY3JpcHRzJzogJ2h0dHA6Ly9sb2NhbGhvc3Q6ODAwMCcsXG4gICAgfSxcbiAgfSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFpVCxTQUFTLG9CQUFvQjtBQUM5VSxPQUFPLFdBQVc7QUFDbEIsT0FBTyxZQUFZO0FBRW5CLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVMsQ0FBQyxNQUFNLEdBQUcsT0FBTyxDQUFDO0FBQUEsRUFDM0IsUUFBUTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLE1BQ0wsUUFBUTtBQUFBLE1BQ1IsVUFBVTtBQUFBLE1BQ1YsZ0JBQWdCO0FBQUEsTUFDaEIsY0FBYztBQUFBLE1BQ2QsbUJBQW1CO0FBQUEsTUFDbkIsU0FBUztBQUFBLE1BQ1QsWUFBWTtBQUFBLElBQ2Q7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K

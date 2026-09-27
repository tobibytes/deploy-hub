import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

const apiTarget = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    // 3000 is a popular port; Vite would otherwise bind IPv6 only and look like
    // it worked while requests went to whatever else holds the IPv4 address.
    port: Number(process.env.VITE_PORT ?? 5173),
    strictPort: true,
    // In development the dashboard runs on Vite and talks to the API next door.
    // In production the API serves these files itself, so there is no proxy.
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false, ws: false },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const api = process.env.KANAKKU_API ?? 'http://127.0.0.1:5170';

function devToken(): Plugin {
  const token = process.env.KANAKKU_TOKEN ?? '';
  return {
    name: 'kanakku-dev-token',
    apply: 'serve',
    transformIndexHtml: (html) =>
      html.replace(/<head>/i, `<head><meta name="kanakku-token" content="${token}">`),
  };
}

export default defineConfig({
  plugins: [react(), devToken()],
  server: {
    port: 5173,
    proxy: { '/api': { target: api, changeOrigin: true } },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 4000,
  },
});

import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const backend = process.env.YUNYOUHE_BACKEND || 'http://127.0.0.1:1265';

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    proxy: { '/api': backend, '/health': backend },
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: { arco: ['@arco-design/web-vue'], vendor: ['vue', 'marked', 'dompurify'] },
      },
    },
  },
});

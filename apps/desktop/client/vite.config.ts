import vue from '@vitejs/plugin-vue';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname);

export default defineConfig({
  plugins: [vue()],
  root: resolve(rootDir, 'src/renderer'),
  base: './',
  build: {
    outDir: resolve(rootDir, 'dist'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': resolve(rootDir, 'src/renderer'),
    },
  },
  server: {
    port: 5173, // Desktop 客户端 Vite 固定端口（与 web:3000、miniapp:3001、desktop server:30001 区分）
    strictPort: true, // 5173 被占用时直接报错，保证与 Electron 主进程写死的端口一致
    host: '0.0.0.0',
  },
});

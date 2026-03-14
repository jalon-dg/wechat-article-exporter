import { defineNitroConfig } from 'nitropack';
import { resolve } from 'path';

export default defineNitroConfig({
  compatibilityDate: '2024-04-03',
  preset: 'node-server',
  srcDir: 'src',
  apiDir: 'api',
  outputDir: '../.output/miniapp-server',
  port: 3001, // 小程序后端固定端口（与 web:3000、desktop:30001/5173 区分）
  host: '0.0.0.0',
  routeRules: {
    '/api/**': {
      cors: true,
    },
  },
  appConfig: {
    apiPrefix: '',
  },
  storage: {
    kv: {
      driver: process.env.NITRO_KV_DRIVER || 'fs',
      base: resolve(process.cwd(), '../../.data/kv'),
    },
  },
});

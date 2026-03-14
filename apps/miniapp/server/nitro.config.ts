import { defineNitroConfig } from 'nitropack';
import { resolve } from 'path';

export default defineNitroConfig({
  compatibilityDate: '2024-04-03',
  preset: 'node-server',
  srcDir: 'src',
  apiDir: 'api',
  outputDir: '../.output/miniapp-server',
  port: 3001,
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
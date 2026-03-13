import { defineNitroConfig } from 'nitropack';

export default defineNitroConfig({
  compatibilityDate: '2024-04-03',
  preset: 'node-server',
  srcDir: 'src',
  apiDir: 'api',
  outputDir: '../.output/miniapp-server',
  port: 3001,
  routeRules: {
    '/api/**': {
      cors: true,
    },
  },
  appConfig: {
    apiPrefix: '',
  },
});
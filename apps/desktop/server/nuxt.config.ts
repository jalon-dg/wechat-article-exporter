import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-10-30',
  devtools: {
    enabled: false,
  },
  devServer: {
    port: 30001,
    host: '0.0.0.0',
  },
  ssr: false,
  runtimeConfig: {
    managerUsername: process.env.MANAGER_USERNAME || 'admin',
    managerPassword: process.env.MANAGER_PASSWORD || 'admin123',
  },
  nitro: {
    baseURL: '/admin/',
    routeRules: {
      '/api/**': { cors: true },
    },
  },
  alias: {
    '#shared': resolve(dirname(fileURLToPath(import.meta.url)), '../../../packages/shared'),
  },
  modules: ['@vueuse/nuxt', '@nuxt/ui'],
  app: {
    head: {
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap' },
      ],
    },
  },
  css: ['~/assets/admin.css'],
});
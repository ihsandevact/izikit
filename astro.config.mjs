import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import AstroPWA from '@vite-pwa/astro';

export default defineConfig({
  site: 'https://izikit.app',
  output: 'static',
  trailingSlash: 'never',
  i18n: {
    defaultLocale: 'id',
    locales: ['id', 'en'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  integrations: [
    react(),
    sitemap({
      i18n: {
        defaultLocale: 'id',
        locales: {
          id: 'id-ID',
          en: 'en-US',
        },
      },
    }),
    AstroPWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'izikit - Alat PDF & Gambar Lokal',
        short_name: 'izikit',
        description:
          'Kit utilitas PDF dan gambar yang berjalan 100% lokal di browser Anda tanpa login dan tanpa unggah file ke server.',
        theme_color: '#0D0F12',
        background_color: '#0D0F12',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        cacheId: 'izikit-v3',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ['**/*.{js,css,svg,woff2,json}'],
        globIgnores: ['**/ort*.js'],
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'izikit-pages-v4',
              networkTimeoutSeconds: 3,
              fetchOptions: {
                cache: 'no-cache',
              },
            },
          },
          {
            urlPattern: /\/_astro\/ort.*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'izikit-onnx-runtime-v3',
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    worker: {
      format: 'es',
    },
  },
});

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
      filter: (page) => !page.endsWith('/404') && !page.endsWith('/404/'),
      i18n: {
        defaultLocale: 'id',
        locales: {
          id: 'id',
          en: 'en',
        },
      },
      serialize(item) {
        item.lastmod = new Date().toISOString();
        return item;
      },
    }),
    AstroPWA({
      registerType: 'autoUpdate',
      manifest: {
        id: '/',
        lang: 'id',
        name: 'izikit - Alat PDF & Gambar Lokal',
        short_name: 'izikit',
        description:
          'Kit utilitas PDF dan gambar yang berjalan 100% lokal di browser Anda tanpa login dan tanpa unggah file ke server.',
        theme_color: '#0B1020',
        background_color: '#0B1020',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/izikit-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/izikit-app-icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cacheId: 'izikit-v3',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ['**/*.{js,css,svg,woff2,json}'],
        globIgnores: ['**/ort*.js', '**/heic-to*.js'],
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
          {
            urlPattern: /\/_astro\/avif_.*\.wasm$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'izikit-avif-wasm-v1',
            },
          },
          {
            urlPattern: /\/_astro\/heic-to.*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'izikit-heic-decoder-v1',
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

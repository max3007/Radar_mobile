import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  build: {
    outDir: 'dist'
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'RADAR — aerei in tempo reale',
        short_name: 'RADAR',
        description: 'Radar aerei in tempo reale attorno alla tua posizione',
        lang: 'it',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#060a0e',
        background_color: '#060a0e',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // App shell in precache; i dati di volo restano sempre network-only.
        // Le tile mappa hanno una cache moderata per riaperture veloci.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(server\.arcgisonline\.com|[a-z]\.basemaps\.cartocdn\.com)\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 3600 }
            }
          }
        ]
      }
    })
  ]
});

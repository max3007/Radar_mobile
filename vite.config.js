import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// opendata.adsb.fi non manda le intestazioni CORS, quindi il browser rifiuta
// la risposta quando la richiesta parte da una pagina web (mentre aprendo
// l'URL a mano funziona: la navigazione diretta non passa dal controllo CORS).
// Le chiamate passano percio dal nostro stesso dominio, sotto /adsb: in
// produzione le inoltra Vercel (vercel.json), qui in sviluppo e in anteprima
// le inoltra Vite. Le due configurazioni devono restare allineate.
const adsbProxy = {
  '/adsb': {
    target: 'https://opendata.adsb.fi',
    changeOrigin: true,
    rewrite: function (p) { return p.replace(/^\/adsb/, '/api'); }
  }
};

export default defineConfig({
  server: { proxy: adsbProxy },
  preview: { proxy: adsbProxy },
  // Marchio di build: serve a sapere con certezza quale versione sta girando
  // sul telefono. Senza, distinguere "il codice e sbagliato" da "il browser
  // ha servito una copia in cache" diventa un gioco di indovinelli.
  define: {
    __BUILD_ID__: JSON.stringify(
      new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
    )
  },
  build: {
    outDir: 'dist'
  },
  // Due famiglie di test con due esecutori diversi: Vitest prende solo i
  // *.test.js (funzioni pure), Playwright solo i *.spec.js in tests/e2e
  // (interfaccia). Senza questo Vitest tenterebbe di eseguire anche i secondi.
  test: {
    include: ['tests/**/*.test.js']
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

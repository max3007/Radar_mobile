import { defineConfig, devices } from '@playwright/test';

// Test end-to-end: girano sulla build di produzione servita da `vite preview`,
// non sul server di sviluppo, cosi si verifica esattamente cio che finisce
// online (service worker e inoltro /adsb compresi).
export default defineConfig({
  testDir: './tests/e2e',
  // Molte prove aspettano cicli di polling da 6 secondi: serve respiro.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,   // le prove pilotano il tempo e la visibilita della pagina
  workers: 1,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    ...devices['Pixel 5'],   // e un'app pensata per il telefono
    locale: 'it-IT',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000
  }
});

import { test, expect } from '@playwright/test';
import {
  preparaRete, rispostaOk, rispostaRifiutata, abilitaControlloVisibilita,
  bannerErrore, cambiaLingua, apriPannello
} from './fixtures.js';

test.describe('Ritmo delle richieste', () => {
  test('interroga la fonte ogni 6 secondi', async ({ page }) => {
    const { urls } = await preparaRete(page);
    await page.goto('/');
    await page.waitForTimeout(1000);
    const partenza = urls.length;
    await page.waitForTimeout(13000);
    const fatte = urls.length - partenza;
    // 13 s a 6 s di intervallo: 2 richieste, tolleranza 1
    expect(fatte).toBeGreaterThanOrEqual(1);
    expect(fatte).toBeLessThanOrEqual(3);
  });

  test('non interroga la fonte mentre e in secondo piano', async ({ page }) => {
    await abilitaControlloVisibilita(page);
    const { urls } = await preparaRete(page);
    await page.goto('/');
    await page.waitForTimeout(1500);

    await page.evaluate(() => window.__setNascosta(true));
    const durante = urls.length;
    await page.waitForTimeout(9000);
    expect(urls.length - durante).toBe(0);
  });

  test('riprende subito tornando in primo piano', async ({ page }) => {
    await abilitaControlloVisibilita(page);
    const { urls } = await preparaRete(page);
    await page.goto('/');
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__setNascosta(true));
    await page.waitForTimeout(3000);

    const prima = urls.length;
    await page.evaluate(() => window.__setNascosta(false));
    await expect.poll(() => urls.length, { timeout: 5000 }).toBeGreaterThan(prima);
  });

  test('si riprende da sola se una richiesta resta appesa', async ({ page }) => {
    // Il guasto degli "aerei congelati": una richiesta che non torna mai
    // spezzava il ciclo di aggiornamento e serviva chiudere e riaprire l'app.
    // Prova lenta per forza di cose: la scadenza e 15 s e l'attesa
    // progressiva dopo un errore parte da 30 s.
    test.setTimeout(150000);
    let appesa = true;
    await preparaRete(page, () => (appesa ? null : rispostaOk()));
    await page.goto('/');
    await page.waitForTimeout(3000);
    appesa = false;
    // Cio che conta non e che parta una richiesta qualsiasi, ma che i DATI
    // tornino a scorrere da soli, senza chiudere e riaprire.
    await expect.poll(() => page.locator('#stCount').textContent(),
      { timeout: 120000 }).toBe('2');
  });
});

test.describe('Banner di errore', () => {
  test('non allarma al primo fallimento isolato', async ({ page }) => {
    let fallisci = true;
    await preparaRete(page, () => (fallisci ? { __abort: true } : rispostaOk()));
    await page.goto('/');
    await page.waitForTimeout(3000);
    // Un buco solo non deve far comparire nulla
    expect(await bannerErrore(page)).toBeNull();
  });

  test('riporta il messaggio della fonte quando questa rifiuta', async ({ page }) => {
    await preparaRete(page, () => rispostaRifiutata('quota esaurita'));
    await page.goto('/');
    await expect.poll(() => bannerErrore(page), { timeout: 20000 }).toContain('quota esaurita');
  });

  test('sparisce quando la fonte torna a rispondere', async ({ page }) => {
    let rotta = true;
    await preparaRete(page, () => (rotta ? rispostaRifiutata() : rispostaOk()));
    await page.goto('/');
    await expect.poll(() => bannerErrore(page), { timeout: 20000 }).not.toBeNull();
    rotta = false;
    await expect.poll(() => bannerErrore(page), { timeout: 30000 }).toBeNull();
  });

  test('cambiando lingua il banner resta coerente e tutto tradotto', async ({ page }) => {
    await preparaRete(page, () => rispostaRifiutata('service unavailable'));
    await page.goto('/');
    await expect.poll(() => bannerErrore(page), { timeout: 20000 }).toContain('service unavailable');

    await apriPannello(page, '#btnSettings');
    await cambiaLingua(page, 'en');

    const dopo = await bannerErrore(page);
    // Deve restare il messaggio della fonte, tradotto nell'involucro inglese,
    // NON riportato al generico "segnale perso".
    expect(dopo).toContain('service unavailable');
    expect(dopo).toContain('SIGNAL LOST');
    // e non deve restare mezzo in italiano
    expect(dopo).not.toContain('RIPROVO');
  });
});

test.describe('Ricerca volo', () => {
  test('dice che la fonte ha rifiutato, non che il volo non e in volo', async ({ page }) => {
    await preparaRete(page, () => rispostaRifiutata('access denied'));
    await page.goto('/');
    await apriPannello(page, '#btnSearch');
    await page.locator('#flightSearch').fill('AZ610');
    await page.locator('#flightSearchBtn').dispatchEvent('click');
    await page.waitForTimeout(2000);

    const nota = await page.locator('#searchNote').textContent();
    // Il difetto: l'app diceva "non in volo" mentre la fonte aveva rifiutato
    expect(nota.toLowerCase()).not.toContain('non in volo');
    expect(nota).toContain('access denied');
  });
});

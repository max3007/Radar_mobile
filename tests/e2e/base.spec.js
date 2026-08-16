import { test, expect } from '@playwright/test';
import { preparaRete, rispostaOk, apriPannello, AEREI_REALI } from './fixtures.js';

test.describe('Avvio e dati', () => {
  test('parte, interroga la fonte giusta e disegna gli aerei', async ({ page }) => {
    const { urls } = await preparaRete(page);
    await page.goto('/');
    await expect.poll(() => urls.length).toBeGreaterThan(0);

    // Deve chiamare il NOSTRO dominio: chiamare adsb.fi direttamente fa
    // fallire il browser per CORS (vedi vercel.json).
    expect(urls[0]).toContain('/adsb/v3/lat/');
    expect(urls[0]).not.toContain('opendata.adsb.fi');

    await expect(page.locator('#stCount')).toHaveText(String(AEREI_REALI.length));
    await expect(page.locator('#errBar')).toBeHidden();
  });

  test('la lista TRAFFICO mostra compagnia, tipo e fase di volo', async ({ page }) => {
    await preparaRete(page);
    await page.goto('/');
    await apriPannello(page, '#btnBoard');

    const righe = page.locator('#planeList .acrow');
    await expect(righe).toHaveCount(2);
    const testo = await page.locator('#planeList').innerText();
    expect(testo).toContain('ITY088');
    expect(testo).toContain('ITA Airways');
    expect(testo).toContain('IN SALITA');          // rateo +2432 ft/min
    expect(testo).toContain('IN DISCESA / ARRIVO'); // rateo -768 ft/min
  });

  test('gli aerei oltre il raggio richiesto vengono scartati', async ({ page }) => {
    // adsb.fi restituisce anche aerei fuori dal raggio: li rifiliamo noi
    const lontano = { hex: 'ff0001', flight: 'LONTANO ', t: 'A320',
      alt_baro: 30000, gs: 400, track: 90, lat: 43.5, lon: 12.6285, dst: 140 };
    await preparaRete(page, () => rispostaOk([...AEREI_REALI, lontano]));
    await page.goto('/');
    // raggio predefinito 100 NM: quello a 140 NM non deve comparire
    await expect(page.locator('#stCount')).toHaveText('2');
  });

  test('la nota di IN ARRIVO dichiara il ritmo reale di aggiornamento', async ({ page }) => {
    await preparaRete(page);
    await page.goto('/');
    await apriPannello(page, '#btnPasses');
    // I numeri devono venire dalle costanti, non essere riscritti a mano
    await expect(page.locator('#arrNote')).toContainText('250 NM');
    await expect(page.locator('#arrNote')).toContainText('6 s');
  });
});

test.describe('Pannelli e tasto BACK', () => {
  const pannelli = [
    ['#btnBoard', '#board'],
    ['#btnPasses', '#passes'],
    ['#btnSettings', '#settings'],
    ['#btnSearch', '#searchPanel']
  ];

  for (const [pulsante, pannello] of pannelli) {
    test(`${pannello} si apre e si chiude`, async ({ page }) => {
      await preparaRete(page);
      await page.goto('/');
      await apriPannello(page, pulsante);
      await expect(page.locator(pannello)).toHaveClass(/open/);
      await apriPannello(page, pulsante);   // secondo tocco: chiude
      await expect(page.locator(pannello)).not.toHaveClass(/open/);
    });
  }

  test('aprire un pannello chiude quello precedente', async ({ page }) => {
    await preparaRete(page);
    await page.goto('/');
    await apriPannello(page, '#btnBoard');
    await apriPannello(page, '#btnSettings');
    await expect(page.locator('#board')).not.toHaveClass(/open/);
    await expect(page.locator('#settings')).toHaveClass(/open/);
  });

  test('il tasto BACK chiude il pannello invece di uscire dall app', async ({ page }) => {
    await preparaRete(page);
    await page.goto('/');
    await apriPannello(page, '#btnSettings');
    await expect(page.locator('#settings')).toHaveClass(/open/);

    await page.goBack();
    await page.waitForTimeout(500);
    await expect(page.locator('#settings')).not.toHaveClass(/open/);
    // Deve essere rimasto nell'app, non tornato a una pagina precedente
    await expect(page.locator('#map')).toBeVisible();
  });
});

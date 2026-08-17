import { test, expect } from '@playwright/test';
import { preparaRete } from './fixtures.js';

// MIRA non aveva nessuna prova end-to-end: la decisione (guidaMira) era coperta
// da test unitari, ma che i sensori arrivassero fino allo schermo si poteva
// solo guardare a occhio sul telefono.
//
// In Chromium headless DeviceOrientationEvent esiste e non chiede permesso,
// quindi si possono spedire eventi veri e verificare cosa succede al mirino.
// Resta fuori solo l'ultimo miglio — che la bussola del telefono dica il vero.

/** Apre MIRA sull'aereo piu vicino e aspetta che agganci i sensori. */
async function apriMira(page) {
  await page.locator('#btnMira').dispatchEvent('click');
  await page.waitForTimeout(600);
}

/**
 * Simula il telefono tenuto fermo in un certo orientamento.
 *
 * Manda una RAFFICA di eventi, non uno solo: un telefono vero ne emette
 * decine al secondo, e il filtro di smussamento (media mobile al 15% per
 * evento) ha bisogno di parecchi campioni per arrivare a destinazione. Con un
 * evento solo si misurerebbe il filtro, non la guida.
 *
 * @param alpha  bussola: l'app calcola heading = 360 - alpha
 * @param beta   inclinazione: 90 = telefono verticale, puntato all'orizzonte
 */
async function orienta(page, alpha, beta) {
  await page.evaluate(([a, b]) => {
    for (let i = 0; i < 40; i++) {
      window.dispatchEvent(new DeviceOrientationEvent('deviceorientation',
        { alpha: a, beta: b, gamma: 0 }));
    }
  }, [alpha, beta]);
  await page.waitForTimeout(150);
}

/** Gradi di rotazione del muso dell'aereo, normalizzati a -180..180. */
async function angoloAereo(page) {
  return page.evaluate(() => {
    const m = document.getElementById('miraAereo').style.transform.match(/rotate\((-?[\d.]+)deg\)/);
    if (!m) return null;
    return ((parseFloat(m[1]) % 360) + 540) % 360 - 180;
  });
}

test.describe('MIRA: cerchio fermo e aereo da centrarci dentro', () => {
  test('si apre con reticolo, aereo bersaglio e gradi', async ({ page }) => {
    await preparaRete(page);
    await page.goto('/');
    await page.waitForTimeout(1200);
    await apriMira(page);

    await expect(page.locator('#miraOverlay')).toBeVisible();
    await expect(page.locator('#miraBox .mira-cerchio')).toBeVisible();
    await expect(page.locator('#miraAereo')).toBeAttached();
    await expect(page.locator('#miraGradi')).toBeVisible();
  });

  test('senza sensori non finge di sapere dove sia l aereo', async ({ page }) => {
    // Disegnare il bersaglio al centro prima che i sensori rispondano
    // direbbe "sei allineato" quando non ne sappiamo niente.
    await preparaRete(page);
    await page.goto('/');
    await page.waitForTimeout(1200);
    await apriMira(page);

    await expect(page.locator('#miraBox')).toHaveClass(/in-attesa/);
    await expect(page.locator('#miraGradi')).toHaveText('--');

    await orienta(page, 45, 90);
    await expect(page.locator('#miraBox')).not.toHaveClass(/in-attesa/);
  });

  test('l aereo si muove quando il telefono si gira', async ({ page }) => {
    await preparaRete(page);
    await page.goto('/');
    await page.waitForTimeout(1200);
    await apriMira(page);

    const dove = () => page.evaluate(() => {
      const e = document.getElementById('miraAereo');
      return { x: parseFloat(e.style.left), y: parseFloat(e.style.top) };
    });

    await orienta(page, 0, 90);
    const a = await dove();
    await orienta(page, 90, 90);
    const b = await dove();

    expect(Number.isFinite(a.x)).toBe(true);
    expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBeGreaterThan(2);
  });

  test('non ci sono piu righe di testo a coprire la mappa', async ({ page }) => {
    // La guida sta tutta nel reticolo: aereo, cerchio, freccia, gradi. Il
    // testo compare solo quando c'e qualcosa che l'utente deve sapere.
    await preparaRete(page);
    await page.goto('/');
    await page.waitForTimeout(1200);
    await apriMira(page);
    await orienta(page, 45, 90);

    expect(await page.locator('#miraStatus').count()).toBe(0);
    expect(await page.locator('#miraSub').count()).toBe(0);
    await expect(page.locator('#miraHint')).toBeHidden();
  });

  test('l etichetta dell aereo sparisce, altrimenti coprirebbe i gradi', async ({ page }) => {
    // L'etichetta ancorata e centrata sulla mappa come il mirino: senza questo
    // finisce sempre dentro al cerchio e nasconde proprio il numero che serve.
    await preparaRete(page);
    await page.goto('/');
    await page.waitForTimeout(1200);

    // Il marker Leaflet dell'etichetta ha iconSize [0,0] e il contenuto sta in
    // overflow: per Playwright ha sempre riquadro nullo, quindi toBeVisible()
    // direbbe "nascosta" anche quando si vede. Si guarda il display calcolato.
    const etichettaVisibile = () => page.evaluate(() => {
      const e = document.querySelector('.tag-anchor');
      return e ? getComputedStyle(e).display !== 'none' : null;
    });

    await page.locator('#btnAbove').dispatchEvent('click');
    await page.waitForTimeout(400);
    await page.locator('#aboveGo').dispatchEvent('click');   // seleziona: compare l'etichetta
    await page.waitForTimeout(600);
    expect(await etichettaVisibile()).toBe(true);

    await apriMira(page);
    expect(await etichettaVisibile()).toBe(false);

    await page.locator('#miraOverlay').dispatchEvent('click');   // chiude MIRA
    await page.waitForTimeout(400);
    expect(await etichettaVisibile()).toBe(true);                // e torna
  });

  test('il muso dell aereo ruota quando il telefono si gira', async ({ page }) => {
    await preparaRete(page);
    await page.goto('/');
    await page.waitForTimeout(1200);
    await apriMira(page);

    // Telefono verticale (beta 90 = orizzonte), girato di un quarto di giro.
    // NON di mezzo giro: due direzioni esattamente opposte sono il caso
    // degenere della media mobile circolare — la media di due versori opposti
    // non ruota, si accorcia soltanto, e la freccia resterebbe ferma. Succede
    // anche col telefono vero, ma li si passa per tutti gli angoli in mezzo.
    await orienta(page, 0, 90);
    const versoA = await angoloAereo(page);
    await orienta(page, 90, 90);
    const versoB = await angoloAereo(page);

    expect(versoA).not.toBeNull();
    expect(versoB).not.toBeNull();
    // Se il muso non si muovesse, vorrebbe dire che i sensori non arrivano
    // fino allo schermo — che e esattamente cio che questa prova protegge.
    expect(Math.abs(versoA - versoB)).toBeGreaterThan(20);
  });

  test('i gradi mancanti sono un numero, non un segnaposto', async ({ page }) => {
    await preparaRete(page);
    await page.goto('/');
    await page.waitForTimeout(1200);
    await apriMira(page);
    await orienta(page, 45, 90);

    await expect(page.locator('#miraGradi')).toHaveText(/^\d+°$/);
  });

  test('il tasto BACK chiude MIRA senza uscire dall app', async ({ page }) => {
    await preparaRete(page);
    await page.goto('/');
    await page.waitForTimeout(1200);
    await apriMira(page);
    await expect(page.locator('#miraOverlay')).toBeVisible();

    await page.goBack();
    await page.waitForTimeout(600);
    await expect(page.locator('#miraOverlay')).toBeHidden();
    await expect(page.locator('#map')).toBeVisible();
  });
});

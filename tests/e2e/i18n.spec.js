import { test, expect } from '@playwright/test';
import { preparaRete, apriPannello, cambiaLingua } from './fixtures.js';

// Apre la scheda a tutto schermo del primo aereo della lista.
async function apriSchedaPrimoAereo(page) {
  await apriPannello(page, '#btnBoard');
  await page.locator('#planeList .acrow').first().dispatchEvent('click');
  await page.waitForTimeout(600);
  await page.locator('.tag-box').click({ timeout: 5000 });
  await page.waitForTimeout(600);
}

test.describe('Traduzione completa dell interfaccia', () => {
  test('l icona di fase volo funziona anche in inglese', async ({ page }) => {
    // Il difetto: l'icona veniva scelta confrontando il testo GIA tradotto
    // (indexOf('SALITA')), quindi in inglese non corrispondeva mai nulla e
    // restava sempre l'aereo generico.
    await preparaRete(page);
    await page.goto('/');
    await apriPannello(page, '#btnSettings');
    await cambiaLingua(page, 'en');
    await page.locator('#btnSettings').dispatchEvent('click');
    await page.waitForTimeout(400);

    await apriSchedaPrimoAereo(page);
    await expect(page.locator('#shPhase')).toHaveClass(/show/);
    await expect(page.locator('#phaseTxt')).toContainText('CLIMBING');
    // Il primo aereo sale a +2432 ft/min: freccia in salita, non aereo generico
    await expect(page.locator('#phaseIco')).toHaveText('↗');
  });

  test('il campo assetto si traduce', async ({ page }) => {
    await preparaRete(page);
    await page.goto('/');
    await apriPannello(page, '#btnSettings');
    await cambiaLingua(page, 'en');
    await page.locator('#btnSettings').dispatchEvent('click');
    await page.waitForTimeout(400);

    await apriSchedaPrimoAereo(page);
    // roll -0.35: entro la soglia, quindi "ali livellate"
    const assetto = await page.locator('#shRoll').textContent();
    expect(assetto).not.toBe('dritto');     // era italiano fisso
    expect(assetto.toLowerCase()).toContain('level');
  });

  test('il chip della posizione si traduce', async ({ page }) => {
    await preparaRete(page);
    await page.goto('/');
    await apriPannello(page, '#btnSettings');
    await cambiaLingua(page, 'en');

    const chip = await page.locator('#locList .chip.loc').first().textContent();
    expect(chip).not.toContain('La mia posizione');   // era italiano fisso
    expect(chip).toContain('My position');
  });

  test('i suggerimenti dei pulsanti si traducono', async ({ page }) => {
    await preparaRete(page);
    await page.goto('/');
    await apriPannello(page, '#btnSettings');
    await cambiaLingua(page, 'en');
    await page.locator('#btnSettings').dispatchEvent('click');
    await page.waitForTimeout(400);

    // title e aria-label restavano in italiano: non esisteva alcun
    // meccanismo che li traducesse
    const titolo = await page.locator('#btnSettings').getAttribute('title');
    expect(titolo).not.toBe('Impostazioni');
  });

  test('gli aerei senza compagnia si traducono', async ({ page }) => {
    // "Privato" era scritto a mano in domain.js
    await preparaRete(page, () => ({
      ac: [{ hex: 'abc001', flight: '', t: 'C172', alt_baro: 3000,
             gs: 90, track: 45, lat: 41.5, lon: 12.6, dst: 5 }],
      msg: 'No error', total: 1
    }));
    await page.goto('/');
    await apriPannello(page, '#btnSettings');
    await cambiaLingua(page, 'en');
    await page.locator('#btnSettings').dispatchEvent('click');
    await page.waitForTimeout(400);
    await apriPannello(page, '#btnBoard');

    const testo = await page.locator('#planeList').innerText();
    expect(testo).not.toContain('Privato');
    expect(testo).toContain('Private');
  });
});

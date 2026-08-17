import { test, expect } from '@playwright/test';
import { preparaRete, rispostaOk, ANZIO } from './fixtures.js';

// Un aereo VICINO e ALTO, quindi con elevazione grande: a 1-2 gradi
// sull'orizzonte un errore di segno sull'asse verticale non si distingue dal
// rumore, e un test che lo usasse passerebbe anche col difetto presente.
// Questo sta a ~3,3 km e 10000 ft: 43 gradi sopra l'orizzonte.
const AEREO_ALTO = {
  hex: '4cad5c', flight: 'ITY088  ', r: 'EI-HHT', t: 'BCS1',
  desc: 'AIRBUS A220-100', alt_baro: 10000, gs: 270, track: 45,
  baro_rate: 0, lat: 41.4779, lon: 12.6285, dst: 2
};

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
async function orienta(page, alpha, beta, gamma = 0, tipo = 'deviceorientationabsolute') {
  await page.evaluate(([a, b, g, t]) => {
    for (let i = 0; i < 60; i++) {
      const ev = new DeviceOrientationEvent(t, { alpha: a, beta: b, gamma: g });
      Object.defineProperty(ev, 'absolute', { value: t === 'deviceorientationabsolute' });
      window.dispatchEvent(ev);
    }
  }, [alpha, beta, gamma, tipo]);
  await page.waitForTimeout(150);
}

/** Assetto (alpha, beta) che punta a un dato azimut/elevazione, con gamma 0. */
function assettoVerso(azimut, elevazione) {
  return [(360 - azimut) % 360, 90 + elevazione];
}

/** Azimut ed elevazione di un aereo visto da un punto di osservazione. */
function bersaglio(centro, ac) {
  const R = Math.PI / 180, R_T = 6371000;
  const lat1 = centro.lat * R, lat2 = ac.lat * R, dLon = (ac.lon - centro.lon) * R;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const d = 2 * R_T * Math.asin(Math.sqrt(
    Math.sin((lat2 - lat1) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2));
  return {
    azimut: (Math.atan2(y, x) / R + 360) % 360,
    elevazione: Math.atan2(ac.alt_baro * 0.3048, d) / R
  };
}

/** Lo scarto in gradi mostrato dentro al cerchio. */
async function gradiMancanti(page) {
  const t = await page.locator('#miraGradi').textContent();
  return t === '--' ? null : parseInt(t, 10);
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

  test('puntando il telefono verso l aereo, il bersaglio entra nel cerchio', async ({ page }) => {
    // LA prova che protegge il difetto segnalato: "l'aereo non riesce mai a
    // entrare nel cerchio, passa da un lato all'altro". Prima falliva perche
    // l'azimut veniva da alpha grezzo e saltava; adesso viene dal versore di
    // puntamento ricostruito con la matrice di rotazione.
    await preparaRete(page, () => rispostaOk([AEREO_ALTO]));
    await page.goto('/');
    await page.waitForTimeout(1400);
    await apriMira(page);

    const b = bersaglio(ANZIO, AEREO_ALTO);
    expect(b.elevazione).toBeGreaterThan(35);   // il test discrimina solo se e alto

    // Prima si guarda dalla parte opposta: deve dire che manca molto
    await orienta(page, ...assettoVerso((b.azimut + 180) % 360, 0));
    expect(await gradiMancanti(page)).toBeGreaterThan(90);
    await expect(page.locator('#miraBox')).not.toHaveClass(/agganciato/);

    // Poi si punta il telefono verso l'aereo: deve agganciare
    await orienta(page, ...assettoVerso(b.azimut, b.elevazione));
    expect(await gradiMancanti(page)).toBeLessThan(10);
    await expect(page.locator('#miraBox')).toHaveClass(/agganciato/);
  });

  test('alzare il telefono avvicina il bersaglio, non lo allontana', async ({ page }) => {
    // Il segno dell'asse verticale. Con l'elevazione invertita si insegue il
    // bersaglio nella direzione sbagliata e lo si supera di continuo: e meta
    // del "passa da un lato all'altro" segnalato.
    await preparaRete(page, () => rispostaOk([AEREO_ALTO]));
    await page.goto('/');
    await page.waitForTimeout(1400);
    await apriMira(page);

    const b = bersaglio(ANZIO, AEREO_ALTO);
    // Puntato all'orizzonte nella direzione giusta: manca solo l'alzata
    await orienta(page, ...assettoVerso(b.azimut, 0));
    const conTelefonoBasso = await gradiMancanti(page);

    // Alzandolo verso l'aereo lo scarto deve CALARE
    await orienta(page, ...assettoVerso(b.azimut, b.elevazione));
    const conTelefonoAlzato = await gradiMancanti(page);

    expect(conTelefonoAlzato).toBeLessThan(conTelefonoBasso);
    expect(conTelefonoAlzato).toBeLessThan(10);
  });

  test('due flussi di sensori insieme non fanno rimbalzare il bersaglio', async ({ page }) => {
    // Su Android arrivano DUE eventi: 'deviceorientationabsolute' con alpha
    // riferito al Nord vero, e 'deviceorientation' che puo averlo riferito a
    // dov'era il telefono all'avvio. Ascoltandoli entrambi, l'azimut saltava
    // fra due riferimenti 60 volte al secondo. E il difetto segnalato.
    await preparaRete(page);
    await page.goto('/');
    await page.waitForTimeout(1200);
    await apriMira(page);

    // Il telefono resta FERMO su un assetto per tutta la prova. L'unica cosa
    // che cambia e quale flusso sta parlando in quel momento.
    await orienta(page, 0, 120, 0, 'deviceorientationabsolute');

    // Si campiona DURANTE l'alternanza, non solo alla fine: col difetto
    // presente lo stato finale torna a posto ma nel mezzo il bersaglio
    // rimbalza, ed e proprio il rimbalzo che rende impossibile centrarlo.
    const letture = [];
    for (let i = 0; i < 4; i++) {
      await orienta(page, 140, 120, 0, 'deviceorientation');
      letture.push(await gradiMancanti(page));
      await orienta(page, 0, 120, 0, 'deviceorientationabsolute');
      letture.push(await gradiMancanti(page));
    }

    const min = Math.min(...letture), max = Math.max(...letture);
    expect(max - min).toBeLessThan(8);
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

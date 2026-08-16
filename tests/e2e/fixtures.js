// Dati e utilita condivise dalle prove end-to-end.
//
// I dati NON sono inventati: sono risposte reali di opendata.adsb.fi
// catturate sul campo il 2026-08-12 sopra Fiumicino. Verificare la logica
// contro risposte autentiche evita di scrivere test che passano solo perche
// il finto server risponde come ce lo immaginiamo noi.

export const ANZIO = { lat: 41.4479, lon: 12.6285 };

// Due aerei reali: uno in salita, uno in atterraggio.
export const AEREI_REALI = [
  { hex: '4cad5c', type: 'adsb_icao', flight: 'ITY088  ', r: 'EI-HHT', t: 'BCS1',
    desc: 'AIRBUS A220-100', alt_baro: 4875, alt_geom: 5325, gs: 270.8, mach: 0.412,
    wd: 284, ws: 14, oat: 20, track: 204.20, roll: -0.35, baro_rate: 2432,
    geom_rate: 2624, squawk: '1000', category: 'A3', nav_altitude_mcp: 16992,
    lat: 41.722366, lon: 12.093887, dst: 8.393, dir: 236.4 },
  { hex: '4cade8', type: 'adsb_icao', flight: 'ITY1726 ', r: 'EI-HOH', t: 'A20N',
    desc: 'AIRBUS A-320neo', alt_baro: 225, alt_geom: 425, gs: 152.1, mach: 0.212,
    wd: 283, ws: 17, track: 162.40, roll: -0.18, baro_rate: -768,
    geom_rate: -768, squawk: '1000', category: 'A3', nav_altitude_mcp: 2016,
    lat: 41.855072, lon: 12.257621, dst: 3.328, dir: 5.9 }
];

export function rispostaOk(ac = AEREI_REALI) {
  return { ac: ac, msg: 'No error', now: Date.now(), total: ac.length, ptime: 0 };
}

// Come adsb.fi comunica un rifiuto: HTTP 200 con l'errore nel corpo.
export function rispostaRifiutata(msg = 'rate limited') {
  return { ac: [], msg: msg, now: Date.now(), total: 0 };
}

/**
 * Prepara la pagina: intercetta la fonte dati e blocca tutto il resto della
 * rete (tile, incendi, foto, rotte), cosi le prove non dipendono da servizi
 * esterni ne li disturbano.
 *
 * @param {import('@playwright/test').Page} page
 * @param {() => object} rispondi  cosa restituire a ogni chiamata dei voli
 * @returns {Promise<{urls: string[]}>} elenco vivo degli URL richiesti
 */
export async function preparaRete(page, rispondi = () => rispostaOk()) {
  const urls = [];
  await page.route('**/adsb/**', (route) => {
    urls.push(route.request().url());
    const r = rispondi();
    if (r === null) return;                    // richiesta lasciata appesa
    if (r && r.__abort) return route.abort('failed');
    route.fulfill({ json: r });
  });
  for (const p of [
    '**/server.arcgisonline.com/**', '**basemaps.cartocdn.com/**',
    '**maps.effis.emergency.copernicus.eu/**', '**adsbdb.com/**',
    '**planespotters.net/**', '**nominatim.openstreetmap.org/**'
  ]) {
    await page.route(p, (route) => route.abort());
  }
  return { urls };
}

/** Permette alle prove di fingere che l'app sia finita in secondo piano. */
export async function abilitaControlloVisibilita(page) {
  await page.addInitScript(() => {
    let nascosta = false;
    Object.defineProperty(document, 'hidden', { get: () => nascosta, configurable: true });
    Object.defineProperty(document, 'visibilityState',
      { get: () => (nascosta ? 'hidden' : 'visible'), configurable: true });
    window.__setNascosta = (v) => {
      nascosta = v;
      document.dispatchEvent(new Event('visibilitychange'));
    };
  });
}

/** Testo del banner rosso, o null se non e visibile. */
export async function bannerErrore(page) {
  return page.evaluate(() => {
    const e = document.getElementById('errBar');
    return getComputedStyle(e).display === 'none' ? null : e.textContent.trim();
  });
}

/** Cambia lingua dai chip in impostazioni (il pannello dev'essere aperto). */
export async function cambiaLingua(page, lang) {
  await page.locator(`#langChips .chip[data-lang="${lang}"]`).dispatchEvent('click');
  await page.waitForTimeout(300);
}

/** Apre un pannello scavalcando eventuali sovrapposizioni di altri pannelli. */
export async function apriPannello(page, idPulsante) {
  await page.locator(idPulsante).dispatchEvent('click');
  await page.waitForTimeout(500);
}

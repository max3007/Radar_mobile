import { describe, it, expect, vi } from 'vitest';
import {
  creaCoda, ErroreVoli, isCrossOrigin, classificaBlocco, creaCanaleVoli
} from '../src/rete.js';

// Fonte finta con la stessa forma di una voce di PLANES_SOURCES.
const FONTE = {
  errorOf: function (data) {
    if (!data) return null;
    var m = data.msg;
    return (typeof m === 'string' && m.toLowerCase() !== 'no error') ? m : null;
  }
};

function risposta(body, ok = true, status = 200) {
  return { ok: ok, status: status, json: async () => body };
}

function canale(opz = {}) {
  return creaCanaleVoli({
    fonte: FONTE,
    abilitata: opz.abilitata !== false,
    diag: opz.diag || (() => {}),
    fetchImpl: opz.fetchImpl,
    online: opz.online || (() => true),
    gapMs: opz.gapMs != null ? opz.gapMs : 0
  }).chiediVoli;
}

describe('creaCoda', () => {
  it('lascia passare subito la prima richiesta', async () => {
    const t0 = Date.now();
    await creaCoda(1100)();
    expect(Date.now() - t0).toBeLessThan(50);
  });

  it('distanzia le richieste ravvicinate', async () => {
    // Il caso reale: polling nel raggio e scansione a 250 NM partono insieme
    // quando IN ARRIVO e aperto. Senza coda la seconda veniva rifiutata e in
    // app si leggeva "SEGNALE PERSO" senza motivo.
    const turno = creaCoda(120);
    const t0 = Date.now();
    await turno();
    await turno();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(110);
  });

  it('prenota i turni in ordine, non tutti nello stesso istante', async () => {
    const turno = creaCoda(60);
    const t0 = Date.now();
    await Promise.all([turno(), turno(), turno()]);
    // La terza deve aspettare due intervalli, non zero
    expect(Date.now() - t0).toBeGreaterThanOrEqual(110);
  });
});

describe('ErroreVoli', () => {
  it('conserva chiave e parametri, non la frase tradotta', () => {
    // E la ragione per cui esiste: il banner deve poter essere ridisegnato in
    // un'altra lingua dopo che l'errore e gia avvenuto.
    const e = ErroreVoli('err.http', { code: 503 });
    expect(e.whyKey).toBe('err.http');
    expect(e.whyParams).toEqual({ code: 503 });
    expect(e.sospeso).toBe(false);
  });

  it('marca a parte il caso dati sospesi', () => {
    expect(ErroreVoli('hud.apiSuspended', null, true).sospeso).toBe(true);
  });
});

describe('classificaBlocco', () => {
  it('non fa partire nessuna sonda su un URL del nostro dominio', async () => {
    // Con l'inoltro da vercel.json le chiamate sono a /adsb/...: il CORS non
    // entra in gioco, quindi la sonda non potrebbe dire nulla di utile e
    // sprecherebbe il turno in coda proprio mentre la fonte sta rifiutando.
    const spia = vi.fn();
    const esito = await classificaBlocco('/adsb/v3/lat/41/lon/12/dist/100', spia, 'https://radar.app');
    expect(esito).toBe('err.blocked');
    expect(spia).not.toHaveBeenCalled();
  });

  it('riconosce il CORS solo su un altro dominio', async () => {
    const ok = vi.fn(async () => ({}));
    const esito = await classificaBlocco('https://altro.example/api', ok, 'https://radar.app');
    expect(esito).toBe('err.cors');
    expect(ok).toHaveBeenCalled();
  });

  it('se anche la sonda fallisce, e blocco e non CORS', async () => {
    const ko = vi.fn(async () => { throw new Error('rete giu'); });
    expect(await classificaBlocco('https://altro.example/api', ko, 'https://radar.app')).toBe('err.blocked');
  });

  it('isCrossOrigin ignora gli URL relativi', () => {
    expect(isCrossOrigin('/adsb/v3/lat/41', 'https://radar.app')).toBe(false);
    expect(isCrossOrigin('https://radar.app/adsb/x', 'https://radar.app')).toBe(false);
    expect(isCrossOrigin('https://opendata.adsb.fi/api', 'https://radar.app')).toBe(true);
  });
});

describe('chiediVoli', () => {
  it('restituisce i dati quando va tutto bene', async () => {
    const dati = { ac: [{ hex: 'abc' }], msg: 'No error' };
    const c = canale({ fetchImpl: async () => risposta(dati) });
    expect(await c('/adsb/x')).toEqual(dati);
  });

  it('con le richieste sospese non tocca la rete', async () => {
    // L'interruttore generale era aggirabile: la sonda partiva comunque e
    // sovrascriveva il banner corretto con "SEGNALE PERSO".
    const spia = vi.fn();
    const c = canale({ abilitata: false, fetchImpl: spia });
    await expect(c('/adsb/x')).rejects.toMatchObject({
      whyKey: 'hud.apiSuspended', sospeso: true
    });
    expect(spia).not.toHaveBeenCalled();
  });

  it('riporta il codice quando la risposta HTTP non e valida', async () => {
    const c = canale({ fetchImpl: async () => risposta(null, false, 429) });
    await expect(c('/adsb/x')).rejects.toMatchObject({
      whyKey: 'err.http', whyParams: { code: 429 }
    });
  });

  it('riconosce il rifiuto scritto nel corpo di una risposta 200', async () => {
    // Come adsb.fi (e prima airplanes.live) comunicano un blocco: HTTP 200
    // con l'errore nel corpo. Senza questo controllo la ricerca volo diceva
    // "volo non in volo" invece del vero motivo.
    const c = canale({ fetchImpl: async () => risposta({ ac: [], msg: 'rate limited' }) });
    await expect(c('/adsb/x')).rejects.toMatchObject({
      whyKey: 'err.apiSaid', whyParams: { msg: 'rate limited' }
    });
  });

  it('tronca i messaggi lunghi della fonte', async () => {
    const lungo = 'x'.repeat(200);
    const c = canale({ fetchImpl: async () => risposta({ msg: lungo }) });
    await c('/adsb/x').catch((e) => {
      expect(e.whyParams.msg).toHaveLength(90);
    });
  });

  it('distingue offline da bloccato', async () => {
    const c = canale({
      online: () => false,
      fetchImpl: async () => { throw new Error('fallita'); }
    });
    await expect(c('/adsb/x')).rejects.toMatchObject({ whyKey: 'err.offline' });
  });

  it('online ma richiesta fallita e un blocco, non un offline', async () => {
    const c = canale({
      online: () => true,
      fetchImpl: async () => { throw new Error('fallita'); }
    });
    await expect(c('/adsb/x')).rejects.toMatchObject({ whyKey: 'err.blocked' });
  });

  it('annota in diagnostica ogni URL chiamato', async () => {
    const visti = [];
    const c = canale({
      diag: (url) => { if (url) visti.push(url); },
      fetchImpl: async () => risposta({ msg: 'No error' })
    });
    await c('/adsb/v3/lat/41/lon/12/dist/100');
    expect(visti).toEqual(['/adsb/v3/lat/41/lon/12/dist/100']);
  });
});

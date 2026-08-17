import { describe, it, expect } from 'vitest';
import { guidaMira, LOCK_IN, LOCK_OUT, SCALE_DEG } from '../src/funzioni/mira.js';

// Scorciatoia: due assi, entrambi col sensore di inclinazione disponibile.
function g(diffAz, diffEl, eraAgganciato = false) {
  return guidaMira(diffAz, diffEl, true, eraAgganciato, null);
}

describe('Isteresi: aggancio e sgancio', () => {
  // Il motivo per cui le soglie sono due e non una: con una sola, sul bordo
  // il mirino alternava di continuo tra "allineato" e "non allineato" a ogni
  // micro-movimento della mano. La differenza si vede solo passando per uno
  // stato precedente, cioe' proprio quello che un test puo fare e un occhio no.

  it('si aggancia quando entrambi gli assi sono sotto la soglia stretta', () => {
    expect(g(3, 2).agganciato).toBe(true);
  });

  it('non si aggancia se anche un solo asse e fuori', () => {
    expect(g(3, 20).agganciato).toBe(false);
    expect(g(20, 3).agganciato).toBe(false);
  });

  it('una volta agganciato non si sgancia nella zona intermedia', () => {
    // 10 gradi: oltre LOCK_IN (8) ma sotto LOCK_OUT (15). Da fermo non
    // aggancerebbe, ma se era gia agganciato deve restarci.
    const intermedio = (LOCK_IN + LOCK_OUT) / 2;
    expect(g(intermedio, 0, false).agganciato).toBe(false);
    expect(g(intermedio, 0, true).agganciato).toBe(true);
  });

  it('si sgancia solo oltre la soglia larga', () => {
    expect(g(LOCK_OUT + 1, 0, true).agganciato).toBe(false);
  });

  it('agganciato, il mirino sta fermo al centro', () => {
    // Fermo apposta: inseguire i decimi di grado quando ormai ci siamo
    // produce solo tremolio.
    const r = g(2, 2, true);
    expect(r.sinistraPct).toBe(50);
    expect(r.altoPct).toBe(50);
    expect(r.statoKey).toBe('mira.aligned');
    expect(r.subKey).toBe('mira.framed');
  });
});

describe('Dove va il mirino', () => {
  it('al centro quando non c e niente da correggere', () => {
    const r = g(0, 0);
    expect(r.sinistraPct).toBe(50);
    expect(r.altoPct).toBe(50);
  });

  it('a destra se il bersaglio e a destra', () => {
    expect(g(30, 0).sinistraPct).toBeGreaterThan(50);
  });

  it('in alto se il bersaglio e piu alto', () => {
    // altoPct piu piccolo = piu vicino al bordo superiore
    expect(g(0, 30).altoPct).toBeLessThan(50);
  });

  it('non esce mai dal mirino, per quanto sia lontano', () => {
    // Senza il limite, un bersaglio a 180 gradi finirebbe fuori dallo schermo
    // e l'utente non vedrebbe piu nulla da seguire.
    for (const az of [90, 179, -179, -90]) {
      const r = g(az, 120);
      expect(r.sinistraPct).toBeGreaterThanOrEqual(5);
      expect(r.sinistraPct).toBeLessThanOrEqual(95);
      expect(r.altoPct).toBeGreaterThanOrEqual(5);
      expect(r.altoPct).toBeLessThanOrEqual(95);
    }
  });

  it('al bordo esatto della scala tocca il limite', () => {
    expect(g(SCALE_DEG, 0).sinistraPct).toBe(95);
    expect(g(-SCALE_DEG, 0).sinistraPct).toBe(5);
  });
});

describe('Cosa dice all utente', () => {
  it('indica il verso della rotazione e di quanto', () => {
    expect(g(30, 0)).toMatchObject({ statoKey: 'mira.right', statoParams: { n: 30 } });
    expect(g(-30, 0)).toMatchObject({ statoKey: 'mira.left', statoParams: { n: 30 } });
  });

  it('indica se alzare o abbassare', () => {
    expect(g(0, 30)).toMatchObject({ subKey: 'mira.up', subParams: { n: 30 } });
    expect(g(0, -30)).toMatchObject({ subKey: 'mira.down', subParams: { n: 30 } });
  });

  it('dice che un asse e a posto anche se l altro no', () => {
    // Le due righe ci sono sempre entrambe: cosi l'altezza del blocco non
    // cambia mai e il mirino non trasla mentre lo si sta seguendo.
    const r = g(2, 40);
    expect(r.statoKey).toBe('mira.rotOk');
    expect(r.subKey).toBe('mira.up');
  });

  it('restituisce chiavi di traduzione, non frasi', () => {
    // Se restituisse testo tradotto, il mirino resterebbe nella lingua in cui
    // e stato aperto. E il difetto che abbiamo gia corretto altrove.
    const r = g(30, 30);
    expect(r.statoKey).toMatch(/^mira\./);
    expect(r.subKey).toMatch(/^mira\./);
  });
});

describe('Telefono senza sensore di inclinazione', () => {
  it('guida solo in rotazione e mostra l elevazione da raggiungere', () => {
    const r = guidaMira(30, null, false, false, 42);
    expect(r.statoKey).toBe('mira.right');
    expect(r.subKey).toBe('mira.elevOf');
    expect(r.subParams).toEqual({ v: '42°' });
    expect(r.altoPct).toBe(50);   // niente da dire sull'asse verticale
  });

  it('con elevazione sconosciuta lo dichiara invece di inventare', () => {
    expect(guidaMira(30, null, false, false, null).subParams).toEqual({ v: '--' });
  });

  it('senza inclinazione l aggancio dipende dalla sola rotazione', () => {
    expect(guidaMira(2, null, false, false, 10).agganciato).toBe(true);
  });
});

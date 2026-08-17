import { describe, it, expect } from 'vitest';
import { guidaMira, LOCK_IN, LOCK_OUT } from '../src/funzioni/mira.js';

// Scorciatoia: due assi, entrambi col sensore di inclinazione disponibile.
function g(diffAz, diffEl, eraAgganciato = false) {
  return guidaMira(diffAz, diffEl, true, eraAgganciato, null);
}

describe('Isteresi: aggancio e sgancio', () => {
  // Il motivo per cui le soglie sono due e non una: con una sola, sul bordo
  // il cerchio alternava di continuo tra "allineato" e "non allineato" a ogni
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
});

describe('Dove punta la freccia', () => {
  // Convenzione: 0 = su, 90 = destra, 180 = giu, -90 = sinistra. E la stessa
  // di rotate() in CSS, cosi il valore va usato tale e quale senza conversioni
  // a meta strada — che sono il posto dove un segno si perde.

  it('in alto se il bersaglio e piu alto', () => {
    expect(g(0, 30).angoloFreccia).toBe(0);
  });

  it('a destra se il bersaglio e a destra', () => {
    expect(g(30, 0).angoloFreccia).toBe(90);
  });

  it('in basso se il bersaglio e piu in basso', () => {
    expect(Math.abs(g(0, -30).angoloFreccia)).toBe(180);
  });

  it('a sinistra se il bersaglio e a sinistra', () => {
    expect(g(-30, 0).angoloFreccia).toBe(-90);
  });

  it('in diagonale quando serve correggere su entrambi gli assi', () => {
    // Stessa quantita sui due assi: esattamente a 45 gradi
    expect(g(30, 30).angoloFreccia).toBe(45);
    expect(g(-30, 30).angoloFreccia).toBe(-45);
    expect(g(30, -30).angoloFreccia).toBe(135);
  });

  it('indica la direzione anche con l aereo dietro le spalle', () => {
    // Il difetto del vecchio mirino mobile: oltre i 60 gradi il bersaglio
    // restava appiccicato al bordo, quindi proprio quando sei piu disorientato
    // smetteva di dire qualcosa di utile. La freccia no.
    const dietro = g(170, 0);
    expect(dietro.angoloFreccia).toBe(90);      // gira a destra
    expect(dietro.distanzaGradi).toBe(170);     // e ti dice quanto
  });

  it('agganciato non indica nessuna direzione', () => {
    // Quando ci sei, una freccia che punta da qualche parte confonde.
    expect(g(2, 2, true).angoloFreccia).toBe(0);
  });
});

describe('Quanti gradi mancano', () => {
  it('e lo scarto complessivo sui due assi, non uno dei due', () => {
    // 3-4-5: il classico triangolo, cosi il numero atteso non e arrotondato
    expect(g(30, 40).distanzaGradi).toBe(50);
  });

  it('su un asse solo coincide con quell asse', () => {
    expect(g(41, 0).distanzaGradi).toBe(41);
    expect(g(0, -25).distanzaGradi).toBe(25);
  });

  it('e sempre positivo, da qualunque parte sia il bersaglio', () => {
    for (const [az, el] of [[30, 40], [-30, 40], [30, -40], [-30, -40]]) {
      expect(g(az, el).distanzaGradi).toBe(50);
    }
  });

  it('resta visibile anche da agganciati', () => {
    // Utile: dice quanto sei preciso, non solo che ci sei
    expect(g(3, 4, true).distanzaGradi).toBe(5);
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
    // cambia mai e niente trasla mentre lo si sta seguendo.
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
  });

  it('la freccia resta sull orizzontale, senza inventare una verticale', () => {
    expect(guidaMira(30, null, false, false, 42).angoloFreccia).toBe(90);
    expect(guidaMira(-30, null, false, false, 42).angoloFreccia).toBe(-90);
  });

  it('i gradi contano solo la rotazione, non una precisione che non abbiamo', () => {
    expect(guidaMira(41, null, false, false, 42).distanzaGradi).toBe(41);
  });

  it('con elevazione sconosciuta lo dichiara invece di inventare', () => {
    expect(guidaMira(30, null, false, false, null).subParams).toEqual({ v: '--' });
  });

  it('senza inclinazione l aggancio dipende dalla sola rotazione', () => {
    expect(guidaMira(2, null, false, false, 10).agganciato).toBe(true);
  });
});

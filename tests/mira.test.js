import { describe, it, expect } from 'vitest';
import {
  guidaMira, LOCK_IN, LOCK_OUT, RAGGIO_CERCHIO, RAGGIO_MAX
} from '../src/funzioni/mira.js';

// Scorciatoia: due assi, entrambi col sensore di inclinazione disponibile.
function g(diffAz, diffEl, eraAgganciato = false) {
  return guidaMira(diffAz, diffEl, true, eraAgganciato);
}

/** Quanto dista dal centro l'aereo disegnato, in percentuale del riquadro. */
function raggio(r) {
  return Math.hypot(r.aereoX - 50, r.aereoY - 50);
}

describe('Isteresi: quando l aereo e dentro il cerchio', () => {
  // Il compito non e centrare l'aereo, e portarlo DENTRO il cerchio. Guardare
  // il cielo a occhio non e mai preciso al grado, e chiedere una centratura
  // perfetta renderebbe lo strumento nervoso senza aggiungere niente.
  //
  // Le soglie sono due e non una: con una sola, sul bordo l'indicazione
  // alternava di continuo tra "dentro" e "fuori" a ogni micro-movimento della
  // mano. La differenza si vede solo passando per uno stato precedente, cioe
  // proprio quello che un test puo fare e un occhio no.

  it('entra quando lo scarto complessivo sta sotto la soglia', () => {
    expect(g(3, 2).agganciato).toBe(true);
  });

  it('conta lo scarto sui DUE assi insieme, non uno alla volta', () => {
    // 8 e 8 stanno sotto soglia presi singolarmente, ma insieme fanno 11.3:
    // l'aereo e fuori dal cerchio, ed e li che si guarda.
    expect(g(8, 8).agganciato).toBe(false);
    expect(g(3, 20).agganciato).toBe(false);
    expect(g(20, 3).agganciato).toBe(false);
  });

  it('una volta dentro non esce nella zona intermedia', () => {
    const intermedio = (LOCK_IN + LOCK_OUT) / 2;
    expect(g(intermedio, 0, false).agganciato).toBe(false);
    expect(g(intermedio, 0, true).agganciato).toBe(true);
  });

  it('esce solo oltre la soglia larga', () => {
    expect(g(LOCK_OUT + 1, 0, true).agganciato).toBe(false);
  });
});

describe('Dove viene disegnato l aereo', () => {
  it('al centro quando non c e niente da correggere', () => {
    const r = g(0, 0);
    expect(r.aereoX).toBeCloseTo(50, 5);
    expect(r.aereoY).toBeCloseTo(50, 5);
  });

  it('alla soglia di aggancio tocca esattamente il bordo del cerchio', () => {
    // E l'ancoraggio che tiene insieme grafica e logica: se la curva e il
    // raggio del cerchio divergessero, l'aereo si accenderebbe di verde
    // mentre e ancora visibilmente fuori — o viceversa.
    expect(raggio(g(LOCK_IN, 0))).toBeCloseTo(RAGGIO_CERCHIO, 5);
    expect(raggio(g(0, LOCK_IN))).toBeCloseTo(RAGGIO_CERCHIO, 5);
  });

  it('dentro il cerchio quando e agganciato, fuori quando non lo e', () => {
    expect(raggio(g(4, 3))).toBeLessThan(RAGGIO_CERCHIO);
    expect(raggio(g(20, 0))).toBeGreaterThan(RAGGIO_CERCHIO);
  });

  it('a destra se il bersaglio e a destra, in alto se e piu alto', () => {
    expect(g(30, 0).aereoX).toBeGreaterThan(50);
    expect(g(-30, 0).aereoX).toBeLessThan(50);
    // Sullo schermo Y cresce verso il basso: piu in alto = valore minore
    expect(g(0, 30).aereoY).toBeLessThan(50);
    expect(g(0, -30).aereoY).toBeGreaterThan(50);
  });

  it('non esce mai dal riquadro, nemmeno col bersaglio alle spalle', () => {
    // Il difetto del vecchio mirino: oltre i 60 gradi il bersaglio restava
    // appiccicato al bordo e smetteva di dire qualcosa. Qui la curva e
    // compressiva, quindi l'aereo resta sempre dentro e sempre visibile.
    for (const [az, el] of [[179, 0], [-179, 0], [90, 90], [-120, -160]]) {
      expect(raggio(g(az, el))).toBeLessThan(RAGGIO_MAX);
    }
  });

  it('piu lontano e il bersaglio, piu lontano dal centro sta l aereo', () => {
    const vicino = raggio(g(5, 0));
    const medio = raggio(g(30, 0));
    const lontano = raggio(g(120, 0));
    expect(vicino).toBeLessThan(medio);
    expect(medio).toBeLessThan(lontano);
  });
});

describe('Come e orientato l aereo', () => {
  // Convenzione: 0 = su, 90 = destra, 180 = giu, -90 = sinistra. E la stessa
  // di rotate() in CSS, cosi il valore va usato tale e quale senza conversioni
  // a meta strada — che sono il posto dove un segno si perde.

  it('col muso nella direzione in cui devi girarti', () => {
    for (const [az, el, atteso] of [[0, 30, 0], [30, 0, 90], [-30, 0, -90], [30, 30, 45]]) {
      expect(g(az, el).angoloAereo).toBe(atteso);
    }
  });

  it('in basso se il bersaglio e sotto', () => {
    expect(Math.abs(g(0, -30).angoloAereo)).toBe(180);
  });

  it('si raddrizza quando e dentro il cerchio', () => {
    // Non c'e piu nessuna direzione da prendere: un muso ancora storto
    // direbbe "gira di la" proprio mentre l'app dice "ci sei".
    expect(g(3, 2, true).angoloAereo).toBe(0);
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

describe('Telefono senza sensore di inclinazione', () => {
  it('muove l aereo solo in orizzontale, senza inventare una verticale', () => {
    const destra = guidaMira(30, null, false, false);
    expect(destra.aereoY).toBe(50);
    expect(destra.aereoX).toBeGreaterThan(50);
    expect(guidaMira(-30, null, false, false).aereoX).toBeLessThan(50);
  });

  it('il muso resta sull orizzontale', () => {
    expect(guidaMira(30, null, false, false).angoloAereo).toBe(90);
    expect(guidaMira(-30, null, false, false).angoloAereo).toBe(-90);
  });

  it('i gradi contano solo la rotazione, non una precisione che non abbiamo', () => {
    expect(guidaMira(41, null, false, false).distanzaGradi).toBe(41);
  });

  it('l aggancio dipende dalla sola rotazione', () => {
    expect(guidaMira(2, null, false, false).agganciato).toBe(true);
    expect(guidaMira(30, null, false, false).agganciato).toBe(false);
  });
});

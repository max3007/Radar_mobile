import { describe, it, expect } from 'vitest';
import {
  guidaMira, direzionePuntata, vettorePuntamento,
  LOCK_IN, LOCK_OUT, RAGGIO_CERCHIO, RAGGIO_MAX
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

describe('Dove punta il telefono', () => {
  // E il calcolo che era sbagliato e rendeva impossibile centrare il
  // bersaglio. La versione precedente prendeva alpha come azimut e beta come
  // alzata: vale solo col telefono perfettamente verticale e senza rollio.
  // Alzandolo verso il cielo si finisce nel punto degenere degli angoli di
  // Eulero (beta 90°), dove alpha salta di decine di gradi a ogni filo di
  // inclinazione laterale.

  const gradi = (v) => Math.round(v * 10) / 10 + 0;   // + 0 normalizza -0
  /** Differenza fra due azimut, tenendo conto che sono circolari. */
  const scartoAz = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

  it('telefono verticale verso Nord: guarda a Nord, all orizzonte', () => {
    const d = direzionePuntata(0, 90, 0);
    expect(gradi(d.azimut)).toBe(0);
    expect(gradi(d.elevazione)).toBe(0);
  });

  it('gira il telefono e l azimut segue, nel verso giusto', () => {
    // alpha cresce in senso antiorario visto dall'alto, quindi l'azimut cala
    expect(gradi(direzionePuntata(90, 90, 0).azimut)).toBe(270);   // Ovest
    expect(gradi(direzionePuntata(180, 90, 0).azimut)).toBe(180);  // Sud
    expect(gradi(direzionePuntata(270, 90, 0).azimut)).toBe(90);   // Est
  });

  it('inclina il telefono all indietro e l elevazione sale', () => {
    expect(gradi(direzionePuntata(0, 120, 0).elevazione)).toBe(30);
    expect(gradi(direzionePuntata(0, 150, 0).elevazione)).toBe(60);
    expect(gradi(direzionePuntata(0, 180, 0).elevazione)).toBe(90);  // allo zenit
  });

  it('telefono piatto sul tavolo: guarda in basso', () => {
    // Schermo in su significa fotocamera verso terra: -90 di elevazione
    expect(gradi(direzionePuntata(0, 0, 0).elevazione)).toBe(-90);
  });

  it('il rollio laterale non manda in tilt l azimut', () => {
    // E il caso che rompeva tutto: telefono alzato verso il cielo e ruotato
    // di lato. Con la vecchia formula alpha saltava; qui l'azimut resta
    // ragionevole e l'elevazione pure.
    const dritto = direzionePuntata(0, 120, 0);
    const inclinato = direzionePuntata(0, 120, 20);
    expect(scartoAz(inclinato.azimut, dritto.azimut)).toBeLessThan(25);
    expect(Math.abs(inclinato.elevazione - dritto.elevazione)).toBeLessThan(25);
  });

  it('il versore ha sempre modulo 1, in qualunque assetto', () => {
    for (const [a, b, g] of [[0,90,0], [45,120,30], [200,45,-60], [330,170,80]]) {
      const v = vettorePuntamento(a, b, g);
      expect(Math.hypot(v[0], v[1], v[2])).toBeCloseTo(1, 10);
    }
  });

  it('l elevazione resta nei limiti fisici', () => {
    for (let a = 0; a < 360; a += 37) {
      for (let b = -180; b <= 180; b += 31) {
        for (let g = -90; g <= 90; g += 29) {
          const d = direzionePuntata(a, b, g);
          expect(d.elevazione).toBeGreaterThanOrEqual(-90.001);
          expect(d.elevazione).toBeLessThanOrEqual(90.001);
          expect(d.azimut).toBeGreaterThanOrEqual(0);
          expect(d.azimut).toBeLessThan(360.001);
        }
      }
    }
  });
});

describe('Centrare il bersaglio converge', () => {
  // La prova che il difetto segnalato non torna: puntando il telefono nella
  // direzione del bersaglio, lo scarto deve andare a zero e l'aereo entrare
  // nel cerchio. Prima oscillava da un lato all'altro senza mai entrare.

  /** Assetto del telefono che punta a un dato azimut/elevazione (gamma 0). */
  function assettoVerso(azimut, elevazione) {
    return [(360 - azimut) % 360, 90 + elevazione, 0];
  }

  it('l assetto che punta al bersaglio azzera lo scarto', () => {
    for (const [az, el] of [[0, 0], [90, 20], [215, 45], [300, -10]]) {
      const d = direzionePuntata(...assettoVerso(az, el));
      expect(((d.azimut - az + 540) % 360) - 180).toBeCloseTo(0, 6);
      expect(d.elevazione).toBeCloseTo(el, 6);
    }
  });

  it('e con scarto zero l aereo e dentro al cerchio', () => {
    const r = guidaMira(0, 0, true, false);
    expect(r.agganciato).toBe(true);
    expect(Math.hypot(r.aereoX - 50, r.aereoY - 50)).toBeLessThan(RAGGIO_CERCHIO);
  });

  it('avvicinandosi al bersaglio lo scarto cala in modo monotono', () => {
    // Nessun rimbalzo: ogni passo verso il bersaglio riduce la distanza.
    const BERSAGLIO_AZ = 120, BERSAGLIO_EL = 30;
    let precedente = Infinity;
    for (const passo of [0, 20, 40, 60, 80, 100]) {
      const az = BERSAGLIO_AZ - 90 + (90 * passo / 100);
      const el = BERSAGLIO_EL - 40 + (40 * passo / 100);
      const d = direzionePuntata(...assettoVerso(az, el));
      const diffAz = ((BERSAGLIO_AZ - d.azimut + 540) % 360) - 180;
      const diffEl = BERSAGLIO_EL - d.elevazione;
      const scarto = guidaMira(diffAz, diffEl, true, false).distanzaGradi;
      expect(scarto).toBeLessThan(precedente);
      precedente = scarto;
    }
    expect(precedente).toBe(0);
  });
});

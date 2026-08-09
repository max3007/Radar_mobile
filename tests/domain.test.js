import { describe, it, expect, beforeAll } from 'vitest';
import {
  airlineName, toCallsign, fmtFlight, altColor, planeColor, compass,
  bearingBetween, bearingFromCenter, elevationAngle, destPoint,
  emergencyInfo, flightPhase, routeConsistent, nextPass, landingBeforePass,
  isOnGround, altLabel, isFirefightingAircraft
} from '../src/domain.js';
import { setLang } from '../src/i18n.js';

// I test asseriscono le stringhe italiane: fissa la lingua
beforeAll(() => setLang('it'));

const ANZIO = [41.4479, 12.6285];

describe('airlineName', () => {
  it('riconosce un codice ICAO noto', () => {
    expect(airlineName('ITY610')).toBe('ITA Airways');
    expect(airlineName('RYR78YR')).toBe('Ryanair');
  });
  it('normalizza spazi e minuscole del callsign', () => {
    expect(airlineName('  ity610 ')).toBe('ITA Airways');
  });
  it('callsign vuoto o mancante -> Privato', () => {
    expect(airlineName('')).toBe('Privato');
    expect(airlineName(null)).toBe('Privato');
  });
  it('codice a 3 lettere ignoto -> restituisce il codice', () => {
    expect(airlineName('XQX123')).toBe('XQX');
  });
  it('callsign non standard (niente 3 lettere iniziali) -> Privato', () => {
    expect(airlineName('I2345')).toBe('Privato');
  });
  it('tronca i nomi oltre 26 caratteri con ellissi', () => {
    const name = airlineName('AVA123'); // Avianca - Aerovias Nacionales de Colombia
    expect(name.length).toBeLessThanOrEqual(26);
    expect(name.endsWith('…')).toBe(true);
  });
});

describe('toCallsign', () => {
  it('lascia invariato un callsign gia ICAO', () => {
    expect(toCallsign('ITY610')).toBe('ITY610');
  });
  it('converte un numero di volo IATA in ICAO', () => {
    expect(toCallsign('AZ610')).toBe('ITY610');
    expect(toCallsign('FR1234')).toBe('RYR1234');
    expect(toCallsign('U21234')).toBe('EZY1234');
  });
  it('normalizza spazi e minuscole', () => {
    expect(toCallsign(' az 610 ')).toBe('ITY610');
  });
  it('prefisso IATA ignoto -> restituisce la query normalizzata', () => {
    expect(toCallsign('Q9123')).toBe('Q9123');
  });
});

describe('fmtFlight', () => {
  it('separa prefisso e numero', () => {
    expect(fmtFlight('AZ610')).toBe('AZ 610');
    expect(fmtFlight('RYR1234')).toBe('RYR 1234');
  });
  it('input nullo -> null', () => {
    expect(fmtFlight(null)).toBeNull();
    expect(fmtFlight('')).toBeNull();
  });
  it('formato non riconosciuto -> invariato', () => {
    expect(fmtFlight('1234')).toBe('1234');
  });
});

describe('altColor', () => {
  it('selezionato -> bianco, sempre', () => {
    expect(altColor(35000, true)).toBe('#f2fff8');
    expect(altColor('ground', true)).toBe('#f2fff8');
  });
  it('a terra -> grigio', () => {
    expect(altColor('ground', false)).toBe('#5d7a6c');
  });
  it('quota ignota -> verde fosforo', () => {
    expect(altColor(null, false)).toBe('#34e08a');
  });
  it('fasce di quota', () => {
    expect(altColor(5000, false)).toBe('#ffb454');   // < 10k
    expect(altColor(15000, false)).toBe('#34e08a');  // 10-25k
    expect(altColor(35000, false)).toBe('#6fd3ff');  // > 25k
  });
});

describe('compass', () => {
  it('punti cardinali principali (in italiano)', () => {
    expect(compass(0)).toBe('N');
    expect(compass(90)).toBe('E');
    expect(compass(180)).toBe('S');
    expect(compass(270)).toBe('O');
    expect(compass(225)).toBe('SO');
    expect(compass(315)).toBe('NO');
  });
  it('normalizza oltre 360 e valori negativi', () => {
    expect(compass(450)).toBe('E');
    expect(compass(-90)).toBe('O');
  });
});

describe('bearingBetween / bearingFromCenter', () => {
  it('nord e est esatti', () => {
    expect(Math.round(bearingBetween(41, 12, 42, 12))).toBe(0);   // verso nord
    expect(Math.round(bearingBetween(0, 0, 0, 1))).toBe(90);      // verso est
  });
  it('bearingFromCenter usa il centro passato', () => {
    const north = bearingFromCenter(ANZIO, ANZIO[0] + 1, ANZIO[1]);
    expect(Math.round(north)).toBe(0);
  });
});

describe('elevationAngle', () => {
  it('aereo sulla verticale -> 90 gradi', () => {
    expect(elevationAngle(ANZIO, ANZIO[0], ANZIO[1], 35000)).toBe(90);
  });
  it('quota zero -> 0 gradi', () => {
    expect(elevationAngle(ANZIO, ANZIO[0] + 0.5, ANZIO[1], 0)).toBe(0);
  });
  it('cresce con la quota a pari distanza', () => {
    const low = elevationAngle(ANZIO, ANZIO[0] + 0.3, ANZIO[1], 10000);
    const high = elevationAngle(ANZIO, ANZIO[0] + 0.3, ANZIO[1], 35000);
    expect(high).toBeGreaterThan(low);
  });
});

describe('destPoint', () => {
  it('spostamento verso nord: cresce la latitudine', () => {
    const [lat, lon] = destPoint(41, 12, 0, 111320); // ~1 grado
    expect(lat).toBeCloseTo(42, 1);
    expect(lon).toBeCloseTo(12, 3);
  });
});

describe('routeConsistent', () => {
  const FCO = { lat: 41.8, lon: 12.25 };   // Roma Fiumicino
  const JFK = { lat: 40.64, lon: -73.78 }; // New York
  const YYZ = { lat: 43.68, lon: -79.63 }; // Toronto
  const CPH = { lat: 55.62, lon: 12.66 };  // Copenaghen

  it('aereo nel corridoio, prua verso destinazione -> plausibile', () => {
    // poco a ovest di Roma, prua ovest, rotta Roma -> New York
    const ac = { lat: 41.9, lon: 10.0, track: 285 };
    expect(routeConsistent(ac, { orig: FCO, dest: JFK })).toBe(true);
  });
  it('aereo lontanissimo dal corridoio -> scartata (caso AC882 sopra Roma)', () => {
    // Toronto -> Copenaghen passa sopra la Groenlandia, non sopra Roma
    const ac = { lat: 41.4, lon: 12.5, track: 125 };
    expect(routeConsistent(ac, { orig: YYZ, dest: CPH })).toBe(false);
  });
  it('aereo nel corridoio ma prua opposta (tratta di ritorno) -> scartata', () => {
    const ac = { lat: 41.9, lon: 10.0, track: 100 }; // punta verso Roma, non verso New York
    expect(routeConsistent(ac, { orig: FCO, dest: JFK })).toBe(false);
  });
  it('senza coordinate aeroporti -> non giudicabile, plausibile', () => {
    const ac = { lat: 41.4, lon: 12.5, track: 125 };
    expect(routeConsistent(ac, { orig: { iata: 'YYZ' }, dest: { iata: 'CPH' } })).toBe(true);
  });
  it('senza posizione aereo -> non giudicabile, plausibile', () => {
    expect(routeConsistent({ track: 125 }, { orig: YYZ, dest: CPH })).toBe(true);
  });
  it('senza prua vale solo il controllo geometrico', () => {
    const inCorridor = { lat: 41.9, lon: 10.0 };
    expect(routeConsistent(inCorridor, { orig: FCO, dest: JFK })).toBe(true);
    const offCorridor = { lat: 41.4, lon: 12.5 };
    expect(routeConsistent(offCorridor, { orig: YYZ, dest: CPH })).toBe(false);
  });
});

describe('emergencyInfo', () => {
  it('squawk di emergenza standard', () => {
    expect(emergencyInfo({ squawk: '7500' })).toBe('DIROTTAMENTO');
    expect(emergencyInfo({ squawk: '7600' })).toBe('RADIO GUASTA');
    expect(emergencyInfo({ squawk: '7700' })).toBe('EMERGENZA GENERALE');
  });
  it('campo emergency mappato', () => {
    expect(emergencyInfo({ emergency: 'lifeguard' })).toBe('VOLO SANITARIO');
    expect(emergencyInfo({ emergency: 'minfuel' })).toBe('CARBURANTE MINIMO');
  });
  it('emergency ignota -> testo generico maiuscolo', () => {
    expect(emergencyInfo({ emergency: 'boh' })).toBe('EMERGENZA: BOH');
  });
  it('nessuna emergenza -> null', () => {
    expect(emergencyInfo({})).toBeNull();
    expect(emergencyInfo({ emergency: 'none', squawk: '1000' })).toBeNull();
  });
});

describe('flightPhase', () => {
  it('a terra', () => {
    expect(flightPhase({ alt_baro: 'ground' })).toBe('A TERRA');
  });
  it('avvicinamento da nav_modes', () => {
    expect(flightPhase({ alt_baro: 3000, nav_modes: ['approach'] })).toBe('IN AVVICINAMENTO');
  });
  it('salita, con e senza quota target', () => {
    expect(flightPhase({ alt_baro: 12000, baro_rate: 1500 })).toBe('IN SALITA');
    expect(flightPhase({ alt_baro: 12000, baro_rate: 1500, nav_altitude_mcp: 36000 })).toBe('IN SALITA → FL360');
  });
  it('discesa, con arrivo sotto i 10k ft', () => {
    expect(flightPhase({ alt_baro: 20000, baro_rate: -1000 })).toBe('IN DISCESA');
    expect(flightPhase({ alt_baro: 8000, baro_rate: -1000 })).toBe('IN DISCESA / ARRIVO');
  });
  it('usa geom_rate se baro_rate manca', () => {
    expect(flightPhase({ alt_baro: 12000, geom_rate: 800 })).toBe('IN SALITA');
  });
  it('crociera sopra i 24k ft, altrimenti livellato', () => {
    expect(flightPhase({ alt_baro: 36000, baro_rate: 0 })).toBe('IN CROCIERA');
    expect(flightPhase({ alt_baro: 12000, baro_rate: 0 })).toBe('IN VOLO LIVELLATO');
  });
});

describe('nextPass (passaggio piu ravvicinato)', () => {
  const ANZIO = [41.4479, 12.6285];

  it('aereo a nord diretto a sud (verso il centro): sorvolo quasi sopra', () => {
    // ~0.5 gradi a nord (~30 NM), track 180 (verso sud), 450 kt
    const ac = { lat: ANZIO[0] + 0.5, lon: ANZIO[1], gs: 450, track: 180, alt_baro: 35000 };
    const r = nextPass(ANZIO, ac);
    expect(r).not.toBeNull();
    expect(r.dMinKm).toBeLessThan(1);          // passa praticamente sopra
    // 30 NM a 450 kt = 0.0667 h = 4 min circa
    expect(r.tMin).toBeGreaterThan(3);
    expect(r.tMin).toBeLessThan(5);
    expect(r.elevAtPass).toBeGreaterThan(80);  // quasi allo zenit
  });

  it('aereo che si allontana: null', () => {
    const ac = { lat: ANZIO[0] + 0.5, lon: ANZIO[1], gs: 450, track: 0, alt_baro: 35000 }; // va a nord
    expect(nextPass(ANZIO, ac)).toBeNull();
  });

  it('passaggio laterale: distanza minima pari all offset', () => {
    // aereo a nord che va verso est: passa alla distanza nord (~0.25 gradi = ~27 km)
    const ac = { lat: ANZIO[0] + 0.25, lon: ANZIO[1] - 0.5, gs: 400, track: 90, alt_baro: 30000 };
    const r = nextPass(ANZIO, ac);
    expect(r).not.toBeNull();
    expect(r.dMinKm).toBeGreaterThan(20);
    expect(r.dMinKm).toBeLessThan(32);
  });

  it('aereo a terra (rullaggio), fermo o senza dati: null', () => {
    expect(nextPass(ANZIO, { lat: 41.9, lon: 12.6, gs: 15, track: 180, alt_baro: 'ground' })).toBeNull();
    expect(nextPass(ANZIO, { lat: 41.9, lon: 12.6, gs: 10, track: 180, alt_baro: 3000 })).toBeNull();
    expect(nextPass(ANZIO, { lat: 41.9, lon: 12.6, gs: null, track: 180, alt_baro: 3000 })).toBeNull();
    expect(nextPass(ANZIO, { lat: null, lon: null, gs: 400, track: 180 })).toBeNull();
  });

  it('flag ground ma in volo veloce: NON scartato (viene proiettato)', () => {
    // caso EC4168: alt_baro 'ground' ma 200 kt in avvicinamento
    const ac = { lat: ANZIO[0] + 0.4, lon: ANZIO[1], gs: 200, track: 180, alt_baro: 'ground' };
    expect(nextPass(ANZIO, ac)).not.toBeNull();
  });
});

describe('landingBeforePass (falsi positivi: atterra prima)', () => {
  const ANZIO = [41.4479, 12.6285];
  const FCO = { icao: 'LIRF', iata: 'FCO', name: 'Roma Fiumicino', lat: 41.8003, lon: 12.2389 };
  const AIRPORTS = [FCO];

  it('aereo a nord in discesa verso FCO (che sta tra aereo e Anzio): atterra prima', () => {
    // aereo sopra/oltre FCO, in discesa marcata, rotta verso sud (verso FCO poi Anzio)
    const ac = { lat: 42.05, lon: 12.20, gs: 250, track: 170, alt_baro: 7000, baro_rate: -900 };
    const pass = nextPass(ANZIO, ac);
    expect(pass).not.toBeNull();
    const apt = landingBeforePass(ANZIO, ac, pass, AIRPORTS);
    expect(apt && apt.iata).toBe('FCO');
  });

  it('stesso corridoio ma in crociera alta e livellato: sorvola davvero, non escluso', () => {
    const ac = { lat: 42.05, lon: 12.20, gs: 450, track: 170, alt_baro: 36000, baro_rate: 0 };
    const pass = nextPass(ANZIO, ac);
    expect(landingBeforePass(ANZIO, ac, pass, AIRPORTS)).toBeNull();
  });

  it('aereo in decollo (in salita) sulla stessa rotta: non escluso', () => {
    const ac = { lat: 42.05, lon: 12.20, gs: 250, track: 170, alt_baro: 6000, baro_rate: 1800 };
    const pass = nextPass(ANZIO, ac);
    expect(landingBeforePass(ANZIO, ac, pass, AIRPORTS)).toBeNull();
  });

  it('approccio da sud: sorvola Anzio PRIMA di FCO (aeroporto oltre il passaggio): non escluso', () => {
    // aereo a sud di Anzio, in discesa, va a nord: passa su Anzio poi atterra a FCO (oltre)
    const ac = { lat: 41.10, lon: 12.70, gs: 250, track: 340, alt_baro: 9000, baro_rate: -700 };
    const pass = nextPass(ANZIO, ac);
    expect(pass).not.toBeNull();
    expect(landingBeforePass(ANZIO, ac, pass, AIRPORTS)).toBeNull();
  });

  it('nessun aeroporto vicino alla rotta: non escluso', () => {
    const ac = { lat: 42.05, lon: 12.20, gs: 250, track: 170, alt_baro: 7000, baro_rate: -900 };
    const pass = nextPass(ANZIO, ac);
    expect(landingBeforePass(ANZIO, ac, pass, [])).toBeNull();
  });
});

describe('isOnGround (falsi "ground" ad alta velocità)', () => {
  it('flag ground a velocità alta (in volo) -> non a terra', () => {
    expect(isOnGround({ alt_baro: 'ground', gs: 200 })).toBe(false); // caso EC4168
    expect(isOnGround({ alt_baro: 'ground', gs: 120 })).toBe(false);
  });
  it('flag ground a bassa velocità (rullaggio) -> a terra', () => {
    expect(isOnGround({ alt_baro: 'ground', gs: 15 })).toBe(true);
    expect(isOnGround({ alt_baro: 'ground', gs: null })).toBe(true);
  });
  it('quota numerica -> mai a terra', () => {
    expect(isOnGround({ alt_baro: 5000, gs: 10 })).toBe(false);
  });
});

describe('altLabel', () => {
  it('a terra vero -> TERRA / a terra', () => {
    expect(altLabel({ alt_baro: 'ground', gs: 10 })).toBe('TERRA');
    expect(altLabel({ alt_baro: 'ground', gs: 10 }, true)).toBe('a terra');
  });
  it('ground ma in volo veloce -> bassa quota', () => {
    expect(altLabel({ alt_baro: 'ground', gs: 200 })).toBe('bassa quota');
  });
  it('quota numerica -> valore in ft', () => {
    expect(altLabel({ alt_baro: 22000, gs: 400 })).toBe('22000 ft');
  });
});

describe('isFirefightingAircraft', () => {
  it('riconosce il codice tipo ICAO del Canadair CL-215T/CL-415', () => {
    expect(isFirefightingAircraft({ t: 'CL2T' })).toBe(true);
    expect(isFirefightingAircraft({ t: 'CL4T' })).toBe(true);
    expect(isFirefightingAircraft({ t: 'cl4t' })).toBe(true); // case-insensitive
  });
  it('riconosce dalla descrizione se il codice tipo manca o e diverso', () => {
    expect(isFirefightingAircraft({ desc: 'CANADAIR CL-415' })).toBe(true);
    expect(isFirefightingAircraft({ desc: 'Bombardier 415' })).toBe(true);
    expect(isFirefightingAircraft({ t: 'XXXX', desc: 'CL215' })).toBe(true);
  });
  it('aereo normale -> false', () => {
    expect(isFirefightingAircraft({ t: 'A320', desc: 'AIRBUS A320' })).toBe(false);
    expect(isFirefightingAircraft({})).toBe(false);
    expect(isFirefightingAircraft(null)).toBe(false);
  });
});

describe('planeColor', () => {
  it('aereo antincendio -> arancione dedicato, indipendente dalla quota', () => {
    expect(planeColor({ t: 'CL4T', alt_baro: 35000 }, false)).toBe('#ff6a00');
    expect(planeColor({ t: 'CL4T', alt_baro: 'ground', gs: 10 }, false)).toBe('#ff6a00');
  });
  it('selezionato -> sempre bianco, anche se antincendio', () => {
    expect(planeColor({ t: 'CL4T', alt_baro: 35000 }, true)).toBe('#f2fff8');
  });
  it('aereo normale -> segue la fascia di quota come prima', () => {
    expect(planeColor({ alt_baro: 5000 }, false)).toBe('#ffb454');
  });
});

describe('flightPhase con falsi ground', () => {
  it('ground a 200 kt -> non "A TERRA" ma in avvicinamento', () => {
    expect(flightPhase({ alt_baro: 'ground', gs: 200 })).toBe('IN AVVICINAMENTO');
  });
  it('ground fermo -> A TERRA', () => {
    expect(flightPhase({ alt_baro: 'ground', gs: 5 })).toBe('A TERRA');
  });
});

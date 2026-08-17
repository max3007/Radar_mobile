import { describe, it, expect, beforeAll } from 'vitest';
import { PLANES_SOURCES, PLANES_SOURCE } from '../src/config.js';
import { isOnGround, isGroundAlt, altLabel, flightPhase, planeColor, nextPass } from '../src/dominio/index.js';
import { setLang } from '../src/ui/i18n.js';

beforeAll(() => setLang('it'));

// Risposta REALE di adsb.fi (opendata.adsb.fi), catturata il 2026-08-12 su
// Fiumicino. Serve a verificare la logica contro dati veri e non inventati.
const ADSBFI_REAL = {
  "ac": [
    { "hex": "4cad5c", "type": "adsb_icao", "flight": "ITY088  ", "r": "EI-HHT", "t": "BCS1",
      "desc": "AIRBUS A220-100", "alt_baro": 4875, "alt_geom": 5325, "gs": 270.8, "mach": 0.412,
      "wd": 284, "ws": 14, "oat": 20, "track": 204.20, "roll": -0.35, "baro_rate": 2432,
      "geom_rate": 2624, "squawk": "1000", "category": "A3", "nav_altitude_mcp": 16992,
      "lat": 41.722366, "lon": 12.093887, "dst": 8.393, "dir": 236.4 },
    { "hex": "4cade8", "type": "adsb_icao", "flight": "ITY1726 ", "r": "EI-HOH", "t": "A20N",
      "desc": "AIRBUS A-320neo", "alt_baro": 225, "alt_geom": 425, "gs": 152.1, "mach": 0.212,
      "wd": 283, "ws": 17, "track": 162.40, "roll": -0.18, "baro_rate": -768,
      "geom_rate": -768, "squawk": "1000", "category": "A3", "nav_altitude_mcp": 2016,
      "lat": 41.855072, "lon": 12.257621, "dst": 3.328, "dir": 5.9 }
  ],
  "msg": "No error", "now": 1786891110001, "total": 2, "ctime": 1786891110001, "ptime": 0
};

// Com'e apparso il blocco di airplanes.live: HTTP 200 con un corpo di errore
const AIRPLANESLIVE_BLOCKED = {
  error: 'Please contact us at contact@airplanes.live. Your email MUST include a link to your project if you have one, a description of the project, and what your user base is.'
};

describe('fonte attiva', () => {
  it('PLANES_SOURCE punta a una fonte definita', () => {
    expect(PLANES_SOURCES[PLANES_SOURCE]).toBeDefined();
  });
  it('ogni fonte espone la stessa interfaccia', () => {
    for (const key of Object.keys(PLANES_SOURCES)) {
      const s = PLANES_SOURCES[key];
      expect(typeof s.point, key).toBe('function');
      expect(typeof s.callsign, key).toBe('function');
      expect(typeof s.errorOf, key).toBe('function');
      expect(typeof s.attribution, key).toBe('string');
    }
  });
});

describe('costruzione URL', () => {
  const fi = PLANES_SOURCES.adsbfi;
  const al = PLANES_SOURCES.airplaneslive;

  it('adsb.fi passa dal nostro dominio (/adsb), non da opendata.adsb.fi', () => {
    // Chiamare direttamente il loro host fa fallire il browser per CORS:
    // l'URL DEVE restare relativo, cioe same-origin. Vedi vercel.json.
    const u = fi.point(41.4479, 12.6285, 100);
    expect(u).toBe('/adsb/v3/lat/41.4479/lon/12.6285/dist/100');
    expect(u.startsWith('/')).toBe(true);
    expect(u).not.toContain('opendata.adsb.fi');
  });
  it('anche la ricerca per callsign resta same-origin', () => {
    expect(fi.callsign('ITY088')).toBe('/adsb/v2/callsign/ITY088');
  });
  it('airplanes.live usa la forma /v2/point/../../..', () => {
    expect(al.point(41.4479, 12.6285, 100))
      .toBe('https://api.airplanes.live/v2/point/41.4479/12.6285/100');
  });
  it('il callsign viene messo in URL-encoding', () => {
    expect(fi.callsign('ITY 088')).toContain('ITY%20088');
    expect(al.callsign('ITY 088')).toContain('ITY%20088');
  });
  it('coordinate negative (emisfero sud/ovest) restano intatte', () => {
    expect(fi.point(-33.87, -151.21, 50)).toBe('/adsb/v3/lat/-33.87/lon/-151.21/dist/50');
  });
});

describe('rilevamento errore, che cambia da fonte a fonte', () => {
  it('adsb.fi: "No error" NON e un errore', () => {
    expect(PLANES_SOURCES.adsbfi.errorOf(ADSBFI_REAL)).toBeNull();
  });
  it('adsb.fi: un msg diverso e un errore', () => {
    expect(PLANES_SOURCES.adsbfi.errorOf({ msg: 'rate limited' })).toBe('rate limited');
  });
  it('airplanes.live: riconosce il messaggio di blocco', () => {
    expect(PLANES_SOURCES.airplaneslive.errorOf(AIRPLANESLIVE_BLOCKED)).toContain('contact us');
  });
  it('nessuna delle due si confonde con una risposta valida', () => {
    expect(PLANES_SOURCES.airplaneslive.errorOf({ ac: [] })).toBeNull();
    expect(PLANES_SOURCES.adsbfi.errorOf({ ac: [] })).toBeNull();
  });
});

describe('i dati reali di adsb.fi passano nella logica esistente', () => {
  const [salita, atterraggio] = ADSBFI_REAL.ac;
  const ANZIO = [41.4479, 12.6285];

  it('la lista sta in "ac", come prima', () => {
    expect(Array.isArray(ADSBFI_REAL.ac)).toBe(true);
    expect(ADSBFI_REAL.ac.length).toBe(2);
  });
  it('nessuno dei due risulta a terra (sono entrambi in volo)', () => {
    expect(isOnGround(salita)).toBe(false);
    expect(isOnGround(atterraggio)).toBe(false);
  });
  it('riconosce la fase di volo dai ratei reali', () => {
    expect(flightPhase(salita)).toBe('IN SALITA → FL170');      // +2432 ft/min
    expect(flightPhase(atterraggio)).toBe('IN DISCESA / ARRIVO'); // -768 ft/min a 225 ft
  });
  it('etichetta di quota corretta', () => {
    expect(altLabel(salita)).toBe('4875 ft');
  });
  it('colora per fascia di quota', () => {
    expect(planeColor(salita, false)).toBe('#ffb454'); // sotto i 10k ft
  });
  it('il callsign con spazi finali non disturba', () => {
    expect(salita.flight.trim()).toBe('ITY088');
  });
  it('calcola un passaggio per l aereo in salita diretto a sud-ovest', () => {
    const p = nextPass(ANZIO, salita);
    expect(p).not.toBeNull();
    expect(p.tMin).toBeGreaterThan(0);
  });
});

describe('isGroundAlt (tolleranza sul formato della quota)', () => {
  it('riconosce le varianti di scrittura', () => {
    expect(isGroundAlt('ground')).toBe(true);
    expect(isGroundAlt('GROUND')).toBe(true);
    expect(isGroundAlt(' Ground ')).toBe(true);
  });
  it('una quota numerica non e "a terra"', () => {
    expect(isGroundAlt(225)).toBe(false);
    expect(isGroundAlt(0)).toBe(false);
    expect(isGroundAlt(null)).toBe(false);
  });
});

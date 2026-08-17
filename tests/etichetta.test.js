import { describe, it, expect, beforeEach } from 'vitest';
import { datiEtichetta } from '../src/dominio/index.js';
import { setLang } from '../src/ui/i18n.js';

// Un aereo vero, catturato sopra Fiumicino: ITA Airways in salita verso sud.
const ITY088 = {
  hex: '4cad5c', flight: 'ITY088  ', r: 'EI-HHT', t: 'BCS1',
  alt_baro: 4875, gs: 270.8, track: 204.2, baro_rate: 2432,
  lat: 41.722366, lon: 12.093887
};

const FIUMICINO = { iata: 'FCO', icao: 'LIRF', lat: 41.8003, lon: 12.2389 };
const CATANIA = { iata: 'CTA', icao: 'LICC', lat: 37.4668, lon: 15.0664 };

beforeEach(() => setLang('it'));

describe('datiEtichetta: cosa scrive', () => {
  it('senza rotta nota usa il callsign', () => {
    const d = datiEtichetta(ITY088, null);
    expect(d.numero).toBe('ITY088');
    expect(d.rotta).toBeNull();
  });

  it('senza callsign ripiega sul codice esadecimale', () => {
    const d = datiEtichetta({ ...ITY088, flight: '   ' }, null);
    expect(d.numero).toBe('4CAD5C');
  });

  it('con la rotta nota preferisce il numero di volo commerciale', () => {
    // AZA1234 e il callsign radio; AZ1234 e quello che l'utente riconosce.
    const d = datiEtichetta(ITY088, {
      flightIata: 'AZ088', orig: FIUMICINO, dest: CATANIA
    });
    expect(d.numero).toBe('AZ 088');   // fmtFlight stacca la sigla dal numero
  });

  it('formatta quota, velocita e direzione', () => {
    const d = datiEtichetta(ITY088, null);
    expect(d.quota).toBe('4875 ft');
    expect(d.velocita).toBe('271 kt');
    expect(d.direzione).toBe('204° SO');   // rosa a 8 punte, non a 16
  });

  it('regge un aereo senza velocita ne prua', () => {
    const d = datiEtichetta({ hex: 'abc123', flight: 'TEST123', alt_baro: 1000 }, null);
    expect(d.velocita).toBe('--');
    expect(d.direzione).toBe('');
  });
});

describe('datiEtichetta: quando fidarsi della rotta d archivio', () => {
  // La regola piu delicata dell'app. Le rotte vengono da un archivio: quella
  // registrata puo non essere quella che l'aereo sta volando adesso, e una
  // rotta sbagliata sull'etichetta e peggio di nessuna rotta.

  it('mostra la rotta quando posizione e prua la confermano', () => {
    // In salita da Fiumicino con prua 204° (sud): coerente con FCO -> CTA.
    const d = datiEtichetta(ITY088, {
      flightIata: 'AZ088', orig: FIUMICINO, dest: CATANIA
    });
    expect(d.rotta).toBe('FCO → CTA');
  });

  it('tace se l aereo vola nella direzione opposta a quella d archivio', () => {
    // Stessa rotta d'archivio, ma l'aereo punta a nord: non e quel volo.
    const versoNord = { ...ITY088, track: 20 };
    const d = datiEtichetta(versoNord, {
      flightIata: 'AZ088', orig: FIUMICINO, dest: CATANIA
    });
    expect(d.rotta).toBeNull();
    // Il numero di volo resta comunque, e un dato indipendente dalla rotta
    expect(d.numero).toBe('AZ 088');   // fmtFlight stacca la sigla dal numero
  });

  it('usa il codice ICAO se manca lo IATA', () => {
    const d = datiEtichetta(ITY088, {
      flightIata: null,
      orig: { icao: 'LIRF', lat: 41.8003, lon: 12.2389 },
      dest: { icao: 'LICC', lat: 37.4668, lon: 15.0664 }
    });
    expect(d.rotta).toBe('LIRF → LICC');
  });
});

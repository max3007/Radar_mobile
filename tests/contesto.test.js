import { describe, it, expect } from 'vitest';
import { creaStato, applicaPreferenze, preferenzeDa, aereoConHex } from '../src/app/contesto.js';
import { TILE_STYLES } from '../src/config.js';

describe('creaStato', () => {
  it('parte con dei valori sensati anche senza preferenze salvate', () => {
    const s = creaStato();
    expect(s.raggio).toBe(100);
    expect(s.aerei).toEqual([]);
    expect(s.selezionato).toBeNull();
    expect(s.postazioneAttiva).toBe('gps');
  });

  it('accetta gli scavalcamenti iniziali senza perdere il resto', () => {
    const s = creaStato({ centro: [41.4, 12.6], raggio: 250 });
    expect(s.centro).toEqual([41.4, 12.6]);
    expect(s.raggio).toBe(250);
    expect(s.soloInVolo).toBe(false);   // il default resta
  });
});

describe('applicaPreferenze', () => {
  // Non e validazione difensiva per abitudine: localStorage puo contenere la
  // forma di una versione precedente dell'app, e un valore fuori scala
  // manderebbe l'interfaccia in uno stato che l'utente non puo correggere
  // senza svuotare i dati del sito.

  it('senza niente da rileggere lascia i valori iniziali', () => {
    const s = applicaPreferenze(creaStato(), null, TILE_STYLES);
    expect(s.raggio).toBe(100);
  });

  it('rilegge quello che e valido', () => {
    const s = applicaPreferenze(creaStato(), {
      radiusNM: 150, passKm: 30, lang: 'en', filterAirborne: true
    }, TILE_STYLES);
    expect(s.raggio).toBe(150);
    expect(s.passKm).toBe(30);
    expect(s.lingua).toBe('en');
    expect(s.soloInVolo).toBe(true);
  });

  it('scarta i valori fuori scala invece di accettarli', () => {
    const s = applicaPreferenze(creaStato(), { radiusNM: 9999, passKm: -5 }, TILE_STYLES);
    expect(s.raggio).toBe(100);   // il default, non 9999
    expect(s.passKm).toBe(20);
  });

  it('scarta una lingua che non esiste', () => {
    expect(applicaPreferenze(creaStato(), { lang: 'de' }, TILE_STYLES).lingua).toBe('it');
  });

  it('scarta uno stile mappa che non esiste piu', () => {
    // Caso concreto: uno stile rimosso in una versione successiva dell'app
    expect(applicaPreferenze(creaStato(), { mapStyle: 'inventato' }, TILE_STYLES).stileMappa)
      .toBe('topo');
  });

  it('tiene solo le postazioni con tutti i campi al posto giusto', () => {
    const s = applicaPreferenze(creaStato(), {
      locations: [
        { id: 'a', label: 'Casa', lat: 41.4, lon: 12.6 },  // buona
        { id: 'b', label: 'Rotta', lat: 'quarantuno', lon: 12.6 },
        { label: 'senza id', lat: 41, lon: 12 },
        null
      ]
    }, TILE_STYLES);
    expect(s.postazioni.map(l => l.id)).toEqual(['a']);
  });

  it('se la postazione attiva non esiste piu, torna al GPS', () => {
    // Succede davvero: si elimina una postazione mentre e quella selezionata,
    // oppure si rilegge uno stato salvato prima di un'eliminazione.
    const s = applicaPreferenze(creaStato(), {
      locations: [{ id: 'a', label: 'Casa', lat: 41.4, lon: 12.6 }],
      activeLocationId: 'sparita'
    }, TILE_STYLES);
    expect(s.postazioneAttiva).toBe('gps');
  });

  it('le postazioni di sistema restano sempre valide', () => {
    expect(applicaPreferenze(creaStato(), { activeLocationId: 'anzio' }, TILE_STYLES)
      .postazioneAttiva).toBe('anzio');
  });
});

describe('preferenzeDa', () => {
  it('salva e rilegge senza perdere niente per strada', () => {
    // L'invariante che protegge: ogni campo persistente deve stare sia in
    // preferenzeDa sia in applicaPreferenze. Dimenticarne uno lo fa sparire
    // in silenzio al riavvio, ed e gia successo.
    const originale = creaStato({
      raggio: 175, passKm: 35, lingua: 'en', stileMappa: 'sat',
      filtroCompagnia: 'ITA Airways', soloInVolo: true,
      incendi: true, areeBruciate: true,
      postazioni: [{ id: 'x', label: 'Molo', lat: 41.44, lon: 12.62 }],
      postazioneAttiva: 'x'
    });
    const rileto = applicaPreferenze(creaStato(), preferenzeDa(originale), TILE_STYLES);

    for (const campo of ['raggio', 'passKm', 'lingua', 'stileMappa', 'filtroCompagnia',
                         'soloInVolo', 'incendi', 'areeBruciate', 'postazioneAttiva']) {
      expect(rileto[campo], 'campo perso nel giro di salvataggio: ' + campo)
        .toEqual(originale[campo]);
    }
    expect(rileto.postazioni).toEqual(originale.postazioni);
  });

  it('non salva lo stato volatile', () => {
    // Gli aerei e la selezione valgono per la sessione: salvarli
    // significherebbe riaprire l'app su dati vecchi di ore.
    const p = preferenzeDa(creaStato({ aerei: [{ hex: 'abc' }], selezionato: 'abc' }));
    expect(JSON.stringify(p)).not.toContain('abc');
  });
});

describe('aereoConHex', () => {
  const flotta = [{ hex: 'aaa', flight: 'ITY1' }, { hex: 'bbb', flight: 'ITY2' }];
  it('trova l aereo giusto', () => {
    expect(aereoConHex(flotta, 'bbb').flight).toBe('ITY2');
  });
  it('restituisce null se non c e, invece di undefined', () => {
    expect(aereoConHex(flotta, 'zzz')).toBeNull();
    expect(aereoConHex([], 'aaa')).toBeNull();
  });
});

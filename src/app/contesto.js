// Il contratto fra la composizione e le funzionalita.
//
// Il problema che risolve: app/avvio.js era 1809 righe in una chiusura sola
// perche' ogni funzione poteva leggere e scrivere qualunque variabile delle
// altre. Non c'era modo di sapere cosa una modifica potesse rompere, e non
// c'era modo di provare niente senza aprire un browser.
//
// La soluzione NON e' un contenitore reattivo con osservatori: per una app a
// istanza unica sarebbe cerimonia senza guadagno. E' piu' semplice e piu'
// severo — ogni funzionalita e' una fabbrica che DICHIARA cosa le serve,
// riceve solo quello, e restituisce la sua superficie pubblica.
//
// Chi legge una funzionalita vede in cima, in dieci righe, tutto cio' da cui
// dipende. Chi la prova gli passa dei finti e non serve altro.
//
// ---------------------------------------------------------------------------
// FORMA DEL CONTESTO
//
// {
//   stato:      oggetto vivo con i dati condivisi (v. sotto). Le funzionalita
//               lo LEGGONO; scriverci dentro spetta alla composizione, che e'
//               l'unica a sapere cosa va ridisegnato dopo.
//   mappa:      istanza Leaflet, per chi disegna davvero sulla mappa
//   vaiAllAereo(ac, opz)     porta la vista su un aereo e lo seleziona
//   chiediVoli(url)          l'unico modo di interrogare i dati di volo
//   pannelli:   { apri, chiudi, aperto, alterna }
//   salvaPreferenze()        persiste lo stato persistibile
//   passaFiltri(ac)          il predicato dei filtri attivi (raggio esclusi)
//   chiediConferma(msg, ok)  dialogo di conferma condiviso
// }
//
// ---------------------------------------------------------------------------

/**
 * Lo stato condiviso dell'app, in un oggetto solo invece che sparso in
 * undici variabili di chiusura.
 *
 * Diviso in due meta' che hanno regole diverse:
 *
 *  - PERSISTENTE: sopravvive alla chiusura dell'app (localStorage). Ogni
 *    campo qui dentro va anche in preferenzeDa() piu' sotto, altrimenti si
 *    perde in silenzio al riavvio — errore gia' fatto una volta.
 *  - VOLATILE: vale per la sessione corrente. Si ricostruisce a ogni giro di
 *    polling e non va mai salvato.
 */
export function creaStato(iniziale) {
  return Object.assign({
    // --- persistente ---
    centro: null,             // [lat, lon] del punto di osservazione
    raggio: 100,              // NM: quanto lontano guardiamo
    passKm: 20,               // soglia di distanza dei passaggi "IN ARRIVO"
    filtroCompagnia: '',      // '' = tutte
    soloInVolo: false,        // nasconde gli aerei a terra
    lingua: 'it',
    stileMappa: 'topo',       // v. TILE_STYLES in config.js
    incendi: false,           // overlay rilevamenti attivi
    areeBruciate: false,      // overlay perimetri
    postazioni: [],           // punti di osservazione salvati dall'utente
    postazioneAttiva: 'gps',

    // --- volatile ---
    aerei: [],                // ultimo giro nel raggio corrente
    aereiScansione: [],       // scansione ampia a 250 NM (solo con IN ARRIVO aperto)
    selezionato: null,        // hex dell'aereo selezionato
    aereoSelezionato: null,   // i suoi dati completi
    etichettaOsservatore: ''  // come si chiama il punto da cui guardiamo
  }, iniziale || {});
}

/** Solo la meta' persistente, nella forma attesa da servizi/preferenze.js. */
export function preferenzeDa(stato) {
  return {
    radiusNM: stato.raggio,
    filterAirline: stato.filtroCompagnia,
    filterAirborne: stato.soloInVolo,
    mapStyle: stato.stileMappa,
    passKm: stato.passKm,
    lang: stato.lingua,
    showFires: stato.incendi,
    showBurnt: stato.areeBruciate,
    locations: stato.postazioni,
    activeLocationId: stato.postazioneAttiva
  };
}

/**
 * Applica le preferenze rilette da localStorage, validando ogni campo.
 *
 * La validazione non e' difensiva per abitudine: localStorage puo' contenere
 * la forma di una versione precedente dell'app, e un raggio fuori scala o una
 * lingua inesistente manderebbero l'interfaccia in uno stato che l'utente non
 * puo' correggere senza svuotare i dati del sito.
 */
export function applicaPreferenze(stato, p, stiliValidi) {
  if (!p) return stato;
  if (p.radiusNM >= 25 && p.radiusNM <= 250) stato.raggio = p.radiusNM;
  if (typeof p.filterAirline === 'string') stato.filtroCompagnia = p.filterAirline;
  if (typeof p.filterAirborne === 'boolean') stato.soloInVolo = p.filterAirborne;
  if (stiliValidi[p.mapStyle]) stato.stileMappa = p.mapStyle;
  if (p.passKm >= 5 && p.passKm <= 50) stato.passKm = p.passKm;
  if (p.lang === 'it' || p.lang === 'en') stato.lingua = p.lang;
  if (typeof p.showFires === 'boolean') stato.incendi = p.showFires;
  if (typeof p.showBurnt === 'boolean') stato.areeBruciate = p.showBurnt;
  if (Array.isArray(p.locations)) {
    stato.postazioni = p.locations.filter(function (l) {
      return l && typeof l.id === 'string' && typeof l.label === 'string' &&
             typeof l.lat === 'number' && typeof l.lon === 'number';
    });
  }
  if (typeof p.activeLocationId === 'string') stato.postazioneAttiva = p.activeLocationId;
  // La postazione attiva deve esistere ancora, altrimenti si torna al GPS
  if (stato.postazioneAttiva !== 'gps' && stato.postazioneAttiva !== 'anzio' &&
      !stato.postazioni.some(function (l) { return l.id === stato.postazioneAttiva; })) {
    stato.postazioneAttiva = 'gps';
  }
  return stato;
}

/** Trova un aereo per codice esadecimale in una lista. */
export function aereoConHex(lista, hex) {
  for (var i = 0; i < lista.length; i++) if (lista[i].hex === hex) return lista[i];
  return null;
}

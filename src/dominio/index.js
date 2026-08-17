// Il dominio, in un punto solo da cui importare.
//
// Quattro concetti distinti, ognuno nel suo file: chi e l'aereo, dove sta,
// dove passera, cosa sta facendo. Prima erano 375 righe in un unico
// domain.js dove geometria sferica e nomi di compagnie stavano mescolate.
//
// La regola che tiene insieme questo strato: nessun import di Leaflet,
// nessun accesso al DOM, nessuno stato condiviso. Non e purismo — e cio che
// rende ogni riga qui dentro verificabile in un secondo, senza browser.

export * from './aereo.js';       // identita: compagnia, callsign, quota, colore
export * from './geometria.js';   // sfera: distanze, rotte, elevazione
export * from './passaggi.js';    // previsione dei passaggi ravvicinati
export * from './volo.js';        // volo in corso: rotta, emergenza, fase, etichetta
export * from './flotta.js';      // insieme degli aerei: taglio al raggio

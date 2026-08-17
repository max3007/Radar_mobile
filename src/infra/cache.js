// Cache a capienza limitata, con sfratto del meno usato di recente.
//
// Serve perche' questa app sta aperta per ore su una finestra, e ogni aereo
// che passa lascia una traccia in memoria: la rotta interrogata per il suo
// callsign, la foto, l'esito della verifica incendio, l'ora dell'ultimo
// avviso. Erano tutti oggetti normali senza alcun limite: in una giornata
// sopra un'area trafficata sono migliaia di voci che non se ne vanno piu',
// per dati di aerei atterrati da un pezzo.
//
// Il limite fa una promessa precisa: la memoria non cresce con il tempo, ma
// con quanti aerei si guardano CONTEMPORANEAMENTE. Le voci utili - quelle
// degli aerei attualmente sullo schermo - vengono rilette a ogni giro e
// quindi non vengono mai sfrattate.

/**
 * @param {number} capienza  quante voci tenere al massimo
 */
export function creaCache(capienza) {
  // Map conserva l'ordine di inserimento: la prima chiave e' la piu vecchia.
  // Rileggere una voce la sposta in fondo, cosi lo sfratto colpisce sempre
  // quella lasciata inutilizzata piu a lungo.
  var m = new Map();

  return {
    /** Legge e segna la voce come usata di recente. */
    get: function (k) {
      if (!m.has(k)) return undefined;
      var v = m.get(k);
      m.delete(k);
      m.set(k, v);
      return v;
    },
    /** Presente in cache? Comprende le voci di valore null (= "cercato, non trovato"). */
    has: function (k) { return m.has(k); },
    set: function (k, v) {
      if (m.has(k)) m.delete(k);
      m.set(k, v);
      if (m.size > capienza) m.delete(m.keys().next().value); // sfratta la piu vecchia
      return v;
    },
    delete: function (k) { return m.delete(k); },
    get size() { return m.size; }
  };
}

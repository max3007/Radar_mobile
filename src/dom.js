// Due strumenti che servono ovunque l'app costruisce una lista in HTML.
//
// Sono qui insieme perche' risolvono due facce dello stesso schema ripetuto
// sei volte in app.js: "componi una stringa HTML, mettila in innerHTML,
// riaggancia un listener a ogni riga".

/**
 * Neutralizza i caratteri che romperebbero l'HTML.
 *
 * Serve perche' i dati che finiscono nelle liste NON sono nostri: callsign,
 * tipo e descrizione arrivano dal feed ADS-B, i nomi dei luoghi da Nominatim,
 * le etichette delle postazioni le scrive l'utente. Prima l'escape era fatto
 * a mano e a meta': in un punto solo `<`, in un altro solo `"`, altrove per
 * niente. Una virgoletta in un nome di luogo bastava a rompere il markup.
 */
export function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Un listener solo sul contenitore invece di uno per riga.
 *
 * Non e' un vezzo: con il pannello TRAFFICO aperto la lista veniva ricostruita
 * e riagganciata a ogni giro di polling, cioe' ogni 6 secondi. Misurato su 400
 * aerei, erano ~170 ms di lavoro bloccante per ciclo, in blocchi fino a 210 ms
 * — abbastanza da far scattare la mappa mentre la si trascina. Con il
 * contenitore chiuso, zero. La delega toglie il costo per riga: il contenitore
 * resta lo stesso nodo, quindi il listener si aggancia UNA volta sola e
 * sopravvive a tutti i ridisegni successivi.
 *
 * @param {Element}  contenitore  nodo che resta vivo tra un ridisegno e l'altro
 * @param {string}   selettore    quali discendenti reagiscono al tocco
 * @param {function} azione       (elemento, evento) => void
 */
export function delega(contenitore, selettore, azione) {
  contenitore.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest(selettore) : null;
    // closest() puo risalire oltre il contenitore: fermiamoci al suo interno
    if (!el || !contenitore.contains(el)) return;
    azione(el, e);
  });
}

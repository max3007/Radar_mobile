// I marker della mappa: quattro icone Leaflet costruite a mano in HTML.
//
// Stavano sparse in quattro punti di app.js e ripetevano ogni volta la stessa
// impalcatura (className vuoto, iconSize, iconAnchor). Qui condividono
// iconaSenzaRiquadro e restano una accanto all'altra, dove si vedono.
//
// Qui dentro c'e' solo il disegno. COSA scrivere nell'etichetta ancorata
// all'aereo lo decide datiEtichetta() in domain.js: e' una funzione pura e
// sta con le altre, cosi' si puo' provare senza un browser. Prima le due cose
// erano intrecciate dentro tagIcon, e la regola piu' delicata dell'app -
// quando fidarsi di una rotta d'archivio - non era verificabile affatto.

import L from 'leaflet';

// Marker senza riquadro ne ombra: il contenuto e' HTML nostro, Leaflet fa
// solo da ancoraggio geografico.
export function iconaSenzaRiquadro(html, size, anchor) {
  return L.divIcon({
    className: '',
    html: html,
    iconSize: size || [0, 0],
    iconAnchor: anchor || [0, 0]
  });
}

export function iconaAereo(track, color, isSel, emerg, ff, ffNear) {
  var cls = 'plane-icon' + (isSel ? ' selected' : '') + (emerg ? ' emerg' : '') +
    (ff ? ' ff' : '') + (ffNear ? ' ff-near' : '');
  var fill = emerg ? '#ff3b30' : color;
  return iconaSenzaRiquadro(
    '<div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;">' +
      '<div class="' + cls + '" style="transform: rotate(' + (track || 0) + 'deg);">' +
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="' + fill + '">' +
      '<path d="M12 2 L14 10 L22 13 L22 15 L14 13.5 L13.5 20 L16 21.5 L16 23 L12 22 L8 23 L8 21.5 L10.5 20 L10 13.5 L2 15 L2 13 L10 10 Z"/>' +
      '</svg></div></div>',
    [40, 40], [20, 20]
  );
}

// Mirino radar sul punto di osservazione: puntino + ping pulsante + crocino
export function iconaOsservatore() {
  return iconaSenzaRiquadro(
    '<div class="observer">' +
      '<span class="obs-ping"></span>' +
      '<span class="obs-cross"></span>' +
      '<span class="obs-core"></span>' +
    '</div>'
  );
}

// Crocetta sul punto di massimo avvicinamento previsto (pannello IN ARRIVO)
export function iconaPuntoPassaggio() {
  return iconaSenzaRiquadro('<div class="pass-x">✕</div>');
}

export function iconaAeroporto(a) {
  return iconaSenzaRiquadro(
    '<div class="airport-marker"><span class="airport-dot"></span>' +
      '<span class="airport-code">' + (a.iata || a.icao) + '</span></div>'
  );
}

export function iconaEtichetta(d) {
  return iconaSenzaRiquadro(
    '<div class="tag-anchor">' +
      '<div class="tag-line"></div>' +
      '<div class="tag-box">' +
        '<div class="tag-more" aria-hidden="true">⛶</div>' +
        '<div class="l1">' + d.numero + '</div>' +
        '<div class="l3" style="color:var(--muted);">' + d.compagnia + '</div>' +
        (d.rotta ? '<div class="l3">' + d.rotta + '</div>' : '') +
        '<div class="l2">' + d.quota + ' · ' + d.velocita + '</div>' +
        (d.direzione ? '<div class="l2">' + d.direzione + '</div>' : '') +
      '</div></div>'
  );
}

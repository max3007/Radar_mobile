// Verifica se un aereo antincendio si trova vicino a un rilevamento attivo,
// interrogando il WMS EFFIS con una GetFeatureInfo puntuale intorno alla sua
// posizione.
//
// E' un controllo "best effort" e deve restare tale: se il servizio non
// risponde o cambia formato, l'aereo resta comunque evidenziato come
// antincendio, solo senza la conferma di vicinanza. Nessun errore visibile
// all'utente — un Canadair riconosciuto e' gia' l'informazione che conta,
// la vicinanza a un incendio e' un di piu'.

import { FIRE_WMS, wmsTimeRange } from '../config.js';
import { fetchConScadenza } from './voli.js';

var RAGGIO_KM = 50;        // quanto largo cerchiamo intorno all'aereo
var RICONTROLLO_MS = 30000; // non ricontrollare lo stesso aereo piu spesso

/**
 * @param {function} onCambio  (hex, vicino) quando l'esito cambia davvero:
 *                             serve a ridisegnare l'icona, e viene chiamata
 *                             SOLO sul cambio, non a ogni verifica riuscita.
 */
export function creaVerificaIncendi(onCambio) {
  var vicino = {};    // hex -> true/false (esito dell'ultima verifica riuscita)
  var quando = {};    // hex -> timestamp dell'ultimo tentativo
  var seq = {};       // hex -> sequenza, per scartare risposte fuori ordine

  function verifica(ac) {
    var hex = ac.hex;
    var ora = Date.now();
    if (quando[hex] && ora - quando[hex] < RICONTROLLO_MS) return;
    quando[hex] = ora;
    var mio = (seq[hex] || 0) + 1;
    seq[hex] = mio;

    var d = RAGGIO_KM / 111; // gradi approssimati (~111 km per grado)
    var params = new URLSearchParams({
      service: 'WMS', version: '1.1.1', request: 'GetFeatureInfo',
      layers: FIRE_WMS.hotspots.layers, query_layers: FIRE_WMS.hotspots.layers,
      srs: 'EPSG:4326',
      bbox: [ac.lon - d, ac.lat - d, ac.lon + d, ac.lat + d].join(','),
      width: 101, height: 101, x: 50, y: 50,
      info_format: 'application/json', feature_count: 1,
      time: wmsTimeRange(FIRE_WMS.hotspots.days)
    });

    fetchConScadenza(FIRE_WMS.url + '?' + params.toString())
      .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
      .then(function (data) {
        if (mio !== seq[hex]) return; // risposta superata da una piu recente
        var ora = !!(data && data.features && data.features.length);
        if (vicino[hex] !== ora) { vicino[hex] = ora; onCambio(hex, ora); }
      })
      .catch(function () { /* servizio non raggiungibile: nessuna conferma, nessun errore */ });
  }

  return {
    verifica: verifica,
    vicino: function (hex) { return !!vicino[hex]; },
    /** Quando un aereo esce dal radar il suo stato se ne va con lui. */
    dimentica: function (hex) { delete vicino[hex]; delete quando[hex]; delete seq[hex]; }
  };
}

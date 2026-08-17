// Overlay incendi EFFIS/Copernicus: due strati WMS pubblici, senza chiave.
//
// - hotspot: rilevamenti satellitari attivi (dove sta bruciando adesso)
// - aree bruciate: perimetri di quello che e' gia' bruciato, con i colori
//   EFFIS che indicano quanto e' recente il passaggio del fuoco
//
// Entrambi vogliono una finestra temporale esplicita: senza il parametro
// `time` il servizio restituisce l'intero archivio storico, che sulla mappa
// e' inutilizzabile.

import L from 'leaflet';
import { FIRE_WMS, wmsTimeRange } from '../config.js';

/**
 * @param {object}   cfg
 * @param {object}   cfg.map       mappa Leaflet
 * @param {function} cfg.onCambio  (quale, acceso) quando l'utente cambia
 *                                 interruttore; serve a salvare le preferenze
 */
export function creaOverlayIncendi(cfg) {
  var map = cfg.map;
  var onCambio = cfg.onCambio || function () {};
  var strati = { fires: null, burnt: null };

  function strato(quale) {
    if (strati[quale]) return strati[quale];
    var def = quale === 'fires' ? FIRE_WMS.hotspots : FIRE_WMS.burnt;
    strati[quale] = L.tileLayer.wms(FIRE_WMS.url, {
      layers: def.layers, format: 'image/png', transparent: true,
      attribution: FIRE_WMS.attribution, time: wmsTimeRange(def.days),
      opacity: quale === 'fires' ? 0.85 : 0.6,
      zIndex: quale === 'fires' ? 250 : 240
    });
    return strati[quale];
  }

  function accendi(quale, acceso, salva) {
    if (acceso) strato(quale).addTo(map);
    else if (strati[quale]) map.removeLayer(strati[quale]);

    document.getElementById(quale === 'fires' ? 'chkFires' : 'chkBurnt').checked = acceso;
    // La legenda dei colori EFFIS (eta dell'incendio) serve solo a layer acceso
    if (quale === 'burnt') {
      document.getElementById('burntLegend').style.display = acceso ? 'flex' : 'none';
    }
    if (salva) onCambio(quale, acceso);
  }

  function setFires(acceso, salva) { accendi('fires', acceso, salva); }
  function setBurnt(acceso, salva) { accendi('burnt', acceso, salva); }

  document.getElementById('chkFires').addEventListener('change', function () {
    setFires(this.checked, true);
  });
  document.getElementById('chkBurnt').addEventListener('change', function () {
    setBurnt(this.checked, true);
  });

  return { setFires: setFires, setBurnt: setBurnt };
}

// Operazioni sull'insieme degli aerei ricevuti dalla fonte.

import { distanceM } from './geometria.js';

/**
 * Alcune fonti restituiscono anche aerei un po' oltre il raggio richiesto
 * (adsb.fi filtra per riquadro, non per cerchio): senza questo taglio si
 * vedrebbero aerei fuori dall'anello piu esterno del radar.
 *
 * Il campo `dst` e la distanza in NM gia calcolata dalla fonte: quando c'e si
 * usa quella, altrimenti si calcola. Gli aerei senza posizione passano: li
 * scarta gia il disegno.
 */
export function trimToRadius(list, center, radiusNM) {
  return list.filter(function (a) {
    if (a.lat == null || a.lon == null) return true;
    var nm = (typeof a.dst === 'number')
      ? a.dst
      : distanceM(center[0], center[1], a.lat, a.lon) / 1852;
    return nm <= radiusNM;
  });
}

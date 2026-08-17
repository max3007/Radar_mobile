// Geometria sulla sfera terrestre: rotte, distanze, angoli di elevazione.
// Il raggio usato e quello di Leaflet, non il raggio medio: v. distanceM.

import { compassDirs } from '../ui/i18n.js';

// Direzione bussola nella lingua corrente
export function compass(bearing) {
  var dirs = compassDirs();
  return dirs[Math.round(((bearing % 360) + 360) % 360 / 45) % 8];
}

// Raggio terrestre in metri. NON e' il raggio medio (6371008.8) ma quello
// che Leaflet usa in L.CRS.Earth: serve che distanceM() e map.distance()
// diano lo stesso identico numero, altrimenti al bordo del raggio un aereo
// verrebbe incluso da una e scartato dall'altra. Verificato in tests/e2e.
var R_TERRA_M = 6371000;

// Distanza in metri tra due punti (formula dell'emisenoverso).
// Esiste per togliere Leaflet di mezzo dove serve solo geometria: filtrare
// una lista di aerei per raggio non e un'operazione di mappa, e legarla a
// map.distance rendeva impossibile provarla senza un browser.
export function distanceM(lat1, lon1, lat2, lon2) {
  var rad = Math.PI / 180;
  var dLat = (lat2 - lat1) * rad;
  var dLon = (lon2 - lon1) * rad;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R_TERRA_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function bearingBetween(lat1, lon1, lat2, lon2) {
  var dLon = (lon2 - lon1) * Math.PI / 180;
  var la1 = lat1 * Math.PI / 180, la2 = lat2 * Math.PI / 180;
  var y = Math.sin(dLon) * Math.cos(la2);
  var x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export function bearingFromCenter(center, lat, lon) {
  return bearingBetween(center[0], center[1], lat, lon);
}

// Elevazione dell'aereo sopra l'orizzonte (gradi), da distanza al suolo e altitudine
export function elevationAngle(center, lat, lon, altFt) {
  // distanza al suolo in metri (Haversine)
  var R = 6371000;
  var dLat = (lat - center[0]) * Math.PI / 180;
  var dLon = (lon - center[1]) * Math.PI / 180;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(center[0] * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  var ground = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  var altM = (typeof altFt === 'number' ? altFt : 0) * 0.3048;
  if (ground < 1) return 90;
  return Math.round(Math.atan2(altM, ground) * 180 / Math.PI);
}

// Punto di arrivo dati partenza, direzione (gradi) e distanza (metri)
export function destPoint(lat, lon, brg, distM) {
  var R = 6371000, d = distM / R, b = brg * Math.PI / 180;
  var la1 = lat * Math.PI / 180, lo1 = lon * Math.PI / 180;
  var la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(b));
  var lo2 = lo1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return [la2 * 180 / Math.PI, lo2 * 180 / Math.PI];
}

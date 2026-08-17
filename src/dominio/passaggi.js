// Previsione dei passaggi ravvicinati (CPA, closest point of approach) e
// riconoscimento dei falsi positivi.

import { isOnGround } from './aereo.js';
import { bearingBetween } from './geometria.js';

// Passaggio piu ravvicinato (CPA, Closest Point of Approach) di un aereo
// rispetto all'osservatore, assumendo rotta e velocita attuali costanti.
// Ritorna null se l'aereo e fermo, a terra, senza dati, o si sta allontanando.
// { tMin: minuti al passaggio, dMinKm: distanza minima (km),
//   passLat/passLon: punto di passaggio, elevAtPass: elevazione (gradi),
//   brgAtPass: direzione dal centro verso il punto di passaggio }
export function nextPass(center, ac) {
  if (!ac || ac.lat == null || ac.lon == null) return null;
  if (ac.gs == null || ac.track == null) return null;
  if (isOnGround(ac)) return null;
  var gs = ac.gs;
  if (gs < 50) return null; // fermo o quasi: nessuna traiettoria utile
  var clat = center[0], clon = center[1];
  // Piano tangente locale in miglia nautiche (1 grado lat = 60 NM)
  var nmLon = 60 * Math.cos(clat * Math.PI / 180);
  var x = (ac.lon - clon) * nmLon;   // posizione aereo rispetto all'osservatore
  var y = (ac.lat - clat) * 60;
  var trk = ac.track * Math.PI / 180;
  var vx = gs * Math.sin(trk), vy = gs * Math.cos(trk); // NM/h
  var vv = vx * vx + vy * vy;
  if (vv < 1e-6) return null;
  var t = -(x * vx + y * vy) / vv;   // ore al punto di minimo
  if (t <= 0) return null;           // gia passato o in allontanamento
  var px = x + vx * t, py = y + vy * t;
  var dMinNm = Math.sqrt(px * px + py * py);
  var passLat = clat + py / 60;
  var passLon = clon + px / nmLon;
  var altM = (typeof ac.alt_baro === 'number' ? ac.alt_baro : 0) * 0.3048;
  var groundM = dMinNm * 1852;
  var elevAtPass = groundM < 1 ? 90 : Math.round(Math.atan2(altM, groundM) * 180 / Math.PI);
  return {
    tMin: t * 60,
    dMinKm: dMinNm * 1.852,
    passLat: passLat,
    passLon: passLon,
    elevAtPass: elevAtPass,
    brgAtPass: bearingBetween(clat, clon, passLat, passLon)
  };
}

// Falso positivo dei passaggi: un aereo in avvicinamento puo atterrare a un
// aeroporto che si trova lungo la sua rotta PRIMA del punto di passaggio sopra
// l'osservatore, quindi non arrivera mai a sorvolarci (es. aerei diretti a
// Fiumicino visti da Anzio, che e sulla rotta ma oltre l'aeroporto).
// Ritorna l'aeroporto se e probabile l'atterraggio prima del passaggio, altrimenti null.
export function landingBeforePass(center, ac, pass, airports) {
  if (!pass || !airports || !airports.length) return null;
  var vr = ac.baro_rate != null ? ac.baro_rate : ac.geom_rate;
  // Solo aerei in discesa marcata e gia bassi: quelli davvero in avvicinamento.
  // Un aereo in crociera alta o in decollo che ci sorvola resta valido.
  if (vr == null || vr >= -250) return null;
  if (typeof ac.alt_baro !== 'number' || ac.alt_baro > 13000) return null;
  var clat = center[0], clon = center[1];
  var nmLon = 60 * Math.cos(clat * Math.PI / 180);
  // Segmento di rotta: dall'aereo (P0) al punto di passaggio (P1), in miglia nautiche
  var p0x = (ac.lon - clon) * nmLon, p0y = (ac.lat - clat) * 60;
  var p1x = (pass.passLon - clon) * nmLon, p1y = (pass.passLat - clat) * 60;
  var dx = p1x - p0x, dy = p1y - p0y;
  var segLen2 = dx * dx + dy * dy;
  if (segLen2 < 1e-6) return null;
  var THRESH_NM = 6; // ~11 km dalla rotta: area terminale dell'aeroporto
  var best = null, bestS = 2;
  for (var i = 0; i < airports.length; i++) {
    var a = airports[i];
    var ax = (a.lon - clon) * nmLon, ay = (a.lat - clat) * 60;
    var s = ((ax - p0x) * dx + (ay - p0y) * dy) / segLen2; // proiezione lungo la rotta [0..1]
    if (s <= 0.02 || s >= 1) continue;                     // deve stare TRA aereo e passaggio
    var projx = p0x + s * dx, projy = p0y + s * dy;
    var perp = Math.sqrt((ax - projx) * (ax - projx) + (ay - projy) * (ay - projy));
    if (perp > THRESH_NM) continue;
    if (s < bestS) { bestS = s; best = a; }                // il primo aeroporto lungo la rotta
  }
  return best;
}

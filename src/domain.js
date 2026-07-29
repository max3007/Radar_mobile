// Funzioni pure di dominio: nomi compagnia, callsign, geometria, fase di volo.
// Logica identica al prototipo originale; le funzioni che nel prototipo
// leggevano il centro radar globale (CENTER) qui lo ricevono come parametro.

import AIRLINES from './data/airlines.json';
import IATA2ICAO from './data/iata2icao.json';

export function airlineName(cs) {
  if (!cs) return "Privato";
  var t = cs.trim().toUpperCase();
  var code = t.substring(0, 3);
  if (AIRLINES[code]) {
    var name = AIRLINES[code];
    // Accorcia nomi molto lunghi per non rompere il layout su mobile
    return name.length > 26 ? name.substring(0, 24).trim() + '…' : name;
  }
  return /^[A-Z]{3}/.test(t) ? code : "Privato";
}

// Converte un numero di volo commerciale (IATA, es. AZ610) in callsign ICAO
export function toCallsign(query) {
  var q = query.trim().toUpperCase().replace(/\s+/g, '');
  if (/^[A-Z]{3}\d/.test(q)) return q;              // gia ICAO (es. ITY610)
  var m = q.match(/^([A-Z0-9]{2})(\d+[A-Z]?)$/);    // IATA (es. AZ610)
  if (m && IATA2ICAO[m[1]]) return IATA2ICAO[m[1]] + m[2];
  return q;                                         // fallback
}

// "AZ610" -> "AZ 610" per leggibilita
export function fmtFlight(s) {
  if (!s) return null;
  var m = s.match(/^([A-Z]{1,3})(\d.*)$/);
  return m ? m[1] + ' ' + m[2] : s;
}

// Aereo davvero a terra: il flag ADS-B 'ground' e attendibile solo a bassa
// velocita. A 200 kt l'aereo e in volo (basso o dato errato), non a terra.
var GROUND_MAX_KT = 80;
export function isOnGround(ac) {
  if (!ac || ac.alt_baro !== 'ground') return false;
  return ac.gs == null || ac.gs < GROUND_MAX_KT;
}

// Etichetta di quota, consapevole dei falsi "ground"
export function altLabel(ac, short) {
  if (isOnGround(ac)) return short ? 'a terra' : 'TERRA';
  if (ac.alt_baro === 'ground') return 'bassa quota'; // in volo ma quota non riportata
  return ac.alt_baro != null ? ac.alt_baro + ' ft' : (short ? '' : '--');
}

// Colore per fascia di quota
export function altColor(alt, isSel) {
  if (isSel) return '#f2fff8';
  if (alt === 'ground') return '#5d7a6c';
  if (typeof alt !== 'number') return '#34e08a';
  if (alt < 10000) return '#ffb454';
  if (alt < 25000) return '#34e08a';
  return '#6fd3ff';
}
// Colore per un aereo, gestendo i falsi "ground" (in volo basso -> ambra)
export function planeColor(ac, isSel) {
  if (isOnGround(ac)) return altColor('ground', isSel);
  if (ac.alt_baro === 'ground') return altColor(500, isSel); // in volo basso
  return altColor(ac.alt_baro, isSel);
}

// Direzione bussola in italiano
export function compass(bearing) {
  var dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  return dirs[Math.round(((bearing % 360) + 360) % 360 / 45) % 8];
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

// Verifica di plausibilita della rotta d'archivio (adsbdb) rispetto alla
// posizione e alla prua reali dell'aereo. Il database delle rotte per
// callsign e statico e a volte stantio: se l'aereo e lontano dal corridoio
// origine->destinazione, o vola nella direzione opposta, la rotta in
// archivio non e quella del volo in corso e va nascosta.
export function routeConsistent(ac, route) {
  var o = route && route.orig, d = route && route.dest;
  // Senza coordinate (rotta o aereo) non si puo giudicare: non bloccare
  if (!o || !d || o.lat == null || o.lon == null || d.lat == null || d.lon == null) return true;
  if (ac.lat == null || ac.lon == null) return true;
  var R = 6371; // km
  function rad(x) { return x * Math.PI / 180; }
  function angDist(lat1, lon1, lat2, lon2) {
    var dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  var total = angDist(o.lat, o.lon, d.lat, d.lon);
  if (total < 1e-6) return true;
  var d13 = angDist(o.lat, o.lon, ac.lat, ac.lon);
  var th13 = rad(bearingBetween(o.lat, o.lon, ac.lat, ac.lon));
  var th12 = rad(bearingBetween(o.lat, o.lon, d.lat, d.lon));
  // Distanza dal corridoio (cross-track sulla great circle origine->destinazione)
  var dxt = Math.asin(Math.max(-1, Math.min(1, Math.sin(d13) * Math.sin(th13 - th12))));
  var xtKm = Math.abs(dxt) * R;
  var totKm = total * R;
  if (xtKm > Math.max(200, totKm * 0.10)) return false;
  // Posizione lungo la tratta: prima dell'origine o oltre la destinazione = incoerente
  var dat = Math.acos(Math.max(-1, Math.min(1, Math.cos(d13) / Math.cos(dxt))));
  var behind = Math.cos(th13 - th12) < 0;
  var fracKm = (behind ? -1 : 1) * dat * R;
  if (fracKm < -Math.max(200, totKm * 0.05) || fracKm > totKm + Math.max(200, totKm * 0.05)) return false;
  // Direzione: in crociera la prua deve puntare grosso modo verso la destinazione
  // (margine ampio, 120 gradi, per deviazioni meteo/aerovie e holding)
  if (ac.track != null) {
    var toDest = bearingBetween(ac.lat, ac.lon, d.lat, d.lon);
    var diff = ((toDest - ac.track + 540) % 360) - 180;
    if (Math.abs(diff) > 120) return false;
  }
  return true;
}

// Stato di emergenza: da campo 'emergency' e da squawk speciali
export function emergencyInfo(ac) {
  var sq = ac.squawk;
  if (sq === '7500') return 'DIROTTAMENTO';
  if (sq === '7600') return 'RADIO GUASTA';
  if (sq === '7700') return 'EMERGENZA GENERALE';
  var e = ac.emergency;
  if (!e || e === 'none') return null;
  var map = { general: 'EMERGENZA', lifeguard: 'VOLO SANITARIO', minfuel: 'CARBURANTE MINIMO',
              nordo: 'RADIO GUASTA', unlawful: 'INTERFERENZA ILLECITA', downed: 'AEREO ABBATTUTO' };
  return map[e] || ('EMERGENZA: ' + e.toUpperCase());
}

// Fase di volo dedotta da modi di navigazione, vario e quota
export function flightPhase(ac) {
  var modes = ac.nav_modes || [];
  if (isOnGround(ac)) return 'A TERRA';
  if (modes.indexOf('approach') !== -1) return 'IN AVVICINAMENTO';
  var vr = ac.baro_rate != null ? ac.baro_rate : ac.geom_rate;
  if (vr != null && vr > 300) {
    var tgt = ac.nav_altitude_mcp;
    if (tgt && typeof ac.alt_baro === 'number') return 'IN SALITA → FL' + Math.round(tgt / 100);
    return 'IN SALITA';
  }
  if (vr != null && vr < -300) {
    if (typeof ac.alt_baro === 'number' && ac.alt_baro < 10000) return 'IN DISCESA / ARRIVO';
    return 'IN DISCESA';
  }
  if (typeof ac.alt_baro === 'number' && ac.alt_baro > 24000) return 'IN CROCIERA';
  // Flag 'ground' ma in volo (velocita alta): e basso, tipicamente in manovra
  if (ac.alt_baro === 'ground') return 'IN AVVICINAMENTO';
  return 'IN VOLO LIVELLATO';
}

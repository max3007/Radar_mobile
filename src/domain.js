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

// Colore per fascia di quota
export function altColor(alt, isSel) {
  if (isSel) return '#f2fff8';
  if (alt === 'ground') return '#5d7a6c';
  if (typeof alt !== 'number') return '#34e08a';
  if (alt < 10000) return '#ffb454';
  if (alt < 25000) return '#34e08a';
  return '#6fd3ff';
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
  if (ac.alt_baro === 'ground') return 'A TERRA';
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
  return 'IN VOLO LIVELLATO';
}

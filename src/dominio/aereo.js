// Identita di un aereo: chi lo opera, come si chiama, com'e messo.
// Funzioni pure — nessun DOM, nessun Leaflet, nessuno stato condiviso.

import AIRLINES from '../data/airlines.json';
import IATA2ICAO from '../data/iata2icao.json';
import { t } from '../ui/i18n.js';

export function airlineName(cs) {
  // NB: la variabile locale si chiama `sigla` e non `t` di proposito — `t` e
  // la funzione di traduzione importata sopra, e ombreggiarla qui impediva
  // di tradurre "Privato" senza accorgersene.
  if (!cs) return t('airline.private');
  var sigla = cs.trim().toUpperCase();
  var code = sigla.substring(0, 3);
  if (AIRLINES[code]) {
    var name = AIRLINES[code];
    // Accorcia nomi molto lunghi per non rompere il layout su mobile
    return name.length > 26 ? name.substring(0, 24).trim() + '…' : name;
  }
  return /^[A-Z]{3}/.test(sigla) ? code : t('airline.private');
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
// La quota "a terra" arriva come stringa 'ground'. Confronto tollerante a
// maiuscole e spazi: le fonti sono diverse e non tutte identiche nel formato.
export function isGroundAlt(alt) {
  return typeof alt === 'string' && alt.trim().toLowerCase() === 'ground';
}
export function isOnGround(ac) {
  if (!ac || !isGroundAlt(ac.alt_baro)) return false;
  return ac.gs == null || ac.gs < GROUND_MAX_KT;
}

// Etichetta di quota, consapevole dei falsi "ground"
export function altLabel(ac, short) {
  if (isOnGround(ac)) return short ? t('alt.groundShort') : t('alt.ground');
  if (isGroundAlt(ac.alt_baro)) return t('alt.low'); // in volo ma quota non riportata
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
// e gli aerei antincendio (colore dedicato, indipendente dalla quota, cosi
// restano riconoscibili a colpo d'occhio in mezzo al traffico normale).
export function planeColor(ac, isSel) {
  if (isSel) return '#f2fff8';
  if (isFirefightingAircraft(ac)) return '#ff6a00';
  if (isOnGround(ac)) return altColor('ground', isSel);
  if (isGroundAlt(ac.alt_baro)) return altColor(500, isSel); // in volo basso
  return altColor(ac.alt_baro, isSel);
}

// Aereo antincendio: riconosce i Canadair CL-215/CL-415 (i water bomber piu
// diffusi in Italia/Europa) dal codice tipo ICAO o dalla descrizione. Il
// codice tipo e il segnale piu affidabile; la descrizione e un ripiego per
// varianti/aliasing non censiti.
var FIREFIGHTING_TYPE_CODES = ['CL2T', 'CL4T']; // CL-215T, CL-415/Bombardier 415
var FIREFIGHTING_DESC_RE = /CANADAIR|BOMBARDIER\s*415|\bCL[\s-]?(215|415)\b/i;
export function isFirefightingAircraft(ac) {
  if (!ac) return false;
  if (FIREFIGHTING_TYPE_CODES.indexOf((ac.t || '').toUpperCase()) !== -1) return true;
  return FIREFIGHTING_DESC_RE.test(ac.desc || '');
}

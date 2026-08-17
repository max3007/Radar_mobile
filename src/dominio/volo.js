// Il volo in corso: coerenza della rotta d'archivio, emergenze, fase di volo,
// e cosa scrivere sull'etichetta ancorata all'aereo.

import { t } from '../ui/i18n.js';
import { airlineName, fmtFlight, altLabel, isGroundAlt, isOnGround } from './aereo.js';
import { compass, bearingBetween, distanceM } from './geometria.js';

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
  if (sq === '7500') return t('em.hijack');
  if (sq === '7600') return t('em.radio');
  if (sq === '7700') return t('em.general');
  var e = ac.emergency;
  if (!e || e === 'none') return null;
  var map = { general: 'em.generalShort', lifeguard: 'em.medical', minfuel: 'em.minfuel',
              nordo: 'em.radio', unlawful: 'em.unlawful', downed: 'em.downed' };
  return map[e] ? t(map[e]) : t('em.other', { e: e.toUpperCase() });
}

// Fase di volo dedotta da modi di navigazione, vario e quota.
// Restituisce un CODICE stabile ('climb', 'descent'...) oltre al testo
// tradotto: il codice serve a chi deve prendere decisioni (che icona
// mostrare), il testo solo a chi deve scriverlo a schermo. Tenerli separati
// evita di far dipendere la logica dalla lingua scelta dall'utente — errore
// che rendeva l'icona di fase muta con l'app in inglese.
// { code, text }
export function flightPhaseInfo(ac) {
  var modes = ac.nav_modes || [];
  if (isOnGround(ac)) return { code: 'ground', text: t('phase.ground') };
  if (modes.indexOf('approach') !== -1) return { code: 'approach', text: t('phase.approach') };
  var vr = ac.baro_rate != null ? ac.baro_rate : ac.geom_rate;
  if (vr != null && vr > 300) {
    var tgt = ac.nav_altitude_mcp;
    if (tgt && typeof ac.alt_baro === 'number') {
      return { code: 'climb', text: t('phase.climbTo', { fl: Math.round(tgt / 100) }) };
    }
    return { code: 'climb', text: t('phase.climb') };
  }
  if (vr != null && vr < -300) {
    if (typeof ac.alt_baro === 'number' && ac.alt_baro < 10000) {
      return { code: 'descent', text: t('phase.descentArr') };
    }
    return { code: 'descent', text: t('phase.descent') };
  }
  if (typeof ac.alt_baro === 'number' && ac.alt_baro > 24000) {
    return { code: 'cruise', text: t('phase.cruise') };
  }
  // Flag 'ground' ma in volo (velocita alta): e basso, tipicamente in manovra
  if (isGroundAlt(ac.alt_baro)) return { code: 'approach', text: t('phase.approach') };
  return { code: 'level', text: t('phase.level') };
}

// Solo il testo, per chi deve unicamente scriverlo a schermo
export function flightPhase(ac) {
  return flightPhaseInfo(ac).text;
}

/**
 * Cosa scrivere nell'etichetta ancorata all'aereo selezionato sulla mappa.
 * Il disegno e' in src/ui/icone.js: qui si decide solo il contenuto, e la
 * decisione piu' delicata e' se fidarsi della rotta d'archivio.
 *
 * @param {object} ac     aereo in formato ADSBexchange v2
 * @param {object} rotta  voce di cache rotte per il suo callsign, o null
 */
export function datiEtichetta(ac, rotta) {
  var cs = (ac.flight || '').trim();
  var numero = cs || ac.hex.toUpperCase();
  var rottaTesto = null;
  if (rotta) {
    // Numero di volo commerciale, se la rotta ce lo dice: piu' riconoscibile
    // del callsign operativo (AZA1234 -> AZ1234).
    var fnum = fmtFlight(rotta.flightIata);
    if (fnum) numero = fnum;
    // Le rotte vengono da un archivio: quella registrata puo' non essere
    // quella che l'aereo sta volando adesso, e una rotta sbagliata in etichetta
    // e' peggio di nessuna rotta. Si mostra solo se posizione e prua reali la
    // confermano.
    if (routeConsistent(ac, rotta)) {
      rottaTesto = (rotta.orig.iata || rotta.orig.icao || '?') + ' → ' +
                   (rotta.dest.iata || rotta.dest.icao || '?');
    }
  }
  return {
    numero: numero,
    compagnia: airlineName(ac.flight),
    rotta: rottaTesto,
    quota: altLabel(ac),
    velocita: ac.gs != null ? Math.round(ac.gs) + ' kt' : '--',
    direzione: ac.track != null ? Math.round(ac.track) + '° ' + compass(ac.track) : ''
  };
}

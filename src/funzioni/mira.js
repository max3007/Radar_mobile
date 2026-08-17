// MIRA: il mirino a due assi che guida a puntare il telefono verso l'aereo
// selezionato, in rotazione (bussola) e in alzata (inclinazione).
//
// Il modulo e' diviso in due meta' apposta:
//
// - guidaMira() decide. E' pura: date le due differenze angolari dice dove
//   va il mirino e cosa dire all'utente. Contiene l'isteresi anti-tremolio,
//   che e' il pezzo di logica piu' facile da rompere per sbaglio e finora
//   viveva sepolto dentro un gestore di eventi dei sensori, dove nessun test
//   poteva arrivare.
// - creaMira() esegue. Parla con i sensori e scrive nel DOM.

import { t } from '../ui/i18n.js';
import { bearingFromCenter, elevationAngle } from '../dominio/index.js';

export var SMOOTH = 0.15;    // 0..1: piu basso = piu stabile ma piu lento
export var LOCK_IN = 8;      // entra in allineamento sotto questa differenza
export var LOCK_OUT = 15;    // esce solo oltre questa (isteresi anti-tremolio)
export var SCALE_DEG = 60;   // gradi visibili dal centro al bordo del mirino

/**
 * Dove mettere il mirino e cosa dire, date le differenze rispetto al bersaglio.
 *
 * @param {number}  diffAz   gradi da recuperare in rotazione; >0 = ruota a destra
 * @param {number}  diffEl   gradi da recuperare in alzata; >0 = alza il telefono.
 *                           Ignorato se hasPitch e false.
 * @param {boolean} hasPitch il sensore riporta l'inclinazione?
 * @param {boolean} eraAgganciato  esito precedente (serve all'isteresi)
 * @param {number}  elevAssoluta   elevazione del bersaglio, per il caso senza
 *                                 inclinazione; null se sconosciuta
 */
export function guidaMira(diffAz, diffEl, hasPitch, eraAgganciato, elevAssoluta) {
  var adA = Math.abs(diffAz);
  var adE = hasPitch ? Math.abs(diffEl) : 0;

  // Isteresi: si aggancia sotto LOCK_IN ma si sgancia solo oltre LOCK_OUT.
  // Con una soglia sola, sul bordo il mirino alternava di continuo tra
  // "allineato" e "non allineato" a ogni micro-movimento della mano.
  var maxDiff = Math.max(adA, adE);
  var agganciato = eraAgganciato;
  if (!eraAgganciato && maxDiff < LOCK_IN) agganciato = true;
  else if (eraAgganciato && maxDiff > LOCK_OUT) agganciato = false;

  if (agganciato) {
    return {
      agganciato: true,
      // Fermo al centro: niente micro-rumore quando ormai ci siamo
      sinistraPct: 50,
      altoPct: 50,
      statoKey: 'mira.aligned', statoParams: null,
      subKey: 'mira.framed', subParams: null
    };
  }

  function clamp(v) { return Math.max(-45, Math.min(45, v / SCALE_DEG * 45)); }

  // Riga 1: rotazione, sempre presente
  var statoKey, statoParams = null;
  if (adA < LOCK_IN) statoKey = 'mira.rotOk';
  else {
    statoKey = diffAz > 0 ? 'mira.right' : 'mira.left';
    statoParams = { n: Math.round(adA) };
  }

  // Riga 2: elevazione, sempre sotto la prima. Le due righe ci sono sempre
  // entrambe: cosi' l'altezza del blocco non cambia e il mirino non trasla.
  var subKey, subParams = null;
  if (!hasPitch) {
    subKey = 'mira.elevOf';
    subParams = { v: (elevAssoluta == null ? '--' : elevAssoluta + '°') };
  } else if (adE < LOCK_IN) {
    subKey = 'mira.elevOk';
  } else {
    subKey = diffEl > 0 ? 'mira.up' : 'mira.down';
    subParams = { n: Math.round(adE) };
  }

  return {
    agganciato: false,
    sinistraPct: 50 + clamp(diffAz),
    altoPct: hasPitch ? (50 - clamp(diffEl)) : 50,
    statoKey: statoKey, statoParams: statoParams,
    subKey: subKey, subParams: subParams
  };
}

/**
 * @param {object}   cfg
 * @param {function} cfg.getCentro  () => [lat, lon] del punto di osservazione
 * @param {function} cfg.getAereo   () => aereo selezionato, o null
 */
export function creaMira(cfg) {
  var attiva = false;
  var handler = null;
  // Componenti circolari per l'azimut (regge il salto 359->0) + EMA sul pitch
  var smoothSin = null, smoothCos = null, smoothBeta = null;
  // Riferimento di pitch che corrisponde all'orizzonte (0° di elevazione).
  // Default 90°: telefono tenuto verticale. La calibrazione lo azzera sul reale.
  var betaHorizon = 90;
  var lastBeta = null;    // ultimo pitch grezzo, per il pulsante CALIBRA
  var agganciato = false;

  function el(id) { return document.getElementById(id); }

  function bearingBersaglio() {
    var ac = cfg.getAereo();
    if (!ac || ac.lat == null) return null;
    return bearingFromCenter(cfg.getCentro(), ac.lat, ac.lon);
  }
  function elevazioneBersaglio() {
    var ac = cfg.getAereo();
    if (!ac || ac.lat == null) return null;
    return elevationAngle(cfg.getCentro(), ac.lat, ac.lon, ac.alt_baro);
  }
  function scriviElevazioneStatica() {
    // Stato iniziale della riga elevazione, prima che arrivino i sensori
    var e = elevazioneBersaglio();
    el('miraSub').textContent = t('mira.elevOf', { v: (e == null ? '--' : e + '°') });
  }

  function onOrientation(ev) {
    // --- Asse orizzontale: rotazione (bussola) ---
    var heading = null;
    if (typeof ev.webkitCompassHeading === 'number') heading = ev.webkitCompassHeading;
    else if (ev.alpha != null) heading = 360 - ev.alpha; // Android: alpha antiorario da Nord
    if (heading == null) return;
    var rad = heading * Math.PI / 180;
    if (smoothSin == null) { smoothSin = Math.sin(rad); smoothCos = Math.cos(rad); }
    else {
      smoothSin = smoothSin * (1 - SMOOTH) + Math.sin(rad) * SMOOTH;
      smoothCos = smoothCos * (1 - SMOOTH) + Math.cos(rad) * SMOOTH;
    }
    var smussato = (Math.atan2(smoothSin, smoothCos) * 180 / Math.PI + 360) % 360;

    var brg = bearingBersaglio();
    if (brg == null) return;
    var diffAz = ((brg - smussato + 540) % 360) - 180; // -180..180

    // --- Asse verticale: alzata (inclinazione del telefono) ---
    var hasPitch = (ev.beta != null);
    var diffEl = null;
    if (hasPitch) {
      lastBeta = ev.beta;
      if (smoothBeta == null) smoothBeta = ev.beta;
      else smoothBeta = smoothBeta * (1 - SMOOTH) + ev.beta * SMOOTH;
      // Elevazione a cui punta il telefono: verticale (betaHorizon) = orizzonte
      var elevPuntata = betaHorizon - smoothBeta;
      var tgt = elevazioneBersaglio();
      if (tgt != null) diffEl = tgt - elevPuntata; // >0 = aereo piu in alto -> alza
      else hasPitch = false;
    }

    var g = guidaMira(diffAz, diffEl, hasPitch, agganciato, elevazioneBersaglio());
    agganciato = g.agganciato;

    var target = el('miraTarget');
    target.style.left = g.sinistraPct + '%';
    target.style.top = g.altoPct + '%';
    el('miraStatus').textContent = t(g.statoKey, g.statoParams);
    el('miraSub').textContent = t(g.subKey, g.subParams);
    el('miraLocked').style.display = g.agganciato ? 'block' : 'none';
  }

  function start() {
    if (!cfg.getAereo()) return;
    // Reset del filtro: riparte pulito
    smoothSin = null; smoothCos = null; smoothBeta = null; agganciato = false;
    var hint = el('miraHint');
    el('miraOverlay').style.display = 'block';
    scriviElevazioneStatica();
    el('miraStatus').textContent = t('mira.move');
    function aggancia() {
      attiva = true;
      handler = onOrientation;
      window.addEventListener('deviceorientationabsolute', handler, true);
      window.addEventListener('deviceorientation', handler, true);
      hint.textContent = t('mira.compassHint');
    }
    // iOS 13+: serve permesso esplicito
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(function (resp) {
        if (resp === 'granted') aggancia();
        else hint.textContent = t('mira.permDenied');
      }).catch(function () { hint.textContent = t('mira.unavailable'); });
    } else if (window.DeviceOrientationEvent) {
      aggancia();
    } else {
      hint.textContent = t('mira.unsupported');
    }
  }

  function stop() {
    attiva = false;
    el('miraOverlay').style.display = 'none';
    if (handler) {
      window.removeEventListener('deviceorientationabsolute', handler, true);
      window.removeEventListener('deviceorientation', handler, true);
      handler = null;
    }
  }

  // Calibrazione orizzonte: l'inclinazione attuale del telefono diventa lo 0°
  // di elevazione. Da usare tenendo il telefono verticale puntato all'orizzonte.
  function calibra() {
    if (lastBeta == null) {
      el('miraHint').textContent = t('mira.moveFirst');
      return;
    }
    betaHorizon = lastBeta;
    el('miraHint').textContent = t('mira.calibrated');
  }

  // L'aereo si muove tra un giro di polling e l'altro: se il mirino e' aperto
  // ma i sensori non hanno ancora mandato nulla, almeno la riga dell'elevazione
  // va tenuta aggiornata.
  function aggiornaBersaglio() {
    if (attiva) scriviElevazioneStatica();
  }

  return {
    start: start,
    stop: stop,
    calibra: calibra,
    aggiornaBersaglio: aggiornaBersaglio,
    attiva: function () { return attiva; }
  };
}

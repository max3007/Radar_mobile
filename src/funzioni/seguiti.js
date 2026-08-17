// Aerei seguiti: la campanella nella scheda accende un avviso in-app quando
// quell'aereo sta per passarti vicino.
//
// Funziona solo con l'app aperta. Le notifiche a schermo spento
// richiederebbero un backend con push, che questa app non ha e non vuole.

import { nextPass, landingBeforePass, compass } from '../dominio/index.js';
import { PASS_ALERT_MIN } from '../config.js';
import { t } from '../ui/i18n.js';
import { aereoConHex } from '../app/contesto.js';

// Un avviso per finestra di avvicinamento: passato questo tempo lo stesso
// aereo puo' tornare ad avvisare, se rientra nelle condizioni.
var RIARMO_MS = 10 * 60000;

/**
 * @param {object}   ctx
 * @param {object}   ctx.stato        stato condiviso (legge aerei, centro, passKm)
 * @param {function} ctx.vaiAllAereo  per aprire l'aereo toccando l'avviso
 * @param {Array}    ctx.aeroporti    per scartare chi atterra prima di arrivare
 * @param {function} ctx.etichettaVolo(ac) come chiamare l'aereo nell'avviso
 */
export function creaSeguiti(ctx) {
  var seguiti = {};      // hex -> true
  var avvisati = {};     // hex -> quando abbiamo avvisato l'ultima volta
  var audio = null;
  var timerNascondi = null;

  function el(id) { return document.getElementById(id); }
  function seguito(hex) { return !!seguiti[hex]; }

  function aggiornaPulsante() {
    var btn = el('followBtn');
    var ac = ctx.stato.aereoSelezionato;
    if (ac && seguito(ac.hex)) { btn.classList.add('on'); btn.title = t('follow.on'); }
    else { btn.classList.remove('on'); btn.title = t('follow.off'); }
  }

  function alterna() {
    var ac = ctx.stato.aereoSelezionato;
    if (!ac) return;
    if (seguiti[ac.hex]) { delete seguiti[ac.hex]; delete avvisati[ac.hex]; }
    else {
      seguiti[ac.hex] = true;
      // L'audio va preparato ORA, dentro il gesto dell'utente: i browser
      // rifiutano di far suonare qualcosa creato piu' tardi, e l'avviso
      // arriverebbe muto proprio quando serve.
      try {
        audio = audio || new (window.AudioContext || window.webkitAudioContext)();
        if (audio.state === 'suspended') audio.resume();
      } catch (e) { /* audio non disponibile su questo dispositivo */ }
    }
    aggiornaPulsante();
  }

  function bip() {
    try {
      if (!audio) return;
      if (audio.state === 'suspended') audio.resume();
      [0, 0.28].forEach(function (ritardo) {
        var o = audio.createOscillator(), g = audio.createGain();
        o.connect(g); g.connect(audio.destination);
        o.type = 'sine'; o.frequency.value = 880;
        var quando = audio.currentTime + ritardo;
        g.gain.setValueAtTime(0.0001, quando);
        g.gain.exponentialRampToValueAtTime(0.35, quando + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, quando + 0.22);
        o.start(quando); o.stop(quando + 0.24);
      });
    } catch (e) { /* niente audio */ }
  }

  function avvisa(ac, passaggio) {
    var bar = el('alertBar');
    var minuti = Math.max(0, Math.round(passaggio.tMin));
    var km = passaggio.dMinKm < 1
      ? Math.round(passaggio.dMinKm * 1000) + ' m'
      : passaggio.dMinKm.toFixed(1) + ' km';
    bar.textContent = t('alert.incoming', {
      flight: ctx.etichettaVolo(ac),
      when: minuti <= 0 ? t('arr.now') : t('arr.inMin', { n: minuti }),
      km: km,
      dir: compass(passaggio.brgAtPass)
    });
    bar.style.display = 'block';
    bar.onclick = function () { bar.style.display = 'none'; ctx.vaiAllAereo(ac); };
    // Alcuni browser espongono vibrate ma la negano senza un gesto recente
    if (navigator.vibrate) { try { navigator.vibrate([200, 100, 200]); } catch (e) { /* no */ } }
    bip();
    if (timerNascondi) clearTimeout(timerNascondi);
    timerNascondi = setTimeout(function () { bar.style.display = 'none'; }, 10000);
  }

  /** Da chiamare a ogni giro di polling, con i dati appena arrivati. */
  function controlla() {
    var s = ctx.stato;
    for (var hex in seguiti) {
      var ac = aereoConHex(s.aerei, hex);
      if (!ac) continue;
      var passaggio = nextPass(s.centro, ac);
      if (!passaggio || passaggio.tMin > PASS_ALERT_MIN || passaggio.dMinKm > s.passKm) continue;
      // Atterra a un aeroporto sulla rotta prima di arrivare: non ci sorvolera'
      if (landingBeforePass(s.centro, ac, passaggio, ctx.aeroporti)) continue;
      if (avvisati[hex] && Date.now() - avvisati[hex] < RIARMO_MS) continue;
      avvisati[hex] = Date.now();
      avvisa(ac, passaggio);
    }
  }

  el('followBtn').addEventListener('click', function (e) {
    e.stopPropagation();
    alterna();
  });

  return {
    controlla: controlla,
    aggiornaPulsante: aggiornaPulsante,
    seguito: seguito
  };
}

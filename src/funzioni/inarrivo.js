// IN ARRIVO: previsione dei prossimi passaggi ravvicinati.
//
// Il calcolo del punto di massimo avvicinamento sta in dominio/passaggi.js.
// Qui c'e' il resto: la scansione dedicata a raggio ampio, la tabella e le
// proiezioni sulla mappa.
//
// La scansione a 250 NM esiste per un motivo preciso: il preavviso deve
// arrivare molto prima che l'aereo entri nel raggio della mappa. Un utente
// con la mappa stretta a 40 NM vedrebbe altrimenti "fra 2 minuti" senza
// averlo mai visto avvicinarsi.

import L from 'leaflet';
import { nextPass, landingBeforePass, airlineName, compass } from '../dominio/index.js';
import { PASS_HORIZON_MIN, PASS_SCAN_NM, PASS_OVERHEAD_KM } from '../config.js';
import { t } from '../ui/i18n.js';
import { esc } from '../ui/dom.js';
import { iconaPuntoPassaggio } from '../ui/icone.js';
import { aereoConHex } from '../app/contesto.js';

/**
 * @param {object}   ctx
 * @param {object}   ctx.stato          legge centro, passKm, raggio, aerei, aereiScansione
 * @param {object}   ctx.mappa          istanza Leaflet, per le proiezioni
 * @param {Array}    ctx.aeroporti      per scartare chi atterra prima di arrivare
 * @param {function} ctx.chiediVoli     l'unico modo di interrogare la fonte
 * @param {function} ctx.urlPunto(lat, lon, nm)  come si compone l'URL della fonte
 * @param {function} ctx.tagliaAlRaggio(lista, nm)
 * @param {function} ctx.passaFiltri(ac)
 * @param {function} ctx.aperto()       il pannello e visibile?
 * @param {function} ctx.vaiAllAereo(ac, opz)
 * @param {function} ctx.etichettaVolo(ac)
 */
export function creaInArrivo(ctx) {
  var strato = null;      // proiezioni sulla mappa (linea + crocetta)
  var seq = 0;            // scarta le risposte fuori ordine della scansione
  // Vero quando la scansione ampia non e riuscita e stiamo mostrando solo gli
  // aerei del raggio corrente. Prima il ripiego era muto: la lista dichiarava
  // di essere una scansione a 250 NM mentre mostrava i dati di 40 NM.
  var ripiego = false;

  /** Calcola e ordina i passaggi entro soglia e orizzonte temporale. */
  function calcola() {
    var s = ctx.stato;
    var out = [];
    var candidati = s.aereiScansione.filter(ctx.passaFiltri);
    for (var i = 0; i < candidati.length; i++) {
      var ac = candidati[i];
      var passaggio = nextPass(s.centro, ac);
      if (!passaggio) continue;
      if (passaggio.tMin > PASS_HORIZON_MIN) continue;
      if (passaggio.dMinKm > s.passKm) continue;
      // Falso positivo: atterra a un aeroporto sulla rotta prima di arrivare
      // sopra di noi (es. gli arrivi a Fiumicino visti da Anzio).
      if (landingBeforePass(s.centro, ac, passaggio, ctx.aeroporti)) continue;
      out.push({ ac: ac, pass: passaggio });
    }
    out.sort(function (a, b) { return a.pass.tMin - b.pass.tMin; });
    return out;
  }

  function pulisciProiezioni() {
    if (strato) { ctx.mappa.removeLayer(strato); strato = null; }
  }

  function disegnaProiezioni(passaggi) {
    pulisciProiezioni();
    if (!passaggi.length) return;
    strato = L.layerGroup();
    for (var i = 0; i < passaggi.length; i++) {
      var ac = passaggi[i].ac, p = passaggi[i].pass;
      L.polyline([[ac.lat, ac.lon], [p.passLat, p.passLon]], {
        color: '#6fd3ff', weight: 1.2, opacity: 0.5, dashArray: '4,6', interactive: false
      }).addTo(strato);
      L.marker([p.passLat, p.passLon], {
        icon: iconaPuntoPassaggio(), interactive: false, keyboard: false
      }).addTo(strato);
    }
    strato.addTo(ctx.mappa);
  }

  function disegnaTabella(passaggi) {
    var box = document.getElementById('passList');
    var lista = passaggi || calcola();
    // Se la scansione ampia non e riuscita lo si dice: mostrare i dati del
    // raggio corrente spacciandoli per una scansione a 250 NM e peggio che
    // non mostrarli affatto.
    var avviso = ripiego
      ? '<div class="empty">' + t('arr.reduced', { nm: ctx.stato.raggio }) + '</div>' : '';
    if (!lista.length) {
      box.innerHTML = avviso + '<div class="empty">' + t('arr.none', { n: PASS_HORIZON_MIN }) + '</div>';
      return;
    }
    var ora = Date.now();
    var html = '';
    for (var i = 0; i < lista.length; i++) {
      var ac = lista[i].ac, p = lista[i].pass;
      var minuti = Math.max(0, Math.round(p.tMin));
      var quando = new Date(ora + p.tMin * 60000);
      var hh = ('0' + quando.getHours()).slice(-2) + ':' + ('0' + quando.getMinutes()).slice(-2);
      var eta = minuti <= 0 ? t('arr.now') : t('arr.inMin', { n: minuti });
      var km = p.dMinKm < 1
        ? Math.round(p.dMinKm * 1000) + ' m'
        : p.dMinKm.toFixed(p.dMinKm < 10 ? 1 : 0) + ' km';
      var sopra = (p.dMinKm < PASS_OVERHEAD_KM);
      html += '<div class="pr" data-hex="' + esc(ac.hex) + '">' +
        '<div class="eta"><b>' + eta + '</b><span>' + hh + '</span></div>' +
        '<div class="info"><div class="f">' + esc(ctx.etichettaVolo(ac)) + '</div>' +
          '<small>' + esc(airlineName(ac.flight)) + (ac.t ? ' · ' + esc(ac.t) : '') + '</small>' +
          (sopra ? '<span class="badge">' + t('arr.overhead') + '</span>' : '') + '</div>' +
        '<div class="geo">' + km + '<small>' +
          t('arr.towards', { elev: p.elevAtPass, dir: compass(p.brgAtPass) }) + '</small></div>' +
        '</div>';
    }
    box.innerHTML = avviso + html;
  }

  /**
   * Scansione a raggio massimo, poi tabella e proiezioni. Gira solo a
   * pannello aperto: e' una seconda richiesta ogni 6 secondi, non va sprecata
   * quando nessuno la sta guardando.
   */
  async function scansiona() {
    if (!ctx.aperto()) return;
    var mio = ++seq;
    try {
      var s = ctx.stato;
      var dati = await ctx.chiediVoli(ctx.urlPunto(s.centro[0], s.centro[1], PASS_SCAN_NM));
      if (mio !== seq || !ctx.aperto()) return;
      s.aereiScansione = ctx.tagliaAlRaggio(dati.ac || [], PASS_SCAN_NM);
      ripiego = false;
    } catch (e) {
      if (mio !== seq) return;
      ctx.stato.aereiScansione = ctx.stato.aerei;  // ripiego sul raggio corrente
      ripiego = true;                              // e lo dichiariamo
    }
    if (!ctx.aperto()) return;
    // Tabella e proiezioni mostrano la STESSA lista: calcolarla due volte non
    // era solo spreco, era il modo di farle divergere se un aereo si muoveva
    // fra un calcolo e l'altro.
    var passaggi = calcola();
    disegnaTabella(passaggi);
    disegnaProiezioni(passaggi);
  }

  /** Un aereo scelto dalla tabella: chiude il pannello e ci porta sopra. */
  function scegli(hex) {
    var ac = aereoConHex(ctx.stato.aereiScansione, hex);
    if (!ac) return;
    pulisciProiezioni();
    ctx.vaiAllAereo(ac, { chiudi: 'passes' });
  }

  return {
    apri: function () {
      document.getElementById('passList').innerHTML =
        '<div class="empty">' + t('arr.scanning') + '</div>';
      scansiona();
    },
    aggiorna: function () { if (ctx.aperto()) scansiona(); },
    ridisegna: function () { if (ctx.aperto()) disegnaTabella(null); },
    pulisciProiezioni: pulisciProiezioni,
    scegli: scegli,
    calcola: calcola
  };
}

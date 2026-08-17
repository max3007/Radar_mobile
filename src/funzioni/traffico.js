// Pannello TRAFFICO: due schede sugli stessi dati.
//
//  AEREI      la lista di cosa c'e' nel raggio, ordinata per distanza
//  COMPAGNIE  quante ne ha ciascuna, come classifica a barre
//
// Le due schede sono mutuamente esclusive e si ridisegna SOLO quella
// visibile. Prima si ridisegnavano entrambe a ogni giro di polling, cioe
// ogni 6 secondi: meta del lavoro finiva in un elemento display:none.
// Misurato con 400 aerei, erano 680 ms di lavoro bloccante ogni 4 cicli,
// scesi a 464 ms guardando quale scheda e davvero aperta.

import {
  airlineName, altLabel, emergencyInfo, flightPhase,
  isFirefightingAircraft, compass, bearingFromCenter, distanceM
} from '../dominio/index.js';
import { t } from '../ui/i18n.js';
import { esc } from '../ui/dom.js';

/**
 * @param {object}   ctx
 * @param {object}   ctx.stato        legge aerei e centro
 * @param {function} ctx.passaFiltri(ac)
 * @param {function} ctx.aperto()     il pannello e visibile?
 * @param {function} ctx.vicinoAIncendio(hex)  per il distintivo dei Canadair
 */
export function creaTraffico(ctx) {

  /** Classifica delle compagnie in volo (scheda COMPAGNIE). */
  function disegnaClassifica() {
    var conteggi = {};
    var presenti = ctx.stato.aerei.filter(ctx.passaFiltri);
    for (var i = 0; i < presenti.length; i++) {
      var nome = airlineName(presenti[i].flight);
      conteggi[nome] = (conteggi[nome] || 0) + 1;
    }
    var lista = Object.keys(conteggi)
      .map(function (k) { return { nome: k, n: conteggi[k] }; })
      .sort(function (a, b) { return b.n - a.n; });
    var massimo = lista.length ? lista[0].n : 1;
    var html = '';
    for (var j = 0; j < lista.length; j++) {
      html += '<div class="row"><div class="name">' + esc(lista[j].nome) + '</div>' +
        '<div class="barWrap"><div class="bar" style="width:' +
          Math.round(lista[j].n / massimo * 100) + '%"></div></div>' +
        '<div class="n">' + lista[j].n + '</div></div>';
    }
    document.getElementById('boardList').innerHTML = html ||
      '<div class="row"><div class="name">' + t('board.none') + '</div></div>';
  }

  /** Lista degli aerei nel raggio (scheda AEREI), ordinata per distanza. */
  function disegnaLista() {
    var s = ctx.stato;
    var lista = s.aerei
      .filter(function (a) { return a.lat != null && a.lon != null && ctx.passaFiltri(a); })
      .map(function (a) {
        return { ac: a, d: distanceM(s.centro[0], s.centro[1], a.lat, a.lon) };
      })
      .sort(function (x, y) { return x.d - y.d; });

    document.getElementById('planeCount').textContent = lista.length
      ? t(lista.length === 1 ? 'list.count1' : 'list.count', { n: lista.length })
      : '';
    if (!lista.length) {
      document.getElementById('planeList').innerHTML =
        '<div class="empty">' + t('list.none') + '</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < lista.length; i++) {
      var a = lista[i].ac, km = lista[i].d / 1000;
      var volo = esc((a.flight || '').trim() || a.hex.toUpperCase());
      var quota = altLabel(a, true) || '--';
      var velocita = a.gs != null ? Math.round(a.gs) + ' kt' : '--';
      var emergenza = !!emergencyInfo(a);
      var fase = flightPhase(a) || '';
      var antincendio = isFirefightingAircraft(a);
      var distintivoFF = antincendio
        ? '<span class="ffbadge">' +
            (ctx.vicinoAIncendio(a.hex) ? '🔥 ' + t('ff.nearFire') : t('ff.badge')) +
          '</span>'
        : '';
      html += '<div class="acrow' + (emergenza ? ' emg' : '') + (antincendio ? ' ff' : '') +
          '" data-hex="' + esc(a.hex) + '">' +
        '<div class="ac-l"><div class="ac-f">' + volo +
          (emergenza ? '<span class="emgbadge">' + t('emg.badge') + '</span>' : '') +
          distintivoFF + '</div>' +
          '<div class="ac-sub">' + esc(airlineName(a.flight)) +
            (a.t ? ' · ' + esc(a.t) : '') + (fase ? ' · ' + esc(fase) : '') + '</div></div>' +
        '<div class="ac-r"><div class="ac-alt">' + quota + ' · ' + velocita + '</div>' +
          '<div class="ac-dist">' + km.toFixed(0) + ' km ' +
            compass(bearingFromCenter(s.centro, a.lat, a.lon)) + '</div></div>' +
        '</div>';
    }
    document.getElementById('planeList').innerHTML = html;
  }

  function schedaVisibile() {
    return document.getElementById('tabAirlines').style.display === 'block'
      ? 'compagnie' : 'aerei';
  }

  /** Ridisegna, ma solo se il pannello e aperto e solo la scheda che si guarda. */
  function aggiorna() {
    if (!ctx.aperto()) return;
    if (schedaVisibile() === 'compagnie') disegnaClassifica();
    else disegnaLista();
  }

  // Cambio scheda AEREI / COMPAGNIE
  var linguette = document.querySelectorAll('#board .tabs .tab');
  for (var i = 0; i < linguette.length; i++) {
    linguette[i].addEventListener('click', function () {
      var quale = this.getAttribute('data-tab');
      for (var j = 0; j < linguette.length; j++) {
        linguette[j].classList.toggle('active', linguette[j] === this);
      }
      document.getElementById('tabPlanes').style.display = quale === 'planes' ? 'block' : 'none';
      document.getElementById('tabAirlines').style.display = quale === 'airlines' ? 'block' : 'none';
      aggiorna();   // la scheda appena scoperta va popolata subito
    });
  }

  return { aggiorna: aggiorna };
}

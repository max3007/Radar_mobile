// MIRA: il mirino a due assi che guida a puntare il telefono verso l'aereo
// selezionato, in rotazione (bussola) e in alzata (inclinazione).
//
// Il modulo e' diviso in due meta' apposta:
//
// - le funzioni pure decidono: dove punta il telefono (direzionePuntata) e
//   dove va disegnato il bersaglio (guidaMira). Si provano senza browser.
// - creaMira() esegue. Parla con i sensori e scrive nel DOM.
//
// ---------------------------------------------------------------------------
// PERCHE IL CALCOLO PASSA DA UNA MATRICE DI ROTAZIONE
//
// La versione precedente prendeva `alpha` come azimut e `beta` come alzata.
// E' una scorciatoia che vale SOLO col telefono tenuto perfettamente
// verticale e senza rollio laterale — cioe' quasi mai. Nell'uso vero MIRA si
// tiene alzata verso il cielo, che e' esattamente dove gli angoli di Eulero
// degenerano: a beta = 90° si perde un grado di liberta' (gimbal lock) e
// basta un filo di inclinazione laterale perche' alpha salti di decine di
// gradi. Risultato: il bersaglio sbatteva da un lato all'altro del cerchio e
// centrarlo era impossibile.
//
// La strada corretta e' ricostruire la matrice di rotazione dai tre angoli,
// applicarla al versore che esce dal retro del telefono e leggere azimut ed
// elevazione da quel vettore. E' stabile in ogni assetto, tiene conto del
// rollio, e non ha punti degeneri.
// ---------------------------------------------------------------------------

import { t } from '../ui/i18n.js';
import { bearingFromCenter, elevationAngle } from '../dominio/index.js';

export var SMOOTH = 0.15;    // 0..1: piu basso = piu stabile ma piu lento
export var LOCK_IN = 10;     // gradi: a questo scarto l'aereo tocca il cerchio
export var LOCK_OUT = 15;    // esce solo oltre questa (isteresi anti-tremolio)

// Geometria del reticolo, in percentuale della larghezza del riquadro.
// Il cerchio ha diametro 68%, quindi raggio 34%.
export var RAGGIO_CERCHIO = 34;
// Dove finisce l'aereo quando il bersaglio e infinitamente lontano: appena
// dentro il bordo. La posizione non e lineare ma compressiva, cosi l'aereo
// resta SEMPRE visibile — anche con il bersaglio alle spalle — e diventa
// preciso solo dove serve, cioe vicino al cerchio.
export var RAGGIO_MAX = 47;
// Costante che ancora la curva: a LOCK_IN gradi l'aereo cade esattamente sul
// bordo del cerchio. Ricavata da RAGGIO_MAX * L / (L + S) = RAGGIO_CERCHIO.
var S_CURVA = LOCK_IN * (RAGGIO_MAX / RAGGIO_CERCHIO - 1);

var RAD = Math.PI / 180;
var GRADI = 180 / Math.PI;

/**
 * Il versore verso cui punta il RETRO del telefono, in coordinate mondo.
 *
 * Convenzione W3C: gli assi mondo sono X = Est, Y = Nord, Z = Su, e la
 * rotazione del dispositivo e' la sequenza intrinseca Z-X'-Y'' cioe'
 * Rz(alpha)·Rx(beta)·Ry(gamma). Il retro del telefono — dove sta la
 * fotocamera, la direzione in cui lo si "punta" — e' l'asse -Z del
 * dispositivo, quindi basta prendere la terza colonna della matrice e
 * cambiarle segno.
 *
 * @returns {number[]} [est, nord, su], di modulo 1
 */
export function vettorePuntamento(alpha, beta, gamma) {
  var ca = Math.cos(alpha * RAD), sa = Math.sin(alpha * RAD);
  var cb = Math.cos(beta * RAD),  sb = Math.sin(beta * RAD);
  var cg = Math.cos(gamma * RAD), sg = Math.sin(gamma * RAD);
  // Terza colonna di Rz(a)·Rx(b)·Ry(g), col segno gia' invertito
  return [
    -(ca * sg + sa * sb * cg),
    -(sa * sg - ca * sb * cg),
    -(cb * cg)
  ];
}

/** Azimut (0 = Nord, orario) ed elevazione (gradi sopra l'orizzonte). */
export function direzioneDaVettore(v) {
  var n = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
  return {
    azimut: (Math.atan2(v[0] / n, v[1] / n) * GRADI + 360) % 360,
    elevazione: Math.asin(Math.max(-1, Math.min(1, v[2] / n))) * GRADI
  };
}

/** Dove sta guardando il telefono, dati i tre angoli dei sensori. */
export function direzionePuntata(alpha, beta, gamma) {
  return direzioneDaVettore(vettorePuntamento(alpha, beta, gamma));
}

/**
 * Dove disegnare l'aereo bersaglio e come orientarlo.
 *
 * Il modello: un cerchio FERMO al centro (dove stai guardando adesso) e la
 * sagoma dell'aereo che si muove. Il compito e portare l'aereo DENTRO il
 * cerchio — non al centro esatto: appena entra, l'hai in vista.
 *
 * Perche il cerchio e una zona e non un punto: guardare il cielo a occhio non
 * e mai preciso al grado, e chiedere una centratura perfetta rende lo
 * strumento nervoso senza aggiungere niente. Il cerchio dichiara la
 * tolleranza vera, e il colpo d'occhio basta a capire se ci sei.
 *
 * Un solo indicatore, non due. Una freccia separata direbbe la stessa cosa
 * dell'aereo (da che parte girarsi) e finirebbe nella stessa fascia radiale:
 * provate insieme si accavallano in una macchia unica. Qui e la sagoma stessa
 * ad avere il muso rivolto verso la direzione da prendere, quindi un elemento
 * solo dice dove sta il bersaglio, quanto e lontano e da che parte andare.
 *
 * @param {number}  diffAz   gradi da recuperare in rotazione; >0 = ruota a destra
 * @param {number}  diffEl   gradi da recuperare in alzata; >0 = alza il telefono.
 *                           Ignorato se hasPitch e false.
 * @param {boolean} hasPitch il sensore riporta l'inclinazione?
 * @param {boolean} eraAgganciato  esito precedente (serve all'isteresi)
 * @returns {{agganciato:boolean, aereoX:number, aereoY:number,
 *            angoloAereo:number, distanzaGradi:number}}
 *          aereoX/aereoY: percentuali dentro il riquadro, 50/50 = centro.
 *          angoloAereo: gradi orari con 0 = muso in su, cioe cio che serve a
 *          rotate(). A bersaglio acquisito torna a 0: l'aereo si raddrizza,
 *          perche non c'e piu nessuna direzione da prendere.
 */
export function guidaMira(diffAz, diffEl, hasPitch, eraAgganciato) {
  var adA = Math.abs(diffAz);
  var adE = hasPitch ? Math.abs(diffEl) : 0;

  // Scarto complessivo sui due assi: e il numero dentro al cerchio. Senza
  // inclinazione vale solo la rotazione, altrimenti dichiareremmo una
  // precisione che non abbiamo.
  var distanza = hasPitch ? Math.sqrt(diffAz * diffAz + diffEl * diffEl) : adA;

  // Isteresi: entra nel cerchio sotto LOCK_IN, ne esce solo oltre LOCK_OUT.
  // Con una soglia sola, sul bordo l'indicazione alternava di continuo tra
  // "dentro" e "fuori" a ogni micro-movimento della mano.
  var agganciato = eraAgganciato;
  if (!eraAgganciato && distanza < LOCK_IN) agganciato = true;
  else if (eraAgganciato && distanza > LOCK_OUT) agganciato = false;

  // Direzione sullo schermo: 0 = su, 90 = destra, 180 = giu, -90 = sinistra.
  // atan2(x, y) e non atan2(y, x) proprio per ottenere questa convenzione, che
  // e quella di rotate() in CSS e della rosa dei venti.
  var angolo = hasPitch
    ? Math.atan2(diffAz, diffEl) * 180 / Math.PI
    : (diffAz >= 0 ? 90 : -90);

  // Distanza dal centro, compressiva: lineare vicino, satura lontano.
  var raggio = RAGGIO_MAX * distanza / (distanza + S_CURVA);
  var rad = angolo * Math.PI / 180;

  return {
    agganciato: agganciato,
    aereoX: 50 + raggio * Math.sin(rad),
    // Meno, non piu: sullo schermo l'asse Y cresce verso il basso mentre
    // un'elevazione positiva significa "piu in alto".
    aereoY: hasPitch ? 50 - raggio * Math.cos(rad) : 50,
    angoloAereo: agganciato ? 0 : Math.round(angolo),
    distanzaGradi: Math.round(distanza)
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
  // Media mobile sul VETTORE di puntamento, non sugli angoli. Il vettore e'
  // continuo: non ha il salto 359->0 dell'azimut, e non ha il caso degenere
  // della media circolare fra due direzioni opposte.
  var vSmussato = null;
  // Correzione dell'elevazione impostata dal pulsante di calibrazione.
  var offsetElev = 0;
  var ultimaElev = null;  // ultima elevazione grezza, per il pulsante
  var agganciato = false;
  // UNA sola sorgente di orientamento. Su Android arrivano DUE flussi:
  // 'deviceorientationabsolute' ha alpha riferito al Nord vero, mentre
  // 'deviceorientation' puo' averlo riferito a dov'era il telefono all'avvio.
  // Ascoltandoli entrambi con lo stesso gestore, l'azimut saltava fra due
  // riferimenti diversi a ogni evento (60 volte al secondo) e il bersaglio
  // rimbalzava da un lato all'altro del cerchio: era impossibile centrarlo.
  var sorgente = null;

  /** true se questo evento viene dal flusso che abbiamo scelto di ascoltare. */
  function sorgenteBuona(ev) {
    var assoluto = (ev.type === 'deviceorientationabsolute') ||
                   ev.absolute === true ||
                   typeof ev.webkitCompassHeading === 'number';
    if (sorgente === null) { sorgente = { tipo: ev.type, assoluto: assoluto }; return true; }
    // Un flusso assoluto ha sempre la precedenza su uno relativo
    if (assoluto && !sorgente.assoluto) { sorgente = { tipo: ev.type, assoluto: assoluto }; return true; }
    return ev.type === sorgente.tipo;
  }

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
  /** Prima che arrivino i sensori non sappiamo dove sta l'aereo: si dichiara. */
  function inAttesaDiSensori() {
    el('miraGradi').textContent = '--';
    el('miraBox').classList.remove('agganciato');
    el('miraBox').classList.add('in-attesa');
  }

  function onOrientation(ev) {
    if (!sorgenteBuona(ev)) return;
    if (ev.alpha == null) return;

    // iOS espone l'heading vero della bussola a parte, e lascia alpha
    // relativo: si sostituisce, cosi la matrice lavora sempre sul Nord vero.
    var alpha = (typeof ev.webkitCompassHeading === 'number')
      ? 360 - ev.webkitCompassHeading
      : ev.alpha;
    // Senza inclinazione nota si assume il telefono verticale, che e' come
    // lo si tiene per guardare il cielo.
    var hasPitch = (ev.beta != null);
    var beta = hasPitch ? ev.beta : 90;
    var gamma = (ev.gamma != null) ? ev.gamma : 0;

    var v = vettorePuntamento(alpha, beta, gamma);
    if (vSmussato == null) vSmussato = v.slice();
    else for (var i = 0; i < 3; i++) {
      vSmussato[i] = vSmussato[i] * (1 - SMOOTH) + v[i] * SMOOTH;
    }
    var punta = direzioneDaVettore(vSmussato);
    ultimaElev = punta.elevazione;

    var brg = bearingBersaglio();
    if (brg == null) return;
    var diffAz = ((brg - punta.azimut + 540) % 360) - 180; // -180..180

    var diffEl = null;
    if (hasPitch) {
      var tgt = elevazioneBersaglio();
      // >0 = aereo piu in alto del punto mirato -> alza il telefono
      if (tgt != null) diffEl = tgt - (punta.elevazione - offsetElev);
      else hasPitch = false;
    }

    var g = guidaMira(diffAz, diffEl, hasPitch, agganciato);
    agganciato = g.agganciato;

    // L'aereo si muove e punta il muso dove devi girarti; il cerchio no.
    var aereo = el('miraAereo');
    aereo.style.left = g.aereoX + '%';
    aereo.style.top = g.aereoY + '%';
    aereo.style.transform = 'translate(-50%, -50%) rotate(' + g.angoloAereo + 'deg)';
    el('miraGradi').textContent = g.distanzaGradi + '°';
    var box = el('miraBox');
    box.classList.remove('in-attesa');
    box.classList.toggle('agganciato', g.agganciato);
  }

  function start() {
    if (!cfg.getAereo()) return;
    // Reset del filtro e della scelta di sorgente: riparte pulito
    vSmussato = null; sorgente = null; agganciato = false;
    var hint = el('miraHint');
    hint.textContent = '';
    el('miraOverlay').style.display = 'block';
    inAttesaDiSensori();
    // Con MIRA aperta si guarda il cielo, non la mappa: l'etichetta ancorata
    // all'aereo e centrata come il mirino, quindi finisce sempre dentro il
    // cerchio e copre proprio i gradi che servono. Sparisce finche dura.
    document.body.classList.add('mira-attiva');
    function aggancia() {
      attiva = true;
      handler = onOrientation;
      window.addEventListener('deviceorientationabsolute', handler, true);
      window.addEventListener('deviceorientation', handler, true);
      // Nessun messaggio quando va tutto bene: il reticolo parla da solo.
      // Il testo compare solo se c'e qualcosa che l'utente deve sapere.
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
    document.body.classList.remove('mira-attiva');
    el('miraOverlay').style.display = 'none';
    if (handler) {
      window.removeEventListener('deviceorientationabsolute', handler, true);
      window.removeEventListener('deviceorientation', handler, true);
      handler = null;
    }
  }

  // Calibrazione orizzonte: l'inclinazione attuale del telefono diventa lo 0°
  // di elevazione. Da usare puntando il telefono all'orizzonte.
  function calibra() {
    if (ultimaElev == null) {
      el('miraHint').textContent = t('mira.moveFirst');
      return;
    }
    // L'elevazione calcolata adesso diventa lo zero. Con la matrice il calcolo
    // e' gia geometricamente corretto: questo serve solo a compensare come
    // ciascuno tiene il telefono rispetto alla propria linea di vista.
    offsetElev = ultimaElev;
    el('miraHint').textContent = t('mira.calibrated');
  }

  // L'aereo si muove tra un giro di polling e l'altro. Se i sensori stanno
  // gia arrivando ci pensa onOrientation; se non sono ancora partiti non c'e
  // niente da aggiornare, perche senza orientamento non sappiamo dove sia.
  function aggiornaBersaglio() { /* la posizione dipende dai sensori */ }

  return {
    start: start,
    stop: stop,
    calibra: calibra,
    aggiornaBersaglio: aggiornaBersaglio,
    attiva: function () { return attiva; }
  };
}

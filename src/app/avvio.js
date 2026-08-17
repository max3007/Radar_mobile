// Logica applicativa del radar: mappa Leaflet, marker/scie, pannelli,
// polling, bussola MIRA, ricerca, geolocalizzazione.
// Portata quasi 1:1 dal prototipo a file singolo (vedi legacy/radarmobile.html);
// le chiusure interne restano volutamente insieme perche condividono lo stato
// (markers, trails, selezione, tag). Dati e funzioni pure sono nei moduli.

import L from 'leaflet';
import { DEFAULT_CENTER, DEFAULT_RADIUS_NM, POLL_INTERVAL_MS, API, TILE_STYLES, DEFAULT_MAP_STYLE, PASS_HORIZON_MIN, DEFAULT_PASS_KM, PASS_SCAN_NM, PASS_OVERHEAD_KM, PASS_ALERT_MIN, FIRE_WMS, wmsTimeRange, PLANES_API_ENABLED, PLANES_SOURCES, PLANES_SOURCE } from '../config.js';

// Fonte dei dati di volo in uso (vedi PLANES_SOURCES in config.js)
var SRC = PLANES_SOURCES[PLANES_SOURCE];
import { loadPrefs, savePrefs } from '../servizi/preferenze.js';
import {
  airlineName, toCallsign, fmtFlight, planeColor, altLabel, isOnGround, compass,
  bearingFromCenter, elevationAngle, emergencyInfo, flightPhase, flightPhaseInfo,
  routeConsistent, nextPass, landingBeforePass, isFirefightingAircraft, datiEtichetta,
  trimToRadius
} from '../dominio/index.js';
import { t, setLang, detectLang, applyStaticI18n } from '../ui/i18n.js';
import { creaCoda, fetchConScadenza, creaCanaleVoli, API_MIN_GAP_MS } from '../servizi/voli.js';
import { creaBanner } from '../ui/banner.js';
import {
  iconaAereo, iconaOsservatore, iconaAeroporto, iconaPuntoPassaggio, iconaEtichetta
} from '../ui/icone.js';
import { creaMira } from '../funzioni/mira.js';
import { creaOverlayIncendi } from '../ui/overlays.js';
import { esc, delega } from '../ui/dom.js';
import { creaCache } from '../infra/cache.js';
import { creaStato, applicaPreferenze, preferenzeDa, aereoConHex } from './contesto.js';
import { creaSeguiti } from '../funzioni/seguiti.js';
import { creaVerificaIncendi } from '../servizi/incendi.js';
import { creaInArrivo } from '../funzioni/inarrivo.js';
import { creaTraffico } from '../funzioni/traffico.js';
import AIRPORTS from '../data/airports.json';

export function initApp() {
  if (typeof L === 'undefined') {
    document.getElementById('hud').innerHTML = '<div style="padding:8px;font-size:12px;">' + t('err.leaflet') + '</div>';
    return;
  }

  // Lo stato condiviso dell'app, in un oggetto solo (v. app/contesto.js).
  // Le funzionalita estratte lo ricevono e lo LEGGONO; scriverci dentro
  // spetta a questo file, che e l'unico a sapere cosa va ridisegnato dopo.
  var stato = creaStato({
    centro: DEFAULT_CENTER.slice(),   // puo cambiare con la geolocalizzazione
    raggio: DEFAULT_RADIUS_NM,
    stileMappa: DEFAULT_MAP_STYLE,
    passKm: DEFAULT_PASS_KM,
    lingua: detectLang()              // dal dispositivo, override in impostazioni
  });

  applicaPreferenze(stato, loadPrefs(), TILE_STYLES);

  function buildPrefs() { return preferenzeDa(stato); }

  // Applica la lingua a tutte le stringhe statiche dell'interfaccia
  setLang(stato.lingua);
  var htmlRoot = document.getElementById('htmlRoot');
  function applyLang() {
    setLang(stato.lingua);
    if (htmlRoot) htmlRoot.setAttribute('lang', stato.lingua);
    applyStaticI18n();
    updateSliderLabels();
    updateArrNote();
    var chips = document.querySelectorAll('#langChips .chip');
    for (var i = 0; i < chips.length; i++) chips[i].classList.toggle('active', chips[i].getAttribute('data-lang') === stato.lingua);
    document.getElementById('btnAbove').textContent = t('fab.above');
    document.getElementById('btnPasses').textContent = t('fab.arriving');
    document.getElementById('btnMira').textContent = t('fab.mira');
  }
  // Nota del pannello IN ARRIVO: i numeri vengono dalle costanti, non
  // riscritti a mano, altrimenti al primo cambio di ritmo l'app direbbe
  // il falso senza che nessuno se ne accorga.
  function updateArrNote() {
    var el = document.getElementById('arrNote');
    if (el) el.textContent = t('arr.note', {
      nm: PASS_SCAN_NM, s: Math.round(POLL_INTERVAL_MS / 1000)
    });
  }
  function updateSliderLabels() {
    document.getElementById('radiusLabel').textContent = t('set.radius', { n: stato.raggio });
    document.getElementById('passKmLabel').textContent = t('set.passKm', { n: stato.passKm });
  }
  // Tutto cio che l'app SCRIVE da sola va ridisegnato quando cambia la lingua:
  // applyStaticI18n copre solo il markup di partenza, non il testo generato a
  // runtime. Chi aggiunge una nuova parte dinamica la aggiunge QUI, in un
  // posto solo, invece di scoprire mesi dopo che resta nella lingua vecchia.
  function ridisegnaTestiDinamici() {
    updateHudFilters();
    refreshErrBar();
    renderLocations();          // chip delle postazioni
    refreshBoard();             // lista aerei + classifica compagnie
    renderSearchResults();      // risultati della ricerca
    inArrivo.ridisegna();
    if (stato.aereoSelezionato) {
      updateTag(stato.aereoSelezionato);
      if (document.getElementById('sheet').classList.contains('full')) fillSheet(stato.aereoSelezionato);
    }
  }
  applyLang();
  var langChips = document.querySelectorAll('#langChips .chip');
  for (var lc = 0; lc < langChips.length; lc++) {
    langChips[lc].addEventListener('click', function () {
      stato.lingua = this.getAttribute('data-lang');
      applyLang();
      savePrefs(buildPrefs());
      ridisegnaTestiDinamici();
    });
  }

  document.getElementById('radiusSlider').value = stato.raggio;
  document.getElementById('passKmSlider').value = stato.passKm;
  document.getElementById('airlineSearch').value = stato.filtroCompagnia;
  document.getElementById('chkAirborne').checked = stato.soloInVolo;

  // Attribuzione obbligatoria per le tile, in forma discreta
  var map = L.map('map', {
    zoomControl: false,
    attributionControl: true
  }).setView(stato.centro, 8);
  map.attributionControl.setPrefix(false);
  // Credito alla fonte dei dati di volo, accanto a quello delle mappe
  map.attributionControl.addAttribution(t('attr.flightData', { src: SRC.attribution }));

  // Basemap selezionabile dalle impostazioni (persistente nelle preferenze)
  var tileLayer = null;
  function setMapStyle(style, save) {
    if (!TILE_STYLES[style]) return;
    stato.stileMappa = style;
    var s = TILE_STYLES[style];
    if (tileLayer) map.removeLayer(tileLayer);
    tileLayer = L.tileLayer(s.url, s.options).addTo(map);
    // Il filtro di schiarimento CSS vale solo per lo stile radar scuro
    document.getElementById('map').classList.toggle('map-dark', !!s.dark);
    // Evidenzia il chip attivo
    var chips = document.querySelectorAll('#mapStyleChips .chip');
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.toggle('active', chips[i].getAttribute('data-style') === style);
    }
    if (save) savePrefs(buildPrefs());
  }
  setMapStyle(stato.stileMappa, false);
  var styleChips = document.querySelectorAll('#mapStyleChips .chip');
  for (var sc = 0; sc < styleChips.length; sc++) {
    styleChips[sc].addEventListener('click', function () {
      setMapStyle(this.getAttribute('data-style'), true);
    });
  }

  // Overlay incendi EFFIS/Copernicus: il come sta in src/overlays.js, qui
  // resta solo il legame con le preferenze salvate.
  var incendi = creaOverlayIncendi({
    map: map,
    onCambio: function (quale, acceso) {
      if (quale === 'fires') stato.incendi = acceso; else stato.areeBruciate = acceso;
      savePrefs(buildPrefs());
    }
  });
  incendi.setFires(stato.incendi, false);
  incendi.setBurnt(stato.areeBruciate, false);

  var markers = {};      // hex -> marker
  var markerState = {};  // hex -> { track, color, sel } per evitare setIcon inutili
  var trails = {};       // hex -> { pts, line, color }
  // Cache a capienza limitata: v. src/infra/cache.js per il perche.
  var photoCache = creaCache(200);   // hex -> {url, credit} | null
  var rings = [];
  var fetchSeq = 0;      // scarta risposte fuori ordine
  var timer = null;
  var searchMarker = null;  // marker per un volo cercato fuori dal raggio
  var tagMarker = null;     // etichetta ancorata che segue l'aereo selezionato

  function clearTag() {
    if (tagMarker) { map.removeLayer(tagMarker); tagMarker = null; }
  }
  function tagIcon(ac) {
    var cs = (ac.flight || '').trim();
    return iconaEtichetta(datiEtichetta(ac, cs ? routeCache.get(cs) : null));
  }
  function updateTag(ac) {
    if (!ac || ac.lat == null) return;
    if (!tagMarker) {
      tagMarker = L.marker([ac.lat, ac.lon], { icon: tagIcon(ac), interactive: true, keyboard: false, zIndexOffset: 1000 }).addTo(map);
      tagMarker.on('click', function (e) { L.DomEvent.stopPropagation(e); openFull(); });
    } else {
      tagMarker.setLatLng([ac.lat, ac.lon]);
      tagMarker.setIcon(tagIcon(ac));
    }
  }
  function clearSearchMarker() {
    if (searchMarker) { map.removeLayer(searchMarker); searchMarker = null; }
  }
  // Un aereo scelto fuori dal raggio del radar (scansione IN ARRIVO a 250 NM,
  // ricerca mondiale per numero di volo) non e' tra i marker del polling:
  // senza un marker suo, il giro successivo lo deseleziona.
  function mostraAereoCercato(ac) {
    if (ac.lat == null) return;
    searchMarker = L.marker([ac.lat, ac.lon], {
      icon: planeIcon(ac.track, '#ffb454', true)
    }).addTo(map);
    searchMarker._ac = ac;
    searchMarker.on('click', function (e) { L.DomEvent.stopPropagation(e); openSheet(this._ac); });
  }
  // L'unico modo di portare la vista su un aereo e selezionarlo. Prima erano
  // tre varianti (lista TRAFFICO, IN ARRIVO, ricerca volo) che facevano le
  // stesse cose in ordine diverso e ognuna dimenticava qualcosa.
  function vaiAllAereo(ac, opz) {
    opz = opz || {};
    if (opz.chiudi) chiudiPannello(opz.chiudi);
    // Il marker della ricerca precedente va tolto sempre: restava sulla mappa
    // a indicare in arancione un aereo che non era piu' quello selezionato.
    clearSearchMarker();
    if (!markers[ac.hex]) mostraAereoCercato(ac);
    if (ac.lat != null) map.setView([ac.lat, ac.lon], opz.zoom || 9, { animate: true });
    openSheet(ac);
    if (opz.full) openFull();
  }

  // ---------- Bussola live: punta il telefono verso l'aereo selezionato ----------
  // Sensori, filtro e isteresi stanno in src/funzioni/mira.js. Qui restano solo i due
  // collegamenti con l'app: da dove si guarda e quale aereo si sta seguendo.
  var mira = creaMira({
    getCentro: function () { return stato.centro; },
    getAereo: function () { return stato.aereoSelezionato; }
  });
  function startMira() { mira.start(); }
  function stopMira() { mira.stop(); }
  document.getElementById('miraCalib').addEventListener('click', function (e) {
    e.stopPropagation();
    mira.calibra();
  });

  // Livello di zoom che fa entrare nello schermo l'anello piu esterno.
  // Era scritto identico in due punti (applica impostazioni, cambio centro):
  // ritoccarne uno solo faceva ricentrare la mappa in due modi diversi.
  function zoomPerRaggio(nm) {
    return nm > 180 ? 7 : nm > 90 ? 8 : nm > 40 ? 9 : 10;
  }

  function drawRings() {
    rings.forEach(function (r) { map.removeLayer(r); });
    rings = [];
    var step = stato.raggio / 4;
    for (var i = 1; i <= 4; i++) {
      rings.push(L.circle(stato.centro, {
        radius: step * i * 1852, color: '#34e08a', weight: 1, fill: false,
        opacity: 0.4, dashArray: '2,7', interactive: false
      }).addTo(map));
    }
    drawObserver();  // segno del punto di osservazione al centro
    drawAirports();  // gli aeroporti seguono centro e raggio correnti
  }

  var observerMarker = null;
  function drawObserver() {
    if (!observerMarker) {
      observerMarker = L.marker(stato.centro, {
        icon: iconaOsservatore(), interactive: false, keyboard: false, zIndexOffset: -200
      }).addTo(map);
    } else {
      observerMarker.setLatLng(stato.centro);
    }
  }

  // ---------- Aeroporti nel raggio ----------
  var airportMarkers = [];
  function drawAirports() {
    airportMarkers.forEach(function (m) { map.removeLayer(m); });
    airportMarkers = [];
    // Entro il raggio, al massimo i 40 piu vicini
    var list = [];
    for (var i = 0; i < AIRPORTS.length; i++) {
      var d = map.distance([AIRPORTS[i].lat, AIRPORTS[i].lon], stato.centro);
      if (d <= stato.raggio * 1852) list.push({ a: AIRPORTS[i], d: d });
    }
    list.sort(function (x, y) { return x.d - y.d; });
    list.slice(0, 40).forEach(function (it) {
      var a = it.a;
      var m = L.marker([a.lat, a.lon], {
        icon: iconaAeroporto(a), keyboard: false, zIndexOffset: -500
      }).addTo(map);
      m.bindPopup('<b>' + (a.iata || a.icao) + '</b> · ' + a.name, {
        className: 'airport-popup', closeButton: false, offset: [0, -4]
      });
      airportMarkers.push(m);
    });
  }
  // A vista larga niente sigle: restano solo i puntini
  map.on('zoomend', function () {
    document.getElementById('map').classList.toggle('zoom-far', map.getZoom() < 6);
  });

  var sweepEl = document.getElementById('sweep');
  function positionSweep() {
    var c = map.latLngToContainerPoint(stato.centro);
    var east = L.latLng(stato.centro[0], stato.centro[1] + (stato.raggio * 1.852 / (111.32 * Math.cos(stato.centro[0] * Math.PI / 180))));
    var e = map.latLngToContainerPoint(east);
    var d = Math.abs(e.x - c.x) * 2;
    sweepEl.style.width = d + 'px';
    sweepEl.style.height = d + 'px';
    sweepEl.style.left = c.x + 'px';
    sweepEl.style.top = c.y + 'px';
  }
  map.on('move zoom viewreset resize', positionSweep);

  var planeIcon = iconaAereo;

  function passesFilters(ac) {
    if (stato.soloInVolo && isOnGround(ac)) return false;
    if (stato.filtroCompagnia && airlineName(ac.flight) !== stato.filtroCompagnia) return false;
    return true;
  }

  // ---------- Foto ----------
  async function fetchPhotoFrom(url) {
    var res = await fetchConScadenza(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    if (data.photos && data.photos.length > 0) {
      var p = data.photos[0];
      return {
        url: (p.thumbnail_large && p.thumbnail_large.src) || (p.thumbnail && p.thumbnail.src),
        credit: p.photographer || ''
      };
    }
    return null;
  }
  async function loadPhoto(hex, reg) {
    var wrap = document.getElementById('photoWrap');
    var note = document.getElementById('photoNote');
    wrap.style.display = 'none';
    note.textContent = '';
    var giaVista = photoCache.get(hex);
    if (giaVista === null) { note.textContent = t('photo.none'); return; }
    if (giaVista) { showPhoto(giaVista); return; }
    note.textContent = t('photo.searching');
    try {
      var info = await fetchPhotoFrom(API.photoHex + hex.toUpperCase());
      if (!info && reg) {
        info = await fetchPhotoFrom(API.photoReg + encodeURIComponent(reg));
      }
      if (info && info.url) {
        photoCache.set(hex, info);
        note.textContent = '';
        showPhoto(info);
      } else {
        photoCache.set(hex, null);
        note.textContent = t('photo.none');
      }
    } catch (e) {
      note.textContent = t('photo.unreachable', { msg: e.message });
    }
  }
  function showPhoto(info) {
    if (!info.url) return;
    document.getElementById('photo').src = info.url;
    document.getElementById('photoCredit').textContent = '\u00A9 ' + info.credit + ' \u00B7 planespotters.net';
    document.getElementById('photoWrap').style.display = 'block';
  }

  // ---------- Rotta del volo (adsbdb.com, gratuita senza chiave) ----------
  var routeCache = creaCache(300);  // callsign -> {orig, dest} | null (null = cercata, non trovata)
  var routeLine = null;  // polilinea origine -> aereo -> destinazione
  var currentRoute = null;

  function clearRouteLine() {
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    currentRoute = null;
  }
  function drawRouteLine(ac) {
    if (!currentRoute) return;
    if (routeLine) map.removeLayer(routeLine);
    routeLine = L.polyline([
      [currentRoute.orig.lat, currentRoute.orig.lon],
      [ac.lat, ac.lon],
      [currentRoute.dest.lat, currentRoute.dest.lon]
    ], { color: '#ffb454', weight: 1.5, opacity: 0.55, dashArray: '6,6', interactive: false }).addTo(map);
  }
  function showRoute(r, ac) {
    document.getElementById('routeNote').textContent = '';
    if (!r) {
      document.getElementById('routeBox').style.display = 'none';
      document.getElementById('routeNote').textContent = t('route.noneForFlight');
      clearRouteLine();
      if (ac && stato.selezionato === ac.hex && tagMarker) updateTag(ac);
      return;
    }
    var cs = ac ? (ac.flight || '').trim() : '';
    // Rotta d'archivio incoerente con posizione/prua reali: nascosta con nota.
    // Il numero di volo IATA resta valido (deriva dal callsign, non dall'archivio).
    if (ac && !routeConsistent(ac, r)) {
      var lbl = (r.orig.iata || r.orig.icao || '?') + ' → ' + (r.dest.iata || r.dest.icao || '?');
      document.getElementById('routeBox').style.display = 'none';
      document.getElementById('routeNote').textContent =
        t('route.inconsistent', { lbl: lbl });
      clearRouteLine();
      if (stato.selezionato === ac.hex && tagMarker) updateTag(ac);
      return;
    }
    document.getElementById('rFlight').textContent = fmtFlight(r.flightIata) || fmtFlight(cs) || '--';
    document.getElementById('rOrigCity').textContent = r.orig.city || r.orig.name || '--';
    document.getElementById('rOrigIata').textContent = r.orig.iata || r.orig.icao || '';
    document.getElementById('rDestCity').textContent = r.dest.city || r.dest.name || '--';
    document.getElementById('rDestIata').textContent = r.dest.iata || r.dest.icao || '';
    document.getElementById('routeBox').style.display = 'block';
    currentRoute = r;
    if (ac && ac.lat != null) drawRouteLine(ac);
    // Aggiorna l'etichetta ancorata ora che numero volo e rotta sono noti
    if (ac && stato.selezionato === ac.hex && tagMarker) updateTag(ac);
  }
  async function loadRoute(ac) {
    var box = document.getElementById('routeBox');
    var note = document.getElementById('routeNote');
    box.style.display = 'none';
    note.textContent = '';
    clearRouteLine();
    var cs = (ac.flight || '').trim();
    if (!cs) { note.textContent = t('route.noCallsign'); return; }
    // Callsign valido = 3 lettere compagnia + numero + eventuale suffisso di lettere
    // (es. RYR1234, RYR78YR, EJU45AB). Ryanair/easyJet usano suffissi alfabetici legittimi.
    // Scartiamo solo cio che NON inizia con 3 lettere + almeno una cifra.
    if (!/^[A-Z]{3}[0-9]/.test(cs.toUpperCase())) {
      note.textContent = t('route.nonStandard');
      showRoute(null, ac);
      return;
    }
    if (routeCache.has(cs)) { showRoute(routeCache.get(cs), ac); return; }
    note.textContent = t('route.searching');
    try {
      var res = await fetchConScadenza(API.routeCallsign + encodeURIComponent(cs));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      var fr = data && data.response && data.response.flightroute;
      if (fr && fr.origin && fr.destination) {
        var r = {
          flightIata: fr.callsign_iata || null,
          orig: { iata: fr.origin.iata_code, icao: fr.origin.icao_code, city: fr.origin.municipality,
                  name: fr.origin.name, lat: fr.origin.latitude, lon: fr.origin.longitude },
          dest: { iata: fr.destination.iata_code, icao: fr.destination.icao_code, city: fr.destination.municipality,
                  name: fr.destination.name, lat: fr.destination.latitude, lon: fr.destination.longitude }
        };
        routeCache.set(cs, r);
        // Mostra solo se l'aereo e ancora selezionato
        if (stato.selezionato === ac.hex) showRoute(r, ac);
      } else {
        routeCache.set(cs, null);
        if (stato.selezionato === ac.hex) showRoute(null, ac);
      }
    } catch (e) {
      // Non mettere in cache gli errori di rete: si riprova alla prossima apertura
      if (stato.selezionato === ac.hex) note.textContent = t('route.unreachable', { msg: e.message });
    }
  }

  // ---------- Pannelli ----------
  // ---------- Registro delle finestre ----------
  // Prima l'elenco delle finestre era ripetuto a mano in TRE punti (chiudi
  // tutto, qualcosa e aperto?, chiudi la piu in alto) e convivevano due modi
  // diversi di dire "aperta": la classe 'open' per i pannelli a scomparsa e
  // style.display per MIRA e i dialoghi. Chi aggiungeva un pannello e
  // dimenticava uno dei tre elenchi rompeva il tasto BACK senza che nulla lo
  // segnalasse. Ora la descrizione sta in un posto solo e le tre funzioni si
  // ricavano da qui: aggiungere una finestra costa una riga.

  // Pannelli a scomparsa dal basso: se ne apre uno alla volta.
  // onApri: cosa fare in piu nel momento in cui si apre.
  var PANNELLI = {
    board: { onApri: function () { refreshBoard(); } },
    passes: { onApri: function () { inArrivo.apri(); } },
    settings: { onApri: null },
    searchPanel: { onApri: function () {
      document.getElementById('searchNote').textContent = '';
      renderSearchResults();
      setTimeout(function () { document.getElementById('flightSearch').focus(); }, 250);
    } }
  };
  // Finestre sovrapposte ai pannelli, IN ORDINE DI PRIORITA per il tasto
  // BACK: dalla piu "in alto" alla piu in basso.
  var SOVRAPPOSTE = [
    { id: 'confirmDialog', chiudi: hideConfirm },
    { id: 'aboveDialog', chiudi: hideAboveDialog },
    { id: 'miraOverlay', chiudi: stopMira }
  ];

  function pannelloAperto(id) {
    return document.getElementById(id).classList.contains('open');
  }
  function sovrappostaAperta(f) {
    return document.getElementById(f.id).style.display === 'block';
  }
  function togglePannello(id) {
    var eraAperto = pannelloAperto(id);
    closeAll();
    if (eraAperto) return;   // secondo tocco sullo stesso pulsante: chiude
    document.getElementById(id).classList.add('open');
    if (PANNELLI[id].onApri) PANNELLI[id].onApri();
  }
  // Chiudere un pannello passa SEMPRE da qui. Scriverlo a mano con
  // classList.remove('open') funziona, ma scavalca il registro: e' cosi' che
  // il tasto BACK si rompe in silenzio quando si aggiunge una finestra.
  function chiudiPannello(id) {
    document.getElementById(id).classList.remove('open');
  }
  function closeAll() {
    for (var id in PANNELLI) chiudiPannello(id);
    clearPassProjections();
    hideAboveDialog();
    hideConfirm();
    closeSheet();
  }
  function updateSelectedIcons(prevSel, newSel) {
    // Aggiorna solo i marker coinvolti nel cambio selezione
    [prevSel, newSel].forEach(function (id) {
      if (id && markers[id] && markers[id]._ac) {
        var ac = markers[id]._ac;
        var isSel = (id === newSel);
        var color = planeColor(ac, isSel);
        var emg = !!emergencyInfo(ac);
        var ff = isFirefightingAircraft(ac);
        markers[id].setIcon(planeIcon(ac.track, color, isSel, emg, ff, ff && incendiVicini.vicino(id)));
        markerState[id] = { track: ac.track || 0, color: color, sel: isSel, emg: emg, ff: ff, ffNear: ff && incendiVicini.vicino(id) };
        if (trails[id] && trails[id].line) {
          trails[id].line.setStyle({ color: isSel ? '#f2fff8' : trails[id].color });
        }
      }
    });
  }
  function fillSheet(ac) {
    updateFollowBtn(); // stato campanella per l'aereo corrente
    document.getElementById('shAirline').textContent = airlineName(ac.flight).toUpperCase();
    // Tipo aereo in evidenza sotto la compagnia: usa descrizione estesa se disponibile, altrimenti codice tipo
    var modelEl = document.getElementById('shModel');
    var model = ac.desc || ac.t || '';
    modelEl.textContent = model || t('sh.unknownType');
    modelEl.style.display = model ? 'block' : 'none';
    document.getElementById('shAlt').textContent = altLabel(ac);
    document.getElementById('shSpd').textContent = ac.gs != null ? Math.round(ac.gs) + ' kt' : '--';
    document.getElementById('shTrk').textContent = ac.track != null ? Math.round(ac.track) + '\u00B0 ' + compass(ac.track) : '--';
    // Variometro: salita/discesa in ft/min
    var vr = ac.baro_rate != null ? ac.baro_rate : ac.geom_rate;
    var vEl = document.getElementById('shVario');
    if (vr == null || Math.abs(vr) < 64) { vEl.textContent = t('vario.level'); vEl.style.color = ''; }
    else if (vr > 0) { vEl.textContent = '\u2191 +' + vr + ' ft/m'; vEl.style.color = '#6fd3ff'; }
    else { vEl.textContent = '\u2193 ' + vr + ' ft/m'; vEl.style.color = '#ffb454'; }
    // Distanza e direzione da Anzio, sempre presenti e aggiornate
    var distTxt = '';
    if (ac.lat != null && ac.lon != null) {
      var km = map.distance([ac.lat, ac.lon], stato.centro) / 1000;
      distTxt = t('sh.dist', { km: km.toFixed(1), dir: compass(bearingFromCenter(stato.centro, ac.lat, ac.lon)) });
    }
    var cs = (ac.flight || '').trim();
    document.getElementById('shReg').textContent = distTxt +
      (cs ? t('sh.flight', { cs: cs }) : '') + t('sh.reg', { r: (ac.r || '--'), hex: ac.hex.toUpperCase() });

    // --- Emergenza ---
    var emerg = emergencyInfo(ac);
    var banner = document.getElementById('emergBanner');
    if (emerg) {
      banner.textContent = t('emg.banner', { info: emerg }) +
        (ac.squawk ? t('emg.squawk', { sq: ac.squawk }) : '');
      banner.style.display = 'block';
    } else {
      banner.style.display = 'none';
    }

    // --- Antincendio (Canadair ecc.), eventualmente vicino a un incendio rilevato ---
    var ffBanner = document.getElementById('ffBanner');
    if (isFirefightingAircraft(ac)) {
      ffBanner.textContent = '\uD83D\uDD25 ' + (incendiVicini.vicino(ac.hex) ? t('ff.nearFire') : t('ff.badge'));
      ffBanner.style.display = 'block';
    } else {
      ffBanner.style.display = 'none';
    }

    // --- Fase di volo (signature) con icona e barra quota ---
    var phaseEl = document.getElementById('shPhase');
    var phase = flightPhaseInfo(ac);
    if (phase && phase.text) {
      document.getElementById('phaseTxt').textContent = phase.text;
      // L'icona segue il CODICE della fase, non il testo: confrontare il
      // testo tradotto funzionava solo in italiano.
      var PHASE_ICO = {
        climb: '\u2197', descent: '\u2198', approach: '\u2198',
        cruise: '\u2708', ground: '\u25AC', level: '\u2708'
      };
      document.getElementById('phaseIco').textContent = PHASE_ICO[phase.code] || '\u2708';
      // Barra quota: 0 a 40000 ft come riferimento crociera
      var pct = 0;
      if (typeof ac.alt_baro === 'number') pct = Math.max(0, Math.min(100, ac.alt_baro / 40000 * 100));
      document.getElementById('altBar').style.width = pct + '%';
      phaseEl.classList.add('show');
    } else {
      phaseEl.classList.remove('show');
    }

    // --- Griglia tecnica: Mach, assetto, vento, temperatura ---
    var hasTech = (ac.mach != null || ac.roll != null || ac.ws != null || ac.oat != null);
    document.getElementById('techGrid').style.display = hasTech ? 'grid' : 'none';
    document.getElementById('shMach').textContent = ac.mach != null ? 'M ' + ac.mach.toFixed(2) : '--';
    // Assetto: rollio -> virata sinistra/destra
    var rEl = document.getElementById('shRoll');
    if (ac.roll == null) { rEl.textContent = '--'; }
    else if (ac.roll < -5) { rEl.textContent = t('roll.left', { n: Math.abs(Math.round(ac.roll)) }); }
    else if (ac.roll > 5) { rEl.textContent = t('roll.right', { n: Math.round(ac.roll) }); }
    else { rEl.textContent = t('roll.straight'); }
    document.getElementById('shWind').textContent = (ac.ws != null && ac.wd != null)
      ? Math.round(ac.ws) + ' kt ' + compass(ac.wd) : '--';
    // Temperatura esterna: gli aerei a volte trasmettono valori assurdi
    // (visto -229 C a 2650 ft), meglio non mostrarli che mostrarli sbagliati
    var oatOk = (typeof ac.oat === 'number' && ac.oat > -100 && ac.oat < 60);
    document.getElementById('shOat').textContent = oatOk ? Math.round(ac.oat) + '\u00B0C' : '--';

    // --- Operatore e categoria (il modello e gia in evidenza nell'header) ---
    var descEl = document.getElementById('shDesc');
    var bits = [];
    if (ac.ownOp && ac.ownOp.toUpperCase() !== airlineName(ac.flight).toUpperCase()) bits.push(t('sh.operator', { op: ac.ownOp }));
    if (ac.category) bits.push(t('sh.category', { c: ac.category }));
    if (bits.length) { descEl.textContent = bits.join('  \u00B7  '); descEl.style.display = 'block'; }
    else { descEl.style.display = 'none'; }

    // Mantiene la linea di rotta agganciata alla posizione attuale dell'aereo
    if (currentRoute && ac.lat != null) drawRouteLine(ac);
  }
  // Selezione = mostra etichetta ancorata sull'aereo, attenua gli altri
  function openSheet(ac, skipPhoto) {
    var prev = stato.selezionato;
    stato.selezionato = ac.hex;
    stato.aereoSelezionato = ac;
    var cambiatoAereo = (prev !== ac.hex);
    // Cambio aereo: azzera la rotta tracciata del precedente
    // (clearRouteLine azzera gia currentRoute)
    if (cambiatoAereo) clearRouteLine();
    chiudiPannello('board');
    chiudiPannello('settings');
    updateTag(ac);
    updateFollowBtn(); // stato campanella per l'aereo appena selezionato
    // Carica la rotta subito (serve all'etichetta per partenza->destinazione)
    var cs = (ac.flight || '').trim();
    if (cs && !routeCache.has(cs)) loadRoute(ac);
    else if (cs && routeCache.get(cs)) showRoute(routeCache.get(cs), ac);
    if (cambiatoAereo) updateSelectedIcons(prev, stato.selezionato);
    drawPlanes(stato.aerei); // riapplica attenuazione agli altri
  }
  // Espande alla scheda a tutto schermo
  function openFull() {
    if (!stato.aereoSelezionato) return;
    var ac = stato.aereoSelezionato;
    fillSheet(ac);
    var s = document.getElementById('sheet');
    s.classList.add('open', 'full');
    loadPhoto(ac.hex, ac.r);
    // Rotta: usa cache se presente, altrimenti caricala
    var cs = (ac.flight || '').trim();
    if (cs && routeCache.has(cs)) showRoute(routeCache.get(cs), ac);
    else loadRoute(ac);
  }
  // Chiude la full, torna all'etichetta ancorata
  function closeFull() {
    document.getElementById('sheet').classList.remove('open', 'full');
    stopMira();
  }
  // Deseleziona tutto
  function closeSheet() {
    if (!stato.selezionato) return;
    var prev = stato.selezionato;
    stato.selezionato = null;
    stato.aereoSelezionato = null;
    stopMira();
    document.getElementById('sheet').classList.remove('open', 'full');
    clearTag();
    clearRouteLine();
    clearSearchMarker();
    updateSelectedIcons(prev, null);
    drawPlanes(stato.aerei); // ripristina piena visibilita
  }
  map.on('click', closeAll);

  // ---------- Pannello TRAFFICO: lista aerei + classifica compagnie ----------
  function isBoardOpen() { return pannelloAperto('board'); }

  // Le due schede stanno in funzioni/traffico.js; qui resta il filo.
  var traffico = creaTraffico({
    stato: stato,
    passaFiltri: passesFilters,
    aperto: isBoardOpen,
    vicinoAIncendio: function (hex) { return incendiVicini.vicino(hex); }
  });
  function refreshBoard() { traffico.aggiorna(); }

  // ---------- Filtro compagnia (nel pannello ricerca, applicazione immediata) ----------
  function airlinesPresent() {
    var names = {};
    for (var i = 0; i < stato.aerei.length; i++) names[airlineName(stato.aerei[i].flight)] = true;
    return Object.keys(names).sort();
  }
  function applyAirlineFilter(name) {
    stato.filtroCompagnia = name;
    document.getElementById('airlineSearch').value = name;
    savePrefs(buildPrefs());
    updateHudFilters();
    drawPlanes(stato.aerei);
    refreshBoard();
    renderSearchResults();
  }
  function renderAirlineList() {
    var box = document.getElementById('airlineList');
    var q = document.getElementById('airlineSearch').value.trim().toLowerCase();
    var list = airlinesPresent().filter(function (n) {
      return !q || n.toLowerCase().indexOf(q) !== -1;
    });
    var html = '<div class="opt" data-name="" style="padding:8px;font-size:13px;cursor:pointer;border-bottom:1px solid var(--line);">' + t('airline.all') + '</div>';
    for (var i = 0; i < list.length; i++) {
      html += '<div class="opt" data-name="' + esc(list[i]) + '" style="padding:8px;font-size:13px;cursor:pointer;border-bottom:1px solid var(--line);">' + esc(list[i]) + '</div>';
    }
    box.innerHTML = html;
  }
  var searchInput = document.getElementById('airlineSearch');
  searchInput.addEventListener('focus', function () {
    document.getElementById('airlineList').style.display = 'block';
    renderAirlineList();
  });
  searchInput.addEventListener('input', function () {
    document.getElementById('airlineList').style.display = 'block';
    renderAirlineList();
  });

  // ---------- Sopra di te ----------
  function nearestAircraft() {
    var best = null, bestD = Infinity;
    var filtered = stato.aerei.filter(passesFilters);
    for (var i = 0; i < filtered.length; i++) {
      var ac = filtered[i];
      if (ac.lat == null || ac.lon == null) continue;
      var d = map.distance([ac.lat, ac.lon], stato.centro);
      if (d < bestD) { bestD = d; best = ac; }
    }
    return best;
  }

  // ---------- IN ARRIVO: passaggi previsti ----------
  // La funzionalita sta in funzioni/inarrivo.js; qui restano i fili.
  function isPassesOpen() { return pannelloAperto('passes'); }
  function passFlightLabel(ac) {
    var cs = (ac.flight || '').trim();
    var r = cs ? routeCache.get(cs) : null;
    var num = r ? fmtFlight(r.flightIata) : null;
    return num || cs || ac.hex.toUpperCase();
  }
  var inArrivo = creaInArrivo({
    stato: stato,
    mappa: map,
    aeroporti: AIRPORTS,
    chiediVoli: chiediVoli,
    urlPunto: function (lat, lon, nm) { return SRC.point(lat, lon, nm); },
    tagliaAlRaggio: tagliaAlRaggio,
    passaFiltri: passesFilters,
    aperto: isPassesOpen,
    vaiAllAereo: vaiAllAereo,
    etichettaVolo: passFlightLabel
  });
  function refreshPasses() { inArrivo.aggiorna(); }
  function clearPassProjections() { inArrivo.pulisciProiezioni(); }

  // ---------- Aerei seguiti + Canadair vicino a un incendio ----------
  // Due funzionalita staccate: qui restano solo i fili che le legano al resto.
  var seguiti = creaSeguiti({
    stato: stato,
    aeroporti: AIRPORTS,
    vaiAllAereo: function (ac) { vaiAllAereo(ac, { chiudi: 'searchPanel' }); },
    etichettaVolo: passFlightLabel
  });
  function updateFollowBtn() { seguiti.aggiornaPulsante(); }

  var incendiVicini = creaVerificaIncendi(function (hex) {
    // L'esito e cambiato: ridisegna l'icona di quell'aereo, se e sulla mappa
    if (markers[hex]) updateSelectedIcons(hex, stato.selezionato);
  });

  // ---------- Disegno ----------
  function drawPlanes(aircraft) {
    var seen = {};
    var maxSpd = 0, maxAlt = 0, count = 0;

    for (var i = 0; i < aircraft.length; i++) {
      var ac = aircraft[i];
      if (ac.lat == null || ac.lon == null) continue;
      if (!passesFilters(ac)) continue;
      var id = ac.hex;
      seen[id] = true;
      count++;
      if (ac.gs > maxSpd) maxSpd = ac.gs;
      if (typeof ac.alt_baro === 'number' && ac.alt_baro > maxAlt) maxAlt = ac.alt_baro;

      var isSel = (id === stato.selezionato);
      var color = planeColor(ac, isSel);

      // Scia: aggiorna i punti; ricrea la linea solo se serve
      if (!trails[id]) trails[id] = { pts: [], line: null, color: color };
      var t = trails[id];
      var last = t.pts[t.pts.length - 1];
      var moved = !last || last[0] !== ac.lat || last[1] !== ac.lon;
      if (moved) {
        t.pts.push([ac.lat, ac.lon]);
        if (t.pts.length > 30) t.pts.shift();
      }
      if (t.pts.length > 1) {
        var lineColor = isSel ? '#f2fff8' : color;
        if (!t.line) {
          t.line = L.polyline(t.pts, { color: lineColor, weight: 1.5, opacity: 0.45, interactive: false }).addTo(map);
        } else {
          if (moved) t.line.setLatLngs(t.pts);
          if (t.color !== color || isSel) t.line.setStyle({ color: lineColor });
        }
        t.color = color;
      }

      // Marker: setIcon solo se rotta (>3 gradi), colore, selezione, emergenza
      // o stato antincendio/vicinanza a un incendio cambiano
      var st = markerState[id];
      var trackNow = ac.track || 0;
      var emg = !!emergencyInfo(ac);
      var ff = isFirefightingAircraft(ac);
      if (ff) incendiVicini.verifica(ac); // non ricontrolla piu spesso di 30 s
      var ffNear = ff && incendiVicini.vicino(id);
      var dim = (stato.selezionato && !isSel); // attenua se c'e una selezione e non e questo
      if (markers[id]) {
        markers[id].setLatLng([ac.lat, ac.lon]);
        markers[id]._ac = ac;
        if (!st || Math.abs((st.track||0) - trackNow) > 3 || st.color !== color || st.sel !== isSel ||
            st.emg !== emg || st.ff !== ff || st.ffNear !== ffNear) {
          markers[id].setIcon(planeIcon(trackNow, color, isSel, emg, ff, ffNear));
          markerState[id] = { track: trackNow, color: color, sel: isSel, emg: emg, ff: ff, ffNear: ffNear };
        }
      } else {
        var m = L.marker([ac.lat, ac.lon], { icon: planeIcon(trackNow, color, isSel, emg, ff, ffNear) }).addTo(map);
        m._ac = ac;
        m.on('click', function (e) {
          L.DomEvent.stopPropagation(e);
          openSheet(this._ac);
        });
        markers[id] = m;
        markerState[id] = { track: trackNow, color: color, sel: isSel, emg: emg, ff: ff, ffNear: ffNear };
      }
      // Attenuazione via classe sull'elemento del marker
      var el = markers[id].getElement && markers[id].getElement();
      if (el) { if (dim) el.classList.add('dimmed'); else el.classList.remove('dimmed'); }
    }

    for (var mid in markers) {
      if (!seen[mid]) {
        map.removeLayer(markers[mid]); delete markers[mid]; delete markerState[mid];
        if (trails[mid]) { if (trails[mid].line) map.removeLayer(trails[mid].line); delete trails[mid]; }
        // Lo stato "vicino a un incendio" vale per un aereo che stiamo
        // guardando: quando esce dal radar se ne va con lui, invece di
        // restare in memoria per il resto della sessione.
        incendiVicini.dimentica(mid);
        if (stato.selezionato === mid) closeSheet();
      }
    }

    document.getElementById('stCount').textContent = count;
    document.getElementById('stFast').textContent = maxSpd ? Math.round(maxSpd) : '--';
    document.getElementById('stHigh').textContent = maxAlt ? (maxAlt >= 1000 ? Math.round(maxAlt/1000) + 'k' : maxAlt) : '--';
  }

  function updateHudFilters() {
    var parts = [stato.raggio + ' NM'];
    parts.push(stato.filtroCompagnia ? stato.filtroCompagnia.toUpperCase() : t('hud.all'));
    if (stato.soloInVolo) parts.push(t('hud.inflight'));
    // stato.etichettaOsservatore e stato.filtroCompagnia possono venire da un nome scritto
    // dall'utente o riletto dalle preferenze: vanno neutralizzati come tutto
    // il resto che finisce in innerHTML.
    document.getElementById('hudFilters').innerHTML =
      esc(parts.join(' \u00B7 ')) +
      (stato.etichettaOsservatore ? ' \u00B7 <span style="color:var(--phosphor)">\u25C9 ' + esc(stato.etichettaOsservatore) + '</span>' : '');
  }

  // ---------- Rete ----------
  var errBar = document.getElementById('errBar');

  // Diagnostica visibile in impostazioni: versione in esecuzione, fonte
  // attiva, ultimo URL chiamato ed esito. Serve a distinguere subito un
  // codice sbagliato da una copia vecchia servita dalla cache del browser.
  var BUILD_ID = (typeof __BUILD_ID__ !== 'undefined') ? __BUILD_ID__ : 'dev';
  document.getElementById('diagBuild').textContent = BUILD_ID;
  document.getElementById('diagSource').textContent = SRC.label + ' (' + PLANES_SOURCE + ')';
  function diag(url, esito) {
    var u = document.getElementById('diagUrl');
    var l = document.getElementById('diagLast');
    if (url != null) u.textContent = url;
    if (esito != null) l.textContent = new Date().toLocaleTimeString() + ' → ' + esito;
  }

  // Il taglio al raggio e geometria pura e sta in domain.js; qui resta solo
  // la domanda che riguarda l'app: questa fonte ne ha bisogno?
  function tagliaAlRaggio(list, nm) {
    return SRC.trimToRadius ? trimToRadius(list, stato.centro, nm) : list;
  }

  // ---------- Rete: coda, scadenza, errori ----------
  // Il come sta in src/servizi/voli.js (verificabile senza browser); qui restano solo
  // i collegamenti con l'app: quale fonte, se le richieste sono abilitate,
  // dove scrivere la diagnostica.
  var turnoLuoghi = creaCoda(API_MIN_GAP_MS); // Nominatim ha lo stesso limite
  var chiediVoli = creaCanaleVoli({
    fonte: SRC,
    abilitata: PLANES_API_ENABLED,
    diag: diag
  }).chiediVoli;

  // ---------- Banner rosso ----------
  // Il come sta in src/ui/banner.js. Il ritmo del polling non lo riguarda: il
  // backoff resta qui, ai punti di chiamata.
  var banner = creaBanner({ elemento: errBar, t: t, diag: diag });
  function mostraBanner(key, whyKey, whyParams) { banner.mostra(key, whyKey, whyParams); }
  function segnalaErroreVoli(err) {
    backoffLevel++;  // rallenta: al prossimo giro aspettiamo di piu
    banner.segnala(err);
  }
  function clearNetError() {
    backoffLevel = -1;  // di nuovo tutto bene: si torna al ritmo normale
    banner.pulisci();
  }
  // Ridisegna il banner nella lingua giusta se la si cambia mentre e visibile
  function refreshErrBar() { banner.ridisegna(); }

  async function fetchPlanes() {
    var seq = ++fetchSeq;
    var data;
    // Fase 1: la rete. Solo qui un errore significa davvero "segnale perso".
    try {
      data = await chiediVoli(SRC.point(stato.centro[0], stato.centro[1], stato.raggio));
    } catch (e) {
      if (seq !== fetchSeq) return;
      segnalaErroreVoli(e);
      return;
    }
    if (seq !== fetchSeq) return; // risposta superata da una piu recente: scarta
    stato.aerei = tagliaAlRaggio(data.ac || [], stato.raggio);
    diag(null, t('diag.ok', { n: stato.aerei.length }));
    clearNetError();

    // Fase 2: il disegno. Un errore qui e un bug nostro, non un problema di
    // segnale: va segnalato in modo diverso, altrimenti si cerca la causa
    // dalla parte sbagliata (e resta invisibile nella console).
    try {
      drawPlanes(stato.aerei);
      refreshBoard(); // aggiorna lista aerei + classifica se il pannello e aperto
      refreshPasses(); // aggiorna "IN ARRIVO" e proiezioni se il pannello e aperto
      seguiti.controlla(); // avvisa se un aereo seguito sta per passare
      if (stato.selezionato) {
        var found = false;
        for (var i = 0; i < stato.aerei.length; i++) {
          if (stato.aerei[i].hex === stato.selezionato) {
            stato.aereoSelezionato = stato.aerei[i];
            updateTag(stato.aerei[i]); // etichetta ancorata segue l'aereo
            mira.aggiornaBersaglio(); // direzione/elevazione seguono l'aereo
            // Aggiorna la scheda full solo se e aperta
            if (document.getElementById('sheet').classList.contains('full')) fillSheet(stato.aerei[i]);
            found = true; break;
          }
        }
        if (!found && searchMarker && searchMarker._ac && searchMarker._ac.hex === stato.selezionato) {
          found = true;
        }
        if (!found) closeSheet();
      }
    } catch (e) {
      console.error('RADAR: errore durante il disegno', e);
      mostraBanner('hud.drawError');
    }
  }

  // Attesa progressiva quando l'API rifiuta: continuare a bussare ogni 12 s a
  // un servizio che ci sta gia dicendo di no non serve a niente e puo solo
  // prolungare il blocco. Al primo esito positivo si torna al ritmo normale.
  var BACKOFF_MS = [30000, 60000, 120000, 300000];
  var backoffLevel = -1; // -1 = tutto bene, ritmo normale
  function currentPollDelay() {
    if (backoffLevel < 0) return POLL_INTERVAL_MS;
    return BACKOFF_MS[Math.min(backoffLevel, BACKOFF_MS.length - 1)];
  }

  // Pausa in background per risparmiare batteria e richieste.
  // Ciclo a setTimeout invece che setInterval: cosi l'attesa successiva puo
  // cambiare a seconda di com'e andata l'ultima richiesta.
  var pollingOn = false;
  var pollGen = 0;        // generazione: rende obsoleti i cicli precedenti
  var lastFetchAt = 0;    // quando e partito l'ultimo tentativo

  function pollLoop(gen) {
    if (!pollingOn || gen !== pollGen) return; // ciclo fermato o superato
    lastFetchAt = Date.now();
    // finally e non then: se fetchPlanes fallisse in modo imprevisto il ciclo
    // si fermerebbe e l'app resterebbe muta per sempre.
    fetchPlanes().finally(function () {
      if (!pollingOn || gen !== pollGen) return;
      timer = setTimeout(function () { pollLoop(gen); }, currentPollDelay());
    });
  }
  function startPolling() {
    // Accesso sospeso: non si parte nemmeno. Meglio una spiegazione ferma che
    // un'app che sembra rotta e continua a bussare a una porta chiusa.
    if (!PLANES_API_ENABLED) {
      errBar.textContent = t('hud.apiSuspended');
      errBar.style.display = 'block';
      document.getElementById('stCount').textContent = '--';
      return;
    }
    // Riparte SEMPRE da capo, senza fidarsi di un ciclo che potrebbe essere
    // gia morto. Tornando da qualche minuto in background il telefono puo aver
    // buttato via il timer o lasciato una richiesta appesa per sempre, mentre
    // la spia "sto girando" resta accesa: un controllo del tipo "sono gia
    // attivo" lascerebbe l'app ferma a guardare aerei immobili finche non la
    // si chiude. La generazione garantisce che resti UN SOLO ciclo vivo.
    pollGen++;
    pollingOn = true;
    if (timer) { clearTimeout(timer); timer = null; }
    var gen = pollGen;
    // Al ritorno in primo piano piu eventi scattano insieme (visibilitychange,
    // pageshow, focus) e ognuno passa di qui. Invece di sparare una richiesta
    // a ogni evento, il nuovo ciclo riprende la CADENZA normale contando dal
    // momento dell'ultima richiesta: se e appena partita si aspetta il resto
    // dell'intervallo, se manca da tempo si riparte subito.
    var restante = currentPollDelay() - (Date.now() - lastFetchAt);
    if (restante > 0) timer = setTimeout(function () { pollLoop(gen); }, restante);
    else pollLoop(gen);
  }
  function stopPolling() {
    pollingOn = false;
    pollGen++; // qualunque ciclo ancora in volo diventa obsoleto
    if (timer) { clearTimeout(timer); timer = null; }
  }
  function onVisible() {
    document.getElementById('hudDot').style.animationPlayState = '';
    startPolling();
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stopPolling();
      document.getElementById('hudDot').style.animationPlayState = 'paused';
    } else {
      onVisible();
    }
  });
  // Reti di sicurezza: non tutti i telefoni emettono gli stessi eventi al
  // ritorno in primo piano, e basta perderne uno per restare fermi.
  window.addEventListener('pageshow', function () { if (!document.hidden) onVisible(); });
  window.addEventListener('focus', function () { if (!document.hidden) onVisible(); });
  // Ultima rete: se l'app e in primo piano ma non parte una richiesta da
  // troppo tempo, il ciclo si e rotto comunque. Meglio farlo ripartire da soli
  // che lasciare all'utente il dubbio se i dati siano veri o congelati.
  setInterval(function () {
    if (document.hidden) return;
    if (Date.now() - lastFetchAt > Math.max(currentPollDelay() * 3, 30000)) startPolling();
  }, 10000);

  // ---------- Eventi UI ----------
  document.getElementById('btnCenter').addEventListener('click', function () { map.setView(stato.centro, 8); });
  document.getElementById('btnBoard').addEventListener('click', function () { togglePannello('board'); });
  document.getElementById('btnPasses').addEventListener('click', function () { togglePannello('passes'); });
  document.getElementById('btnSettings').addEventListener('click', function () { togglePannello('settings'); });
  // SOPRA DI TE: se l'aereo piu vicino e basso sull'orizzonte non e davvero
  // "sopra di te" (e probabilmente non visibile a occhio): chiedi conferma.
  var ABOVE_MIN_ELEV = 15; // gradi di elevazione minima per considerarlo visibile
  var aboveCandidate = null;
  function showAbove(ac) {
    map.setView([ac.lat, ac.lon], 10, { animate: true });
    openSheet(ac);
  }
  function hideAboveDialog() {
    document.getElementById('aboveDialog').style.display = 'none';
    aboveCandidate = null;
  }
  document.getElementById('btnAbove').addEventListener('click', function () {
    var ac = nearestAircraft();
    var dlg = document.getElementById('aboveDialog');
    if (!ac) {
      document.getElementById('aboveTitle').textContent = t('above.noContact');
      document.getElementById('aboveInfo').textContent = t('above.retry');
      document.getElementById('aboveGo').style.display = 'none';
      dlg.style.display = 'block';
      return;
    }
    var elev = elevationAngle(stato.centro, ac.lat, ac.lon, ac.alt_baro);
    if (elev >= ABOVE_MIN_ELEV) { hideAboveDialog(); showAbove(ac); return; }
    var km = map.distance([ac.lat, ac.lon], stato.centro) / 1000;
    var name = (ac.flight || '').trim() || ac.hex.toUpperCase();
    document.getElementById('aboveTitle').textContent = t('above.noneAbove');
    document.getElementById('aboveInfo').textContent = t('above.nearest', { name: name, airline: airlineName(ac.flight), km: km.toFixed(0), dir: compass(bearingFromCenter(stato.centro, ac.lat, ac.lon)), elev: elev });
    document.getElementById('aboveGo').style.display = '';
    aboveCandidate = ac;
    dlg.style.display = 'block';
  });
  document.getElementById('aboveGo').addEventListener('click', function () {
    var ac = aboveCandidate;
    hideAboveDialog();
    if (ac) showAbove(ac);
  });
  document.getElementById('aboveCancel').addEventListener('click', hideAboveDialog);

  // MIRA: bussola live sulla mappa verso l'aereo selezionato
  document.getElementById('btnMira').addEventListener('click', function () {
    if (mira.attiva()) { stopMira(); return; } // secondo tap: spegne
    if (!stato.aereoSelezionato) {
      // Nessun aereo selezionato: usa il piu vicino
      var ac = nearestAircraft();
      if (!ac) return;
      openSheet(ac); // selezione con etichetta ancorata
    }
    closeFull(); // la bussola vive sulla mappa, non nella scheda
    startMira();
  });
  // Tap sull'overlay bussola: chiude
  document.getElementById('miraOverlay').addEventListener('click', stopMira);

  // ---------- Ricerca live tra gli aerei nel raggio ----------
  function pickAndClose(ac) {
    vaiAllAereo(ac, { chiudi: 'searchPanel' });
  }
  function renderSearchResults() {
    var q = document.getElementById('flightSearch').value.trim().toUpperCase();
    var box = document.getElementById('searchResults');
    if (!q) { box.innerHTML = ''; return; }
    var hits = [];
    for (var i = 0; i < stato.aerei.length; i++) {
      var ac = stato.aerei[i];
      if (ac.lat == null) continue;
      var cs = (ac.flight || '').trim().toUpperCase();
      var hay = [cs, toCallsign(q) === cs ? q : '', airlineName(ac.flight).toUpperCase(),
                 (ac.r || '').toUpperCase(), (ac.t || '').toUpperCase(), (ac.desc || '').toUpperCase()].join(' ');
      if (hay.indexOf(q) !== -1 || cs === toCallsign(q)) hits.push(ac);
      if (hits.length >= 8) break;
    }
    var html = '';
    for (var j = 0; j < hits.length; j++) {
      var a = hits[j];
      var km = map.distance([a.lat, a.lon], stato.centro) / 1000;
      var alt = altLabel(a, true);
      html += '<div class="sr" data-hex="' + esc(a.hex) + '">' +
        '<div class="f">' + esc((a.flight || '').trim() || a.hex.toUpperCase()) + '</div>' +
        '<div class="d">' + esc(airlineName(a.flight)) + '<small>' + esc(a.t || '') + ' \u00B7 ' + alt + '</small></div>' +
        '<div class="km">' + km.toFixed(0) + ' km</div></div>';
    }
    box.innerHTML = html || '<div style="font-size:11px;color:var(--muted);padding:6px 0;">' + t('search.noneInRange') + '</div>';
  }

  // ---------- Chip rapidi ----------
  function quickPick(kind) {
    var pool = stato.aerei.filter(function (a) { return a.lat != null && passesFilters(a); });
    if (!pool.length) return;
    var best = null;
    function by(fn, cmp) {
      var b = null, bv = null;
      for (var i = 0; i < pool.length; i++) {
        var v = fn(pool[i]);
        if (v == null) continue;
        if (b === null || cmp(v, bv)) { b = pool[i]; bv = v; }
      }
      return b;
    }
    if (kind === 'vicino') best = by(function (a) { return map.distance([a.lat, a.lon], stato.centro); }, function (x, y) { return x < y; });
    else if (kind === 'alto') best = by(function (a) { return typeof a.alt_baro === 'number' ? a.alt_baro : null; }, function (x, y) { return x > y; });
    else if (kind === 'veloce') best = by(function (a) { return a.gs; }, function (x, y) { return x > y; });
    else if (kind === 'atterraggio') best = by(function (a) {
      var vr = a.baro_rate != null ? a.baro_rate : a.geom_rate;
      return (vr != null && vr < -300 && typeof a.alt_baro === 'number' && a.alt_baro < 12000) ? a.alt_baro : null;
    }, function (x, y) { return x < y; });
    else if (kind === 'decollo') best = by(function (a) {
      var vr = a.baro_rate != null ? a.baro_rate : a.geom_rate;
      return (vr != null && vr > 500 && typeof a.alt_baro === 'number' && a.alt_baro < 15000) ? a.alt_baro : null;
    }, function (x, y) { return x < y; });
    if (best) pickAndClose(best);
    else document.getElementById('searchNote').textContent = t('search.noneMatch');
  }
  var chips = document.querySelectorAll('#quickChips .chip');
  for (var ci = 0; ci < chips.length; ci++) {
    chips[ci].addEventListener('click', function () { quickPick(this.getAttribute('data-q')); });
  }

  // ---------- Ricerca per numero di volo (globale, anche fuori raggio) ----------
  async function searchFlight() {
    var raw = document.getElementById('flightSearch').value;
    var note = document.getElementById('searchNote');
    if (!raw.trim()) { note.textContent = t('search.typeFlight'); return; }
    var cs = toCallsign(raw);
    note.textContent = t('search.searching', { cs: cs });
    try {
      var data = await chiediVoli(SRC.callsign(cs));
      var list = (data.ac || []).filter(function (a) { return a.lat != null && a.lon != null; });
      if (!list.length) {
        note.textContent = t('search.notFlying', { cs: cs });
        clearSearchMarker();
        return;
      }
      var ac = list[0];
      note.textContent = '';
      vaiAllAereo(ac, { chiudi: 'searchPanel', zoom: 8, full: true });
    } catch (e) {
      // Il difetto corretto qui: se la fonte rifiutava, l'app diceva "volo non
      // in volo" invece del vero motivo. Ora riporta cosa ha risposto.
      note.textContent = e.whyKey
        ? t('search.error', { msg: t(e.whyKey, e.whyParams) })
        : t('search.error', { msg: e.message });
      clearSearchMarker();
    }
  }
  // Chiudi la scheda full: torna all'etichetta ancorata
  document.getElementById('closeFull').addEventListener('click', function (e) {
    e.stopPropagation();
    closeFull();
  });

  // Pannello ricerca: apertura da FAB, ricerca live mentre digiti
  document.getElementById('btnSearch').addEventListener('click', function () { togglePannello('searchPanel'); });
  document.getElementById('flightSearchBtn').addEventListener('click', searchFlight);
  document.getElementById('flightSearch').addEventListener('input', renderSearchResults);
  document.getElementById('flightSearch').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') searchFlight();
  });

  document.getElementById('radiusSlider').addEventListener('input', function () {
    document.getElementById('radiusLabel').textContent = t('set.radius', { n: this.value });
  });
  document.getElementById('passKmSlider').addEventListener('input', function () {
    document.getElementById('passKmLabel').textContent = t('set.passKm', { n: this.value });
  });
  document.getElementById('applyBtn').addEventListener('click', function () {
    var newRadius = parseInt(document.getElementById('radiusSlider').value);
    var radiusChanged = (newRadius !== stato.raggio);
    stato.raggio = newRadius;
    stato.passKm = parseInt(document.getElementById('passKmSlider').value);
    stato.soloInVolo = document.getElementById('chkAirborne').checked;
    savePrefs(buildPrefs());
    refreshPasses();
    updateHudFilters();
    chiudiPannello('settings');
    if (radiusChanged) {
      drawRings();
      positionSweep();
      // Ricentra solo se il raggio e cambiato, per non perdere la vista corrente
      map.setView(stato.centro, zoomPerRaggio(stato.raggio));
    }
    fetchPlanes();
  });

  // ---------- Riapplica tutto quando cambia il centro ----------
  function applyCenter(recenter) {
    drawRings();
    positionSweep();
    if (recenter) map.setView(stato.centro, zoomPerRaggio(stato.raggio));
    fetchPlanes();
  }

  // ---------- Multi-postazione ----------
  // 'gps' segue la posizione del telefono; 'anzio' e il default fisso;
  // le altre voci sono postazioni salvate dall'utente (centro mappa + nome).
  var isSecure = (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  function activateLocation(id, recenter) {
    stato.postazioneAttiva = id;
    renderLocations();
    savePrefs(buildPrefs());
    if (id === 'gps') {
      if (navigator.geolocation && isSecure) {
        stato.etichettaOsservatore = t('obs.locating'); updateHudFilters();
        navigator.geolocation.getCurrentPosition(
          function (pos) {
            if (stato.postazioneAttiva !== 'gps') return; // nel frattempo e stata scelta un'altra postazione
            stato.centro = [pos.coords.latitude, pos.coords.longitude];
            stato.etichettaOsservatore = t('obs.yourPos'); updateHudFilters();
            applyCenter(recenter);
          },
          function (err) {
            // Permesso negato o non disponibile: resta sul centro corrente
            if (stato.postazioneAttiva !== 'gps') return;
            stato.etichettaOsservatore = t('obs.anzioNoGps'); updateHudFilters();
            console.warn(t('geo.unavailable'), err && err.message);
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
      } else {
        stato.etichettaOsservatore = isSecure ? t('obs.anzio') : t('obs.anzioHttps'); updateHudFilters();
      }
      return;
    }
    if (id === 'anzio') {
      stato.centro = DEFAULT_CENTER.slice();
      stato.etichettaOsservatore = t('obs.anzio'); updateHudFilters();
      applyCenter(recenter);
      return;
    }
    for (var i = 0; i < stato.postazioni.length; i++) {
      if (stato.postazioni[i].id === id) {
        stato.centro = [stato.postazioni[i].lat, stato.postazioni[i].lon];
        stato.etichettaOsservatore = stato.postazioni[i].label; updateHudFilters();
        applyCenter(recenter);
        return;
      }
    }
  }
  function renderLocations() {
    var box = document.getElementById('locList');
    var html = '<button class="chip loc' + (stato.postazioneAttiva === 'gps' ? ' active' : '') + '" data-id="gps">' + t('set.myPos') + '</button>' +
      '<button class="chip loc' + (stato.postazioneAttiva === 'anzio' ? ' active' : '') + '" data-id="anzio">' + t('obs.anzio') + '</button>';
    for (var i = 0; i < stato.postazioni.length; i++) {
      var l = stato.postazioni[i];
      html += '<button class="chip loc' + (stato.postazioneAttiva === l.id ? ' active' : '') + '" data-id="' + esc(l.id) + '">' +
        esc(l.label) + '<span class="del" data-del="' + esc(l.id) + '">\u2715</span></button>';
    }
    box.innerHTML = html;
  }
  // Conferma prima di eliminare: la X da sola era troppo facile da toccare
  function chiediEliminaPostazione(id) {
    var loc = stato.postazioni.filter(function (l) { return l.id === id; })[0];
    askConfirm(t('loc.deleteQ', { name: loc ? loc.label : t('loc.thisOne') }), function () {
      stato.postazioni = stato.postazioni.filter(function (l) { return l.id !== id; });
      if (stato.postazioneAttiva === id) { activateLocation('gps', true); return; }
      renderLocations();
      savePrefs(buildPrefs());
    });
  }

  // ---------- Dialog di conferma generico ----------
  var confirmCb = null;
  function askConfirm(msg, onYes) {
    confirmCb = onYes;
    document.getElementById('confirmTitle').textContent = msg;
    document.getElementById('confirmDialog').style.display = 'block';
  }
  function hideConfirm() {
    document.getElementById('confirmDialog').style.display = 'none';
    confirmCb = null;
  }
  document.getElementById('confirmYes').addEventListener('click', function () {
    var cb = confirmCb;
    hideConfirm();
    if (cb) cb();
  });
  document.getElementById('confirmNo').addEventListener('click', hideConfirm);

  // ---------- Ricerca luogo per creare una postazione ----------
  // Ultimi risultati di ricerca luogo: la delega e agganciata una volta sola,
  // quindi l'elenco su cui lavora deve stare qui e non nella chiusura del
  // singolo render.
  var luoghiTrovati = [];
  function renderPlaceResults(list) {
    luoghiTrovati = list || [];
    var box = document.getElementById('locSearchResults');
    if (!luoghiTrovati.length) { box.innerHTML = ''; return; }
    var html = '';
    for (var i = 0; i < luoghiTrovati.length; i++) {
      var r = luoghiTrovati[i];
      html += '<div class="lr" data-i="' + i + '">' + esc(r.name) +
        (r.detail ? '<small>' + esc(r.detail) + '</small>' : '') + '</div>';
    }
    box.innerHTML = html;
  }
  function scegliLuogo(i) {
    var r = luoghiTrovati[i];
    if (!r) return;
    // Centra la mappa sul luogo (senza cambiare la postazione attiva) e
    // precompila il nome: basta poi premere "+ SALVA QUI"
    map.setView([r.lat, r.lon], Math.max(map.getZoom(), 9));
    document.getElementById('locName').value = r.name.substring(0, 20);
    document.getElementById('locSearchResults').innerHTML = '';
    document.getElementById('locSearchNote').textContent = t('loc.ready');
  }
  async function searchPlace() {
    var q = document.getElementById('locSearch').value.trim();
    var note = document.getElementById('locSearchNote');
    if (!q) { note.textContent = t('loc.typePlace'); return; }
    note.textContent = t('loc.searchingPlace', { q: q });
    document.getElementById('locSearchResults').innerHTML = '';
    try {
      var url = API.geocode + '?format=json&limit=6&addressdetails=0&q=' + encodeURIComponent(q);
      await turnoLuoghi();   // anche Nominatim accetta 1 richiesta al secondo
      var res = await fetchConScadenza(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      if (!Array.isArray(data) || !data.length) { note.textContent = t('loc.noPlace', { q: q }); return; }
      var list = data.map(function (d) {
        var parts = (d.display_name || '').split(',').map(function (s) { return s.trim(); });
        return { name: parts[0] || d.display_name || q,
                 detail: parts.slice(1, 4).join(', '),
                 lat: parseFloat(d.lat), lon: parseFloat(d.lon) };
      }).filter(function (r) { return !isNaN(r.lat) && !isNaN(r.lon); });
      note.textContent = t('loc.pickResult');
      renderPlaceResults(list);
    } catch (e) {
      note.textContent = t('loc.placeError', { msg: e.message });
    }
  }
  document.getElementById('locSearchBtn').addEventListener('click', searchPlace);
  document.getElementById('locSearch').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); searchPlace(); }
  });
  document.getElementById('locSave').addEventListener('click', function () {
    var name = document.getElementById('locName').value.trim();
    if (!name) name = t('loc.defaultName', { n: (stato.postazioni.length + 1) });
    var c = map.getCenter();
    var loc = { id: 'loc' + Date.now(), label: name.substring(0, 20),
                lat: Math.round(c.lat * 10000) / 10000, lon: Math.round(c.lng * 10000) / 10000 };
    stato.postazioni.push(loc);
    document.getElementById('locName').value = '';
    activateLocation(loc.id, true); // renderLocations + savePrefs inclusi
  });

  // ---------- Tasto BACK: chiude le finestre invece di uscire dall'app ----------
  // Quando qualcosa e aperto si aggiunge una tappa nella cronologia; il back
  // la consuma chiudendo la finestra piu in alto. Con tutto chiuso, il back
  // esce normalmente.
  function isAnyOpen() {
    if (SOVRAPPOSTE.some(sovrappostaAperta)) return true;
    if (pannelloAperto('sheet')) return true;
    for (var id in PANNELLI) if (pannelloAperto(id)) return true;
    return false;
  }
  function closeTopmost() {
    // Le sovrapposte sono gia in ordine di priorita nel registro
    for (var i = 0; i < SOVRAPPOSTE.length; i++) {
      if (sovrappostaAperta(SOVRAPPOSTE[i])) { SOVRAPPOSTE[i].chiudi(); return; }
    }
    if (document.getElementById('sheet').classList.contains('full')) { closeFull(); return; }
    closeAll(); // pannelli + scheda dell'aereo
  }
  var modalActive = false;   // ho una tappa "finestra" nella cronologia?
  var suppressPop = false;   // ignora il prossimo popstate (chiusura via tap)
  function syncHistoryModal() {
    var open = isAnyOpen();
    if (open && !modalActive) {
      modalActive = true;
      try { history.pushState({ radarModal: true }, ''); } catch (e) { modalActive = false; }
    } else if (!open && modalActive) {
      modalActive = false;
      suppressPop = true;
      try { history.back(); } catch (e) { suppressPop = false; }
    }
  }
  window.addEventListener('popstate', function () {
    if (suppressPop) { suppressPop = false; return; }
    if (isAnyOpen()) {
      modalActive = false;
      closeTopmost();
      // Se resta ancora qualcosa aperto, rimetti la tappa per il prossimo back
      if (isAnyOpen()) {
        modalActive = true;
        try { history.pushState({ radarModal: true }, ''); } catch (e) { modalActive = false; }
      }
    }
  });
  // Dopo ogni click (che puo aprire/chiudere finestre) allinea la cronologia
  document.addEventListener('click', function () { setTimeout(syncHistoryModal, 0); });

  // ---------- Delega degli eventi delle liste ----------
  // Tutte le liste dell'app vengono ricostruite con innerHTML, alcune a ogni
  // giro di polling. Riagganciare un listener per riga costava, misurato su
  // 400 aerei col pannello TRAFFICO aperto, ~170 ms bloccanti ogni 6 secondi.
  // I contenitori invece non cambiano mai: basta agganciarsi UNA volta a loro.
  function perHex(elenco, azione) {
    return function (riga) {
      var hex = riga.getAttribute('data-hex');
      var lista = elenco();
      for (var i = 0; i < lista.length; i++) {
        if (lista[i].hex === hex) { azione(lista[i]); return; }
      }
    };
  }
  delega(document.getElementById('planeList'), '.acrow',
    perHex(function () { return stato.aerei; }, function (ac) {
      vaiAllAereo(ac, { chiudi: 'board' });
    }));
  delega(document.getElementById('searchResults'), '.sr',
    perHex(function () { return stato.aerei; }, pickAndClose));
  delega(document.getElementById('passList'), '.pr', function (riga) {
    inArrivo.scegli(riga.getAttribute('data-hex'));
  });
  delega(document.getElementById('airlineList'), '.opt', function (riga) {
    applyAirlineFilter(riga.getAttribute('data-name'));
    document.getElementById('airlineList').style.display = 'none';
  });
  delega(document.getElementById('locList'), '.chip.loc', function (riga, e) {
    var del = e.target.getAttribute && e.target.getAttribute('data-del');
    if (del) { e.stopPropagation(); chiediEliminaPostazione(del); return; }
    activateLocation(riga.getAttribute('data-id'), true);
  });
  delega(document.getElementById('locSearchResults'), '.lr', function (riga) {
    scegliLuogo(parseInt(riga.getAttribute('data-i'), 10));
  });

  // ---------- Avvio ----------
  drawRings();
  positionSweep();
  updateHudFilters();
  startPolling();
  activateLocation(stato.postazioneAttiva, true);
}

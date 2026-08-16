// Logica applicativa del radar: mappa Leaflet, marker/scie, pannelli,
// polling, bussola MIRA, ricerca, geolocalizzazione.
// Portata quasi 1:1 dal prototipo a file singolo (vedi legacy/radarmobile.html);
// le chiusure interne restano volutamente insieme perche condividono lo stato
// (markers, trails, selezione, tag). Dati e funzioni pure sono nei moduli.

import L from 'leaflet';
import { DEFAULT_CENTER, DEFAULT_RADIUS_NM, POLL_INTERVAL_MS, API, TILE_STYLES, DEFAULT_MAP_STYLE, PASS_HORIZON_MIN, DEFAULT_PASS_KM, PASS_SCAN_NM, PASS_OVERHEAD_KM, PASS_ALERT_MIN, FIRE_WMS, PLANES_API_ENABLED, PLANES_SOURCES, PLANES_SOURCE } from './config.js';

// Fonte dei dati di volo in uso (vedi PLANES_SOURCES in config.js)
var SRC = PLANES_SOURCES[PLANES_SOURCE];
import { loadPrefs, savePrefs } from './prefs.js';
import {
  airlineName, toCallsign, fmtFlight, altColor, planeColor, altLabel, isOnGround, compass,
  bearingFromCenter, elevationAngle, emergencyInfo, flightPhase,
  routeConsistent, nextPass, landingBeforePass, isFirefightingAircraft
} from './domain.js';
import { t, setLang, getLang, detectLang, applyStaticI18n } from './i18n.js';
import AIRPORTS from './data/airports.json';

var CENTER = DEFAULT_CENTER.slice(); // puo cambiare con la geolocalizzazione
var radiusNM = DEFAULT_RADIUS_NM;
var filterAirline = "";
var filterAirborne = false;
var mapStyle = DEFAULT_MAP_STYLE;
var passKm = DEFAULT_PASS_KM;   // soglia distanza dei passaggi "IN ARRIVO"
var lang = detectLang();        // lingua UI: rilevata dal dispositivo, override in impostazioni
var showFires = false;          // overlay incendi attivi (EFFIS hotspot) attivo?
var showBurnt = false;          // overlay perimetri aree bruciate (EFFIS) attivo?
// Multi-postazione: punti di osservazione salvati + selezione attiva.
// 'gps' (segue la posizione) e 'anzio' sono di sistema, il resto e dell'utente.
var userLocations = [];
var activeLocation = 'gps';

export function initApp() {
  if (typeof L === 'undefined') {
    document.getElementById('hud').innerHTML = '<div style="padding:8px;font-size:12px;">' + t('err.leaflet') + '</div>';
    return;
  }

  var p = loadPrefs();
  if (p) {
    if (p.radiusNM >= 25 && p.radiusNM <= 250) radiusNM = p.radiusNM;
    if (typeof p.filterAirline === 'string') filterAirline = p.filterAirline;
    if (typeof p.filterAirborne === 'boolean') filterAirborne = p.filterAirborne;
    if (TILE_STYLES[p.mapStyle]) mapStyle = p.mapStyle;
    if (p.passKm >= 5 && p.passKm <= 50) passKm = p.passKm;
    if (p.lang === 'it' || p.lang === 'en') lang = p.lang;
    if (typeof p.showFires === 'boolean') showFires = p.showFires;
    if (typeof p.showBurnt === 'boolean') showBurnt = p.showBurnt;
    if (Array.isArray(p.locations)) {
      userLocations = p.locations.filter(function (l) {
        return l && typeof l.id === 'string' && typeof l.label === 'string' &&
               typeof l.lat === 'number' && typeof l.lon === 'number';
      });
    }
    if (typeof p.activeLocationId === 'string') activeLocation = p.activeLocationId;
  }
  // La postazione attiva deve esistere ancora, altrimenti si torna al GPS
  if (activeLocation !== 'gps' && activeLocation !== 'anzio' &&
      !userLocations.some(function (l) { return l.id === activeLocation; })) {
    activeLocation = 'gps';
  }
  function buildPrefs() {
    return { radiusNM: radiusNM, filterAirline: filterAirline, filterAirborne: filterAirborne,
             mapStyle: mapStyle, passKm: passKm, lang: lang, showFires: showFires, showBurnt: showBurnt,
             locations: userLocations, activeLocationId: activeLocation };
  }

  // Applica la lingua a tutte le stringhe statiche dell'interfaccia
  setLang(lang);
  var htmlRoot = document.getElementById('htmlRoot');
  function applyLang() {
    setLang(lang);
    if (htmlRoot) htmlRoot.setAttribute('lang', lang);
    applyStaticI18n();
    updateSliderLabels();
    updateArrNote();
    var chips = document.querySelectorAll('#langChips .chip');
    for (var i = 0; i < chips.length; i++) chips[i].classList.toggle('active', chips[i].getAttribute('data-lang') === lang);
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
    document.getElementById('radiusLabel').textContent = t('set.radius', { n: radiusNM });
    document.getElementById('passKmLabel').textContent = t('set.passKm', { n: passKm });
  }
  applyLang();
  var langChips = document.querySelectorAll('#langChips .chip');
  for (var lc = 0; lc < langChips.length; lc++) {
    langChips[lc].addEventListener('click', function () {
      lang = this.getAttribute('data-lang');
      applyLang();
      savePrefs(buildPrefs());
      // Ridisegna le parti dinamiche gia visibili nella nuova lingua
      updateHudFilters();
      refreshErrBar();
      if (selectedAc) { updateTag(selectedAc); if (document.getElementById('sheet').classList.contains('full')) fillSheet(selectedAc); }
      refreshBoard();
      renderSearchResults();
    });
  }

  document.getElementById('radiusSlider').value = radiusNM;
  document.getElementById('passKmSlider').value = passKm;
  document.getElementById('airlineSearch').value = filterAirline;
  document.getElementById('chkAirborne').checked = filterAirborne;

  // Attribuzione obbligatoria per le tile, in forma discreta
  var map = L.map('map', {
    zoomControl: false,
    attributionControl: true
  }).setView(CENTER, 8);
  map.attributionControl.setPrefix(false);
  // Credito alla fonte dei dati di volo, accanto a quello delle mappe
  map.attributionControl.addAttribution(t('attr.flightData', { src: SRC.attribution }));

  // Basemap selezionabile dalle impostazioni (persistente nelle preferenze)
  var tileLayer = null;
  function setMapStyle(style, save) {
    if (!TILE_STYLES[style]) return;
    mapStyle = style;
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
  setMapStyle(mapStyle, false);
  var styleChips = document.querySelectorAll('#mapStyleChips .chip');
  for (var sc = 0; sc < styleChips.length; sc++) {
    styleChips[sc].addEventListener('click', function () {
      setMapStyle(this.getAttribute('data-style'), true);
    });
  }

  // Overlay incendi (rilevamenti satellitari EFFIS/Copernicus, WMS pubblico):
  // due layer indipendenti, entrambi opzionali.
  // - fireLayer: rilevamenti attivi (hotspot, tutte le fonti)
  // - burntLayer: perimetri delle aree gia bruciate (quasi tempo reale)
  function fmtWmsDate(d) { return d.toISOString().slice(0, 10); }
  function wmsTimeRange(days) {
    var end = new Date();
    var start = new Date(Date.now() - days * 86400000);
    return fmtWmsDate(start) + '/' + fmtWmsDate(end);
  }
  var fireLayer = null;
  function setFires(on, save) {
    showFires = on;
    if (on) {
      if (!fireLayer) {
        fireLayer = L.tileLayer.wms(FIRE_WMS.url, {
          layers: FIRE_WMS.hotspots.layers, format: 'image/png', transparent: true,
          attribution: FIRE_WMS.attribution, time: wmsTimeRange(FIRE_WMS.hotspots.days),
          opacity: 0.85, zIndex: 250
        });
      }
      fireLayer.addTo(map);
    } else if (fireLayer) {
      map.removeLayer(fireLayer);
    }
    document.getElementById('chkFires').checked = on;
    if (save) savePrefs(buildPrefs());
  }
  var burntLayer = null;
  function setBurnt(on, save) {
    showBurnt = on;
    if (on) {
      if (!burntLayer) {
        burntLayer = L.tileLayer.wms(FIRE_WMS.url, {
          layers: FIRE_WMS.burnt.layers, format: 'image/png', transparent: true,
          attribution: FIRE_WMS.attribution, time: wmsTimeRange(FIRE_WMS.burnt.days),
          opacity: 0.6, zIndex: 240
        });
      }
      burntLayer.addTo(map);
    } else if (burntLayer) {
      map.removeLayer(burntLayer);
    }
    document.getElementById('chkBurnt').checked = on;
    // La legenda dei colori EFFIS (eta dell'incendio) serve solo a layer acceso
    document.getElementById('burntLegend').style.display = on ? 'flex' : 'none';
    if (save) savePrefs(buildPrefs());
  }
  document.getElementById('chkFires').addEventListener('change', function () {
    setFires(this.checked, true);
  });
  document.getElementById('chkBurnt').addEventListener('change', function () {
    setBurnt(this.checked, true);
  });
  setFires(showFires, false);
  setBurnt(showBurnt, false);

  var markers = {};      // hex -> marker
  var markerState = {};  // hex -> { track, color, sel } per evitare setIcon inutili
  var trails = {};       // hex -> { pts, line, color }
  var selected = null;
  var lastAircraft = [];
  var photoCache = {};
  var rings = [];
  var fetchSeq = 0;      // scarta risposte fuori ordine
  var timer = null;
  var searchMarker = null;  // marker per un volo cercato fuori dal raggio
  var observerLabel = '';   // etichetta punto di osservazione nell'HUD
  var tagMarker = null;     // etichetta ancorata che segue l'aereo selezionato
  var selectedAc = null;    // dati dell'aereo selezionato

  function clearTag() {
    if (tagMarker) { map.removeLayer(tagMarker); tagMarker = null; }
  }
  function tagIcon(ac) {
    // Numero volo commerciale se disponibile in cache rotte, altrimenti callsign
    var cs = (ac.flight || '').trim();
    var num = cs || ac.hex.toUpperCase();
    var route = null;
    if (cs && routeCache[cs]) {
      var r = routeCache[cs];
      var fnum = fmtFlight(r.flightIata);
      if (fnum) num = fnum;
      // Mostra la rotta solo se coerente con posizione e prua reali
      if (routeConsistent(ac, r)) {
        route = (r.orig.iata || r.orig.icao || '?') + ' \u2192 ' + (r.dest.iata || r.dest.icao || '?');
      }
    }
    var alt = altLabel(ac);
    var spd = ac.gs != null ? Math.round(ac.gs) + ' kt' : '--';
    var dir = ac.track != null ? Math.round(ac.track) + '\u00B0 ' + compass(ac.track) : '';
    var comp = airlineName(ac.flight);
    return L.divIcon({
      className: '',
      html: '<div class="tag-anchor">' +
        '<div class="tag-line"></div>' +
        '<div class="tag-box">' +
          '<div class="tag-more" aria-hidden="true">\u26F6</div>' +
          '<div class="l1">' + num + '</div>' +
          '<div class="l3" style="color:var(--muted);">' + comp + '</div>' +
          (route ? '<div class="l3">' + route + '</div>' : '') +
          '<div class="l2">' + alt + ' \u00B7 ' + spd + '</div>' +
          (dir ? '<div class="l2">' + dir + '</div>' : '') +
        '</div></div>',
      iconSize: [0, 0], iconAnchor: [0, 0]
    });
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

  // ---------- Bussola live: punta il telefono verso l'aereo selezionato ----------
  var miraActive = false;
  var miraHandler = null;
  function miraTargetBearing() {
    if (!selectedAc || selectedAc.lat == null) return null;
    return bearingFromCenter(CENTER, selectedAc.lat, selectedAc.lon);
  }
  // Elevazione dell'aereo selezionato (gradi sopra l'orizzonte)
  function miraTargetElevation() {
    if (!selectedAc || selectedAc.lat == null) return null;
    return elevationAngle(CENTER, selectedAc.lat, selectedAc.lon, selectedAc.alt_baro);
  }
  function updateMiraStatic() {
    // Stato iniziale della riga elevazione, prima che arrivino i sensori
    var elev = miraTargetElevation();
    document.getElementById('miraSub').textContent = t('mira.elevOf', { v: (elev == null ? '--' : elev + '\u00B0') });
  }
  // Smoothing: componenti circolari per l'azimut (salto 359->0) + EMA per il pitch
  var smoothSin = null, smoothCos = null, smoothBeta = null;
  var SMOOTH = 0.15;       // 0..1: piu basso = piu stabile ma piu lento
  // Riferimento di pitch che corrisponde all'orizzonte (0\u00B0 elevazione).
  // Default 90\u00B0: telefono tenuto verticale. La calibrazione lo azzera sul reale.
  var betaHorizon = 90;
  var lastBeta = null;     // ultimo pitch grezzo, per il pulsante CALIBRA
  var LOCK_IN = 8;         // entra in allineamento sotto questa differenza
  var LOCK_OUT = 15;       // esce solo oltre questa (isteresi anti-tremolio)
  var SCALE_DEG = 60;      // gradi visibili dal centro al bordo del mirino
  var miraLocked = false;  // stato di allineamento corrente

  function onOrientation(e) {
    // --- Asse orizzontale: rotazione (bussola) ---
    var heading = null;
    if (typeof e.webkitCompassHeading === 'number') heading = e.webkitCompassHeading;
    else if (e.alpha != null) heading = 360 - e.alpha; // Android: alpha antiorario da Nord
    if (heading == null) return;
    var rad = heading * Math.PI / 180;
    if (smoothSin == null) { smoothSin = Math.sin(rad); smoothCos = Math.cos(rad); }
    else {
      smoothSin = smoothSin * (1 - SMOOTH) + Math.sin(rad) * SMOOTH;
      smoothCos = smoothCos * (1 - SMOOTH) + Math.cos(rad) * SMOOTH;
    }
    var smoothed = (Math.atan2(smoothSin, smoothCos) * 180 / Math.PI + 360) % 360;

    var tgtBrg = miraTargetBearing();
    if (tgtBrg == null) return;
    var diffAz = ((tgtBrg - smoothed + 540) % 360) - 180; // -180..180

    // --- Asse verticale: alzata (inclinazione del telefono) ---
    var hasPitch = (e.beta != null);
    var diffEl = null;
    if (hasPitch) {
      lastBeta = e.beta;
      if (smoothBeta == null) smoothBeta = e.beta;
      else smoothBeta = smoothBeta * (1 - SMOOTH) + e.beta * SMOOTH;
      // Elevazione a cui punta il telefono: verticale (betaHorizon) = orizzonte
      var pointElev = betaHorizon - smoothBeta;
      var tgtEl = miraTargetElevation();
      if (tgtEl != null) diffEl = tgtEl - pointElev; // >0 = aereo piu in alto -> alza
    }

    var target = document.getElementById('miraTarget');
    var status = document.getElementById('miraStatus');
    var sub = document.getElementById('miraSub');
    var locked = document.getElementById('miraLocked');
    var adA = Math.abs(diffAz);
    var adE = hasPitch ? Math.abs(diffEl) : 0;

    // Lock con isteresi: entra sotto LOCK_IN, esce solo oltre LOCK_OUT.
    // Cosi sul bordo della soglia non alterna piu tra allineato e non.
    var maxDiff = Math.max(adA, adE);
    if (!miraLocked && maxDiff < LOCK_IN) miraLocked = true;
    else if (miraLocked && maxDiff > LOCK_OUT) miraLocked = false;

    // Due righe SEMPRE presenti e su singola riga (rotazione sopra, elevazione
    // sotto): l'altezza del blocco non cambia mai, quindi il mirino non trasla.
    if (miraLocked) {
      target.style.left = '50%';   // fermo al centro: niente micro-rumore
      target.style.top = '50%';
      status.textContent = t('mira.aligned');
      sub.textContent = t('mira.framed');
      locked.style.display = 'block';
    } else {
      var clamp = function (v) { return Math.max(-45, Math.min(45, v / SCALE_DEG * 45)); };
      target.style.left = (50 + clamp(diffAz)) + '%';
      target.style.top = (hasPitch ? (50 - clamp(diffEl)) : 50) + '%';
      locked.style.display = 'none';
      // Riga 1: rotazione (sempre)
      status.textContent = adA < LOCK_IN ? t('mira.rotOk')
        : t(diffAz > 0 ? 'mira.right' : 'mira.left', { n: Math.round(adA) });
      // Riga 2: elevazione (sempre sotto)
      if (!hasPitch) {
        var te = miraTargetElevation();
        sub.textContent = t('mira.elevOf', { v: (te == null ? '--' : te + '\u00B0') });
      } else {
        sub.textContent = adE < LOCK_IN ? t('mira.elevOk')
          : t(diffEl > 0 ? 'mira.up' : 'mira.down', { n: Math.round(adE) });
      }
    }
  }
  function startMira() {
    if (!selectedAc) return;
    // Reset del filtro: riparte pulito
    smoothSin = null; smoothCos = null; smoothBeta = null; miraLocked = false;
    var overlay = document.getElementById('miraOverlay');
    var hint = document.getElementById('miraHint');
    overlay.style.display = 'block';
    updateMiraStatic();
    document.getElementById('miraStatus').textContent = t('mira.move');
    function attach() {
      miraActive = true;
      miraHandler = onOrientation;
      window.addEventListener('deviceorientationabsolute', miraHandler, true);
      window.addEventListener('deviceorientation', miraHandler, true);
      hint.textContent = t('mira.compassHint');
    }
    // iOS 13+: serve permesso esplicito
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(function (resp) {
        if (resp === 'granted') attach();
        else hint.textContent = t('mira.permDenied');
      }).catch(function () { hint.textContent = t('mira.unavailable'); });
    } else if (window.DeviceOrientationEvent) {
      attach();
    } else {
      hint.textContent = t('mira.unsupported');
    }
  }
  function stopMira() {
    miraActive = false;
    document.getElementById('miraOverlay').style.display = 'none';
    if (miraHandler) {
      window.removeEventListener('deviceorientationabsolute', miraHandler, true);
      window.removeEventListener('deviceorientation', miraHandler, true);
      miraHandler = null;
    }
  }
  // Calibrazione orizzonte: l'inclinazione attuale del telefono diventa lo 0°
  // di elevazione. Da usare tenendo il telefono verticale puntato all'orizzonte.
  document.getElementById('miraCalib').addEventListener('click', function (e) {
    e.stopPropagation();
    if (lastBeta == null) {
      document.getElementById('miraHint').textContent = t('mira.moveFirst');
      return;
    }
    betaHorizon = lastBeta;
    document.getElementById('miraHint').textContent = t('mira.calibrated');
  });

  function drawRings() {
    rings.forEach(function (r) { map.removeLayer(r); });
    rings = [];
    var step = radiusNM / 4;
    for (var i = 1; i <= 4; i++) {
      rings.push(L.circle(CENTER, {
        radius: step * i * 1852, color: '#34e08a', weight: 1, fill: false,
        opacity: 0.4, dashArray: '2,7', interactive: false
      }).addTo(map));
    }
    drawObserver();  // segno del punto di osservazione al centro
    drawAirports();  // gli aeroporti seguono centro e raggio correnti
  }

  // Mirino radar sul punto di osservazione: puntino + ping pulsante + crocino
  var observerMarker = null;
  function observerIcon() {
    return L.divIcon({
      className: '',
      html: '<div class="observer">' +
        '<span class="obs-ping"></span>' +
        '<span class="obs-cross"></span>' +
        '<span class="obs-core"></span>' +
        '</div>',
      iconSize: [0, 0], iconAnchor: [0, 0]
    });
  }
  function drawObserver() {
    if (!observerMarker) {
      observerMarker = L.marker(CENTER, {
        icon: observerIcon(), interactive: false, keyboard: false, zIndexOffset: -200
      }).addTo(map);
    } else {
      observerMarker.setLatLng(CENTER);
    }
  }

  // ---------- Aeroporti nel raggio ----------
  var airportMarkers = [];
  function airportIcon(a) {
    return L.divIcon({
      className: '',
      html: '<div class="airport-marker"><span class="airport-dot"></span>' +
        '<span class="airport-code">' + (a.iata || a.icao) + '</span></div>',
      iconSize: [0, 0], iconAnchor: [0, 0]
    });
  }
  function drawAirports() {
    airportMarkers.forEach(function (m) { map.removeLayer(m); });
    airportMarkers = [];
    // Entro il raggio, al massimo i 40 piu vicini
    var list = [];
    for (var i = 0; i < AIRPORTS.length; i++) {
      var d = map.distance([AIRPORTS[i].lat, AIRPORTS[i].lon], CENTER);
      if (d <= radiusNM * 1852) list.push({ a: AIRPORTS[i], d: d });
    }
    list.sort(function (x, y) { return x.d - y.d; });
    list.slice(0, 40).forEach(function (it) {
      var a = it.a;
      var m = L.marker([a.lat, a.lon], {
        icon: airportIcon(a), keyboard: false, zIndexOffset: -500
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
    var c = map.latLngToContainerPoint(CENTER);
    var east = L.latLng(CENTER[0], CENTER[1] + (radiusNM * 1.852 / (111.32 * Math.cos(CENTER[0] * Math.PI / 180))));
    var e = map.latLngToContainerPoint(east);
    var d = Math.abs(e.x - c.x) * 2;
    sweepEl.style.width = d + 'px';
    sweepEl.style.height = d + 'px';
    sweepEl.style.left = c.x + 'px';
    sweepEl.style.top = c.y + 'px';
  }
  map.on('move zoom viewreset resize', positionSweep);

  function planeIcon(track, color, isSel, emerg, ff, ffNear) {
    var cls = 'plane-icon' + (isSel ? ' selected' : '') + (emerg ? ' emerg' : '') +
      (ff ? ' ff' : '') + (ffNear ? ' ff-near' : '');
    var fill = emerg ? '#ff3b30' : color;
    return L.divIcon({
      className: '',
      html: '<div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;">' +
        '<div class="' + cls + '" style="transform: rotate(' + (track||0) + 'deg);">' +
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="' + fill + '">' +
        '<path d="M12 2 L14 10 L22 13 L22 15 L14 13.5 L13.5 20 L16 21.5 L16 23 L12 22 L8 23 L8 21.5 L10.5 20 L10 13.5 L2 15 L2 13 L10 10 Z"/>' +
        '</svg></div></div>',
      iconSize: [40, 40], iconAnchor: [20, 20]
    });
  }

  function passesFilters(ac) {
    if (filterAirborne && isOnGround(ac)) return false;
    if (filterAirline && airlineName(ac.flight) !== filterAirline) return false;
    return true;
  }

  // ---------- Foto ----------
  async function fetchPhotoFrom(url) {
    var res = await fetch(url);
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
    if (photoCache[hex] === null) { note.textContent = t('photo.none'); return; }
    if (photoCache[hex]) { showPhoto(photoCache[hex]); return; }
    note.textContent = t('photo.searching');
    try {
      var info = await fetchPhotoFrom(API.photoHex + hex.toUpperCase());
      if (!info && reg) {
        info = await fetchPhotoFrom(API.photoReg + encodeURIComponent(reg));
      }
      if (info && info.url) {
        photoCache[hex] = info;
        note.textContent = '';
        showPhoto(info);
      } else {
        photoCache[hex] = null;
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
  var routeCache = {};   // callsign -> {orig, dest} | null (null = non trovata)
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
      document.getElementById('miniOrig').textContent = '?';
      document.getElementById('miniDest').textContent = '?';
      clearRouteLine();
      if (ac && selected === ac.hex && tagMarker) updateTag(ac);
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
      document.getElementById('miniOrig').textContent = '?';
      document.getElementById('miniDest').textContent = '?';
      var mfi = document.getElementById('miniFlight');
      var numi = fmtFlight(r.flightIata);
      if (numi) { mfi.textContent = numi; mfi.dataset.iata = '1'; }
      clearRouteLine();
      if (selected === ac.hex && tagMarker) updateTag(ac);
      return;
    }
    document.getElementById('rFlight').textContent = fmtFlight(r.flightIata) || fmtFlight(cs) || '--';
    document.getElementById('rOrigCity').textContent = r.orig.city || r.orig.name || '--';
    document.getElementById('rOrigIata').textContent = r.orig.iata || r.orig.icao || '';
    document.getElementById('rDestCity').textContent = r.dest.city || r.dest.name || '--';
    document.getElementById('rDestIata').textContent = r.dest.iata || r.dest.icao || '';
    // Destinazione e partenza nella riga compatta
    document.getElementById('miniOrig').textContent = r.orig.city || r.orig.iata || r.orig.icao || '?';
    document.getElementById('miniDest').textContent = r.dest.city || r.dest.iata || r.dest.icao || '?';
    // Numero volo commerciale (IATA) al posto del callsign
    var miniF = document.getElementById('miniFlight');
    var num = fmtFlight(r.flightIata);
    if (num) { miniF.textContent = num; miniF.dataset.iata = '1'; }
    document.getElementById('routeBox').style.display = 'block';
    currentRoute = r;
    if (ac && ac.lat != null) drawRouteLine(ac);
    // Aggiorna l'etichetta ancorata ora che numero volo e rotta sono noti
    if (ac && selected === ac.hex && tagMarker) updateTag(ac);
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
    if (cs in routeCache) { showRoute(routeCache[cs], ac); return; }
    note.textContent = t('route.searching');
    try {
      var res = await fetch(API.routeCallsign + encodeURIComponent(cs));
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
        routeCache[cs] = r;
        // Mostra solo se l'aereo e ancora selezionato
        if (selected === ac.hex) showRoute(r, ac);
      } else {
        routeCache[cs] = null;
        if (selected === ac.hex) showRoute(null, ac);
      }
    } catch (e) {
      // Non mettere in cache gli errori di rete: si riprova alla prossima apertura
      if (selected === ac.hex) note.textContent = t('route.unreachable', { msg: e.message });
    }
  }

  // ---------- Pannelli ----------
  function closeAll() {
    document.getElementById('board').classList.remove('open');
    document.getElementById('settings').classList.remove('open');
    document.getElementById('searchPanel').classList.remove('open');
    document.getElementById('passes').classList.remove('open');
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
        markers[id].setIcon(planeIcon(ac.track, color, isSel, emg, ff, ff && fireNear[id]));
        markerState[id] = { track: ac.track || 0, color: color, sel: isSel, emg: emg, ff: ff, ffNear: !!(ff && fireNear[id]) };
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
    // Riga compatta: compagnia + dati che si aggiornano ad ogni refresh
    document.getElementById('miniAirline').textContent = airlineName(ac.flight).toUpperCase();
    // Ripiego numero volo = callsign, finche showRoute non fornisce il numero IATA
    var miniF = document.getElementById('miniFlight');
    if (!miniF.dataset.iata) miniF.textContent = (ac.flight || '').trim() || ac.hex.toUpperCase();
    document.getElementById('miniAlt').textContent = altLabel(ac);
    document.getElementById('miniSpd').textContent = ac.gs != null ? Math.round(ac.gs) + ' kt' : '--';
    // Tipo aereo nella riga mini
    document.getElementById('miniModel').textContent = ac.desc || ac.t || t('sh.unknownType');
    // Distanza e direzione da Anzio nella riga mini
    if (ac.lat != null && ac.lon != null) {
      var mkm = map.distance([ac.lat, ac.lon], CENTER) / 1000;
      document.getElementById('miniDist').textContent = mkm.toFixed(0) + ' km ' + compass(bearingFromCenter(CENTER, ac.lat, ac.lon));
    } else {
      document.getElementById('miniDist').textContent = '--';
    }
    // Fase di volo nella riga mini
    document.getElementById('miniPhase').textContent = flightPhase(ac) || '';
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
      var km = map.distance([ac.lat, ac.lon], CENTER) / 1000;
      distTxt = t('sh.dist', { km: km.toFixed(1), dir: compass(bearingFromCenter(CENTER, ac.lat, ac.lon)) });
    }
    var cs = (ac.flight || '').trim();
    document.getElementById('shReg').textContent = distTxt +
      (cs ? t('sh.flight', { cs: cs }) : '') + t('sh.reg', { r: (ac.r || '--'), hex: ac.hex.toUpperCase() });

    // --- Emergenza ---
    var emerg = emergencyInfo(ac);
    var banner = document.getElementById('emergBanner');
    if (emerg) {
      banner.textContent = '\u26A0 ' + emerg + (ac.squawk ? ' \u00B7 SQUAWK ' + ac.squawk : '');
      banner.style.display = 'block';
    } else {
      banner.style.display = 'none';
    }

    // --- Antincendio (Canadair ecc.), eventualmente vicino a un incendio rilevato ---
    var ffBanner = document.getElementById('ffBanner');
    if (isFirefightingAircraft(ac)) {
      ffBanner.textContent = '\uD83D\uDD25 ' + (fireNear[ac.hex] ? t('ff.nearFire') : t('ff.badge'));
      ffBanner.style.display = 'block';
    } else {
      ffBanner.style.display = 'none';
    }

    // --- Fase di volo (signature) con icona e barra quota ---
    var phaseEl = document.getElementById('shPhase');
    var phase = flightPhase(ac);
    if (phase) {
      document.getElementById('phaseTxt').textContent = phase;
      // Icona secondo la fase
      var pico = '\u2708';
      if (phase.indexOf('SALITA') !== -1) pico = '\u2197';
      else if (phase.indexOf('DISCESA') !== -1 || phase.indexOf('AVVICINAMENTO') !== -1 || phase.indexOf('ARRIVO') !== -1) pico = '\u2198';
      else if (phase.indexOf('CROCIERA') !== -1) pico = '\u2708';
      else if (phase.indexOf('TERRA') !== -1) pico = '\u25AC';
      document.getElementById('phaseIco').textContent = pico;
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
    else if (ac.roll < -5) { rEl.textContent = '\u21B0 sx ' + Math.abs(Math.round(ac.roll)) + '\u00B0'; }
    else if (ac.roll > 5) { rEl.textContent = '\u21B1 dx ' + Math.round(ac.roll) + '\u00B0'; }
    else { rEl.textContent = 'dritto'; }
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
    var prev = selected;
    selected = ac.hex;
    selectedAc = ac;
    // Cambio aereo: azzera la rotta tracciata del precedente
    if (prev !== ac.hex) { clearRouteLine(); currentRoute = null; }
    document.getElementById('board').classList.remove('open');
    document.getElementById('settings').classList.remove('open');
    updateTag(ac);
    updateFollowBtn(); // stato campanella per l'aereo appena selezionato
    // Carica la rotta subito (serve all'etichetta per partenza->destinazione)
    var cs = (ac.flight || '').trim();
    if (cs && !(cs in routeCache)) loadRoute(ac);
    else if (cs && routeCache[cs]) showRoute(routeCache[cs], ac);
    if (prev !== selected) updateSelectedIcons(prev, selected);
    drawPlanes(lastAircraft); // riapplica attenuazione agli altri
  }
  // Espande alla scheda a tutto schermo
  function openFull() {
    if (!selectedAc) return;
    var ac = selectedAc;
    var mf = document.getElementById('miniFlight'); delete mf.dataset.iata;
    document.getElementById('miniOrig').textContent = '\u2026';
    document.getElementById('miniDest').textContent = '\u2026';
    fillSheet(ac);
    var s = document.getElementById('sheet');
    s.classList.remove('mini');
    s.classList.add('open', 'full');
    loadPhoto(ac.hex, ac.r);
    // Rotta: usa cache se presente, altrimenti caricala
    var cs = (ac.flight || '').trim();
    if (cs && routeCache[cs] !== undefined) showRoute(routeCache[cs], ac);
    else loadRoute(ac);
  }
  // Chiude la full, torna all'etichetta ancorata
  function closeFull() {
    document.getElementById('sheet').classList.remove('open', 'full');
    stopMira();
  }
  // Deseleziona tutto
  function closeSheet() {
    if (!selected) return;
    var prev = selected;
    selected = null;
    selectedAc = null;
    stopMira();
    document.getElementById('sheet').classList.remove('open', 'full');
    clearTag();
    clearRouteLine();
    clearSearchMarker();
    updateSelectedIcons(prev, null);
    drawPlanes(lastAircraft); // ripristina piena visibilita
  }
  map.on('click', closeAll);

  // ---------- Pannello TRAFFICO: lista aerei + classifica compagnie ----------
  function isBoardOpen() { return document.getElementById('board').classList.contains('open'); }

  // Classifica compagnie (tab COMPAGNIE)
  function renderBoard() {
    var counts = {};
    var filtered = lastAircraft.filter(passesFilters);
    for (var i = 0; i < filtered.length; i++) {
      var n = airlineName(filtered[i].flight);
      counts[n] = (counts[n] || 0) + 1;
    }
    var list = Object.keys(counts).map(function (k) { return { name: k, n: counts[k] }; })
      .sort(function (a, b) { return b.n - a.n; });
    var max = list.length ? list[0].n : 1;
    var html = '';
    for (var j = 0; j < list.length; j++) {
      html += '<div class="row"><div class="name">' + list[j].name + '</div>' +
        '<div class="barWrap"><div class="bar" style="width:' + Math.round(list[j].n / max * 100) + '%"></div></div>' +
        '<div class="n">' + list[j].n + '</div></div>';
    }
    document.getElementById('boardList').innerHTML = html || '<div class="row"><div class="name">' + t('board.none') + '</div></div>';
  }

  // Lista aerei nel raggio (tab AEREI): rispetta i filtri, ordinata per
  // distanza, righe cliccabili che portano all'aereo.
  function renderPlaneList() {
    var list = lastAircraft.filter(function (a) { return a.lat != null && a.lon != null && passesFilters(a); });
    list = list.map(function (a) { return { ac: a, d: map.distance([a.lat, a.lon], CENTER) }; })
      .sort(function (x, y) { return x.d - y.d; });
    document.getElementById('planeCount').textContent =
      list.length ? t(list.length === 1 ? 'list.count1' : 'list.count', { n: list.length }) : '';
    if (!list.length) {
      document.getElementById('planeList').innerHTML = '<div class="empty">' + t('list.none') + '</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var a = list[i].ac, km = list[i].d / 1000;
      var flight = (a.flight || '').trim() || a.hex.toUpperCase();
      var alt = altLabel(a, true) || '--';
      var spd = a.gs != null ? Math.round(a.gs) + ' kt' : '--';
      var emg = !!emergencyInfo(a);
      var phase = flightPhase(a) || '';
      var ff = isFirefightingAircraft(a);
      var ffBadge = ff ? ('<span class="ffbadge">' + (fireNear[a.hex] ? '🔥 ' + t('ff.nearFire') : t('ff.badge')) + '</span>') : '';
      html += '<div class="acrow' + (emg ? ' emg' : '') + (ff ? ' ff' : '') + '" data-hex="' + a.hex + '">' +
        '<div class="ac-l"><div class="ac-f">' + flight + (emg ? '<span class="emgbadge">EMERG</span>' : '') + ffBadge + '</div>' +
          '<div class="ac-sub">' + airlineName(a.flight) + (a.t ? ' · ' + a.t : '') + (phase ? ' · ' + phase : '') + '</div></div>' +
        '<div class="ac-r"><div class="ac-alt">' + alt + ' · ' + spd + '</div>' +
          '<div class="ac-dist">' + km.toFixed(0) + ' km ' + compass(bearingFromCenter(CENTER, a.lat, a.lon)) + '</div></div>' +
        '</div>';
    }
    var box = document.getElementById('planeList');
    box.innerHTML = html;
    var rows = box.querySelectorAll('.acrow');
    for (var k = 0; k < rows.length; k++) {
      rows[k].addEventListener('click', function () {
        var hex = this.getAttribute('data-hex');
        for (var m = 0; m < lastAircraft.length; m++) {
          if (lastAircraft[m].hex === hex) {
            document.getElementById('board').classList.remove('open');
            pickAndClose(lastAircraft[m]);
            return;
          }
        }
      });
    }
  }

  // Aggiorna le viste del pannello TRAFFICO (solo se aperto)
  function refreshBoard() {
    if (!isBoardOpen()) return;
    renderPlaneList();
    renderBoard();
  }

  // Tab AEREI / COMPAGNIE
  (function () {
    var tabs = document.querySelectorAll('#board .tabs .tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        var which = this.getAttribute('data-tab');
        for (var j = 0; j < tabs.length; j++) tabs[j].classList.toggle('active', tabs[j] === this);
        document.getElementById('tabPlanes').style.display = which === 'planes' ? 'block' : 'none';
        document.getElementById('tabAirlines').style.display = which === 'airlines' ? 'block' : 'none';
      });
    }
  })();

  // ---------- Filtro compagnia (nel pannello ricerca, applicazione immediata) ----------
  function airlinesPresent() {
    var names = {};
    for (var i = 0; i < lastAircraft.length; i++) names[airlineName(lastAircraft[i].flight)] = true;
    return Object.keys(names).sort();
  }
  function applyAirlineFilter(name) {
    filterAirline = name;
    document.getElementById('airlineSearch').value = name;
    savePrefs(buildPrefs());
    updateHudFilters();
    drawPlanes(lastAircraft);
    refreshBoard();
    renderSearchResults();
  }
  function renderAirlineList() {
    var box = document.getElementById('airlineList');
    var q = document.getElementById('airlineSearch').value.trim().toLowerCase();
    var list = airlinesPresent().filter(function (n) {
      return !q || n.toLowerCase().indexOf(q) !== -1;
    });
    var html = '<div class="opt" data-name="" style="padding:8px;font-size:13px;cursor:pointer;border-bottom:1px solid var(--line);">Tutte</div>';
    for (var i = 0; i < list.length; i++) {
      html += '<div class="opt" data-name="' + list[i].replace(/"/g,'&quot;') + '" style="padding:8px;font-size:13px;cursor:pointer;border-bottom:1px solid var(--line);">' + list[i] + '</div>';
    }
    box.innerHTML = html;
    var opts = box.querySelectorAll('.opt');
    for (var j = 0; j < opts.length; j++) {
      opts[j].addEventListener('click', function () {
        applyAirlineFilter(this.getAttribute('data-name'));
        box.style.display = 'none';
      });
    }
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
    var filtered = lastAircraft.filter(passesFilters);
    for (var i = 0; i < filtered.length; i++) {
      var ac = filtered[i];
      if (ac.lat == null || ac.lon == null) continue;
      var d = map.distance([ac.lat, ac.lon], CENTER);
      if (d < bestD) { bestD = d; best = ac; }
    }
    return best;
  }

  // ---------- IN ARRIVO: passaggi previsti (CPA) ----------
  var passLayer = null;      // proiezioni sulla mappa (linea + crocetta)
  var passAircraft = [];     // set esteso dalla scansione a raggio ampio
  var passScanSeq = 0;       // scarta risposte fuori ordine della scansione
  function isPassesOpen() { return document.getElementById('passes').classList.contains('open'); }

  // Calcola e ordina i passaggi entro soglia e orizzonte temporale.
  // Usa il set della scansione ampia (250 NM), cosi vede gli aerei molto
  // prima del raggio della mappa.
  function computePasses() {
    var out = [];
    var filtered = passAircraft.filter(passesFilters);
    for (var i = 0; i < filtered.length; i++) {
      var ac = filtered[i];
      var pass = nextPass(CENTER, ac);
      if (!pass) continue;
      if (pass.tMin > PASS_HORIZON_MIN) continue;
      if (pass.dMinKm > passKm) continue;
      // Scarta i falsi positivi: aerei che atterrano a un aeroporto sulla
      // rotta prima di arrivare sopra di noi (es. arrivi a Fiumicino).
      if (landingBeforePass(CENTER, ac, pass, AIRPORTS)) continue;
      out.push({ ac: ac, pass: pass });
    }
    out.sort(function (a, b) { return a.pass.tMin - b.pass.tMin; });
    return out;
  }

  // Scansione dedicata a raggio massimo (solo a pannello aperto): estende il
  // preaviso senza toccare il raggio della mappa. Rinfrescata a ogni polling.
  async function fetchPassScan() {
    if (!PLANES_API_ENABLED) return;   // accesso sospeso: nessuna scansione
    if (!isPassesOpen()) return;
    var seq = ++passScanSeq;
    try {
      var res = await apiFetch(SRC.point(CENTER[0], CENTER[1], PASS_SCAN_NM));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      if (seq !== passScanSeq || !isPassesOpen()) return;
      if (SRC.errorOf(data)) throw new Error('API'); // ripiega sul set nel raggio
      passAircraft = trimToRadius(data.ac || [], PASS_SCAN_NM);
    } catch (e) {
      if (seq !== passScanSeq) return;
      passAircraft = lastAircraft; // fallback al set nel raggio corrente
    }
    if (!isPassesOpen()) return;
    renderPasses();
    drawPassProjections();
  }

  function passFlightLabel(ac) {
    var cs = (ac.flight || '').trim();
    if (cs && routeCache[cs]) {
      var num = fmtFlight(routeCache[cs].flightIata);
      if (num) return num;
    }
    return cs || ac.hex.toUpperCase();
  }

  function renderPasses() {
    var box = document.getElementById('passList');
    var list = computePasses();
    if (!list.length) {
      box.innerHTML = '<div class="empty">' + t('arr.none', { n: PASS_HORIZON_MIN }) + '</div>';
      return;
    }
    var now = Date.now();
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var ac = list[i].ac, p = list[i].pass;
      var mins = Math.max(0, Math.round(p.tMin));
      var when = new Date(now + p.tMin * 60000);
      var hh = ('0' + when.getHours()).slice(-2) + ':' + ('0' + when.getMinutes()).slice(-2);
      var etaBig = mins <= 0 ? t('arr.now') : t('arr.inMin', { n: mins });
      var km = p.dMinKm < 1 ? (Math.round(p.dMinKm * 1000) + ' m') : (p.dMinKm.toFixed(p.dMinKm < 10 ? 1 : 0) + ' km');
      var overhead = (p.dMinKm < PASS_OVERHEAD_KM);
      html += '<div class="pr" data-hex="' + ac.hex + '">' +
        '<div class="eta"><b>' + etaBig + '</b><span>' + hh + '</span></div>' +
        '<div class="info"><div class="f">' + passFlightLabel(ac) + '</div>' +
          '<small>' + airlineName(ac.flight) + (ac.t ? ' · ' + ac.t : '') + '</small>' +
          (overhead ? '<span class="badge">' + t('arr.overhead') + '</span>' : '') + '</div>' +
        '<div class="geo">' + km + '<small>' + t('arr.towards', { elev: p.elevAtPass, dir: compass(p.brgAtPass) }) + '</small></div>' +
        '</div>';
    }
    box.innerHTML = html;
    var rows = box.querySelectorAll('.pr');
    for (var k = 0; k < rows.length; k++) {
      rows[k].addEventListener('click', function () {
        var hex = this.getAttribute('data-hex');
        for (var m = 0; m < passAircraft.length; m++) {
          if (passAircraft[m].hex === hex) { passPickAndClose(passAircraft[m]); return; }
        }
      });
    }
  }

  function passPickAndClose(ac) {
    document.getElementById('passes').classList.remove('open');
    clearPassProjections();
    // L'aereo puo essere fuori dal raggio della mappa (scansione ampia): in
    // quel caso lo aggancio come marker di ricerca, cosi il polling non lo
    // deseleziona (stesso meccanismo della ricerca globale per numero volo).
    var inRange = lastAircraft.some(function (a) { return a.hex === ac.hex; });
    if (!inRange && ac.lat != null) {
      clearSearchMarker();
      searchMarker = L.marker([ac.lat, ac.lon], { icon: planeIcon(ac.track, '#ffb454', true) }).addTo(map);
      searchMarker._ac = ac;
      searchMarker.on('click', function (e) { L.DomEvent.stopPropagation(e); openSheet(this._ac); });
    }
    if (ac.lat != null) map.setView([ac.lat, ac.lon], 9, { animate: true });
    openSheet(ac);
  }

  // Proiezioni sulla mappa: linea posizione attuale -> punto di passaggio + crocetta
  function clearPassProjections() {
    if (passLayer) { map.removeLayer(passLayer); passLayer = null; }
  }
  function drawPassProjections() {
    clearPassProjections();
    var list = computePasses();
    if (!list.length) return;
    passLayer = L.layerGroup();
    for (var i = 0; i < list.length; i++) {
      var ac = list[i].ac, p = list[i].pass;
      L.polyline([[ac.lat, ac.lon], [p.passLat, p.passLon]], {
        color: '#6fd3ff', weight: 1.2, opacity: 0.5, dashArray: '4,6', interactive: false
      }).addTo(passLayer);
      L.marker([p.passLat, p.passLon], {
        icon: L.divIcon({ className: '', html: '<div class="pass-x">✕</div>', iconSize: [0, 0], iconAnchor: [0, 0] }),
        interactive: false, keyboard: false
      }).addTo(passLayer);
    }
    passLayer.addTo(map);
  }
  function refreshPasses() {
    if (!isPassesOpen()) return;
    fetchPassScan(); // rinfresca il set ampio, poi ridisegna
  }

  // ---------- Aerei seguiti + avviso in-app al sorvolo ----------
  var followed = {};   // hex -> true: aerei da avvisare
  var alerted = {};    // hex -> timestamp ultimo avviso (evita ripetizioni)
  var audioCtx = null;

  function isFollowed(hex) { return !!followed[hex]; }
  function updateFollowBtn() {
    var btn = document.getElementById('followBtn');
    if (selectedAc && isFollowed(selectedAc.hex)) {
      btn.classList.add('on'); btn.title = t('follow.on');
    } else {
      btn.classList.remove('on'); btn.title = t('follow.off');
    }
  }
  document.getElementById('followBtn').addEventListener('click', function (e) {
    e.stopPropagation();
    if (!selectedAc) return;
    var hex = selectedAc.hex;
    if (followed[hex]) { delete followed[hex]; delete alerted[hex]; }
    else {
      followed[hex] = true;
      // Prepara l'audio ora (gesture utente): serve per far suonare l'avviso
      try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
      } catch (err) { /* audio non disponibile */ }
    }
    updateFollowBtn();
  });

  function beep() {
    try {
      if (!audioCtx) return;
      if (audioCtx.state === 'suspended') audioCtx.resume();
      [0, 0.28].forEach(function (t0) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination);
        o.type = 'sine'; o.frequency.value = 880;
        var t = audioCtx.currentTime + t0;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        o.start(t); o.stop(t + 0.24);
      });
    } catch (e) { /* niente audio */ }
  }
  var alertHideTimer = null;
  function fireAlert(ac, pass) {
    var bar = document.getElementById('alertBar');
    var flight = passFlightLabel(ac);
    var mins = Math.max(0, Math.round(pass.tMin));
    var km = pass.dMinKm < 1 ? (Math.round(pass.dMinKm * 1000) + ' m') : (pass.dMinKm.toFixed(1) + ' km');
    bar.textContent = t('alert.incoming', { flight: flight, when: (mins <= 0 ? t('arr.now') : t('arr.inMin', { n: mins })), km: km, dir: compass(pass.brgAtPass) });
    bar.style.display = 'block';
    bar.onclick = function () { bar.style.display = 'none'; pickAndClose(ac); };
    if (navigator.vibrate) { try { navigator.vibrate([200, 100, 200]); } catch (e) {} }
    beep();
    if (alertHideTimer) clearTimeout(alertHideTimer);
    alertHideTimer = setTimeout(function () { bar.style.display = 'none'; }, 10000);
  }
  // Controlla gli aerei seguiti: avvisa quando il passaggio e imminente
  function checkFollowAlerts() {
    for (var hex in followed) {
      var ac = null;
      for (var i = 0; i < lastAircraft.length; i++) { if (lastAircraft[i].hex === hex) { ac = lastAircraft[i]; break; } }
      if (!ac) continue;
      var pass = nextPass(CENTER, ac);
      if (!pass || pass.tMin > PASS_ALERT_MIN || pass.dMinKm > passKm) continue;
      if (landingBeforePass(CENTER, ac, pass, AIRPORTS)) continue; // atterra prima: non arriva
      // Avvisa una sola volta per finestra di avvicinamento (ripristina dopo 10 min)
      if (alerted[hex] && Date.now() - alerted[hex] < 10 * 60000) continue;
      alerted[hex] = Date.now();
      fireAlert(ac, pass);
    }
  }

  // ---------- Canadair vicino a un incendio ----------
  // Per gli aerei antincendio individuati (v. isFirefightingAircraft), verifica
  // se sono nei pressi di un rilevamento attivo interrogando il WMS EFFIS con
  // una GetFeatureInfo puntuale intorno alla posizione dell'aereo. E' un
  // controllo "best effort": se il servizio non risponde o cambia formato,
  // l'aereo resta comunque evidenziato come antincendio, solo senza la
  // conferma di vicinanza (nessun errore visibile all'utente).
  var FIRE_CHECK_KM = 50;         // raggio della query intorno all'aereo
  var FIRE_CHECK_MIN_MS = 30000;  // non ricontrollare lo stesso aereo piu spesso di cosi
  var fireNear = {};      // hex -> true/false (esito ultima verifica riuscita)
  var fireCheckAt = {};   // hex -> timestamp ultimo tentativo
  var fireCheckSeq = {};  // hex -> sequenza, scarta risposte fuori ordine
  function checkFireProximity(ac) {
    var hex = ac.hex;
    var now = Date.now();
    if (fireCheckAt[hex] && now - fireCheckAt[hex] < FIRE_CHECK_MIN_MS) return;
    fireCheckAt[hex] = now;
    var seq = (fireCheckSeq[hex] || 0) + 1;
    fireCheckSeq[hex] = seq;
    var d = FIRE_CHECK_KM / 111; // gradi approssimati (~111 km/grado)
    var bbox = [ac.lon - d, ac.lat - d, ac.lon + d, ac.lat + d].join(',');
    var params = new URLSearchParams({
      service: 'WMS', version: '1.1.1', request: 'GetFeatureInfo',
      layers: FIRE_WMS.hotspots.layers, query_layers: FIRE_WMS.hotspots.layers,
      srs: 'EPSG:4326', bbox: bbox, width: 101, height: 101, x: 50, y: 50,
      info_format: 'application/json', feature_count: 1,
      time: wmsTimeRange(FIRE_WMS.hotspots.days)
    });
    fetch(FIRE_WMS.url + '?' + params.toString())
      .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
      .then(function (data) {
        if (seq !== fireCheckSeq[hex]) return; // risposta superata da una piu recente
        var near = !!(data && data.features && data.features.length);
        if (fireNear[hex] !== near) {
          fireNear[hex] = near;
          if (markers[hex]) updateSelectedIcons(hex, selected); // ridisegna con lo stato aggiornato
        }
      })
      .catch(function () { /* servizio non raggiungibile: nessuna conferma, nessun errore visibile */ });
  }

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

      var isSel = (id === selected);
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
      if (ff) checkFireProximity(ac); // throttled internamente
      var ffNear = ff && !!fireNear[id];
      var dim = (selected && !isSel); // attenua se c'e una selezione e non e questo
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
        if (selected === mid) closeSheet();
      }
    }

    document.getElementById('stCount').textContent = count;
    document.getElementById('stFast').textContent = maxSpd ? Math.round(maxSpd) : '--';
    document.getElementById('stHigh').textContent = maxAlt ? (maxAlt >= 1000 ? Math.round(maxAlt/1000) + 'k' : maxAlt) : '--';
  }

  function updateHudFilters() {
    var parts = [radiusNM + ' NM'];
    parts.push(filterAirline ? filterAirline.toUpperCase() : t('hud.all'));
    if (filterAirborne) parts.push(t('hud.inflight'));
    document.getElementById('hudFilters').innerHTML =
      parts.join(' \u00B7 ') + (observerLabel ? ' \u00B7 <span style="color:var(--phosphor)">\u25C9 ' + observerLabel + '</span>' : '');
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

  // L'API pubblica degli aerei accetta circa UNA richiesta al secondo. L'app
  // pero ne fa partire due ravvicinate ogni volta che il pannello IN ARRIVO e
  // aperto (polling nel raggio + scansione a 250 NM), e la seconda veniva
  // rifiutata: in app si vedeva "SEGNALE PERSO" senza motivo apparente.
  // Qui le mettiamo in fila, prenotando a ciascuna il suo turno.
  // Alcune fonti restituiscono anche aerei un po' oltre il raggio richiesto
  // (adsb.fi filtra per riquadro, non per cerchio): senza questo taglio si
  // vedrebbero aerei fuori dall'anello piu esterno del radar. Il campo `dst`
  // e la distanza in NM dal punto interrogato, quando la fonte la fornisce.
  function trimToRadius(list, radiusNM) {
    if (!SRC.trimToRadius) return list;
    return list.filter(function (a) {
      if (a.lat == null || a.lon == null) return true; // ci pensa gia drawPlanes
      var nm = (typeof a.dst === 'number') ? a.dst
             : map.distance([a.lat, a.lon], CENTER) / 1852;
      return nm <= radiusNM;
    });
  }

  var API_MIN_GAP_MS = 1100;
  var API_TIMEOUT_MS = 15000;  // oltre, la richiesta e considerata persa
  var nextApiSlot = 0;
  function apiFetch(url) {
    // Barriera finale: con l'accesso sospeso nessuna strada deve poter far
    // partire una richiesta, nemmeno per errore di un ramo dimenticato.
    if (!PLANES_API_ENABLED) return Promise.reject(new Error('API_DISABLED'));
    var now = Date.now();
    var slot = Math.max(now, nextApiSlot);
    nextApiSlot = slot + API_MIN_GAP_MS;
    var wait = slot - now;
    var ready = wait > 0 ? new Promise(function (r) { setTimeout(r, wait); }) : Promise.resolve();
    return ready.then(function () {
      // Scadenza: una richiesta che resta appesa senza mai concludersi (capita
      // quando il telefono congela la pagina a meta) blocherebbe il ciclo di
      // aggiornamento a tempo indeterminato. Meglio un fallimento dichiarato,
      // che fa scattare il normale meccanismo di riprova.
      if (typeof AbortController === 'undefined') return fetch(url);
      var ctrl = new AbortController();
      var killer = setTimeout(function () { ctrl.abort(); }, API_TIMEOUT_MS);
      return fetch(url, { signal: ctrl.signal })
        .finally(function () { clearTimeout(killer); });
    });
  }

  // Un buco isolato (galleria, cambio cella) non merita un allarme: il banner
  // compare dal secondo fallimento di fila. Mostra anche il PERCHE, cosi si
  // distingue un problema di rete da un rifiuto del server (es. HTTP 429).
  // Il browser nasconde di proposito il motivo per cui una fetch e fallita:
  // CORS, DNS, firewall e host irraggiungibile arrivano tutti come lo stesso
  // errore generico, e cercare la causa alla cieca costa tempo. Una sonda in
  // modalita 'no-cors' scioglie il dubbio piu insidioso: quella modalita non
  // richiede il permesso CORS, quindi se la sonda PASSA vuol dire che il
  // server risponde e a bloccarci e stata la politica CORS del browser; se
  // fallisce anche lei, il problema e prima, sulla rete.
  function classifyBlocked(url) {
    return fetch(url, { mode: 'no-cors', cache: 'no-store' })
      .then(function () { return t('err.cors'); })
      .catch(function () { return t('err.blocked'); });
  }

  var failStreak = 0;
  var lastErrWhy = null;
  function showNetError(why, immediate) {
    failStreak++;
    backoffLevel++; // rallenta: al prossimo giro aspettiamo di piu
    lastErrWhy = why;
    // immediate: quando e il server a dire esplicitamente cosa non va, non ha
    // senso aspettare la conferma di un secondo tentativo.
    if (!immediate && failStreak < 2) return;
    errBar.textContent = t('hud.signalLostWhy', { why: why });
    errBar.style.display = 'block';
  }
  function clearNetError() {
    failStreak = 0;
    backoffLevel = -1; // di nuovo tutto bene: si torna al ritmo normale
    lastErrWhy = null;
    errBar.style.display = 'none';
  }
  // Ridisegna il banner nella lingua giusta se la si cambia mentre e visibile
  function refreshErrBar() {
    if (lastErrWhy != null && errBar.style.display === 'block') {
      errBar.textContent = t('hud.signalLostWhy', { why: lastErrWhy });
    }
  }
  async function fetchPlanes() {
    var seq = ++fetchSeq;
    var data;
    // Fase 1: la rete. Solo qui un errore significa davvero "segnale perso".
    var url = SRC.point(CENTER[0], CENTER[1], radiusNM);
    diag(url, null);
    try {
      var res = await apiFetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      data = await res.json();
    } catch (e) {
      if (seq !== fetchSeq) return;
      var why;
      if (/^HTTP /.test(e.message)) why = e.message;          // il server ha risposto male
      else if (navigator.onLine === false) why = t('err.offline');
      else why = await classifyBlocked(url);
      if (seq !== fetchSeq) return;
      diag(null, why);
      showNetError(why);
      return;
    }
    if (seq !== fetchSeq) return; // risposta superata da una piu recente: scarta
    // La fonte puo rispondere con successo ma con un corpo di errore (e cosi
    // che airplanes.live comunicava il blocco). Dove sta scritto l'errore
    // cambia da fornitore a fornitore: lo sa la fonte, non noi.
    var apiErr = SRC.errorOf(data);
    if (apiErr) {
      diag(null, String(apiErr).slice(0, 60));
      showNetError(t('err.apiSaid', { msg: String(apiErr).slice(0, 90) }), true);
      return;
    }
    lastAircraft = trimToRadius(data.ac || [], radiusNM);
    diag(null, t('diag.ok', { n: lastAircraft.length }));
    clearNetError();

    // Fase 2: il disegno. Un errore qui e un bug nostro, non un problema di
    // segnale: va segnalato in modo diverso, altrimenti si cerca la causa
    // dalla parte sbagliata (e resta invisibile nella console).
    try {
      drawPlanes(lastAircraft);
      refreshBoard(); // aggiorna lista aerei + classifica se il pannello e aperto
      refreshPasses(); // aggiorna "IN ARRIVO" e proiezioni se il pannello e aperto
      checkFollowAlerts(); // avvisa se un aereo seguito sta per passare
      if (selected) {
        var found = false;
        for (var i = 0; i < lastAircraft.length; i++) {
          if (lastAircraft[i].hex === selected) {
            selectedAc = lastAircraft[i];
            updateTag(lastAircraft[i]); // etichetta ancorata segue l'aereo
            if (miraActive) updateMiraStatic(); // aggiorna direzione/elevazione live
            // Aggiorna la scheda full solo se e aperta
            if (document.getElementById('sheet').classList.contains('full')) fillSheet(lastAircraft[i]);
            found = true; break;
          }
        }
        if (!found && searchMarker && searchMarker._ac && searchMarker._ac.hex === selected) {
          found = true;
        }
        if (!found) closeSheet();
      }
    } catch (e) {
      console.error('RADAR: errore durante il disegno', e);
      lastErrWhy = null;
      errBar.textContent = t('hud.drawError');
      errBar.style.display = 'block';
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
  var MIN_REFETCH_MS = 2000; // distanza minima fra due riavvii del ciclo
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
    // Al ritorno in primo piano piu eventi scattano insieme e ognuno passa di
    // qui: se ciascuno lanciasse subito una richiesta partirebbe una raffica
    // inutile. Il ciclo lo si riavvia comunque (e quello che salva l'app), ma
    // se abbiamo appena interrogato la fonte si aspetta un attimo.
    var since = Date.now() - lastFetchAt;
    if (since < MIN_REFETCH_MS) timer = setTimeout(function () { pollLoop(gen); }, MIN_REFETCH_MS - since);
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
    if (document.hidden || !PLANES_API_ENABLED) return;
    if (Date.now() - lastFetchAt > Math.max(currentPollDelay() * 3, 30000)) startPolling();
  }, 10000);

  // ---------- Eventi UI ----------
  document.getElementById('btnCenter').addEventListener('click', function () { map.setView(CENTER, 8); });
  document.getElementById('btnBoard').addEventListener('click', function () {
    var wasOpen = document.getElementById('board').classList.contains('open');
    closeAll();
    if (!wasOpen) {
      document.getElementById('board').classList.add('open');
      refreshBoard();
    }
  });
  document.getElementById('btnPasses').addEventListener('click', function () {
    var wasOpen = isPassesOpen();
    closeAll();
    if (!wasOpen) {
      document.getElementById('passes').classList.add('open');
      document.getElementById('passList').innerHTML = '<div class="empty">' + t('arr.scanning') + '</div>';
      fetchPassScan(); // legge a 250 NM poi popola la tabella e le proiezioni
    }
  });
  document.getElementById('btnSettings').addEventListener('click', function () {
    var wasOpen = document.getElementById('settings').classList.contains('open');
    closeAll();
    if (!wasOpen) document.getElementById('settings').classList.add('open');
  });
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
    var elev = elevationAngle(CENTER, ac.lat, ac.lon, ac.alt_baro);
    if (elev >= ABOVE_MIN_ELEV) { hideAboveDialog(); showAbove(ac); return; }
    var km = map.distance([ac.lat, ac.lon], CENTER) / 1000;
    var name = (ac.flight || '').trim() || ac.hex.toUpperCase();
    document.getElementById('aboveTitle').textContent = t('above.noneAbove');
    document.getElementById('aboveInfo').textContent = t('above.nearest', { name: name, airline: airlineName(ac.flight), km: km.toFixed(0), dir: compass(bearingFromCenter(CENTER, ac.lat, ac.lon)), elev: elev });
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
    if (miraActive) { stopMira(); return; } // secondo tap: spegne
    if (!selectedAc) {
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
    document.getElementById('searchPanel').classList.remove('open');
    map.setView([ac.lat, ac.lon], 9, { animate: true });
    openSheet(ac);
  }
  function renderSearchResults() {
    var q = document.getElementById('flightSearch').value.trim().toUpperCase();
    var box = document.getElementById('searchResults');
    if (!q) { box.innerHTML = ''; return; }
    var hits = [];
    for (var i = 0; i < lastAircraft.length; i++) {
      var ac = lastAircraft[i];
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
      var km = map.distance([a.lat, a.lon], CENTER) / 1000;
      var alt = altLabel(a, true);
      html += '<div class="sr" data-hex="' + a.hex + '">' +
        '<div class="f">' + ((a.flight || '').trim() || a.hex.toUpperCase()) + '</div>' +
        '<div class="d">' + airlineName(a.flight) + '<small>' + (a.t || '') + ' \u00B7 ' + alt + '</small></div>' +
        '<div class="km">' + km.toFixed(0) + ' km</div></div>';
    }
    box.innerHTML = html || '<div style="font-size:11px;color:var(--muted);padding:6px 0;">' + t('search.noneInRange') + '</div>';
    var rows = box.querySelectorAll('.sr');
    for (var k = 0; k < rows.length; k++) {
      rows[k].addEventListener('click', function () {
        var hex = this.getAttribute('data-hex');
        for (var m = 0; m < lastAircraft.length; m++) {
          if (lastAircraft[m].hex === hex) { pickAndClose(lastAircraft[m]); return; }
        }
      });
    }
  }

  // ---------- Chip rapidi ----------
  function quickPick(kind) {
    var pool = lastAircraft.filter(function (a) { return a.lat != null && passesFilters(a); });
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
    if (kind === 'vicino') best = by(function (a) { return map.distance([a.lat, a.lon], CENTER); }, function (x, y) { return x < y; });
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
    if (!PLANES_API_ENABLED) { note.textContent = t('hud.apiSuspended'); return; }
    if (!raw.trim()) { note.textContent = t('search.typeFlight'); return; }
    var cs = toCallsign(raw);
    note.textContent = t('search.searching', { cs: cs });
    try {
      var res = await apiFetch(SRC.callsign(cs));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      var list = (data.ac || []).filter(function (a) { return a.lat != null && a.lon != null; });
      if (!list.length) {
        note.textContent = t('search.notFlying', { cs: cs });
        clearSearchMarker();
        return;
      }
      var ac = list[0];
      note.textContent = '';
      clearSearchMarker();
      if (!markers[ac.hex]) {
        searchMarker = L.marker([ac.lat, ac.lon], {
          icon: planeIcon(ac.track, '#ffb454', true)
        }).addTo(map);
        searchMarker._ac = ac;
        searchMarker.on('click', function (e) { L.DomEvent.stopPropagation(e); openSheet(this._ac); });
      }
      document.getElementById('searchPanel').classList.remove('open');
      map.setView([ac.lat, ac.lon], 8, { animate: true });
      openSheet(ac);
      openFull();
    } catch (e) {
      note.textContent = t('search.error', { msg: e.message });
      clearSearchMarker();
    }
  }
  // Chiudi la scheda full: torna all'etichetta ancorata
  document.getElementById('closeFull').addEventListener('click', function (e) {
    e.stopPropagation();
    closeFull();
  });

  // Pannello ricerca: apertura da FAB, ricerca live mentre digiti
  document.getElementById('btnSearch').addEventListener('click', function () {
    var p = document.getElementById('searchPanel');
    var wasOpen = p.classList.contains('open');
    closeAll();
    if (!wasOpen) {
      p.classList.add('open');
      document.getElementById('searchNote').textContent = '';
      renderSearchResults();
      setTimeout(function () { document.getElementById('flightSearch').focus(); }, 250);
    }
  });
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
    var radiusChanged = (newRadius !== radiusNM);
    radiusNM = newRadius;
    passKm = parseInt(document.getElementById('passKmSlider').value);
    filterAirborne = document.getElementById('chkAirborne').checked;
    savePrefs(buildPrefs());
    refreshPasses();
    updateHudFilters();
    document.getElementById('settings').classList.remove('open');
    if (radiusChanged) {
      drawRings();
      positionSweep();
      // Ricentra solo se il raggio e cambiato, per non perdere la vista corrente
      map.setView(CENTER, radiusNM > 180 ? 7 : radiusNM > 90 ? 8 : radiusNM > 40 ? 9 : 10);
    }
    fetchPlanes();
  });

  // ---------- Riapplica tutto quando cambia il centro ----------
  function applyCenter(recenter) {
    drawRings();
    positionSweep();
    if (recenter) map.setView(CENTER, radiusNM > 180 ? 7 : radiusNM > 90 ? 8 : radiusNM > 40 ? 9 : 10);
    fetchPlanes();
  }

  // ---------- Multi-postazione ----------
  // 'gps' segue la posizione del telefono; 'anzio' e il default fisso;
  // le altre voci sono postazioni salvate dall'utente (centro mappa + nome).
  var isSecure = (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  function activateLocation(id, recenter) {
    activeLocation = id;
    renderLocations();
    savePrefs(buildPrefs());
    if (id === 'gps') {
      if (navigator.geolocation && isSecure) {
        observerLabel = t('obs.locating'); updateHudFilters();
        navigator.geolocation.getCurrentPosition(
          function (pos) {
            if (activeLocation !== 'gps') return; // nel frattempo e stata scelta un'altra postazione
            CENTER = [pos.coords.latitude, pos.coords.longitude];
            observerLabel = t('obs.yourPos'); updateHudFilters();
            applyCenter(recenter);
          },
          function (err) {
            // Permesso negato o non disponibile: resta sul centro corrente
            if (activeLocation !== 'gps') return;
            observerLabel = t('obs.anzioNoGps'); updateHudFilters();
            console.warn(t('geo.unavailable'), err && err.message);
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
      } else {
        observerLabel = isSecure ? t('obs.anzio') : t('obs.anzioHttps'); updateHudFilters();
      }
      return;
    }
    if (id === 'anzio') {
      CENTER = DEFAULT_CENTER.slice();
      observerLabel = t('obs.anzio'); updateHudFilters();
      applyCenter(recenter);
      return;
    }
    for (var i = 0; i < userLocations.length; i++) {
      if (userLocations[i].id === id) {
        CENTER = [userLocations[i].lat, userLocations[i].lon];
        observerLabel = userLocations[i].label; updateHudFilters();
        applyCenter(recenter);
        return;
      }
    }
  }
  function renderLocations() {
    var box = document.getElementById('locList');
    var html = '<button class="chip loc' + (activeLocation === 'gps' ? ' active' : '') + '" data-id="gps">\u25c9 La mia posizione</button>' +
      '<button class="chip loc' + (activeLocation === 'anzio' ? ' active' : '') + '" data-id="anzio">' + t('obs.anzio') + '</button>';
    for (var i = 0; i < userLocations.length; i++) {
      var l = userLocations[i];
      html += '<button class="chip loc' + (activeLocation === l.id ? ' active' : '') + '" data-id="' + l.id + '">' +
        l.label.replace(/</g, '&lt;') + '<span class="del" data-del="' + l.id + '">\u2715</span></button>';
    }
    box.innerHTML = html;
    var chips = box.querySelectorAll('.chip.loc');
    for (var j = 0; j < chips.length; j++) {
      chips[j].addEventListener('click', function (e) {
        var del = e.target.getAttribute && e.target.getAttribute('data-del');
        if (del) {
          e.stopPropagation();
          var loc = userLocations.filter(function (l) { return l.id === del; })[0];
          var label = loc ? loc.label : t('loc.thisOne');
          // Conferma prima di eliminare: la X da sola era troppo facile da toccare
          askConfirm(t('loc.deleteQ', { name: label }), function () {
            userLocations = userLocations.filter(function (l) { return l.id !== del; });
            if (activeLocation === del) { activateLocation('gps', true); return; }
            renderLocations();
            savePrefs(buildPrefs());
          });
          return;
        }
        activateLocation(this.getAttribute('data-id'), true);
      });
    }
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
  function renderPlaceResults(list) {
    var box = document.getElementById('locSearchResults');
    if (!list || !list.length) { box.innerHTML = ''; return; }
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      html += '<div class="lr" data-i="' + i + '">' + r.name.replace(/</g, '&lt;') +
        (r.detail ? '<small>' + r.detail.replace(/</g, '&lt;') + '</small>' : '') + '</div>';
    }
    box.innerHTML = html;
    var rows = box.querySelectorAll('.lr');
    for (var j = 0; j < rows.length; j++) {
      rows[j].addEventListener('click', function () {
        var r = list[parseInt(this.getAttribute('data-i'), 10)];
        // Centra la mappa sul luogo (senza cambiare la postazione attiva) e
        // precompila il nome: basta poi premere "+ SALVA QUI"
        map.setView([r.lat, r.lon], Math.max(map.getZoom(), 9));
        document.getElementById('locName').value = r.name.substring(0, 20);
        box.innerHTML = '';
        document.getElementById('locSearchNote').textContent = t('loc.ready');
      });
    }
  }
  async function searchPlace() {
    var q = document.getElementById('locSearch').value.trim();
    var note = document.getElementById('locSearchNote');
    if (!q) { note.textContent = t('loc.typePlace'); return; }
    note.textContent = t('loc.searchingPlace', { q: q });
    document.getElementById('locSearchResults').innerHTML = '';
    try {
      var url = API.geocode + '?format=json&limit=6&addressdetails=0&q=' + encodeURIComponent(q);
      var res = await fetch(url, { headers: { 'Accept': 'application/json' } });
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
    if (!name) name = t('loc.defaultName', { n: (userLocations.length + 1) });
    var c = map.getCenter();
    var loc = { id: 'loc' + Date.now(), label: name.substring(0, 20),
                lat: Math.round(c.lat * 10000) / 10000, lon: Math.round(c.lng * 10000) / 10000 };
    userLocations.push(loc);
    document.getElementById('locName').value = '';
    activateLocation(loc.id, true); // renderLocations + savePrefs inclusi
  });

  // ---------- Tasto BACK: chiude le finestre invece di uscire dall'app ----------
  // Quando qualcosa e aperto si aggiunge una tappa nella cronologia; il back
  // la consuma chiudendo la finestra piu in alto. Con tutto chiuso, il back
  // esce normalmente.
  function isAnyOpen() {
    return document.getElementById('board').classList.contains('open') ||
      document.getElementById('settings').classList.contains('open') ||
      document.getElementById('searchPanel').classList.contains('open') ||
      document.getElementById('passes').classList.contains('open') ||
      document.getElementById('sheet').classList.contains('open') ||
      document.getElementById('miraOverlay').style.display === 'block' ||
      document.getElementById('aboveDialog').style.display === 'block' ||
      document.getElementById('confirmDialog').style.display === 'block';
  }
  function closeTopmost() {
    // Ordine dal livello piu "in alto" al piu basso
    if (document.getElementById('confirmDialog').style.display === 'block') { hideConfirm(); return; }
    if (document.getElementById('aboveDialog').style.display === 'block') { hideAboveDialog(); return; }
    if (document.getElementById('miraOverlay').style.display === 'block') { stopMira(); return; }
    if (document.getElementById('sheet').classList.contains('full')) { closeFull(); return; }
    closeAll(); // pannelli + scheda mini
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

  // ---------- Avvio ----------
  drawRings();
  positionSweep();
  updateHudFilters();
  startPolling();
  activateLocation(activeLocation, true);
}

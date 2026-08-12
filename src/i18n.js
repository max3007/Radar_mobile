// Internazionalizzazione: dizionari IT/EN + funzione di traduzione t().
// La lingua si rileva dal dispositivo al primo avvio e si puo cambiare dalle
// impostazioni; la scelta e persistita a parte (vedi prefs.lang in app.js).

const DICT = {
  it: {
    // HUD
    'hud.contacts': 'CONTATTI', 'hud.maxkt': 'MAX KT', 'hud.maxft': 'MAX FT',
    'hud.all': 'TUTTE', 'hud.inflight': 'IN VOLO',
    'hud.signalLost': 'SEGNALE PERSO · RIPROVO…',
    'hud.signalLostWhy': 'SEGNALE PERSO ({why}) · RIPROVO…',
    'hud.drawError': 'ERRORE INTERNO · DATI RICEVUTI MA NON DISEGNATI',
    'err.offline': 'telefono offline',
    'err.blocked': 'connessione ok, richiesta bloccata',
    'err.apiSaid': 'l\'API risponde: {msg}',
    'obs.locating': 'rilevo posizione…', 'obs.yourPos': 'la tua posizione',
    'obs.anzio': 'Anzio', 'obs.anzioNoGps': 'Anzio (GPS non disp.)', 'obs.anzioHttps': 'Anzio (serve HTTPS)',
    // FAB
    'fab.above': 'SOPRA\nDI TE', 'fab.arriving': 'IN\nARRIVO', 'fab.mira': 'MIRA',
    // Pannelli
    'panel.settings': 'IMPOSTAZIONI', 'panel.searchTitle': 'CERCA AEREO',
    'panel.arrivingTitle': 'IN ARRIVO · PROSSIMI PASSAGGI',
    'tab.planes': 'AEREI', 'tab.airlines': 'COMPAGNIE',
    // Ricerca
    'search.ph': 'Volo, compagnia, tipo, registrazione…',
    'search.world': 'CERCA NEL MONDO (numero volo)',
    'chip.nearest': 'Più vicino', 'chip.highest': 'Più alto', 'chip.fastest': 'Più veloce',
    'chip.landing': 'In atterraggio', 'chip.takeoff': 'In decollo',
    'search.filterAirline': 'FILTRA PER COMPAGNIA (si applica subito)',
    'search.airlinePh': 'Tutte (digita per cercare)',
    'search.noneInRange': 'Nessun aereo nel raggio. Prova "CERCA NEL MONDO".',
    'search.typeFlight': 'Digita un numero di volo (es. AZ610)',
    'search.searching': 'Cerco {cs} nel mondo…',
    'search.notFlying': 'Volo {cs} non in volo o senza posizione',
    'search.error': 'Errore ricerca ({msg})',
    'search.noneMatch': 'Nessun aereo corrisponde ora',
    // Impostazioni
    'set.location': 'POSTAZIONE DI OSSERVAZIONE (si applica subito)',
    'set.searchPlacePh': 'Cerca un luogo (città, indirizzo…)',
    'set.search': 'CERCA', 'set.locNamePh': 'Nome postazione', 'set.saveHere': '+ SALVA QUI',
    'set.locHint': 'Cerca un luogo (oppure sposta la mappa), poi "+ SALVA QUI" memorizza il centro come postazione',
    'set.radius': 'RAGGIO DI RICERCA: {n} NM', 'set.passKm': 'PASSAGGI "IN ARRIVO" ENTRO: {n} km',
    'set.excludeGround': 'Escludi aerei a terra',
    'set.compass': 'Orienta la mappa come guardi',
    'set.compassNote': 'Invece del nord in alto, ruota la mappa verso dove punti il telefono · serve la bussola. Puoi anche ruotarla a due dita: il gesto ha la precedenza e spegne la bussola',
    'map.northUp': 'Rimetti il nord in alto',
    'set.fires': 'Mostra incendi (rilevamenti satellitari)',
    'set.firesNote': 'Dati EFFIS/Copernicus · rilevamenti degli ultimi giorni, aggiornati ogni poche ore',
    'set.burnt': 'Mostra aree bruciate (perimetri)',
    'set.burntNote': 'Dati EFFIS/Copernicus (GWIS, quasi tempo reale) · perimetri degli ultimi 30 giorni',
    // Legenda aree bruciate: il colore EFFIS indica quanto e recente l'incendio
    'legend.fire24h': 'ultime 24h', 'legend.fire7d': 'ultimi 7 giorni', 'legend.fireOlder': 'precedenti',
    'set.mapStyle': 'STILE MAPPA (si applica subito)',
    'style.topo': 'RILIEVO', 'style.sat': 'SATELLITE', 'style.dark': 'RADAR SCURO',
    'set.language': 'LINGUA (si applica subito)',
    'set.apply': 'APPLICA',
    'set.myPos': '◉ La mia posizione',
    // Postazioni
    'loc.searchingPlace': 'Cerco "{q}"…', 'loc.typePlace': 'Digita un luogo da cercare',
    'loc.noPlace': 'Nessun luogo trovato per "{q}"', 'loc.pickResult': 'Tocca un risultato per centrare la mappa',
    'loc.ready': 'Luogo pronto: premi "+ SALVA QUI" per memorizzarlo',
    'loc.placeError': 'Ricerca non riuscita ({msg})', 'loc.defaultName': 'Postazione {n}',
    'loc.deleteQ': 'Eliminare la postazione\n«{name}»?', 'loc.thisOne': 'questa postazione',
    // Scheda dettaglio
    'sh.unknownType': 'Tipo sconosciuto', 'sh.onGroundShort': 'A terra',
    'cell.alt': 'QUOTA', 'cell.speed': 'VELOCITA', 'cell.track': 'ROTTA', 'cell.vario': 'VARIO',
    'cell.mach': 'MACH', 'cell.roll': 'ASSETTO', 'cell.wind': 'VENTO', 'cell.oat': 'TEMP EST.',
    'vario.level': '→ livellato', 'roll.left': '↰ sx {n}°', 'roll.right': '↱ dx {n}°', 'roll.straight': 'dritto',
    'sh.operator': 'Operatore: {op}', 'sh.category': 'Cat. {c}',
    'sh.dist': 'DIST {km} km {dir}  ·  ', 'sh.flight': 'VOLO {cs}  ·  ', 'sh.reg': 'REG {r}  ·  HEX {hex}',
    // Foto e rotta
    'photo.none': 'Nessuna foto in archivio per questo aereo', 'photo.searching': 'Cerco foto…',
    'photo.unreachable': 'Foto non raggiungibile ({msg})',
    'route.noneForFlight': 'Rotta non disponibile per questo volo',
    'route.inconsistent': 'Rotta in archivio ({lbl}) non coerente con la posizione: probabilmente non aggiornata',
    'route.noCallsign': 'Rotta non disponibile (nessun callsign)',
    'route.nonStandard': 'Rotta non disponibile (callsign non standard)',
    'route.searching': 'Cerco rotta…', 'route.unreachable': 'Rotta non raggiungibile ({msg})',
    // Emergenza
    'emg.banner': '⚠ {info}', 'emg.squawk': ' · SQUAWK {sq}', 'emg.badge': 'EMERG',
    // Antincendio
    'ff.badge': 'ANTINCENDIO', 'ff.nearFire': 'VICINO A UN INCENDIO',
    // Fasi di volo
    'phase.ground': 'A TERRA', 'phase.approach': 'IN AVVICINAMENTO',
    'phase.climbTo': 'IN SALITA → FL{fl}', 'phase.climb': 'IN SALITA',
    'phase.descentArr': 'IN DISCESA / ARRIVO', 'phase.descent': 'IN DISCESA',
    'phase.cruise': 'IN CROCIERA', 'phase.level': 'IN VOLO LIVELLATO',
    // Emergenze
    'em.hijack': 'DIROTTAMENTO', 'em.radio': 'RADIO GUASTA', 'em.general': 'EMERGENZA GENERALE',
    'em.generalShort': 'EMERGENZA', 'em.medical': 'VOLO SANITARIO', 'em.minfuel': 'CARBURANTE MINIMO',
    'em.unlawful': 'INTERFERENZA ILLECITA', 'em.downed': 'AEREO ABBATTUTO', 'em.other': 'EMERGENZA: {e}',
    // Quota
    'alt.ground': 'TERRA', 'alt.groundShort': 'a terra', 'alt.low': 'bassa quota',
    // MIRA
    'mira.move': 'MUOVI IL TELEFONO…', 'mira.aligned': '✈ ALLINEATO — GUARDA LÀ!',
    'mira.framed': 'aereo inquadrato ✓', 'mira.rotOk': '◎ rotazione ok', 'mira.elevOk': '◎ elevazione ok',
    'mira.left': 'SINISTRA {n}°', 'mira.right': 'DESTRA {n}°', 'mira.up': 'ALZA {n}°', 'mira.down': 'ABBASSA {n}°',
    'mira.elevOf': 'elevazione aereo {v}',
    'mira.compassHint': 'Bussola imprecisa? Muovi il telefono a otto',
    'mira.permDenied': 'Permesso bussola negato', 'mira.unavailable': 'Bussola non disponibile',
    'mira.unsupported': 'Bussola non supportata su questo dispositivo',
    'mira.calibrated': 'Orizzonte calibrato ✓', 'mira.moveFirst': 'Muovi prima il telefono per attivare i sensori',
    // SOPRA DI TE
    'above.noContact': 'NESSUN CONTATTO NEL RAGGIO', 'above.retry': 'Riprova tra qualche secondo',
    'above.noneAbove': 'NESSUN AEREO SOPRA DI TE',
    'above.nearest': 'Il più vicino: {name} ({airline}) · {km} km {dir} · elevazione {elev}°',
    // Aeroporti
    'apt.route': 'rotta: adsbdb.com',
    // IN ARRIVO
    'arr.none': 'Nessun passaggio ravvicinato previsto nei prossimi {n} minuti.',
    'arr.scanning': 'Scansione a raggio ampio…', 'arr.now': 'ora', 'arr.inMin': 'tra {n}′',
    'arr.overhead': 'SORVOLO', 'arr.towards': '{elev}° · verso {dir}',
    'arr.note': 'Scansione fino a 250 NM · stima su rotta e velocità attuali · aggiornata ogni 12 s',
    // Lista aerei
    'list.count1': '{n} AEREO NEL RAGGIO', 'list.count': '{n} AEREI NEL RAGGIO',
    'list.none': 'Nessun aereo nel raggio.', 'board.none': 'Nessun contatto',
    // Avviso sorvolo
    'alert.incoming': '✈ {flight} in arrivo · {when} · {km} · guarda verso {dir}',
    'follow.on': 'Avviso attivo: tocca per togliere', 'follow.off': 'Avvisami quando passa vicino',
    // Dialoghi / MIRA box / lingua
    'dlg.delete': 'ELIMINA', 'dlg.cancel': 'ANNULLA', 'above.showAnyway': 'MOSTRA COMUNQUE',
    'mira.calibBtn': 'CALIBRA ORIZZONTE',
    'miralbl.left': 'SX', 'miralbl.right': 'DX', 'miralbl.up': 'SU', 'miralbl.down': 'GIU',
    // Errori generici
    'err.leaflet': 'Errore: Leaflet non caricato (serve connessione)',
    'geo.unavailable': 'Geolocalizzazione non disponibile:'
  },
  en: {
    'hud.contacts': 'CONTACTS', 'hud.maxkt': 'MAX KT', 'hud.maxft': 'MAX FT',
    'hud.all': 'ALL', 'hud.inflight': 'AIRBORNE',
    'hud.signalLost': 'SIGNAL LOST · RETRYING…',
    'hud.signalLostWhy': 'SIGNAL LOST ({why}) · RETRYING…',
    'hud.drawError': 'INTERNAL ERROR · DATA RECEIVED BUT NOT DRAWN',
    'err.offline': 'phone offline',
    'err.blocked': 'connection ok, request blocked',
    'err.apiSaid': 'API says: {msg}',
    'obs.locating': 'locating…', 'obs.yourPos': 'your position',
    'obs.anzio': 'Anzio', 'obs.anzioNoGps': 'Anzio (no GPS)', 'obs.anzioHttps': 'Anzio (needs HTTPS)',
    'fab.above': 'ABOVE\nYOU', 'fab.arriving': 'IN-\nBOUND', 'fab.mira': 'AIM',
    'panel.settings': 'SETTINGS', 'panel.searchTitle': 'FIND AIRCRAFT',
    'panel.arrivingTitle': 'INBOUND · NEXT PASSES',
    'tab.planes': 'AIRCRAFT', 'tab.airlines': 'AIRLINES',
    'search.ph': 'Flight, airline, type, registration…',
    'search.world': 'SEARCH WORLDWIDE (flight no.)',
    'chip.nearest': 'Nearest', 'chip.highest': 'Highest', 'chip.fastest': 'Fastest',
    'chip.landing': 'Landing', 'chip.takeoff': 'Taking off',
    'search.filterAirline': 'FILTER BY AIRLINE (applies now)',
    'search.airlinePh': 'All (type to search)',
    'search.noneInRange': 'No aircraft in range. Try "SEARCH WORLDWIDE".',
    'search.typeFlight': 'Type a flight number (e.g. AZ610)',
    'search.searching': 'Searching {cs} worldwide…',
    'search.notFlying': 'Flight {cs} not airborne or without position',
    'search.error': 'Search error ({msg})',
    'search.noneMatch': 'No aircraft matches right now',
    'set.location': 'OBSERVATION POINT (applies now)',
    'set.searchPlacePh': 'Search a place (city, address…)',
    'set.search': 'SEARCH', 'set.locNamePh': 'Location name', 'set.saveHere': '+ SAVE HERE',
    'set.locHint': 'Search a place (or move the map), then "+ SAVE HERE" stores the center as a location',
    'set.radius': 'SEARCH RADIUS: {n} NM', 'set.passKm': 'INBOUND PASSES WITHIN: {n} km',
    'set.excludeGround': 'Exclude aircraft on ground',
    'set.compass': 'Rotate map to where you look',
    'set.compassNote': 'Instead of north-up, turns the map towards where you point the phone · needs the compass. You can also rotate it with two fingers: the gesture wins and turns the compass off',
    'map.northUp': 'Reset north up',
    'set.fires': 'Show wildfires (satellite detections)',
    'set.firesNote': 'EFFIS/Copernicus data · detections of the last few days, refreshed every few hours',
    'set.burnt': 'Show burnt areas (perimeters)',
    'set.burntNote': 'EFFIS/Copernicus data (GWIS, near real-time) · perimeters from the last 30 days',
    'legend.fire24h': 'last 24h', 'legend.fire7d': 'last 7 days', 'legend.fireOlder': 'older',
    'set.mapStyle': 'MAP STYLE (applies now)',
    'style.topo': 'RELIEF', 'style.sat': 'SATELLITE', 'style.dark': 'DARK RADAR',
    'set.language': 'LANGUAGE (applies now)',
    'set.apply': 'APPLY',
    'set.myPos': '◉ My position',
    'loc.searchingPlace': 'Searching "{q}"…', 'loc.typePlace': 'Type a place to search',
    'loc.noPlace': 'No place found for "{q}"', 'loc.pickResult': 'Tap a result to center the map',
    'loc.ready': 'Place ready: tap "+ SAVE HERE" to store it',
    'loc.placeError': 'Search failed ({msg})', 'loc.defaultName': 'Location {n}',
    'loc.deleteQ': 'Delete the location\n"{name}"?', 'loc.thisOne': 'this location',
    'sh.unknownType': 'Unknown type', 'sh.onGroundShort': 'On ground',
    'cell.alt': 'ALTITUDE', 'cell.speed': 'SPEED', 'cell.track': 'TRACK', 'cell.vario': 'V/S',
    'cell.mach': 'MACH', 'cell.roll': 'ATTITUDE', 'cell.wind': 'WIND', 'cell.oat': 'OAT',
    'vario.level': '→ level', 'roll.left': '↰ left {n}°', 'roll.right': '↱ right {n}°', 'roll.straight': 'wings level',
    'sh.operator': 'Operator: {op}', 'sh.category': 'Cat. {c}',
    'sh.dist': 'DIST {km} km {dir}  ·  ', 'sh.flight': 'FLIGHT {cs}  ·  ', 'sh.reg': 'REG {r}  ·  HEX {hex}',
    'photo.none': 'No photo on file for this aircraft', 'photo.searching': 'Looking for a photo…',
    'photo.unreachable': 'Photo unreachable ({msg})',
    'route.noneForFlight': 'Route not available for this flight',
    'route.inconsistent': 'Archived route ({lbl}) inconsistent with position: probably outdated',
    'route.noCallsign': 'Route not available (no callsign)',
    'route.nonStandard': 'Route not available (non-standard callsign)',
    'route.searching': 'Looking up route…', 'route.unreachable': 'Route unreachable ({msg})',
    'emg.banner': '⚠ {info}', 'emg.squawk': ' · SQUAWK {sq}', 'emg.badge': 'EMERG',
    'ff.badge': 'FIREFIGHTING', 'ff.nearFire': 'NEAR A WILDFIRE',
    'phase.ground': 'ON GROUND', 'phase.approach': 'ON APPROACH',
    'phase.climbTo': 'CLIMBING → FL{fl}', 'phase.climb': 'CLIMBING',
    'phase.descentArr': 'DESCENDING / ARRIVAL', 'phase.descent': 'DESCENDING',
    'phase.cruise': 'CRUISING', 'phase.level': 'LEVEL FLIGHT',
    'em.hijack': 'HIJACK', 'em.radio': 'RADIO FAILURE', 'em.general': 'GENERAL EMERGENCY',
    'em.generalShort': 'EMERGENCY', 'em.medical': 'MEDICAL FLIGHT', 'em.minfuel': 'MINIMUM FUEL',
    'em.unlawful': 'UNLAWFUL INTERFERENCE', 'em.downed': 'DOWNED AIRCRAFT', 'em.other': 'EMERGENCY: {e}',
    'alt.ground': 'GROUND', 'alt.groundShort': 'on ground', 'alt.low': 'low altitude',
    'mira.move': 'MOVE THE PHONE…', 'mira.aligned': '✈ ALIGNED — LOOK THERE!',
    'mira.framed': 'aircraft in view ✓', 'mira.rotOk': '◎ rotation ok', 'mira.elevOk': '◎ elevation ok',
    'mira.left': 'LEFT {n}°', 'mira.right': 'RIGHT {n}°', 'mira.up': 'UP {n}°', 'mira.down': 'DOWN {n}°',
    'mira.elevOf': 'aircraft elevation {v}',
    'mira.compassHint': 'Compass off? Move the phone in a figure-8',
    'mira.permDenied': 'Compass permission denied', 'mira.unavailable': 'Compass unavailable',
    'mira.unsupported': 'Compass not supported on this device',
    'mira.calibrated': 'Horizon calibrated ✓', 'mira.moveFirst': 'Move the phone first to activate the sensors',
    'above.noContact': 'NO CONTACT IN RANGE', 'above.retry': 'Try again in a few seconds',
    'above.noneAbove': 'NO AIRCRAFT ABOVE YOU',
    'above.nearest': 'Nearest: {name} ({airline}) · {km} km {dir} · elevation {elev}°',
    'apt.route': 'route: adsbdb.com',
    'arr.none': 'No close pass expected in the next {n} minutes.',
    'arr.scanning': 'Wide-range scan…', 'arr.now': 'now', 'arr.inMin': 'in {n}′',
    'arr.overhead': 'OVERHEAD', 'arr.towards': '{elev}° · look {dir}',
    'arr.note': 'Scan up to 250 NM · estimate on current track & speed · refreshed every 12 s',
    'list.count1': '{n} AIRCRAFT IN RANGE', 'list.count': '{n} AIRCRAFT IN RANGE',
    'list.none': 'No aircraft in range.', 'board.none': 'No contact',
    'alert.incoming': '✈ {flight} inbound · {when} · {km} · look {dir}',
    'follow.on': 'Alert on: tap to remove', 'follow.off': 'Alert me when it passes close',
    'dlg.delete': 'DELETE', 'dlg.cancel': 'CANCEL', 'above.showAnyway': 'SHOW ANYWAY',
    'mira.calibBtn': 'CALIBRATE HORIZON',
    'miralbl.left': 'L', 'miralbl.right': 'R', 'miralbl.up': 'UP', 'miralbl.down': 'DN',
    'err.leaflet': 'Error: Leaflet not loaded (needs connection)',
    'geo.unavailable': 'Geolocation unavailable:'
  }
};

const COMPASS = {
  it: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'],
  en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
};

var currentLang = 'it';

export function detectLang() {
  try {
    var l = (navigator.language || navigator.userLanguage || 'it').toLowerCase();
    return l.indexOf('it') === 0 ? 'it' : 'en';
  } catch (e) { return 'it'; }
}
export function setLang(lang) { currentLang = DICT[lang] ? lang : 'it'; }
export function getLang() { return currentLang; }
export function compassDirs() { return COMPASS[currentLang] || COMPASS.it; }

// Traduzione con interpolazione {param}
export function t(key, params) {
  var s = (DICT[currentLang] && DICT[currentLang][key]);
  if (s == null) s = (DICT.it[key] != null ? DICT.it[key] : key);
  if (params) {
    s = s.replace(/\{(\w+)\}/g, function (m, k) { return params[k] != null ? params[k] : m; });
  }
  return s;
}

// Applica le traduzioni agli elementi statici marcati con data-i18n / data-i18n-ph
export function applyStaticI18n(root) {
  var scope = root || document;
  var els = scope.querySelectorAll('[data-i18n]');
  for (var i = 0; i < els.length; i++) {
    els[i].textContent = t(els[i].getAttribute('data-i18n'));
  }
  var phs = scope.querySelectorAll('[data-i18n-ph]');
  for (var j = 0; j < phs.length; j++) {
    phs[j].setAttribute('placeholder', t(phs[j].getAttribute('data-i18n-ph')));
  }
  // Tooltip / etichette accessibili
  var tts = scope.querySelectorAll('[data-i18n-title]');
  for (var k = 0; k < tts.length; k++) {
    var lbl = t(tts[k].getAttribute('data-i18n-title'));
    tts[k].setAttribute('title', lbl);
    tts[k].setAttribute('aria-label', lbl);
  }
}

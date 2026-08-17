// Livello di rete per i dati di volo.
//
// Vive fuori da app.js per due motivi. Il primo: qui e' nato quasi ogni
// difetto della sessione in cui l'app e' passata da airplanes.live ad
// adsb.fi, e finche' stava dentro la chiusura di initApp non era verificabile
// se non aprendo un browser vero. Il secondo: il DOM non c'entra nulla con
// l'interrogare una fonte dati. La diagnostica entra come callback.

// Le API pubbliche che usiamo accettano circa UNA richiesta al secondo.
// L'app pero' ne fa partire due ravvicinate ogni volta che il pannello IN
// ARRIVO e' aperto (polling nel raggio + scansione a 250 NM): la seconda
// veniva rifiutata e in app si leggeva "SEGNALE PERSO" senza motivo.
// Ogni coda prenota a chi chiama il suo turno.
export function creaCoda(gapMs) {
  var prossimoTurno = 0;
  return function attendiTurno() {
    var ora = Date.now();
    var turno = Math.max(ora, prossimoTurno);
    prossimoTurno = turno + gapMs;
    var attesa = turno - ora;
    return attesa > 0 ? new Promise(function (r) { setTimeout(r, attesa); }) : Promise.resolve();
  };
}

export var API_MIN_GAP_MS = 1100;
export var API_TIMEOUT_MS = 15000;   // oltre, la richiesta e' considerata persa

// Scadenza su OGNI richiesta: una che resta appesa senza mai concludersi
// (capita quando il telefono congela la pagina a meta') lasciava "cerco..."
// nel pannello per sempre e bloccava il ciclo di aggiornamento.
export function fetchConScadenza(url, opzioni, timeoutMs) {
  if (typeof AbortController === 'undefined') return fetch(url, opzioni);
  var ctrl = new AbortController();
  var killer = setTimeout(function () { ctrl.abort(); }, timeoutMs || API_TIMEOUT_MS);
  var o = Object.assign({}, opzioni || {}, { signal: ctrl.signal });
  return fetch(url, o).finally(function () { clearTimeout(killer); });
}

// Conserviamo CHIAVE e parametri, non la frase gia' tradotta: solo cosi' il
// banner si puo' ridisegnare nella lingua giusta quando l'utente la cambia.
// Prima teneva il testo tradotto e al cambio lingua restava mezzo in
// italiano, oppure veniva riportato a un messaggio generico che diceva
// tutt'altro ("segnale perso" al posto di "dati sospesi").
export function ErroreVoli(whyKey, whyParams, sospeso) {
  var e = new Error(whyKey);
  e.whyKey = whyKey;
  e.whyParams = whyParams || null;
  e.sospeso = !!sospeso;
  return e;
}

export function isCrossOrigin(url, origine) {
  var o = origine || (typeof location !== 'undefined' ? location.origin : '');
  return /^https?:\/\//i.test(url) && url.indexOf(o) !== 0;
}

// La diagnosi CORS ha senso SOLO su URL di un altro dominio: con la fonte
// attuale le chiamate sono al nostro stesso dominio (/adsb/..., inoltrato da
// vercel.json) e il CORS non entra proprio in gioco. La sonda resta per il
// caso in cui si torni a una fonte cross-origin, ma non spreca piu' una
// richiesta quando non puo' dire nulla - e sprecarla era dannoso, perche'
// scavalcava la coda proprio mentre la fonte stava rifiutando.
export function classificaBlocco(url, fetchImpl, origine) {
  if (!isCrossOrigin(url, origine)) return Promise.resolve('err.blocked');
  var f = fetchImpl || fetch;
  return f(url, { mode: 'no-cors', cache: 'no-store' })
    .then(function () { return 'err.cors'; })
    .catch(function () { return 'err.blocked'; });
}

/**
 * L'unico modo di interrogare i dati di volo.
 *
 * Applica SEMPRE, nello stesso ordine: interruttore generale, turno nella
 * coda, scadenza, controllo dell'errore nel corpo, diagnostica. Prima ogni
 * chiamante ne applicava un sottoinsieme diverso: per questo la ricerca volo
 * dichiarava "non in volo" quando la fonte aveva rifiutato, e la scansione a
 * 250 NM falliva in silenzio mostrando altri dati.
 *
 * @param {object}   cfg
 * @param {object}   cfg.fonte      voce di PLANES_SOURCES (serve errorOf)
 * @param {boolean}  cfg.abilitata  interruttore generale delle richieste
 * @param {function} cfg.diag       (url, esito) per la diagnostica; opzionale
 * @param {function} cfg.fetchImpl  iniettabile per i test; default fetch
 * @param {function} cfg.online     () => bool; default navigator.onLine
 */
export function creaCanaleVoli(cfg) {
  var fonte = cfg.fonte;
  var diag = cfg.diag || function () {};
  var fetchImpl = cfg.fetchImpl || null;
  var online = cfg.online || function () {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
  };
  var turnoVoli = creaCoda(cfg.gapMs || API_MIN_GAP_MS);

  function richiedi(url) {
    return fetchImpl
      ? fetchImpl(url)
      : fetchConScadenza(url, null, cfg.timeoutMs);
  }

  async function chiediVoli(url) {
    diag(url, null);
    if (!cfg.abilitata) throw ErroreVoli('hud.apiSuspended', null, true);
    var res;
    try {
      await turnoVoli();
      res = await richiedi(url);
    } catch (e) {
      var chiave = !online() ? 'err.offline' : await classificaBlocco(url, fetchImpl);
      throw ErroreVoli(chiave);
    }
    if (!res.ok) throw ErroreVoli('err.http', { code: res.status });
    var data = await res.json();
    // La fonte puo' rispondere con successo ma con un corpo di errore: e' cosi'
    // che airplanes.live comunicava il blocco. Dove sta scritto l'errore cambia
    // da fornitore a fornitore: lo sa la fonte, non noi.
    var apiErr = fonte.errorOf(data);
    if (apiErr) throw ErroreVoli('err.apiSaid', { msg: String(apiErr).slice(0, 90) });
    return data;
  }

  return { chiediVoli: chiediVoli, turnoVoli: turnoVoli };
}

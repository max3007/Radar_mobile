// Il banner rosso in cima alla mappa.
//
// Sembra un dettaglio, ma e' l'unica cosa che l'app dice all'utente quando i
// dati non arrivano, e per tre volte di fila ha detto il falso: annunciava
// "segnale perso · riprovo" mentre le richieste erano sospese e non stava
// riprovando affatto, e dopo un cambio lingua restava mezzo in italiano.
//
// La radice era sempre la stessa: teneva in memoria la FRASE gia' tradotta
// invece della chiave. Qui tiene chiave + parametri e ridisegna a comando.

/**
 * @param {object}   cfg
 * @param {object}   cfg.elemento  il nodo del banner (serve textContent e style)
 * @param {function} cfg.t         funzione di traduzione (chiave, parametri)
 * @param {function} cfg.diag      (url, esito) per la diagnostica; opzionale
 */
export function creaBanner(cfg) {
  var elemento = cfg.elemento;
  var t = cfg.t;
  var diag = cfg.diag || function () {};
  var stato = null;        // { key, whyKey, whyParams } oppure null
  var fallimenti = 0;      // di fila

  function disegna() {
    if (!stato) return;
    var p = stato.whyKey ? { why: t(stato.whyKey, stato.whyParams) } : null;
    elemento.textContent = t(stato.key, p);
    elemento.style.display = 'block';
  }

  function mostra(key, whyKey, whyParams) {
    stato = { key: key, whyKey: whyKey || null, whyParams: whyParams || null };
    disegna();
  }

  // Un buco isolato (galleria, cambio cella) non merita un allarme: il banner
  // compare dal secondo fallimento di fila. Se pero' e' il server a dire
  // esplicitamente cosa non va, non ha senso attendere una conferma.
  function segnala(err) {
    fallimenti++;
    diag(null, t(err.whyKey, err.whyParams));
    if (err.sospeso) { mostra('hud.apiSuspended'); return; }
    var esplicito = (err.whyKey === 'err.apiSaid' || err.whyKey === 'err.http');
    stato = { key: 'hud.signalLostWhy', whyKey: err.whyKey, whyParams: err.whyParams };
    if (esplicito || fallimenti >= 2) disegna();
  }

  function pulisci() {
    fallimenti = 0;
    stato = null;
    elemento.style.display = 'none';
  }

  return {
    mostra: mostra,
    segnala: segnala,
    pulisci: pulisci,
    // Da chiamare al cambio lingua: applyStaticI18n riscrive tutti gli
    // elementi con data-i18n, banner compreso, e senza questo il testo
    // tornerebbe a un messaggio generico che dice tutt'altro.
    ridisegna: disegna,
    fallimenti: function () { return fallimenti; },
    visibile: function () { return !!stato; }
  };
}

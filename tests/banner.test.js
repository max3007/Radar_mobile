import { describe, it, expect, vi, beforeEach } from 'vitest';
import { creaBanner } from '../src/banner.js';
import { ErroreVoli } from '../src/rete.js';
import { t, setLang } from '../src/i18n.js';

// Il traduttore e quello VERO dell'app, non un finto dizionario: cosi le
// frasi attese qui sotto non possono divergere da quelle che l'utente legge.
// Al banner serve solo un elemento con textContent e style.display.
function elementoFinto() {
  return { textContent: '', style: { display: 'none' } };
}

function banca(opz = {}) {
  const el = elementoFinto();
  const diag = opz.diag || vi.fn();
  return { el: el, diag: diag, b: creaBanner({ elemento: el, t: t, diag: diag }) };
}

beforeEach(() => setLang('it'));

describe('Banner: quando compare', () => {
  it('un buco isolato non allarma', () => {
    // Galleria, cambio cella: un fallimento solo non merita un allarme rosso.
    const { el, b } = banca();
    b.segnala(ErroreVoli('err.blocked'));
    expect(el.style.display).toBe('none');
  });

  it('due fallimenti di fila lo fanno comparire', () => {
    const { el, b } = banca();
    b.segnala(ErroreVoli('err.blocked'));
    b.segnala(ErroreVoli('err.blocked'));
    expect(el.style.display).toBe('block');
    expect(el.textContent).toBe('SEGNALE PERSO (connessione ok, richiesta bloccata) · RIPROVO…');
  });

  it('se e la fonte a dire cosa non va, non aspetta la conferma', () => {
    const { el, b } = banca();
    b.segnala(ErroreVoli('err.apiSaid', { msg: 'rate limited' }));
    expect(el.style.display).toBe('block');
    expect(el.textContent).toContain('rate limited');
  });

  it('anche un codice HTTP e esplicito, quindi immediato', () => {
    const { el, b } = banca();
    b.segnala(ErroreVoli('err.http', { code: 503 }));
    expect(el.style.display).toBe('block');
    expect(el.textContent).toContain('503');
  });

  it('una risposta buona azzera il conteggio', () => {
    const { el, b } = banca();
    b.segnala(ErroreVoli('err.blocked'));
    b.pulisci();
    b.segnala(ErroreVoli('err.blocked'));   // di nuovo il primo di una serie
    expect(el.style.display).toBe('none');
  });
});

describe('Banner: cosa dice', () => {
  it('con i dati sospesi non promette di riprovare', () => {
    // Il difetto peggiore dei tre: annunciava "segnale perso · riprovo"
    // mentre le richieste erano ferme per scelta e non stava riprovando.
    const { el, b } = banca();
    b.segnala(ErroreVoli('hud.apiSuspended', null, true));
    expect(el.textContent).toBe('DATI AEREI SOSPESI · NESSUNA FONTE ATTIVA');
    expect(el.textContent).not.toContain('RIPROVO');
  });

  it('annota in diagnostica il motivo tradotto', () => {
    const { b, diag } = banca();
    b.segnala(ErroreVoli('err.http', { code: 429 }));
    expect(diag).toHaveBeenCalledWith(null, 'il server risponde HTTP 429');
  });
});

describe('Banner: cambio lingua', () => {
  it('si ridisegna tutto nella nuova lingua, non a meta', () => {
    // Prima teneva la frase gia tradotta, quindi dopo il cambio lingua
    // restava "SIGNAL LOST (connessione ok, richiesta bloccata)".
    const { el, b } = banca();
    b.segnala(ErroreVoli('err.blocked'));
    b.segnala(ErroreVoli('err.blocked'));
    expect(el.textContent).toBe('SEGNALE PERSO (connessione ok, richiesta bloccata) · RIPROVO…');

    setLang('en');
    b.ridisegna();
    expect(el.textContent).toBe('SIGNAL LOST (connection ok, request blocked) · RETRYING…');
  });

  it('anche lo stato dati sospesi resta se stesso', () => {
    // L'altra meta del difetto: il ridisegno copriva un solo stato dei tre,
    // e "dati sospesi" diventava "segnale perso · riprovo".
    const { el, b } = banca();
    b.segnala(ErroreVoli('hud.apiSuspended', null, true));
    setLang('en');
    b.ridisegna();
    expect(el.textContent).toBe('AIRCRAFT DATA SUSPENDED · NO ACTIVE SOURCE');
  });

  it('con i parametri della fonte dentro, li conserva attraverso la lingua', () => {
    const { el, b } = banca();
    b.segnala(ErroreVoli('err.apiSaid', { msg: 'rate limited' }));
    setLang('en');
    b.ridisegna();
    expect(el.textContent).toBe('SIGNAL LOST (API says: rate limited) · RETRYING…');
  });

  it('senza niente da mostrare non scrive nulla', () => {
    const { el, b } = banca();
    b.ridisegna();
    expect(el.textContent).toBe('');
    expect(el.style.display).toBe('none');
  });
});

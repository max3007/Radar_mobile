import { describe, it, expect } from 'vitest';
import { esc } from '../src/ui/dom.js';

describe('esc', () => {
  // I dati che finiscono nelle liste NON sono nostri: callsign e tipo vengono
  // dal feed ADS-B, i nomi dei luoghi da Nominatim, le etichette delle
  // postazioni le scrive l'utente. Prima l'escape era fatto a mano e a meta:
  // in un punto solo `<`, in un altro solo `"`, altrove per niente.

  it('neutralizza i caratteri che rompono il markup', () => {
    expect(esc('<script>')).toBe('&lt;script&gt;');
    expect(esc('a"b')).toBe('a&quot;b');
    expect(esc("l'aereo")).toBe('l&#39;aereo');
    expect(esc('a & b')).toBe('a &amp; b');
  });

  it('non produce doppie codifiche a catena', () => {
    // La & va sostituita per prima, altrimenti &lt; diventa &amp;lt;
    expect(esc('<')).toBe('&lt;');
    expect(esc('&lt;')).toBe('&amp;lt;');
  });

  it('regge valori assenti invece di scrivere "null" a schermo', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });

  it('lascia intatto un testo normale', () => {
    expect(esc('ITY088')).toBe('ITY088');
    expect(esc('ITA Airways')).toBe('ITA Airways');
    expect(esc(1234)).toBe('1234');
  });

  it('chiude il caso che rompeva davvero le postazioni', () => {
    // Un apostrofo in un nome di luogo di Nominatim ("L'Aquila") finiva in un
    // attributo HTML senza essere neutralizzato.
    expect(esc("L'Aquila")).toBe('L&#39;Aquila');
    expect(esc('Sant"Angelo')).toBe('Sant&quot;Angelo');
  });
});

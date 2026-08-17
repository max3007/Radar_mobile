import { describe, it, expect } from 'vitest';
import { creaCache } from '../src/cache.js';

describe('creaCache', () => {
  it('si comporta come una mappa finche sta nella capienza', () => {
    const c = creaCache(3);
    c.set('a', 1); c.set('b', 2);
    expect(c.get('a')).toBe(1);
    expect(c.has('b')).toBe(true);
    expect(c.size).toBe(2);
  });

  it('distingue "cercato, non trovato" da "mai cercato"', () => {
    // La distinzione porta un comportamento visibile: con null l'app scrive
    // "rotta non disponibile", con undefined va a interrogare l'archivio.
    const c = creaCache(3);
    c.set('ITY088', null);
    expect(c.has('ITY088')).toBe(true);
    expect(c.get('ITY088')).toBeNull();
    expect(c.has('MAI')).toBe(false);
    expect(c.get('MAI')).toBeUndefined();
  });

  it('oltre la capienza sfratta la voce piu vecchia', () => {
    const c = creaCache(2);
    c.set('a', 1); c.set('b', 2); c.set('c', 3);
    expect(c.has('a')).toBe(false);
    expect(c.has('b')).toBe(true);
    expect(c.has('c')).toBe(true);
    expect(c.size).toBe(2);
  });

  it('rileggere una voce la salva dallo sfratto', () => {
    // E l'invariante che conta: le voci degli aerei ancora sullo schermo
    // vengono rilette a ogni giro di polling, quindi non vengono mai buttate.
    const c = creaCache(2);
    c.set('a', 1); c.set('b', 2);
    c.get('a');            // 'a' torna la piu recente, 'b' diventa la piu vecchia
    c.set('c', 3);
    expect(c.has('a')).toBe(true);
    expect(c.has('b')).toBe(false);
  });

  it('riscrivere una voce non la duplica ne fa crescere la dimensione', () => {
    const c = creaCache(2);
    c.set('a', 1); c.set('a', 2);
    expect(c.size).toBe(1);
    expect(c.get('a')).toBe(2);
  });

  it('la memoria non cresce con il tempo, ma con quanti aerei si guardano', () => {
    // Il punto di tutto: l'app resta aperta per ore e ogni aereo che passa
    // lasciava una voce che non se ne andava piu.
    const c = creaCache(300);
    for (let i = 0; i < 10000; i++) c.set('VOLO' + i, { orig: 'FCO', dest: 'CTA' });
    expect(c.size).toBe(300);
    expect(c.has('VOLO9999')).toBe(true);
    expect(c.has('VOLO0')).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { wmsTimeRange } from '../src/config.js';

// Un istante fisso, cosi il test non dipende da quando lo si esegue.
const MEZZOGIORNO = Date.parse('2026-08-17T12:00:00Z');

describe('wmsTimeRange', () => {
  // Senza questo parametro il WMS EFFIS restituisce l'intero archivio
  // storico: sulla mappa diventa una macchia continua e inutilizzabile.

  it('costruisce la finestra nel formato inizio/fine che il WMS si aspetta', () => {
    expect(wmsTimeRange(7, MEZZOGIORNO)).toBe('2026-08-10/2026-08-17');
  });

  it('la finestra dei perimetri e piu lunga di quella degli hotspot', () => {
    // 30 giorni per le aree bruciate, 7 per i rilevamenti attivi
    expect(wmsTimeRange(30, MEZZOGIORNO)).toBe('2026-07-18/2026-08-17');
  });

  it('regge il salto di mese e di anno', () => {
    const capodanno = Date.parse('2026-01-03T00:00:00Z');
    expect(wmsTimeRange(7, capodanno)).toBe('2025-12-27/2026-01-03');
  });

  it('usa solo la data, non l ora', () => {
    const mattina = Date.parse('2026-08-17T06:30:00Z');
    const sera = Date.parse('2026-08-17T23:00:00Z');
    expect(wmsTimeRange(1, mattina)).toBe(wmsTimeRange(1, sera));
  });
});

import { test, expect } from '@playwright/test';
import { preparaRete } from './fixtures.js';

// La nostra distanceM (src/dominio/geometria.js) deve dare lo STESSO numero di
// map.distance di Leaflet, non uno simile: il taglio al raggio usa la nostra,
// mentre lista TRAFFICO, ricerca e chip rapidi usano quella di Leaflet. Se le
// due divergessero, al bordo del raggio un aereo comparirebbe nella lista ma
// non sulla mappa, o viceversa.
//
// Il tranello che ha gia colpito una volta: Leaflet NON usa il raggio
// terrestre medio (6371008.8 m) ma 6371000 m tondi. Con quello sbagliato lo
// scarto era di 1381 parti per miliardo — invisibile a occhio, ma vero.
const R_LEAFLET = 6371000;
function distanceM(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R_LEAFLET * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

test('la nostra distanza coincide con quella di Leaflet', async ({ page }) => {
  await preparaRete(page);
  await page.goto('/');

  const coppie = [
    [41.4479, 12.6285, 41.8003, 12.2389],   // Anzio -> Fiumicino
    [41.4479, 12.6285, 37.4668, 15.0664],   // Anzio -> Catania
    [41.4479, 12.6285, 41.4479, 12.6285],   // stesso punto
    [41.4479, 12.6285, 51.4700, -0.4543],   // Anzio -> Heathrow
    [41.4479, 12.6285, 41.4479, 14.6285],   // solo longitudine
    [0, 0, 0, 179.9]                        // quasi agli antipodi
  ];

  const daLeaflet = await page.evaluate(
    (c) => c.map(([a, b, x, y]) => window.L.latLng(a, b).distanceTo(window.L.latLng(x, y))),
    coppie
  );

  coppie.forEach(([a, b, x, y], i) => {
    const nostra = distanceM(a, b, x, y);
    if (daLeaflet[i] === 0) expect(nostra).toBe(0);
    else expect(Math.abs(nostra - daLeaflet[i]) / daLeaflet[i]).toBeLessThan(1e-12);
  });
});

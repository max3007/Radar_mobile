# RADAR · Anzio

Radar aerei in tempo reale pensato per smartphone: mappa scura stile
"schermo radar" con gli aerei nel raggio scelto attorno al punto di
osservazione (default Anzio, oppure la posizione GPS del telefono).

Funzionalità principali:

- mappa Leaflet con anelli di distanza, sweep radar e scie degli aerei;
- scheda dettaglio volo (compagnia, tipo, quota, velocità, fase di volo,
  rotta origine→destinazione, foto dell'aereo, dati tecnici);
- bussola **MIRA**: ruota il telefono finché non punti verso l'aereo
  selezionato;
- ricerca tra gli aerei nel raggio e ricerca mondiale per numero di volo;
- classifica delle compagnie in volo e filtri (raggio, compagnia, esclusione
  aerei a terra) con preferenze persistenti.

Dati forniti da API pubbliche gratuite chiamate direttamente dal client:
[airplanes.live](https://airplanes.live) (posizioni ADS-B),
[adsbdb.com](https://www.adsbdb.com) (rotte),
[planespotters.net](https://www.planespotters.net) (foto).

## Sviluppo

```bash
npm install
npm run dev       # server di sviluppo (http://localhost:5173)
npm test          # unit test delle funzioni di dominio
npm run build     # build di produzione in dist/
npm run preview   # anteprima della build
```

Nota: geolocalizzazione e bussola richiedono un contesto sicuro (HTTPS o
`localhost`). Per provarle da smartphone in sviluppo serve un tunnel HTTPS
oppure la preview di Vercel.

## Struttura

```
index.html          markup dell'app (nessuno script inline)
src/main.js         entry point: stili, avvio app
src/app.js          logica applicativa: mappa, marker, pannelli, polling, MIRA
src/domain.js       funzioni pure (bearing, fase di volo, emergenze, callsign…)
src/config.js       costanti: centro default, raggio, intervallo polling, URL API
src/prefs.js        preferenze persistenti (localStorage)
src/data/*.json     dizionario compagnie ICAO e mappa prefissi IATA→ICAO
src/styles.css      stili (tema "fosforo" HUD)
tests/              unit test Vitest su src/domain.js
legacy/             prototipo originale a file singolo (baseline di confronto)
```

## Deploy su Vercel

Il progetto è pronto per il deploy zero-config su Vercel (preset **Vite**
rilevato automaticamente: build `vite build`, output `dist/`):

1. su [vercel.com](https://vercel.com) → **Add New… → Project** → importa il
   repo GitHub `max3007/radar_mobile`;
2. conferma le impostazioni proposte (framework: Vite) e fai **Deploy**.

Da quel momento ogni push sul branch di produzione pubblica automaticamente,
e ogni branch/PR riceve una preview URL.

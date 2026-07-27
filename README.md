# RADAR · Anzio

Radar aerei in tempo reale pensato per smartphone: mappa con gli aerei nel
raggio scelto attorno a un punto di osservazione (la posizione GPS del
telefono, Anzio, o una postazione salvata).

Funzionalità principali:

- mappa Leaflet con anelli di distanza, sweep radar e scie degli aerei;
- **mirino** sul punto di osservazione (puntino con ping pulsante e crocino);
- **stili mappa** selezionabili: rilievo (default), satellite, radar scuro;
- **aeroporti** nel raggio con sigla e nome (tap per il dettaglio);
- scheda dettaglio volo (compagnia, tipo, quota, velocità, fase di volo,
  rotta origine→destinazione, foto dell'aereo, dati tecnici); le rotte
  d'archivio incoerenti con la posizione reale vengono nascoste;
- **MIRA**: mirino a due assi che ti guida a puntare il telefono verso
  l'aereo selezionato, sia in rotazione (bussola) sia in alzata
  (inclinazione), con calibrazione dell'orizzonte;
- **SOPRA DI TE**: salta all'aereo più vicino, con conferma se è troppo
  basso sull'orizzonte per essere visto;
- **IN ARRIVO**: previsione dei prossimi passaggi ravvicinati (fino a ~40 min)
  dal calcolo del punto di massimo avvicinamento (rotta + velocità), con una
  scansione dedicata a raggio ampio (250 NM) per il massimo preaviso anche a
  mappa stretta: tabella cliccabile con minuti al passaggio, distanza,
  elevazione e direzione, soglia regolabile, proiezione sulla mappa e
  aggiornamento live;
- ricerca tra gli aerei nel raggio e ricerca mondiale per numero di volo;
- classifica delle compagnie in volo e filtri (raggio, compagnia, esclusione
  aerei a terra);
- **postazioni multiple**: GPS, Anzio e punti salvati dall'utente (cercando
  un luogo per nome o salvando il centro della mappa), con selezione
  immediata; preferenze e postazioni persistono tra le sessioni.

Dati forniti da API pubbliche gratuite chiamate direttamente dal client:
[airplanes.live](https://airplanes.live) (posizioni ADS-B),
[adsbdb.com](https://www.adsbdb.com) (rotte),
[planespotters.net](https://www.planespotters.net) (foto),
[Nominatim/OpenStreetMap](https://nominatim.openstreetmap.org) (ricerca
luoghi). Le basemap sono tile [Esri](https://www.esri.com) (rilievo,
satellite) e [CARTO](https://carto.com)/OSM (radar scuro).

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
src/app.js          logica applicativa: mappa, marker, pannelli, polling, MIRA,
                    postazioni, aeroporti, ricerca luoghi
src/domain.js       funzioni pure (bearing, fase di volo, emergenze, callsign,
                    coerenza rotta…)
src/config.js       costanti: centro default, raggio, polling, URL API, stili mappa
src/prefs.js        preferenze persistenti (localStorage)
src/data/*.json     compagnie ICAO, prefissi IATA→ICAO, aeroporti
src/styles.css      stili (tema "fosforo" HUD)
public/             icone PWA (generate da scripts/make-icons.mjs)
scripts/            generazione icone (uso una tantum)
vite.config.js      build Vite + vite-plugin-pwa (manifest, service worker)
tests/              unit test Vitest su src/domain.js
legacy/             prototipo originale a file singolo (baseline di confronto)
```

## Installazione come app (PWA)

L'app è una PWA installabile: dalla pagina pubblicata, su **Android Chrome**
compare il prompt "Aggiungi a schermata Home" (o menu ⋮ → *Installa app*);
su **iOS Safari**: Condividi → *Aggiungi a Home*. Una volta installata parte
a schermo pieno con icona e splash dedicate. L'app shell e le tile mappa
recenti sono in cache per riaperture veloci; i dati di volo restano sempre
in tempo reale (nessuna cache).

## Deploy su Vercel

Il progetto è pronto per il deploy zero-config su Vercel (preset **Vite**
rilevato automaticamente: build `vite build`, output `dist/`):

1. su [vercel.com](https://vercel.com) → **Add New… → Project** → importa il
   repo GitHub `max3007/radar_mobile`;
2. conferma le impostazioni proposte (framework: Vite) e fai **Deploy**.

Da quel momento ogni push sul branch di produzione pubblica automaticamente,
e ogni branch/PR riceve una preview URL.

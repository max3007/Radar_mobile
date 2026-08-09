# RADAR — Nota di passaggio (handoff)

Documento per riprendere lo sviluppo in una nuova sessione (Claude Code o
altro). Riassume architettura, stato, convenzioni e cose da verificare.

## Cos'è

App mobile "RADAR": mostra su mappa Leaflet gli aerei in volo (ADS-B) attorno
a un punto di osservazione (GPS, Anzio, o postazioni salvate). Scheda dettaglio
volo, bussola MIRA, previsione passaggi ravvicinati, aeroporti, overlay
incendi, bilingue IT/EN. Nata da un prototipo HTML a file singolo (conservato
in `legacy/radarmobile.html`), poi modularizzata con Vite (vanilla JS, niente
framework — scelta deliberata: il cuore è codice imperativo Leaflet).

## Stack e comandi

- **Vanilla JS + Vite**, Leaflet da npm, PWA via `vite-plugin-pwa`, test con
  **Vitest**. Nessun backend: tutte le API sono chiamate dal client.
- Deploy: **Vercel** (statico, preset Vite). Push su `main` → deploy in
  produzione. URL: `radar-mobile.vercel.app`.

```bash
npm install
npm run dev        # sviluppo (http://localhost:5173)
npm test           # oppure: npx vitest run   (59 test)
npm run build      # produzione in dist/
npm run preview    # anteprima build (http://localhost:4173)
```

Nota: GPS, bussola e notifiche richiedono HTTPS → si provano solo su
`localhost`, tunnel HTTPS, o l'URL Vercel; non in http semplice.

## Struttura

```
index.html          markup; stringhe statiche marcate con data-i18n / data-i18n-ph
src/main.js         entry: importa stili, avvia initApp
src/app.js          TUTTA la logica applicativa (una grande initApp con chiusure
                    condivise: mappa, marker/scie, pannelli, polling, MIRA,
                    postazioni, IN ARRIVO, incendi, follow/avvisi, tasto back)
src/domain.js       funzioni PURE e testate: airlineName, toCallsign, fmtFlight,
                    compass, bearing*, elevationAngle, destPoint, altColor,
                    planeColor, altLabel, isOnGround, emergencyInfo, flightPhase,
                    routeConsistent, nextPass (CPA), landingBeforePass
src/i18n.js         dizionari it/en + t(key,params) + applyStaticI18n + compassDirs
src/config.js       costanti: centro, raggio, polling, URL API, stili mappa,
                    soglie IN ARRIVO, FIRE_WMS (incendi)
src/prefs.js        load/save preferenze (localStorage 'radarPrefs')
src/data/*.json     airlines (ICAO→nome), iata2icao, airports
src/styles.css      tutti gli stili (tema "fosforo" HUD)
tests/domain.test.js unit test delle funzioni pure
legacy/             prototipo originale a file singolo (baseline)
scripts/make-icons.mjs  genera le icone PWA (uso una tantum)
```

## Convenzioni di lavoro (IMPORTANTE)

- **Branch**: sviluppo su `claude/app-development-plan-5m66ct`, poi
  fast-forward su `main` e push di entrambi. (Se il flusso cambia, chiedere.)
- **README nello stesso commit** della feature: tenerlo sempre allineato.
- **Ogni modifica**: `npm run build` + `npx vitest run` verdi prima di
  committare; per le UI, verifica con Playwright headless (vedi sotto).
- Commit in italiano, descrittivi. NON inserire l'ID del modello nei commit.
- **i18n**: ogni nuova stringa visibile va aggiunta a `src/i18n.js` (it + en)
  e richiamata con `t('chiave')` (JS) o `data-i18n="chiave"` (HTML statico).
  Le funzioni di dominio che producono testo importano `t` da i18n.
- **prefs**: nuove preferenze → aggiungere in `buildPrefs()` e nel blocco di
  load in `initApp` (validando il tipo).

## Come verifico le UI (pattern usato in tutta la sessione)

Playwright headless con Chromium pre-installato, mockando le API di volo. Es.:
```js
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox'] });
const ctx = await b.newContext({ viewport:{width:390,height:844} });
await ctx.route('**/api.airplanes.live/**', r => r.fulfill({ json:{ ac:[/* aerei mock */] }}));
await ctx.route('**/server.arcgisonline.com/**', r => r.abort()); // tile mappa
// ... apri http://localhost:4173, interagisci, asserisci
```
Nel sandbox le tile mappa e le API esterne sono spesso bloccate dal proxy: si
verifica la LOGICA (URL/parametri, stato UI), non il rendering delle tile reali.

## Funzionalità implementate

Modularizzazione Vite · PWA installabile · stili mappa (rilievo/satellite/
radar scuro) · aeroporti nel raggio · mirino sul punto di osservazione · scheda
dettaglio (foto planespotters, rotta adsbdb con filtro rotte incoerenti) ·
**MIRA** mirino 2D (rotazione+elevazione) con calibrazione e lock a isteresi ·
**SOPRA DI TE** con conferma se basso · **IN ARRIVO** (previsione CPA fino a
~40 min, scansione a 250 NM, proiezioni mappa, esclusione falsi positivi tipo
arrivi a Fiumicino) · pannello **TRAFFICO** (lista aerei + classifica) ·
multi-postazione con ricerca luoghi (Nominatim) e conferma eliminazione ·
riconoscimento falsi "a terra" (flag ground ad alta velocità) · **segui aereo**
con avviso in-app (banner+vibrazione+suono) al sorvolo · tasto **back** chiude
le finestre (History API) · **bilingue IT/EN** (auto-detect + selettore) ·
icona "espandi" sulla finestrella · **overlay incendi** EFFIS.

## DA VERIFICARE SUL CAMPO (non testabile in sandbox)

1. **Overlay incendi (EFFIS)** — priorità. Endpoint/layer in `src/config.js`
   (`FIRE_WMS`: `ies-ows.jrc.ec.europa.eu/effis`, layer `modis.hs`) sono quelli
   STORICI e non confermati (EFFIS è migrato a Copernicus). Se attivando il
   toggle non appaiono incendi: verificare via GetCapabilities il nuovo
   endpoint/nome layer e aggiornare `FIRE_WMS`. Endpoint moderno probabile:
   `https://maps.effis.emergency.copernicus.eu/effis`. Alternativa: NASA FIRMS
   WMS (richiede MAP_KEY gratuita, forse proxy per CORS).
2. **MIRA / GPS / bussola**: sensori reali del telefono (iOS chiede permesso).
   Verificare che l'asse verticale non sia invertito su alcuni device.
3. **Notifiche follow**: avviso in-app funziona solo con app aperta in
   foreground (nessun backend). Push a schermo spento = lavoro futuro (Web Push
   + serverless su Vercel).

## Backlog / idee future

- **Canadair vicino agli incendi**: evidenziare aerei antincendio (tipo CL-415,
  categoria) prossimi a un hotspot rilevato — collega i due dati, molto "su
  misura" per l'app.
- Push notifications a schermo spento (serverless Vercel + VAPID).
- Storico avvistamenti con statistiche.
- AR reale su fotocamera per MIRA.
- Ordinamento configurabile nella lista TRAFFICO; emergenze forzate in cima.

## Note utili

- Il dizionario `airlines.json` (~5800 voci) è grande: è la maggior parte del
  bundle. Normale.
- `nextPass` (CPA) assume rotta/velocità costanti: affidabile ~30 min, per
  questo l'orizzonte è breve e la lista si aggiorna ogni 12 s.
- Il polling si ferma in background (`visibilitychange`) per risparmiare.

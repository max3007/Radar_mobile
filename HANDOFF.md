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

- **Vanilla JS + Vite**, Leaflet da npm (+ `leaflet-rotate` per la mappa
  orientabile), PWA via `vite-plugin-pwa`, test con **Vitest**. Nessun
  backend: tutte le API sono chiamate dal client.
- Deploy: **Vercel** (statico, preset Vite). Push su `main` → deploy in
  produzione. URL: `radar-mobile.vercel.app`.

```bash
npm install
npm run dev        # sviluppo (http://localhost:5173)
npm test           # oppure: npx vitest run   (65 test)
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
                    routeConsistent, nextPass (CPA), landingBeforePass,
                    isFirefightingAircraft (Canadair/water bomber)
src/i18n.js         dizionari it/en + t(key,params) + applyStaticI18n + compassDirs
src/config.js       costanti: centro, raggio, polling, URL API, stili mappa,
                    soglie IN ARRIVO, FIRE_WMS (incendi: hotspot + aree bruciate)
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
icona "espandi" sulla finestrella · **overlay incendi** EFFIS: rilevamenti
attivi (`all.hs`, tutte le fonti) + **perimetri aree bruciate** (`effis.nrt.ba.poly`,
quasi tempo reale) come layer indipendenti · **Canadair vicino agli incendi**:
riconosce gli aerei antincendio (Canadair CL-215/CL-415, per codice tipo ICAO
o descrizione) e li evidenzia con colore/icona dedicati; se rilevati vicino a
un hotspot attivo (verifica via WMS GetFeatureInfo, best-effort) l'evidenza
si rafforza (icona pulsante, badge "VICINO A UN INCENDIO" in lista e scheda) ·
**mappa ruotabile**: "orienta la mappa come guardi" (bussola) da impostazioni
e rotazione a due dita, con freccia del nord che rimette il nord in alto.

## DA VERIFICARE SUL CAMPO (non testabile in sandbox)

1. ~~Overlay incendi (EFFIS)~~ — RISOLTO 2026-08-09: `ies-ows.jrc.ec.europa.eu`
   era l'host storico ormai dismesso. Verificato via GetCapabilities che il
   servizio è su `https://maps.effis.emergency.copernicus.eu/effis` (MapServer)
   e che il layer `modis.hs` esiste ancora con lo stesso nome (insieme a
   `viirs.hs`, `noaa.hs`, `all.hs` = tutte le fonti insieme). `FIRE_WMS`
   aggiornato in `src/config.js`. Resta da confermare sul campo che le tile
   effettivamente si carichino (nel sandbox il dominio è bloccato dal proxy
   di rete, quindi non renderizzabile qui).
2. **Perimetri aree bruciate (`effis.nrt.ba.poly`)** — stesso discorso del
   punto 1: layer nuovo, mai visto renderizzare tile reali (dominio bloccato
   dal proxy in sandbox). Verificare sul campo che il checkbox "Mostra aree
   bruciate" mostri effettivamente dei poligoni.
3. **Canadair vicino agli incendi (GetFeatureInfo)** — la query di prossimità
   (`checkFireProximity` in `src/app.js`) è verificata solo con risposte
   MOCK in Playwright (URL costruito correttamente, stato UI si aggiorna).
   MAI testata contro il vero servizio EFFIS: verificare sul campo che
   `GetFeatureInfo` risponda in JSON per il layer `all.hs` con VERSION=1.1.1
   (assunto per coerenza con L.tileLayer.wms che di default usa 1.1.1); se il
   servizio non risponde o cambia formato la query fallisce silenziosamente
   (fetch in `.catch` vuoto) e l'aereo resta comunque evidenziato come
   antincendio, solo senza la conferma "vicino a un incendio".
4. **MIRA / GPS / bussola**: sensori reali del telefono (iOS chiede permesso).
   Verificare che l'asse verticale non sia invertito su alcuni device.
   Vale anche per la **mappa orientata**: la logica di rotazione e verificata
   con eventi di orientamento SIMULATI in Playwright (verso, freccia del nord
   e dimensione del cerchio radar corretti), ma mai con una bussola vera.
   Da controllare sul campo: che non "tremi" (in caso alzare `MC_SMOOTH` /
   `MC_MIN_DELTA` in `app.js`) e che su iOS il permesso venga chiesto al
   tocco dell'interruttore.
5. **Notifiche follow**: avviso in-app funziona solo con app aperta in
   foreground (nessun backend). Push a schermo spento = lavoro futuro (Web Push
   + serverless su Vercel).

## Backlog / idee future

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
- **L'API aerei accetta ~1 richiesta al secondo.** L'app pero ne fa partire
  due ravvicinate quando IN ARRIVO e aperto (polling nel raggio + scansione a
  250 NM, chiamata da `refreshPasses` dentro `fetchPlanes`): la seconda veniva
  rifiutata e in app si leggeva "SEGNALE PERSO" senza motivo apparente. Ora
  tutte le chiamate a quell'API passano da `apiFetch`, che prenota a ciascuna
  un turno a distanza di `API_MIN_GAP_MS` (1,1 s). Se in futuro si aggiungono
  chiamate a `api.airplanes.live`, vanno fatte con `apiFetch`, non con `fetch`.
- **Il banner rosso distingue tre casi diversi**: rete irraggiungibile,
  rifiuto del server (mostra il codice, es. HTTP 429) ed errore di disegno
  ("ERRORE INTERNO"). Prima qualsiasi eccezione JS nel rendering finiva nello
  stesso `catch` della rete e si leggeva "segnale perso": si finiva a cercare
  un problema di connessione mentre era un bug nostro. Il banner compare dal
  SECONDO fallimento di fila, cosi un buco isolato non allarma.
- **Mappa orientata**: la rotazione la fa `leaflet-rotate` (`map.setBearing`),
  la prua stabile la calcoliamo noi (media circolare su sin/cos, come MIRA).
  `setBearing(-prua)`: il segno meno porta in alto la direzione in cui guardi.
  I marker degli aerei hanno `rotateWithView: true` cosi la prua continua a
  indicare la direzione reale; tutto il resto (aeroporti, targhetta, mirino)
  resta col default `false` e quindi dritto e leggibile. Non e una preferenza
  persistente ma una modalita come MIRA: al riavvio si riparte da nord in alto.
- Si ruota in due modi e convivono: bussola e **due dita** (`touchRotate`).
  Attenzione: in leaflet-rotate zoom e rotazione sono lo STESSO gesto a due
  dita (`TouchGestures`), quindi ogni pinch-zoom ruota anche un po'. Per
  questo il gesto spegne la bussola solo oltre `GESTURE_ROTATE_OFF` (10°):
  sotto quella soglia e considerato torsione involontaria da pinch-zoom.
  Durante il gesto la bussola e sospesa (`gestureBearing`) per non combattere
  con le dita, e a fine gesto la rotazione scelta viene mantenuta
  (`setMapCompass(false, keepBearing=true)`).
- La freccia del nord e guidata dall'evento `rotate` della mappa (non dalla
  bussola), quindi resta corretta anche a rotazione manuale; compare quando
  il bearing non e 0 e toccandola si rimette il nord in alto.
- `shiftKeyRotate` resta spento (e da desktop, non serve).
- **Colori delle aree bruciate**: non li scegliamo noi, vengono dallo stile
  `default` di EFFIS e codificano l'ETA dell'incendio — rosso: ultime 24 ore;
  arancione: ultimi 7 giorni; blu: ultimi 90 giorni; verde: oltre 90 giorni.
  Con la finestra attuale (`FIRE_WMS.burnt.days` = 30) il verde non compare
  mai, per questo la legenda in impostazioni mostra solo tre voci. Le pastiglie
  colorate della legenda sono approssimate a occhio sul rendering reale: se
  EFFIS cambia palette vanno riallineate (in alternativa si puo incorporare
  la legenda ufficiale via `request=GetLegendGraphic&layer=effis.nrt.ba.poly`).

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
npm test           # oppure: npx vitest run   (84 test)
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
src/config.js       costanti: centro, raggio, polling, stili mappa, soglie IN
                    ARRIVO, FIRE_WMS (incendi), PLANES_SOURCES (fonti dati voli)
src/prefs.js        load/save preferenze (localStorage 'radarPrefs')
src/data/*.json     airlines (ICAO→nome), iata2icao, airports
src/styles.css      tutti gli stili (tema "fosforo" HUD)
tests/domain.test.js unit test delle funzioni pure
tests/sources.test.js  fonti dati: URL, rilevamento errori, dati reali adsb.fi
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
si rafforza (icona pulsante, badge "VICINO A UN INCENDIO" in lista e scheda).

## FONTE DEI DATI DI VOLO — leggere prima di toccarla

La fonte e **configurabile**: `PLANES_SOURCES` + `PLANES_SOURCE` in
`src/config.js`. Ogni fonte espone la stessa interfaccia (`point()`,
`callsign()`, `errorOf()`, `attribution`, `trimToRadius`), quindi
**cambiare fornitore e una riga** e non tocca la logica dell'app.

- **Attiva: `adsbfi`** (opendata.adsb.fi). Nessuna chiave, nessuna
  registrazione, uso personale non commerciale, 1 richiesta/secondo.
- **`airplaneslive`: NON utilizzabile.** Il 2026-08-12 hanno chiuso
  l'accesso pubblico: rispondono a qualsiasi richiesta non autorizzata
  chiedendo di scrivere a contact@airplanes.live con link al progetto,
  descrizione e platea di utenti. **Non era un problema nostro**: stesso
  messaggio da IP diversi, da VPN e da un servizio terzo — cioe una
  restrizione generale, non un blocco contro di noi. La definizione resta
  in `config.js` pronta all'uso se un giorno autorizzano.

Due differenze fra le due che il codice gia gestisce, da tenere presenti se
si aggiunge una terza fonte:

- **Dove sta l'errore**: adsb.fi lo mette in `msg` (vale `"No error"` quando
  va tutto bene), airplanes.live in `error`. Entrambi con HTTP 200: senza
  `errorOf()` un rifiuto sembrerebbe una risposta valida con zero aerei.
- **Il raggio**: adsb.fi restituisce anche aerei oltre il raggio richiesto
  (con `dist=3` sono arrivati aerei a 4,0 e 5,7 NM), per questo ha
  `trimToRadius: true` e `trimToRadius()` in `app.js` rifila usando il campo
  `dst` (distanza in NM dal punto interrogato) quando c'e.

`PLANES_API_ENABLED` resta come interruttore generale: a `false` l'app non
contatta nessuna fonte e lo dichiara, invece di sembrare rotta. Il blocco e
su tre livelli (polling, scansione IN ARRIVO, ricerca volo) piu una barriera
finale dentro `apiFetch`, cosi nessun ramo dimenticato puo far partire una
richiesta.

I test in `tests/sources.test.js` girano su una **risposta reale** di
adsb.fi catturata dal campo: se si cambia fonte, catturarne una nuova e
aggiornare quella costante e il modo piu rapido per validare il cambio.

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
- **L'API puo rifiutare rispondendo 200 con un corpo di errore**
  (`{"error": "please contact us at contact@airplanes.live"}`): e cosi che
  airplanes.live segnala un client bloccato. `fetchPlanes` lo riconosce e lo
  mostra nel banner, altrimenti si vedrebbero solo zero contatti senza motivo.
- **Colori delle aree bruciate**: non li scegliamo noi, vengono dallo stile
  `default` di EFFIS e codificano l'ETA dell'incendio — rosso: ultime 24 ore;
  arancione: ultimi 7 giorni; blu: ultimi 90 giorni; verde: oltre 90 giorni.
  Con la finestra attuale (`FIRE_WMS.burnt.days` = 30) il verde non compare
  mai, per questo la legenda in impostazioni mostra solo tre voci. Le pastiglie
  colorate della legenda sono approssimate a occhio sul rendering reale: se
  EFFIS cambia palette vanno riallineate (in alternativa si puo incorporare
  la legenda ufficiale via `request=GetLegendGraphic&layer=effis.nrt.ba.poly`).

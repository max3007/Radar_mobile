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
npm test           # unit test dei moduli (186)
npm run test:e2e   # prove interfaccia su browser vero (32)
npm run test:all   # entrambi
npm run build      # produzione in dist/
npm run preview    # anteprima build (http://localhost:4173)
```

Nota: GPS, bussola e notifiche richiedono HTTPS → si provano solo su
`localhost`, tunnel HTTPS, o l'URL Vercel; non in http semplice.

## Struttura

Cinque strati, dipendenze in una direzione sola: dal basso verso l'alto
nessuno sa dell'altro. La cartella dice a che strato appartiene un file, e
lo strato dice cosa gli e permesso importare.

```
index.html          markup; stringhe statiche marcate con data-i18n / data-i18n-ph
src/main.js         entry: importa gli stili, avvia initApp
src/config.js       costanti e fonti dati: centro, raggio, polling, stili mappa,
                    soglie IN ARRIVO, FIRE_WMS + wmsTimeRange, PLANES_SOURCES

── dominio/ ───────── PURO. Niente Leaflet, niente DOM, niente stato condiviso.
   aereo.js         chi e: airlineName, toCallsign, fmtFlight, altLabel,
                    planeColor, isOnGround, isFirefightingAircraft
   geometria.js     dove sta: distanceM (= map.distance di Leaflet, 0 ppb),
                    bearing*, elevationAngle, destPoint, compass
   passaggi.js      dove passera: nextPass (CPA), landingBeforePass
   volo.js          cosa fa: routeConsistent, emergencyInfo, flightPhaseInfo,
                    datiEtichetta (cosa scrivere sull'etichetta di un aereo)
   flotta.js        l'insieme: trimToRadius
   index.js         li riespone tutti insieme: si importa da qui

── ui/ ───────────── RESA. Trasforma dati gia decisi in markup.
   dom.js           esc() (l'UNICO escape) e delega() (l'UNICO modo di rendere
                    cliccabile una lista)
   icone.js         i cinque marker Leaflet. SOLO disegno, nessuna decisione
   i18n.js          dizionari it/en + t(key,params) + applyStaticI18n
   banner.js        il banner rosso: quando comparire, cosa dire, come
                    ridisegnarsi al cambio lingua
   overlays.js      i due strati WMS incendi (hotspot + aree bruciate)

── servizi/ ──────── EFFETTI. Parlano con rete e archiviazione.
   voli.js          coda, scadenza, ErroreVoli, creaCanaleVoli().chiediVoli:
                    l'UNICO modo di interrogare i dati di volo. fetch e stato
                    connessione iniettabili, quindi provabile senza browser
   incendi.js       verifica Canadair vicino a un rilevamento (GetFeatureInfo)
   preferenze.js    load/save (localStorage 'radarPrefs')

── funzioni/ ─────── FUNZIONALITA VERTICALI. Ognuna e una fabbrica che
                    dichiara cosa le serve e restituisce la sua superficie.
   traffico.js      pannello TRAFFICO: lista aerei + classifica compagnie
   inarrivo.js      IN ARRIVO: scansione a 250 NM, tabella, proiezioni
   seguiti.js       aerei seguiti e avviso al sorvolo
   mira.js          guidaMira() pura (isteresi, angolo della freccia, gradi
                    mancanti) + creaMira() che parla con i sensori

── infra/ ────────── STRUMENTI senza dominio.
   cache.js         cache a capienza limitata con sfratto del meno usato

── app/ ──────────── COMPOSIZIONE. L'unico strato che sa di tutti gli altri.
   contesto.js      forma dello stato condiviso, salvataggio/rilettura
                    preferenze con validazione, e il contratto per le funzioni
   avvio.js         initApp: mappa, marker/scie, selezione, scheda volo,
                    pannelli, polling, postazioni, ricerca, tasto back

vercel.json         inoltro /adsb/* -> opendata.adsb.fi (aggira il CORS)
src/data/*.json     airlines (ICAO→nome), iata2icao, airports
src/styles.css      tutti gli stili (tema "fosforo" HUD)
tests/*.test.js     unit test dei moduli puri e dei servizi
tests/e2e/          prove dell'interfaccia con Playwright (browser vero)
playwright.config.js  configurazione delle prove e2e
legacy/             prototipo originale a file singolo (baseline)
scripts/make-icons.mjs  genera le icone PWA (uso una tantum)
```

### La regola che decide dove va una funzione nuova

**Si puo provare senza aprire un browser?** Se si, va in `dominio/`. Ma
attenzione: un modulo che importa Leaflet non parte sotto Vitest (`window is
not defined`), quindi una funzione pura non va messa accanto a codice che usa
Leaflet. `datiEtichetta` sta in `dominio/volo.js` e non in `ui/icone.js`,
`wmsTimeRange` in `config.js` e non in `ui/overlays.js`, per questo motivo e
non per gusto.

Se ha effetti (rete, archiviazione, sensori) va in `servizi/`, con le
dipendenze iniettabili. Se e una funzionalita che l'utente riconosce come
tale, va in `funzioni/` come fabbrica che riceve un contesto.

### Aggiungere una funzionalita

1. Un file in `funzioni/`, che esporta `creaXxx(ctx)` e dichiara in cima cosa
   legge dal contesto.
2. Legge lo stato, **non lo scrive**: scriverci spetta a `avvio.js`, che e
   l'unico a sapere cosa va ridisegnato dopo.
3. Comunica gli esiti con richiamate, non toccando altre funzionalita.
4. Le sue decisioni pure vanno estratte come funzioni a parte e provate: v.
   `guidaMira()` in `mira.js` come modello.


## Convenzioni di lavoro (IMPORTANTE)

- **Branch**: sviluppo su `claude/app-development-plan-5m66ct`, poi
  fast-forward su `main` e push di entrambi. (Se il flusso cambia, chiedere.)
- **README nello stesso commit** della feature: tenerlo sempre allineato.
- **Ogni modifica**: `npm run build` + `npm run test:all` verdi prima di
  committare. Se tocchi l'interfaccia, aggiungi un caso in `tests/e2e/`.
- Commit in italiano, descrittivi. NON inserire l'ID del modello nei commit.
- **i18n**: ogni nuova stringa visibile va aggiunta a `src/i18n.js` (it + en)
  e richiamata con `t('chiave')` (JS) o, nell'HTML, `data-i18n`,
  `data-i18n-ph`, `data-i18n-title`, `data-i18n-aria`, `data-i18n-alt`.
  DUE trappole gia costate tempo: (1) NON far dipendere la logica dal testo
  tradotto — l'icona di fase volo confrontava `indexOf('SALITA')` e in
  inglese non funzionava piu; usare un codice separato, vedi
  `flightPhaseInfo`. (2) Cio che l'app scrive da sola non lo ridisegna
  `applyStaticI18n`: va aggiunto a `ridisegnaTestiDinamici()` in
  `app/avvio.js`, altrimenti resta nella lingua vecchia.
- **prefs**: una preferenza nuova va aggiunta in TRE punti di
  `app/contesto.js` — il default in `creaStato()`, la scrittura in
  `preferenzeDa()`, la rilettura validata in `applicaPreferenze()`.
  Dimenticarne uno la fa sparire in silenzio al riavvio: c'e un test in
  `tests/contesto.test.js` che percorre il giro completo e fallisce se
  succede.

## Come verifico le UI (pattern usato in tutta la sessione)

Playwright headless con Chromium pre-installato, mockando le API di volo. Es.:
```js
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox'] });
const ctx = await b.newContext({ viewport:{width:390,height:844} });
await ctx.route('**/adsb/**', r => r.fulfill({ json:{ ac:[/* aerei mock */] }}));
await ctx.route('**/server.arcgisonline.com/**', r => r.abort()); // tile mappa
// ... apri http://localhost:4173, interagisci, asserisci
```
Nel sandbox le tile mappa e le API esterne sono spesso bloccate dal proxy: si
verifica la LOGICA (URL/parametri, stato UI), non il rendering delle tile reali.

**Ma per le verifiche vere ora ci sono i test end-to-end**, in `tests/e2e/`,
con Playwright fra le dipendenze: `npm run test:e2e`. Le prove usano risposte
REALI di adsb.fi come dati di partenza (`tests/e2e/fixtures.js`) e coprono
avvio, ritorno dal background, i tre stati del banner di errore, il cambio
lingua con un errore visibile, pannelli e tasto BACK. Scrivere script
usa-e-getta come si faceva prima significa buttare via la verifica appena
fatta: meglio aggiungere un caso li.

**Prima di un e2e, chiediti se basta un unit test.** Gira in un secondo
invece che in un minuto e mezzo, e dice con precisione cosa e rotto. I test
in `tests/*.test.js` usano il traduttore VERO di `src/i18n.js`, non un
dizionario finto: cosi le frasi attese non possono divergere da quelle che
l'utente legge davvero.

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

## Un solo modo di fare ciascuna cosa (esito del refactoring)

Dove la duplicazione ha causato bug veri, ora c'e un punto solo da cui tutto
si ricava. Se ti trovi a scrivere la seconda copia di una di queste, fermati.

- **`chiediVoli(url)`** (`src/rete.js`) e l'UNICO modo di interrogare i dati
  di volo. Applica sempre, nello stesso ordine: interruttore generale, turno
  nella coda del limite di richieste, scadenza, controllo dell'errore nel
  corpo della risposta, diagnostica. Prima ogni chiamante ne applicava un
  sottoinsieme diverso: per questo la ricerca volo diceva "non in volo"
  quando la fonte aveva rifiutato. Non aggiungere `fetch` diretti verso i voli.
- **`PANNELLI` + `SOVRAPPOSTE`** descrivono le finestre. `closeAll`,
  `isAnyOpen` e `closeTopmost` si ricavano da li; `togglePannello(id)` apre e
  chiude, `chiudiPannello(id)` chiude e basta. L'ordine di `SOVRAPPOSTE` E la
  priorita del tasto BACK. **Mai `classList.remove('open')` a mano**: e' cosi
  che il BACK si rompe in silenzio, ed e' gia successo due volte.
- **`vaiAllAereo(ac, opz)`** porta la vista su un aereo e lo seleziona. Erano
  tre varianti (lista TRAFFICO, IN ARRIVO, ricerca volo) che facevano le
  stesse cose in ordine diverso, ognuna dimenticandone una.
- **`zoomPerRaggio(nm)`** e l'unico posto dove sta la scala raggio→zoom.

Il banner di errore (`src/banner.js`) conserva **chiave e parametri**, non la
frase tradotta: solo cosi si ridisegna nella lingua giusta. Se ci si mette il
testo gia tradotto, al cambio lingua resta mezzo in italiano.

**Dove mettere una funzione nuova.** Se e pura, va in un modulo, non in
`app.js`: e l'unico modo di poterla provare senza aprire un browser. Ma
attenzione — un modulo che importa Leaflet non parte sotto Vitest (`window is
not defined`), quindi una funzione pura non va messa accanto a codice che usa
Leaflet: `datiEtichetta` sta in `domain.js` e non in `icone.js`, `wmsTimeRange`
in `config.js` e non in `overlays.js`, per questo motivo e non per gusto.

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

### ⚠️ adsb.fi si chiama SOLO tramite il nostro dominio (CORS)

`opendata.adsb.fi` **non manda le intestazioni CORS**, quindi il browser
rifiuta la risposta quando la richiesta parte da una pagina web — mentre
aprendo lo stesso URL a mano nella barra degli indirizzi funziona, perche la
navigazione diretta non passa dal controllo CORS. Sintomo ingannevole: la
richiesta fallisce **senza nemmeno una risposta HTTP**, indistinguibile a
occhio da "rete assente".

Percio gli URL della fonte `adsbfi` sono **relativi** (`/adsb/...`) e vengono
inoltrati a `https://opendata.adsb.fi/api/...`:

- in produzione da **`vercel.json`** (rewrite)
- in sviluppo e anteprima da **`vite.config.js`** (`server.proxy` e
  `preview.proxy`)

**I tre file devono restare allineati.** Se in `config.js` cambia il prefisso
`/adsb`, vanno aggiornati anche gli altri due, altrimenti l'app chiama un
percorso che nessuno inoltra. Un test in `tests/sources.test.js` verifica che
l'URL resti relativo, proprio per non ricascarci.

Effetto collaterale da sapere: le richieste arrivano ad adsb.fi dall'IP di
Vercel, non dal telefono. Loro limitano a 1 richiesta/secondo **per IP**: per
un'app personale e irrilevante, ma se un giorno l'app avesse molti utenti
converrebbe ripensarci.

Per capire al volo se un fallimento e CORS o rete: `classifyBlocked()` in
`app.js` fa una sonda in modalita `no-cors` (che non richiede il permesso
CORS) e distingue i due casi nel banner.

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
  questo l'orizzonte è breve e la lista si aggiorna a ogni polling
  (`POLL_INTERVAL_MS`, oggi 6 s). La nota nel pannello IN ARRIVO ricava i
  numeri da quelle costanti: non riscriverli a mano nelle stringhe i18n.
- Il polling si ferma in background (`visibilitychange`) per risparmiare, ma
  **il riavvio al ritorno deve restare incondizionato**. Il ciclo e a
  `setTimeout` concatenati: tornando dopo qualche minuto il telefono puo aver
  buttato via il timer o lasciato una richiesta appesa per sempre, mentre la
  spia "sto girando" resta accesa. Con un controllo del tipo `if (pollingOn)
  return` l'app restava con gli aerei immobili finche non la si chiudeva —
  era esattamente questo il bug. Ora `startPolling()` riparte sempre e la
  variabile `pollGen` garantisce che resti un solo ciclo vivo. Ci sono tre
  reti di sicurezza: `pageshow`, `focus` e un controllo ogni 10 s che
  rilancia il ciclo se in primo piano non parte una richiesta da troppo
  tempo. `API_TIMEOUT_MS` impedisce a una richiesta appesa di bloccare tutto.
- **L'API aerei accetta ~1 richiesta al secondo.** L'app pero ne fa partire
  due ravvicinate quando IN ARRIVO e aperto (polling nel raggio + scansione a
  250 NM, chiamata da `refreshPasses` dentro `fetchPlanes`): la seconda veniva
  rifiutata e in app si leggeva "SEGNALE PERSO" senza motivo apparente. Ora
  tutte le chiamate a quell'API passano da `apiFetch`, che prenota a ciascuna
  un turno a distanza di `API_MIN_GAP_MS` (1,1 s). Se in futuro si aggiungono
  chiamate ai dati di volo, vanno fatte con `chiediVoli()`, non con `fetch`.
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

// Costanti dell'app: punto di osservazione di default, raggio, polling, API.

export const DEFAULT_CENTER = [41.4479, 12.6285]; // Anzio
export const DEFAULT_RADIUS_NM = 100;
export const POLL_INTERVAL_MS = 12000;

// Stili mappa selezionabili dalle impostazioni. 'dark' e lo stile radar
// originale (tile scure schiarite via filtro CSS, attivato dalla classe
// map-dark sul contenitore); gli altri sono basemap a colori nativi.
export const TILE_STYLES = {
  topo: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    options: { maxZoom: 19, attribution: '&copy; <a href="https://www.esri.com/">Esri</a>' },
    dark: false
  },
  sat: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    options: { maxZoom: 19, attribution: '&copy; <a href="https://www.esri.com/">Esri</a>' },
    dark: false
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    options: { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>' },
    dark: true
  }
};
export const DEFAULT_MAP_STYLE = 'topo';

// "IN ARRIVO": orizzonte temporale e soglia di distanza dei passaggi previsti.
// PASS_SCAN_NM: raggio (max API) usato per la scansione dedicata quando il
// pannello e aperto, cosi si "vedono" gli aerei molto prima del raggio mappa.
export const PASS_HORIZON_MIN = 40;
export const DEFAULT_PASS_KM = 15;
export const PASS_SCAN_NM = 250;
// Un passaggio conta come "SORVOLO" (praticamente sopra la testa) solo entro
// questa distanza orizzontale dal punto di osservazione.
export const PASS_OVERHEAD_KM = 2;
// Avviso in-app per gli aerei seguiti: scatta quando il passaggio e entro
// questi minuti.
export const PASS_ALERT_MIN = 2;

// Overlay incendi: rilevamenti satellitari EFFIS/Copernicus (WMS pubblico,
// senza chiave). Host e layer verificati via GetCapabilities il 2026-08-09
// (il vecchio host ies-ows.jrc.ec.europa.eu e stato dismesso). Due layer
// distinti e selezionabili separatamente:
// - hotspots: rilevamenti attivi (punto caldo), tutte le fonti satellitari
//   insieme (MODIS+VIIRS+NOAA) per la massima copertura.
// - burnt: perimetri delle aree gia bruciate, quasi in tempo reale (basato
//   su cluster di rilevamenti VIIRS), utile per vedere l'estensione reale
//   di un incendio in corso e non solo il punto del rilevamento.
export const FIRE_WMS = {
  url: 'https://maps.effis.emergency.copernicus.eu/effis',
  attribution: '&copy; <a href="https://forest-fire.emergency.copernicus.eu/">EFFIS</a> / Copernicus',
  hotspots: { layers: 'all.hs', days: 7 },
  burnt: { layers: 'effis.nrt.ba.poly', days: 30 }
};

// INTERRUTTORE GENERALE delle chiamate ai dati di volo: a false l'app non
// contatta nessuna fonte e lo dice apertamente, invece di sembrare rotta.
// Serve se anche la fonte attiva dovesse chiudere l'accesso.
export const PLANES_API_ENABLED = true;

// ---------------------------------------------------------------------------
// FONTI DEI DATI DI VOLO
//
// Parlano tutte il formato ADSBexchange v2 (`{ac: [...]}` con hex, flight,
// lat, lon, alt_baro, gs, track, t, desc...), quindi cambiare fonte NON tocca
// la logica dell'app: cambia solo come si compone l'URL e dove si legge un
// eventuale errore. Per cambiare fornitore basta cambiare PLANES_SOURCE.
//
// Storia, perche non si ripeta la ricerca a vuoto: airplanes.live ha chiuso
// l'accesso pubblico il 2026-08-12 e ora risponde a QUALSIASI richiesta non
// autorizzata chiedendo di scrivere a contact@airplanes.live con link al
// progetto, descrizione e platea di utenti. Verificato che non dipendeva da
// noi: stesso messaggio da IP diversi, da VPN e da un servizio terzo.
// ---------------------------------------------------------------------------
export const PLANES_SOURCES = {
  // Attiva. Nessuna chiave, nessuna registrazione, uso personale non
  // commerciale, 1 richiesta/secondo. https://github.com/adsbfi/opendata
  adsbfi: {
    label: 'adsb.fi',
    attribution: '<a href="https://adsb.fi/">adsb.fi</a>',
    // ATTENZIONE: NON si chiama opendata.adsb.fi direttamente.
    // Il loro servizio non manda le intestazioni CORS, quindi il browser
    // rifiuta la risposta quando la richiesta parte da una pagina web —
    // mentre aprendo lo stesso URL a mano funziona, perche la navigazione
    // diretta non passa dal controllo CORS. Sintomo: la richiesta fallisce
    // senza nemmeno una risposta HTTP.
    // Quindi chiamiamo il NOSTRO stesso dominio sotto /adsb, che inoltra a
    // https://opendata.adsb.fi/api/... : in produzione via vercel.json, in
    // sviluppo via vite.config.js. Essendo same-origin, il CORS non entra
    // in gioco. Toccando questi percorsi vanno aggiornati entrambi i file.
    point: function (lat, lon, radiusNM) {
      // Raggio massimo consentito: 250 NM
      return '/adsb/v3/lat/' + lat + '/lon/' + lon + '/dist/' + radiusNM;
    },
    callsign: function (cs) {
      return '/adsb/v2/callsign/' + encodeURIComponent(cs);
    },
    // Restituisce anche aerei un po' oltre il raggio chiesto (verificato:
    // con dist=3 sono arrivati aerei a 4,0 e 5,7 NM), quindi rifiliamo noi.
    trimToRadius: true,
    // L'esito sta in `msg`, che vale "No error" quando e tutto a posto
    errorOf: function (data) {
      if (!data) return null;
      var m = data.msg;
      return (typeof m === 'string' && m.toLowerCase() !== 'no error') ? m : null;
    }
  },
  // Non utilizzabile senza autorizzazione (vedi sopra). Tenuta qui pronta:
  // se rispondono all'email basta cambiare PLANES_SOURCE.
  airplaneslive: {
    label: 'airplanes.live',
    attribution: '<a href="https://airplanes.live/">airplanes.live</a>',
    point: function (lat, lon, radiusNM) {
      return 'https://api.airplanes.live/v2/point/' + lat + '/' + lon + '/' + radiusNM;
    },
    callsign: function (cs) {
      return 'https://api.airplanes.live/v2/callsign/' + encodeURIComponent(cs);
    },
    trimToRadius: false,
    // Qui l'errore arriva nel campo `error`, con HTTP 200
    errorOf: function (data) {
      return (data && data.error) ? data.error : null;
    }
  }
};

// La fonte in uso: cambiare QUESTA riga per cambiare fornitore.
export const PLANES_SOURCE = 'adsbfi';

export const API = {
  // Rotte volo (gratuita, senza chiave)
  routeCallsign: 'https://api.adsbdb.com/v0/callsign/',      // + callsign
  // Foto aerei
  photoHex: 'https://api.planespotters.net/pub/photos/hex/', // + hex ICAO
  photoReg: 'https://api.planespotters.net/pub/photos/reg/', // + registrazione
  // Ricerca luoghi per le postazioni (Nominatim/OSM, gratuita, senza chiave)
  geocode: 'https://nominatim.openstreetmap.org/search'      // ?format=json&q=...
};

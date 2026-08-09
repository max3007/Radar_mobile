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
// senza chiave). I nomi layer hotspot MODIS/VIIRS sono quelli storici di
// EFFIS; se non comparissero, verificarli via GetCapabilities e aggiornarli qui.
export const FIRE_WMS = {
  url: 'https://ies-ows.jrc.ec.europa.eu/effis',
  layers: 'modis.hs',   // hotspot MODIS (rilevamenti incendi attivi)
  attribution: '&copy; <a href="https://forest-fire.emergency.copernicus.eu/">EFFIS</a> / Copernicus',
  days: 7               // finestra temporale dei rilevamenti mostrati
};

export const API = {
  // Posizioni ADS-B in tempo reale (gratuita, senza chiave)
  planesPoint: 'https://api.airplanes.live/v2/point/',       // + lat/lon/raggioNM
  planesCallsign: 'https://api.airplanes.live/v2/callsign/', // + callsign
  // Rotte volo (gratuita, senza chiave)
  routeCallsign: 'https://api.adsbdb.com/v0/callsign/',      // + callsign
  // Foto aerei
  photoHex: 'https://api.planespotters.net/pub/photos/hex/', // + hex ICAO
  photoReg: 'https://api.planespotters.net/pub/photos/reg/', // + registrazione
  // Ricerca luoghi per le postazioni (Nominatim/OSM, gratuita, senza chiave)
  geocode: 'https://nominatim.openstreetmap.org/search'      // ?format=json&q=...
};

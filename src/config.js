// Costanti dell'app: punto di osservazione di default, raggio, polling, API.

export const DEFAULT_CENTER = [41.4479, 12.6285]; // Anzio
export const DEFAULT_RADIUS_NM = 100;
export const POLL_INTERVAL_MS = 12000;

export const API = {
  // Posizioni ADS-B in tempo reale (gratuita, senza chiave)
  planesPoint: 'https://api.airplanes.live/v2/point/',       // + lat/lon/raggioNM
  planesCallsign: 'https://api.airplanes.live/v2/callsign/', // + callsign
  // Rotte volo (gratuita, senza chiave)
  routeCallsign: 'https://api.adsbdb.com/v0/callsign/',      // + callsign
  // Foto aerei
  photoHex: 'https://api.planespotters.net/pub/photos/hex/', // + hex ICAO
  photoReg: 'https://api.planespotters.net/pub/photos/reg/'  // + registrazione
};

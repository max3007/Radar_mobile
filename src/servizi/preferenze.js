// Preferenze persistenti (protette: se lo storage non e disponibile, si ignora)
// Stessa chiave e stesso schema del prototipo originale, cosi le preferenze
// gia salvate dagli utenti restano valide.

const KEY = 'radarPrefs';

export function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch (e) { /* storage non disponibile: nessun problema */
    return null;
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch (e) { /* storage non disponibile: nessun problema */ }
}

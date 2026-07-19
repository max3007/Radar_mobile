import 'leaflet/dist/leaflet.css';
import './styles.css';
import { initApp } from './app.js';

// Come nel prototipo originale: avvio a pagina completamente caricata
if (document.readyState === 'complete') initApp();
else window.addEventListener('load', initApp);

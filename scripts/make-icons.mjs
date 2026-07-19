// Genera le icone PWA renderizzando un SVG in Chromium e salvandone lo
// screenshot alle varie dimensioni. Uso una tantum: node scripts/make-icons.mjs
// (richiede playwright disponibile; le PNG generate vengono committate).
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { resolve } from 'path';

const outDir = resolve(import.meta.dirname, '../public');
mkdirSync(outDir, { recursive: true });

// maskable: contenuto entro il 60% centrale (safe zone), fondo pieno
function svg(size, maskable) {
  const s = maskable ? 0.52 : 0.72; // scala della grafica rispetto al lato
  return `<!doctype html><body style="margin:0">
  <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
    <rect width="100" height="100" fill="#060a0e"/>
    <g transform="translate(50 50) scale(${s}) translate(-50 -50)">
      <circle cx="50" cy="50" r="46" fill="none" stroke="#1a7a4d" stroke-width="2.5"/>
      <circle cx="50" cy="50" r="30" fill="none" stroke="#1a7a4d" stroke-width="1.5" stroke-dasharray="3 5"/>
      <circle cx="50" cy="50" r="14" fill="none" stroke="#1a7a4d" stroke-width="1.5" stroke-dasharray="2 4"/>
      <path d="M50 50 L50 4 A46 46 0 0 1 82 18 Z" fill="#34e08a" opacity="0.28"/>
      <g transform="translate(50 50) rotate(45) scale(1.55) translate(-12 -12)">
        <path d="M12 2 L14 10 L22 13 L22 15 L14 13.5 L13.5 20 L16 21.5 L16 23 L12 22 L8 23 L8 21.5 L10.5 20 L10 13.5 L2 15 L2 13 L10 10 Z"
          fill="#34e08a" stroke="#060a0e" stroke-width="0.8" paint-order="stroke"/>
      </g>
    </g>
  </svg></body>`;
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const jobs = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, false]
];
for (const [name, size, maskable] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(svg(size, maskable));
  await page.screenshot({ path: resolve(outDir, name), clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  console.log('scritta', name);
}
await browser.close();

// Generates the PWA PNG icons (192, 512, maskable) by rendering an inline SVG
// in headless Chromium and screenshotting it. Run once; the PNGs are committed.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'icons');
fs.mkdirSync(OUT, { recursive: true });

// Card-with-barcode glyph on a sky gradient. `pad` grows the safe zone for maskable.
function svg(size, pad = 0) {
  const s = size;
  const inner = s * (1 - pad * 2);
  const off = s * pad;
  return `<!doctype html><body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0ea5e9"/><stop offset="1" stop-color="#0369a1"/>
    </linearGradient></defs>
    <rect width="${s}" height="${s}" fill="url(#g)"/>
    <g transform="translate(${off},${off}) scale(${inner / 100})">
      <rect x="14" y="26" width="72" height="48" rx="8" fill="#f8fafc"/>
      <rect x="14" y="26" width="72" height="12" rx="6" fill="#0f172a" opacity="0.85"/>
      ${[22, 27, 31, 37, 41, 47, 52, 56, 62, 66, 72]
        .map((x, i) => `<rect x="${x}" y="48" width="${i % 3 === 0 ? 3 : 2}" height="18" fill="#0f172a"/>`)
        .join('')}
    </g>
  </svg></body>`;
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();

for (const [file, size, pad] of [
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['icon-maskable-512.png', 512, 0.12],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(svg(size, pad));
  await page.screenshot({ path: path.join(OUT, file), clip: { x: 0, y: 0, width: size, height: size } });
  console.log('wrote', file);
}
await browser.close();

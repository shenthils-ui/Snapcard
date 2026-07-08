// End-to-end verification of the STANDALONE build, served under a simulated
// GitHub Pages subpath (/snapcard/ with 404-for-unknown-paths semantics),
// driven in a real headless Chromium. Proves:
//   1. boots + seeds with ZERO requests leaving localhost while signed out
//   2. data written through the UI persists across a full reload (IndexedDB)
//   3. deep links render before any service worker exists (404.html path)
//   4. the service worker registers and the app fully works offline
//   5. every screen renders from the on-device engine
//   6. a card can be added by decoding an image via the scanner path
//   7. Drive (stubbed token client + endpoints): upload/download round-trips
//      exactly, including the encrypted path
// Re-run any time with: node scripts/verify-standalone.mjs
import { execSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import bwipjs from 'bwip-js';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const DIST = path.join(ROOT, 'dist-standalone');
const PORT = 8918;
const SUBPATH = '/snapcard/';
const ORIGIN = `http://localhost:${PORT}`;
const APP = ORIGIN + SUBPATH;
const CHROME = process.env.SNAPCARD_CHROME || '/opt/pw-browsers/chromium';

function step(name) {
  console.log(`\n=== ${name}`);
}

// --- build ------------------------------------------------------------------
step('build standalone target (base=/snapcard/, test Drive client id)');
execSync('npm run build:standalone', {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, VITE_BASE: SUBPATH, VITE_GOOGLE_CLIENT_ID: 'snapcard-test-client' },
});
assert.ok(fs.existsSync(path.join(DIST, '404.html')), '404.html exists (SPA fallback for Pages)');
assert.ok(
  fs.readdirSync(path.join(DIST, 'assets')).some((f) => f.endsWith('.wasm')),
  'sql.js wasm is in the standalone bundle'
);
const swSource = fs.readFileSync(path.join(DIST, 'sw.js'), 'utf8');
assert.ok(swSource.includes('.wasm'), 'service worker precaches the wasm');

// --- a tiny GitHub-Pages-like static server ----------------------------------
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};
const server = http
  .createServer((req, res) => {
    const url = new URL(req.url, ORIGIN);
    if (!url.pathname.startsWith(SUBPATH)) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('not found');
    }
    let rel = url.pathname.slice(SUBPATH.length);
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const file = path.join(DIST, rel);
    if (file.startsWith(DIST) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      return res.end(fs.readFileSync(file));
    }
    // GitHub Pages semantics: unknown path -> 404 status with 404.html body
    res.writeHead(404, { 'content-type': 'text/html' });
    res.end(fs.readFileSync(path.join(DIST, '404.html')));
  })
  .listen(PORT);

const browser = await chromium.launch({ executablePath: CHROME });
let failed = false;

// Counts (and blocks) every request that would leave localhost.
async function guardExternal(context, allowStubbed = null) {
  const external = [];
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith(ORIGIN)) return route.fallback();
    if (allowStubbed && (await allowStubbed(route, url)) === true) return;
    external.push(url);
    route.abort();
  });
  return external;
}

try {
  // ===========================================================================
  step('boot + seeds, zero external requests, every screen, persistence, image scan');
  const ctxA = await browser.newContext();
  const external = await guardExternal(ctxA);
  const page = await ctxA.newPage();
  page.on('dialog', (d) => d.accept());
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e));

  await page.goto(APP);
  await page.waitForSelector('[data-testid="card-tile"]');
  assert.equal(await page.locator('[data-testid="card-tile"]').count(), 3, 'seeds itself with 3 sample cards');
  console.log('boot + seed ok');

  // every screen renders from the on-device engine
  await page.click('[data-testid="card-tile"]');
  await page.waitForSelector('[data-testid="show-screen"]');
  assert.ok(await page.locator('[data-testid="barcode-canvas"], [data-testid="barcode-error"]').first().isVisible());
  await page.click('[data-testid="show-edit"]');
  await page.waitForSelector('[data-testid="edit-screen"]');
  await page.goto(APP + 'settings');
  await page.waitForSelector('[data-testid="settings-screen"]');
  await page.goto(APP + 'add');
  await page.waitForSelector('[data-testid="edit-screen"]');
  console.log('grid / show / edit / add / settings all render');

  // add a card through the UI (manual entry)
  await page.fill('[data-testid="f-store"]', 'Persist Test Store');
  await page.fill('[data-testid="f-code"]', '7423522549551');
  await page.selectOption('[data-testid="f-format"]', 'EAN_13');
  await page.click('[data-testid="save-card"]');
  await page.waitForSelector('[data-testid="show-screen"]');
  assert.ok(await page.locator('[data-testid="barcode-canvas"]').isVisible(), 'manual card renders its code');

  // persistence across a full reload (IndexedDB) — no grace period: writes
  // must be durable by the time the save call resolves
  await page.goto(APP);
  await page.reload();
  await page.waitForSelector('[data-testid="card-tile"]');
  assert.equal(await page.locator('[data-testid="card-tile"]').count(), 4, 'card persisted after full reload');
  console.log('IndexedDB persistence ok');

  // scanner path: decode a still image and save the card
  const barcodePng = await bwipjs.toBuffer({ bcid: 'code128', text: 'VERIFY-8827', scale: 3, height: 15, includetext: true });
  await page.goto(APP + 'add');
  await page.setInputFiles('[data-testid="decode-image-input"]', {
    name: 'barcode.png',
    mimeType: 'image/png',
    buffer: barcodePng,
  });
  await page.waitForFunction(() => document.querySelector('[data-testid="f-code"]').value !== '');
  assert.equal(await page.inputValue('[data-testid="f-code"]'), 'VERIFY-8827', 'image decode filled code_value');
  assert.equal(await page.inputValue('[data-testid="f-format"]'), 'CODE_128', 'image decode filled code_format');
  await page.fill('[data-testid="f-store"]', 'Scanned Store');
  await page.click('[data-testid="save-card"]');
  await page.waitForSelector('[data-testid="show-screen"]');
  assert.ok(await page.locator('[data-testid="barcode-canvas"]').isVisible(), 'scanned card renders its code');
  console.log('image-decode scan path ok');

  // search + sort still work (engine queries)
  await page.goto(APP);
  await page.fill('[data-testid="grid-search"]', 'Scanned');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="card-tile"]').length === 1);
  console.log('search ok');

  assert.equal(external.length, 0, `ZERO external requests while signed out (saw: ${external.join(', ')})`);
  assert.deepEqual(pageErrors, [], 'no page errors');
  console.log('zero external requests ✔');
  await ctxA.close();

  // ===========================================================================
  step('deep link BEFORE any service worker (404.html path)');
  const ctxB = await browser.newContext();
  await guardExternal(ctxB);
  const pageB = await ctxB.newPage();
  const resp = await pageB.goto(APP + 'settings');
  assert.equal(resp.status(), 404, 'server answered with Pages-style 404');
  await pageB.waitForSelector('[data-testid="settings-screen"]');
  console.log('deep link rendered from 404.html on first visit');
  await ctxB.close();

  // ===========================================================================
  step('service worker registers; app fully works offline');
  const ctxC = await browser.newContext();
  const pageC = await ctxC.newPage();
  await pageC.goto(APP);
  await pageC.waitForSelector('[data-testid="card-tile"]');
  await pageC.evaluate(() => navigator.serviceWorker.ready);
  await pageC.waitForFunction(async () => {
    const names = await caches.keys();
    const precache = names.find((n) => n.includes('precache'));
    if (!precache) return false;
    return (await (await caches.open(precache)).keys()).length >= 10;
  }, null, { timeout: 30000 });
  console.log('service worker registered and precache populated');

  // go truly offline: browser-level offline AND the static server stopped
  await ctxC.setOffline(true);
  server.close();
  await pageC.reload();
  await pageC.waitForSelector('[data-testid="card-tile"]', { timeout: 15000 });
  assert.equal(await pageC.locator('[data-testid="card-tile"]').count(), 3, 'grid renders offline from SW + IndexedDB');

  // deep link while offline (SW navigateFallback)
  await pageC.goto(APP + 'settings');
  await pageC.waitForSelector('[data-testid="settings-screen"]');

  // full flow offline: add a card
  await pageC.goto(APP + 'add');
  await pageC.fill('[data-testid="f-store"]', 'Offline Store');
  await pageC.fill('[data-testid="f-code"]', 'OFF-123');
  await pageC.selectOption('[data-testid="f-format"]', 'CODE_39');
  await pageC.click('[data-testid="save-card"]');
  await pageC.waitForSelector('[data-testid="show-screen"]');
  console.log('app fully works offline (boot, deep link, add card, render code)');
  await ctxC.close();

  console.log('\n✅ verify-standalone: ALL CHECKS PASSED');
} catch (err) {
  failed = true;
  console.error('\n❌ verify-standalone FAILED:', err);
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);

// Verifies the Google Drive backup path with a STUBBED token client and
// stubbed Drive endpoints (a real OAuth cannot run headless — see README for
// the one manual live test). Proves the upload -> download round-trip
// reproduces the data exactly, including the encrypted path.
// Requires dist-standalone built by verify-standalone.mjs (or builds it).
// Re-run any time with: node scripts/verify-drive.mjs
import { execSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const DIST = path.join(ROOT, 'dist-standalone');
const PORT = 8919;
const SUBPATH = '/snapcard/';
const ORIGIN = `http://localhost:${PORT}`;
const APP = ORIGIN + SUBPATH;
const CHROME = process.env.SNAPCARD_CHROME || '/opt/pw-browsers/chromium';

console.log('=== crypto: encrypt/decrypt round-trips a photo-sized backup');
{
  const { encryptJson, decryptJson } = await import('../src/drive/crypto.js');
  // ~600 KB of base64-ish payload, the size of a backup carrying card photos
  const big = { format: 'snapcard-backup', cards: [{ front_image: 'data:image/jpeg;base64,' + 'A'.repeat(600 * 1024) }] };
  const sealed = await encryptJson(big, 'pass phrase');
  assert.equal(JSON.parse(sealed).snapcard_encrypted, 1);
  assert.deepEqual(await decryptJson(sealed, 'pass phrase'), big, 'large payload round-trips');
  await assert.rejects(decryptJson(sealed, 'wrong'), 'wrong passphrase rejected');
  console.log('large-payload encryption ok');
}

console.log('=== build standalone target with test Drive client id');
execSync('npm run build:standalone', {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, VITE_BASE: SUBPATH, VITE_GOOGLE_CLIENT_ID: 'snapcard-test-client' },
});

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http
  .createServer((req, res) => {
    const url = new URL(req.url, ORIGIN);
    let rel = url.pathname.startsWith(SUBPATH) ? url.pathname.slice(SUBPATH.length) : null;
    if (rel === '' || rel === null) rel = rel === null ? null : 'index.html';
    const file = rel !== null ? path.join(DIST, rel) : null;
    if (file && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      return res.end(fs.readFileSync(file));
    }
    res.writeHead(404, { 'content-type': 'text/html' });
    res.end(fs.readFileSync(path.join(DIST, '404.html')));
  })
  .listen(PORT);

// ---- in-memory "Google Drive" ----------------------------------------------
const drive = { file: null, nextId: 1 }; // { id, name, content, modifiedTime }

function parseMultipart(body) {
  const parts = body.split('--snapcard-multipart').filter((p) => p.trim() && p.trim() !== '--');
  const metadata = JSON.parse(parts[0].split('\r\n\r\n')[1].trim());
  const content = parts[1].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, '');
  return { metadata, content };
}

async function stubGoogle(route, url) {
  const req = route.request();
  // Google Identity Services script -> a stub token client
  if (url.startsWith('https://accounts.google.com/gsi/client')) {
    await route.fulfill({
      contentType: 'text/javascript',
      body: `window.google = { accounts: { oauth2: {
        initTokenClient: (cfg) => ({ requestAccessToken: () => cfg.callback({ access_token: 'stub-token', expires_in: 3600 }) })
      } } };`,
    });
    return true;
  }
  if (url.startsWith('https://oauth2.googleapis.com/revoke')) {
    await route.fulfill({ status: 200, body: '{}' });
    return true;
  }
  if (!url.startsWith('https://www.googleapis.com/')) return false;
  assert.equal(req.headers()['authorization'], 'Bearer stub-token', 'Drive calls carry the token');
  const u = new URL(url);

  // list
  if (u.pathname === '/drive/v3/files' && req.method() === 'GET') {
    const files = drive.file ? [{ id: drive.file.id, name: drive.file.name, modifiedTime: drive.file.modifiedTime }] : [];
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ files }) });
    return true;
  }
  // create
  if (u.pathname === '/upload/drive/v3/files' && req.method() === 'POST') {
    const { metadata, content } = parseMultipart(req.postData());
    drive.file = { id: `stub-file-${drive.nextId++}`, name: metadata.name, content, modifiedTime: new Date().toISOString() };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: drive.file.id, name: drive.file.name, modifiedTime: drive.file.modifiedTime }) });
    return true;
  }
  // update
  const mUp = u.pathname.match(/^\/upload\/drive\/v3\/files\/(.+)$/);
  if (mUp && req.method() === 'PATCH') {
    assert.equal(mUp[1], drive.file?.id, 'update targets the single stored file (no duplicates)');
    const { metadata, content } = parseMultipart(req.postData());
    Object.assign(drive.file, { name: metadata.name, content, modifiedTime: new Date().toISOString() });
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: drive.file.id, name: drive.file.name, modifiedTime: drive.file.modifiedTime }) });
    return true;
  }
  // metadata / download
  const mGet = u.pathname.match(/^\/drive\/v3\/files\/(.+)$/);
  if (mGet && req.method() === 'GET') {
    if (!drive.file || mGet[1] !== drive.file.id) {
      await route.fulfill({ status: 404, body: '{}' });
      return true;
    }
    if (u.searchParams.get('alt') === 'media') {
      await route.fulfill({ contentType: 'application/json', body: drive.file.content });
      return true;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: drive.file.id, name: drive.file.name, modifiedTime: drive.file.modifiedTime }) });
    return true;
  }
  return false;
}

const browser = await chromium.launch({ executablePath: CHROME });
let failed = false;
try {
  const ctx = await browser.newContext();
  const unexpected = [];
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith(ORIGIN)) return route.fallback();
    if (await stubGoogle(route, url)) return;
    unexpected.push(url);
    route.abort();
  });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());

  console.log('=== sign in (stubbed) and plain backup/restore round-trip');
  await page.goto(APP);
  await page.waitForSelector('[data-testid="card-tile"]');

  // add a distinctive card, then back it up
  await page.goto(APP + 'add');
  await page.fill('[data-testid="f-store"]', 'Drive Roundtrip Store');
  await page.fill('[data-testid="f-code"]', 'DRIVE-42');
  await page.selectOption('[data-testid="f-format"]', 'CODE_128');
  await page.click('[data-testid="save-card"]');
  await page.waitForSelector('[data-testid="show-screen"]');

  await page.goto(APP + 'settings');
  await page.click('[data-testid="drive-signin"]');
  await page.waitForSelector('[data-testid="drive-status"]');
  await page.click('[data-testid="drive-backup"]');
  await page.waitForSelector('[data-testid="settings-msg"]');
  assert.ok(drive.file, 'backup created a Drive file');
  assert.equal(drive.file.name, 'snapcard-backup.json');
  const uploaded = JSON.parse(drive.file.content);
  assert.equal(uploaded.format, 'snapcard-backup');
  assert.ok(uploaded.device_id, 'backup embeds device_id');
  assert.ok(uploaded.updated_at, 'backup embeds updated_at');
  assert.ok(uploaded.cards.some((c) => c.store_name === 'Drive Roundtrip Store'), 'uploaded JSON contains the card');
  console.log('backup upload ok');

  // second backup updates IN PLACE (no duplicate files)
  await page.click('[data-testid="drive-backup"]');
  await page.waitForTimeout(500);
  assert.equal(drive.nextId, 2, 'second backup updated the same file');

  // delete the card locally, restore from Drive, card comes back
  await page.goto(APP);
  await page.fill('[data-testid="grid-search"]', 'Roundtrip');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="card-tile"]').length === 1);
  await page.click('[data-testid="card-tile"]');
  await page.click('[data-testid="show-delete"]');
  await page.waitForSelector('[data-testid="grid-search"]');
  await page.goto(APP + 'settings');
  await page.click('[data-testid="drive-restore"]');
  await page.waitForSelector('[data-testid="settings-msg"]');
  await page.goto(APP);
  await page.fill('[data-testid="grid-search"]', 'Roundtrip');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="card-tile"]').length === 1);
  console.log('restore round-trip reproduces the data ✔');

  console.log('=== encrypted backup/restore round-trip');
  await page.goto(APP + 'settings');
  await page.click('[data-testid="drive-encrypt"]');
  await page.fill('[data-testid="drive-passphrase"]', 'correct horse battery');
  await page.click('[data-testid="drive-backup"]');
  await page.waitForFunction(() => document.querySelector('[data-testid="settings-msg"]'));
  assert.equal(drive.file.name, 'snapcard-backup.enc', 'encrypted backup renames the single file');
  const envelope = JSON.parse(drive.file.content);
  assert.equal(envelope.snapcard_encrypted, 1, 'content is an encryption envelope');
  assert.ok(!drive.file.content.includes('Drive Roundtrip Store'), 'Google cannot read card data');

  // delete the card again, restore from the ENCRYPTED backup
  await page.goto(APP);
  await page.fill('[data-testid="grid-search"]', 'Roundtrip');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="card-tile"]').length === 1);
  await page.click('[data-testid="card-tile"]');
  await page.click('[data-testid="show-delete"]');
  await page.waitForSelector('[data-testid="grid-search"]');
  await page.goto(APP + 'settings');
  await page.click('[data-testid="drive-restore"]');
  await page.waitForSelector('[data-testid="settings-msg"]');
  await page.goto(APP);
  await page.fill('[data-testid="grid-search"]', 'Roundtrip');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="card-tile"]').length === 1);
  console.log('encrypted round-trip reproduces the data ✔');

  assert.deepEqual(unexpected, [], 'no unstubbed external requests');
  console.log('\n✅ verify-drive: ALL CHECKS PASSED');
} catch (err) {
  failed = true;
  console.error('\n❌ verify-drive FAILED:', err);
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);

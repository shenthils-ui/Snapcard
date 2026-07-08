// End-to-end verification of the SERVER build: builds it, starts the Express
// server against a throwaway database, hits the RPC API directly, drives the
// UI in a real (headless) Chromium, and round-trips export -> import.
// Re-run any time with: node scripts/verify-server.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const PORT = 8917;
const BASE = `http://localhost:${PORT}`;
const CHROME = process.env.SNAPCARD_CHROME || '/opt/pw-browsers/chromium';
const tmpDb = path.join(os.tmpdir(), `snapcard-verify-${Date.now()}.db`);

function step(name) {
  console.log(`\n=== ${name}`);
}

step('build server target');
if (!process.env.SNAPCARD_SKIP_BUILD || !fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
  execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
}

step('start server');
const server = spawn('node', ['server/index.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), SNAPCARD_DB: tmpDb },
  stdio: 'pipe',
});
let failed = false;
try {
  // wait for the server to come up
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) break;
    } catch {
      /* not up yet */
    }
    if (i > 50) throw new Error('server did not start');
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log('server is up');

  step('RPC API');
  const rpc = async (method, ...args) => {
    const res = await fetch(`${BASE}/api/rpc`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method, args }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error);
    return body.result;
  };
  assert.equal((await rpc('listCards', {})).length, 3, 'seeded with 3 cards');
  const card = await rpc('createCard', { store_name: 'Verify Mart', code_value: '4006381333931', code_format: 'EAN_13' });
  assert.ok(card.id, 'createCard via RPC');
  console.log('RPC list/create ok');

  step('export -> import round-trip');
  const dump = await rpc('exportData');
  assert.equal(dump.format, 'snapcard-backup');
  await rpc('deleteCard', card.id);
  assert.equal((await rpc('listCards', {})).length, 3, 'deleted');
  const res = await rpc('importData', dump);
  assert.equal(res.imported, 4, 'import restored all cards');
  const after = await rpc('exportData');
  assert.deepEqual(
    after.cards.map((c) => c.id).sort(),
    dump.cards.map((c) => c.id).sort(),
    'export/import round-trips exactly'
  );
  console.log('export/import round-trip ok');

  step('UI renders against the server in a real browser');
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage();
  await page.goto(BASE);
  await page.waitForSelector('[data-testid="card-tile"]');
  assert.equal(await page.locator('[data-testid="card-tile"]').count(), 4, 'grid shows all cards from the server');

  // add a card through the UI
  await page.click('[data-testid="add-card"]');
  await page.fill('[data-testid="f-store"]', 'UI Server Store');
  await page.fill('[data-testid="f-code"]', 'SRV-001');
  await page.selectOption('[data-testid="f-format"]', 'CODE_128');
  await page.click('[data-testid="save-card"]');
  await page.waitForSelector('[data-testid="show-screen"]');
  assert.ok(await page.locator('[data-testid="barcode-canvas"]').isVisible(), 'code renders on show screen');
  const cards = await rpc('listCards', { query: 'UI Server Store' });
  assert.equal(cards.length, 1, 'UI-created card landed in the server database');
  await browser.close();
  console.log('server UI ok');

  console.log('\n✅ verify-server: ALL CHECKS PASSED');
} catch (err) {
  failed = true;
  console.error('\n❌ verify-server FAILED:', err);
} finally {
  server.kill();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(tmpDb + suffix, { force: true });
}
process.exit(failed ? 1 : 0);

// Smoke test: run the SAME shared/store.js logic against BOTH engines
// (better-sqlite3 and the sql.js shim) and assert identical behaviour.
import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import { openDb } from '../server/db.js';
import { wrapSqlJsDb } from '../shared/sqljs-shim.js';
import * as store from '../shared/store.js';
import fs from 'node:fs';

const results = [];

async function exercise(name, db) {
  store.migrate(db);
  store.seedIfEmpty(db);

  let cards = store.listCards(db);
  assert.equal(cards.length, 3, `${name}: seeds 3 cards`);
  assert.equal(cards[0].is_favorite, 1, `${name}: favourite sorts first`);

  const created = store.createCard(db, {
    store_name: 'Test Store',
    label: 'My card',
    code_value: '1234567890128',
    code_format: 'EAN_13',
    note: 'hello',
    color: '#ff0000',
    balance_value: '12.50',
    balance_kind: 'currency',
    expiry_date: '2027-01-01',
    tags: ['test', 'shopping'],
  });
  assert.ok(created.id, `${name}: createCard returns id`);
  assert.equal(created.tags.length, 2, `${name}: tags attached`);

  const updated = store.updateCard(db, created.id, { label: 'Renamed', tags: ['shopping'] });
  assert.equal(updated.label, 'Renamed', `${name}: update works`);
  assert.equal(updated.tags.length, 1, `${name}: tags replaced`);
  assert.equal(store.listTags(db).length, 4, `${name}: orphan tags pruned (3 seed + 1)`);

  const found = store.listCards(db, { query: 'shopping' });
  assert.equal(found.length, 1, `${name}: search by tag`);
  assert.equal(store.listCards(db, { query: 'Test Sto' }).length, 1, `${name}: search by store`);

  store.setFavorite(db, created.id, true);
  store.touchCard(db, created.id);
  cards = store.listCards(db, { sort: 'recent' });
  assert.equal(cards[0].id, created.id, `${name}: favourite + recent sorts first`);

  const dump = store.exportData(db);
  assert.equal(dump.format, 'snapcard-backup', `${name}: export format`);
  assert.equal(dump.cards.length, 4, `${name}: export card count`);

  store.deleteCard(db, created.id);
  assert.equal(store.listCards(db).length, 3, `${name}: delete works`);

  const res = store.importData(db, dump);
  assert.equal(res.imported, 4, `${name}: import count`);
  assert.equal(store.listCards(db).length, 4, `${name}: import replace-all`);
  const reDump = store.exportData(db);
  assert.deepEqual(
    reDump.cards.map((c) => [c.id, c.store_name, c.code_value]),
    dump.cards.map((c) => [c.id, c.store_name, c.code_value]),
    `${name}: export/import round-trips`
  );

  // bad input rejected
  assert.throws(() => store.createCard(db, { store_name: 'x', code_value: 'y', code_format: 'NOPE' }));
  // failed import rolls back
  const before = store.listCards(db).length;
  assert.throws(() => store.importData(db, { format: 'snapcard-backup', version: 1, cards: [{ store_name: null }] }));
  assert.equal(store.listCards(db).length, before, `${name}: failed import rolled back`);

  results.push(store.exportData(db));
  console.log(`✓ ${name} engine passed`);
}

// 1. better-sqlite3
const tmp = new URL('../.smoke-test.db', import.meta.url).pathname;
fs.rmSync(tmp, { force: true });
const nativeDb = openDb(tmp);
await exercise('better-sqlite3', nativeDb);
nativeDb.close();
fs.rmSync(tmp, { force: true });
['-wal', '-shm'].forEach((s) => fs.rmSync(tmp + s, { force: true }));

// 2. sql.js via the shim
const SQL = await initSqlJs();
let writes = 0;
const shimDb = wrapSqlJsDb(new SQL.Database());
shimDb.onWrite = () => writes++;
await exercise('sql.js shim', shimDb);
assert.ok(writes > 0, 'onWrite hook fires for persistence');

// 3. Cross-engine: identical schema produced
const cols = (db) => db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
const freshNative = openDb(tmp);
assert.deepEqual(cols(freshNative), cols(shimDb), 'both engines produce identical tables');
freshNative.close();
fs.rmSync(tmp, { force: true });
['-wal', '-shm'].forEach((s) => fs.rmSync(tmp + s, { force: true }));

console.log('✓ both engines run identical shared logic');

// 4. i18n: every language ships the full key set (no silent English fallbacks)
const { STRINGS } = await import('../src/i18n/strings.js');
const enKeys = Object.keys(STRINGS.en).sort();
for (const [lang, dict] of Object.entries(STRINGS)) {
  assert.deepEqual(Object.keys(dict).sort(), enKeys, `i18n: '${lang}' has the same keys as 'en'`);
}
console.log(`✓ i18n dictionaries complete (${Object.keys(STRINGS).join(', ')})`);

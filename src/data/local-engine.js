// Standalone (no-server) engine: sql.js (SQLite compiled to WebAssembly)
// running entirely in the browser, persisted to IndexedDB. Only ever loaded
// by the standalone build, via dynamic import in client.js.
import { wrapSqlJsDb } from '../../shared/sqljs-shim.js';
import * as store from '../../shared/store.js';

const IDB_NAME = 'snapcard';
const IDB_STORE = 'sqlite';
const IDB_KEY = 'main';
const PERSIST_DEBOUNCE_MS = 500;

let db = null;
let persistTimer = null;
let dirty = false;
export let storagePersisted = null; // result of navigator.storage.persist(), for Settings

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbLoad() {
  const idb = await idbOpen();
  try {
    return await new Promise((resolve, reject) => {
      const req = idb.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    idb.close();
  }
}

async function idbSave(bytes) {
  const idb = await idbOpen();
  try {
    await new Promise((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(bytes, IDB_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    idb.close();
  }
}

async function persistNow() {
  if (!db || !dirty) return;
  dirty = false;
  clearTimeout(persistTimer);
  persistTimer = null;
  await idbSave(db.export());
}

function schedulePersist() {
  dirty = true;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, PERSIST_DEBOUNCE_MS);
}

export async function initLocalEngine() {
  // Dynamic imports keep sql.js and its wasm out of the server build.
  const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([
    import('sql.js'),
    import('sql.js/dist/sql-wasm.wasm?url'),
  ]);
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });

  const saved = await idbLoad();
  db = wrapSqlJsDb(saved ? new SQL.Database(new Uint8Array(saved)) : new SQL.Database());
  store.migrate(db);
  store.seedIfEmpty(db);
  db.onWrite = schedulePersist;
  await idbSave(db.export()); // make sure the seeded/migrated database is on disk

  // Flush pending writes when the tab hides or unloads (iOS especially).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistNow();
  });
  window.addEventListener('pagehide', () => persistNow());

  // Ask the browser for durable storage and surface the answer in Settings.
  // Exposed on window because the UI must not import this module statically
  // (that would pull sql.js into the server build).
  if (navigator.storage?.persist) {
    try {
      storagePersisted = await navigator.storage.persist();
    } catch {
      storagePersisted = null;
    }
  }
  window.__snapcardStoragePersisted = storagePersisted;

  const callLocal = async (method, ...args) => {
    const fn = store.rpcMethods[method];
    if (!fn) throw new Error(`unknown method: ${method}`);
    const result = fn(db, ...args);
    // Durability before the UI moves on: if this call wrote anything, flush to
    // IndexedDB now. Otherwise a save followed by a quick reload/navigation
    // races the debounce timer and loses the write.
    if (dirty) await persistNow();
    return result;
  };
  // Exposed for the verification scripts (scripts/verify-*.mjs).
  window.__snapcardCall = callLocal;
  return callLocal;
}

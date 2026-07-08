// The ONE module that decides where data calls go. The flag is statically
// defined in vite.config.js, so the unused branch is tree-shaken:
//   - server build:     fetch() to the Express RPC endpoint
//   - standalone build: the in-browser sql.js engine (dynamically imported so
//     no wasm ever lands in the server build)
const STANDALONE = import.meta.env.VITE_STANDALONE === 'true';

// Card-data mutations that should refresh the UI and (when enabled) trigger
// auto-backup. Deliberately excludes setMeta: backupNow itself writes meta
// (last_backup_at), and counting that as a data change would loop auto-backup.
const MUTATING = new Set([
  'createCard',
  'updateCard',
  'deleteCard',
  'setFavorite',
  'setCardTags',
  'importData',
]);

let localCall = null;

export class ServerUnreachableError extends Error {}

export async function initData() {
  if (STANDALONE) {
    const mod = await import('./local-engine.js');
    localCall = await mod.initLocalEngine();
  } else {
    let res;
    try {
      res = await fetch(`${import.meta.env.BASE_URL}api/health`);
    } catch {
      throw new ServerUnreachableError('cannot reach the Snapcard server');
    }
    if (!res.ok) throw new ServerUnreachableError('cannot reach the Snapcard server');
  }
}

export async function call(method, ...args) {
  let result;
  if (STANDALONE) {
    if (!localCall) throw new Error('data layer not initialised');
    result = localCall(method, ...args);
  } else {
    let res;
    try {
      res = await fetch(`${import.meta.env.BASE_URL}api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method, args }),
      });
    } catch {
      throw new ServerUnreachableError('cannot reach the Snapcard server');
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `RPC failed (${res.status})`);
    }
    result = (await res.json()).result;
  }
  if (MUTATING.has(method)) notifyDataChanged();
  return result;
}

export function notifyDataChanged() {
  window.dispatchEvent(new CustomEvent('snapcard:data-changed'));
}

export function onDataChanged(handler) {
  window.addEventListener('snapcard:data-changed', handler);
  return () => window.removeEventListener('snapcard:data-changed', handler);
}

export const isStandalone = STANDALONE;

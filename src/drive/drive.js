// Google Drive backup module — ONE implementation used by both builds.
// The JSON body comes from the shared store (via the data client), so the
// server build reads/writes through RPC and the standalone build through the
// in-browser engine, but the Drive logic here is identical.
//
// Contained, opt-in layer: nothing in this module runs (and the GIS script is
// not even loaded) until the user opens the Drive section and signs in.
import { call } from '../data/client.js';
import { encryptJson, decryptJson, isEncryptedPayload } from './crypto.js';

export const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
export const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const API = 'https://www.googleapis.com';
const TOKEN_KEY = 'snapcard.gtoken';
const PASS_KEY = 'snapcard.drivepass';
const REDIRECT_PENDING_KEY = 'snapcard.oauth-pending';

export function isDriveConfigured() {
  return Boolean(CLIENT_ID);
}

// --- token handling --------------------------------------------------------

function readToken() {
  try {
    const { token, exp } = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null') || {};
    if (token && exp && Date.now() < exp - 30000) return token;
  } catch {
    /* fall through */
  }
  return null;
}

function saveToken(token, expiresInSec) {
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, exp: Date.now() + expiresInSec * 1000 }));
}

export function isSignedIn() {
  return Boolean(readToken());
}

function isIosStandalone() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standaloneDisplay = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone;
  return ios && Boolean(standaloneDisplay);
}

// Lazily inject the Google Identity Services script — only when the user
// actually signs in, so a signed-out user triggers zero external calls.
function loadGis() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve(window.google.accounts.oauth2);
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve(window.google.accounts.oauth2);
    s.onerror = () => reject(new Error('failed to load Google sign-in'));
    document.head.appendChild(s);
  });
}

function popupSignIn() {
  return loadGis().then(
    (oauth2) =>
      new Promise((resolve, reject) => {
        const client = oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPE,
          callback: (resp) => {
            if (resp.error) return reject(new Error(resp.error));
            saveToken(resp.access_token, Number(resp.expires_in) || 3600);
            resolve(resp.access_token);
          },
          error_callback: (err) => reject(new Error(err?.type || 'sign-in failed')),
        });
        client.requestAccessToken();
      })
  );
}

// Redirect-based OAuth for installed iOS web apps, where popups often fail.
function redirectSignIn() {
  const redirectUri = window.location.origin + import.meta.env.BASE_URL;
  sessionStorage.setItem(REDIRECT_PENDING_KEY, window.location.pathname + window.location.search);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: SCOPE,
    include_granted_scopes: 'true',
    state: 'snapcard-oauth',
  });
  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  return new Promise(() => {}); // navigation takes over
}

// Called once at boot (before the router mounts) to pick up a redirect return.
// Returns the in-app path to restore, or null when this boot is not an OAuth return.
export function consumeRedirectToken() {
  if (!window.location.hash.includes('access_token=')) return null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (params.get('state') !== 'snapcard-oauth') return null;
  saveToken(params.get('access_token'), Number(params.get('expires_in')) || 3600);
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  const back = sessionStorage.getItem(REDIRECT_PENDING_KEY);
  sessionStorage.removeItem(REDIRECT_PENDING_KEY);
  return back || null;
}

export async function signIn() {
  if (!isDriveConfigured()) throw new Error('drive-not-configured');
  const cached = readToken();
  if (cached) return cached;
  return isIosStandalone() ? redirectSignIn() : popupSignIn();
}

export async function signOut() {
  const token = readToken();
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(PASS_KEY);
  if (token) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' });
    } catch {
      /* token simply expires */
    }
  }
}

// Access tokens are short-lived: on 401, drop the token and re-authorise once
// without losing app state (popup path; redirect path resumes after boot).
async function driveFetch(url, opts = {}, retried = false) {
  const token = readToken() || (await signIn());
  const res = await fetch(url, {
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 && !retried) {
    sessionStorage.removeItem(TOKEN_KEY);
    return driveFetch(url, opts, true);
  }
  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => '');
    throw new Error(`Drive ${res.status}: ${body.slice(0, 200)}`);
  }
  return res;
}

// --- passphrase (kept only for this browser session, never uploaded) --------

export function getPassphrase() {
  return sessionStorage.getItem(PASS_KEY) || '';
}

export function setPassphrase(pass) {
  if (pass) sessionStorage.setItem(PASS_KEY, pass);
  else sessionStorage.removeItem(PASS_KEY);
}

// --- one backup file in Drive ----------------------------------------------

const PLAIN_NAME = 'snapcard-backup.json';
const ENC_NAME = 'snapcard-backup.enc';

async function findBackupFile() {
  const q = encodeURIComponent(`(name = '${PLAIN_NAME}' or name = '${ENC_NAME}') and trashed = false`);
  const res = await driveFetch(`${API}/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)&spaces=drive`);
  if (res.status === 404) return null;
  const { files } = await res.json();
  return files?.[0] || null;
}

async function resolveFileId() {
  const storedId = await call('getMeta', 'drive_file_id');
  if (storedId) {
    const res = await driveFetch(`${API}/drive/v3/files/${storedId}?fields=id,name,modifiedTime`);
    if (res.status !== 404) return res.json();
    await call('setMeta', 'drive_file_id', null); // stale id (file deleted in Drive)
  }
  const found = await findBackupFile();
  if (found) await call('setMeta', 'drive_file_id', found.id);
  return found;
}

function multipartBody(metadata, content, contentType) {
  const boundary = 'snapcard-multipart';
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n` +
    `${content}\r\n--${boundary}--`;
  return { body, type: `multipart/related; boundary=${boundary}` };
}

// Upload the current data as the single Drive backup file (create or update in place).
export async function backupNow() {
  const data = await call('exportData');
  const encrypt = (await call('getMeta', 'drive_encrypt')) === '1';
  let content, name;
  if (encrypt) {
    const pass = getPassphrase();
    if (!pass) throw new Error('need-passphrase');
    content = await encryptJson(data, pass);
    name = ENC_NAME;
  } else {
    content = JSON.stringify(data);
    name = PLAIN_NAME;
  }

  const existing = await resolveFileId();
  const { body, type } = multipartBody({ name, mimeType: 'application/json' }, content, 'application/json');
  const url = existing
    ? `${API}/upload/drive/v3/files/${existing.id}?uploadType=multipart&fields=id,name,modifiedTime`
    : `${API}/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime`;
  const res = await driveFetch(url, {
    method: existing ? 'PATCH' : 'POST',
    headers: { 'Content-Type': type },
    body,
  });
  const file = await res.json();
  await call('setMeta', 'drive_file_id', file.id);
  await call('setMeta', 'last_backup_at', new Date().toISOString());
  return file;
}

// Download + parse (and decrypt if needed) the Drive backup without importing it.
export async function fetchBackup() {
  const file = await resolveFileId();
  if (!file) return null;
  const res = await driveFetch(`${API}/drive/v3/files/${file.id}?alt=media`);
  if (res.status === 404) return null;
  const text = await res.text();
  let data;
  if (isEncryptedPayload(text)) {
    const pass = getPassphrase();
    if (!pass) throw new Error('need-passphrase');
    try {
      data = await decryptJson(text, pass);
    } catch {
      throw new Error('wrong-passphrase');
    }
  } else {
    data = JSON.parse(text);
  }
  return { file, data };
}

// Replace-all import of the Drive backup (same import path as local import).
export async function restoreFromDrive(data) {
  return call('importData', data);
}

// --- auto-backup (opt-in, debounced after data changes) ---------------------

let autoTimer = null;

export function initAutoBackup(onDataChanged) {
  onDataChanged(async () => {
    if (!isDriveConfigured() || !isSignedIn()) return;
    if ((await call('getMeta', 'drive_auto_backup')) !== '1') return;
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
      backupNow().catch(() => {
        /* auto-backup is best-effort; manual backup surfaces errors */
      });
    }, 5000);
  });
}

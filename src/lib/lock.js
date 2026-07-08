// App lock: PIN hash stored in app_meta, plus optional biometric unlock via a
// WebAuthn platform authenticator. Everything is local; nothing leaves the device.
import { call } from '../data/client.js';

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function pinHash(pin) {
  const deviceId = await call('getMeta', 'device_id');
  return sha256Hex(`snapcard:${deviceId}:${pin}`);
}

export async function isLockEnabled() {
  return Boolean(await call('getMeta', 'app_lock_pin_hash'));
}

export async function setPin(pin) {
  await call('setMeta', 'app_lock_pin_hash', await pinHash(pin));
}

export async function verifyPin(pin) {
  const stored = await call('getMeta', 'app_lock_pin_hash');
  return stored !== null && stored === (await pinHash(pin));
}

export async function removeLock() {
  await call('setMeta', 'app_lock_pin_hash', null);
  await call('setMeta', 'app_lock_webauthn_id', null);
}

// --- optional biometric unlock -------------------------------------------

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function biometricsAvailable() {
  return typeof window.PublicKeyCredential !== 'undefined';
}

export async function enrollBiometric() {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'Snapcard' },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: 'snapcard-user',
        displayName: 'Snapcard',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'discouraged',
      },
      timeout: 60000,
    },
  });
  await call('setMeta', 'app_lock_webauthn_id', b64(cred.rawId));
  return true;
}

export async function hasBiometricEnrolled() {
  return Boolean(await call('getMeta', 'app_lock_webauthn_id'));
}

export async function unenrollBiometric() {
  await call('setMeta', 'app_lock_webauthn_id', null);
}

export async function biometricUnlock() {
  const idB64 = await call('getMeta', 'app_lock_webauthn_id');
  if (!idB64) return false;
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [{ type: 'public-key', id: unb64(idB64) }],
      userVerification: 'required',
      timeout: 60000,
    },
  });
  return Boolean(assertion);
}

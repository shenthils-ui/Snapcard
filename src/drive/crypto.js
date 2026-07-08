// Optional client-side encryption for Drive backups: AES-GCM with a key
// derived from the user's passphrase via PBKDF2 (WebCrypto only, no libraries).
// When enabled, Google never sees readable card data.
const ITERATIONS = 310000;

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(passphrase, salt) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptJson(obj, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(obj));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return JSON.stringify({
    snapcard_encrypted: 1,
    kdf: 'PBKDF2-SHA256',
    iterations: ITERATIONS,
    salt: b64(salt),
    iv: b64(iv),
    data: b64(ciphertext),
  });
}

export function isEncryptedPayload(text) {
  try {
    return JSON.parse(text)?.snapcard_encrypted === 1;
  } catch {
    return false;
  }
}

export async function decryptJson(text, passphrase) {
  const env = JSON.parse(text);
  if (env.snapcard_encrypted !== 1) throw new Error('not an encrypted Snapcard payload');
  const key = await deriveKey(passphrase, unb64(env.salt));
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, key, unb64(env.data));
  return JSON.parse(new TextDecoder().decode(plaintext));
}

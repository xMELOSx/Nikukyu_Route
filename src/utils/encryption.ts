import { AUTHOR_TAMPERED, AUTHOR_DEFAULT_PLAIN, AUTHOR_UNKNOWN_MARKER, RENDER_CACHE_KEY } from './constants'

const AES_GCM_PREFIX = 'v2:';
const AES_GCM_LEGACY_PREFIX = 'legacy:';
const IV_BYTES = 12;

async function deriveAesKey(passphrase: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const subtle = (typeof crypto !== 'undefined' ? crypto.subtle : null);
  if (!subtle || !subtle.importKey) {
    throw new Error('Web Crypto API が利用できない環境です');
  }
  const passphraseBytes = enc.encode(passphrase);
  const hashBuf = await subtle.digest('SHA-256', passphraseBytes);
  return subtle.importKey(
    'raw', hashBuf, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function aesGcmEncrypt(plain: string, passphrase: string): Promise<string> {
  if (!plain) return aesGcmEncrypt(AUTHOR_DEFAULT_PLAIN, passphrase);
  const subtle = (typeof crypto !== 'undefined' ? crypto.subtle : null);
  if (!subtle) throw new Error('Web Crypto API が利用できない環境です');
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveAesKey(passphrase);
  const enc = new TextEncoder();
  const cipherBuf = await subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new Uint8Array() },
    key, enc.encode(plain)
  );
  const cipher = new Uint8Array(cipherBuf);
  const out = new Uint8Array(IV_BYTES + cipher.length);
  out.set(iv, 0);
  out.set(cipher, IV_BYTES);
  return AES_GCM_PREFIX + bytesToBase64(out);
}

export async function aesGcmDecrypt(encoded: string, passphrase: string): Promise<string> {
  if (!encoded) return '';
  if (encoded === AUTHOR_UNKNOWN_MARKER) return AUTHOR_TAMPERED;
  if (encoded.startsWith(AES_GCM_PREFIX)) {
    try {
      const subtle = (typeof crypto !== 'undefined' ? crypto.subtle : null);
      if (!subtle) return AUTHOR_TAMPERED;
      const payload = base64ToBytes(encoded.slice(AES_GCM_PREFIX.length));
      if (payload.length < IV_BYTES + 16) return AUTHOR_TAMPERED;
      const iv = payload.slice(0, IV_BYTES);
      const cipher = payload.slice(IV_BYTES);
      const key = await deriveAesKey(passphrase);
      const plainBuf = await subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData: new Uint8Array() },
        key, cipher
      );
      return new TextDecoder().decode(plainBuf);
    } catch {
      return AUTHOR_TAMPERED;
    }
  }
  if (encoded.startsWith(AES_GCM_LEGACY_PREFIX)) {
    const legacyPayload = encoded.slice(AES_GCM_LEGACY_PREFIX.length);
    const plain = legacyXorDecrypt(legacyPayload, passphrase);
    return plain || AUTHOR_TAMPERED;
  }
  const plain = legacyXorDecrypt(encoded, passphrase);
  return plain || AUTHOR_TAMPERED;
}

function legacyXorDecrypt(encoded: string, key: string): string {
  if (!encoded) return '';
  try {
    const decoded = decodeURIComponent(escape(atob(encoded)));
    let result = '';
    for (let i = 0; i < decoded.length; i++) {
      result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
  } catch {
    return '';
  }
}

export function xorDecrypt(encoded: string, key: string): string {
  if (!encoded) return '';
  if (encoded.startsWith(AES_GCM_PREFIX) || encoded.startsWith(AES_GCM_LEGACY_PREFIX)) {
    return AUTHOR_TAMPERED;
  }
  return legacyXorDecrypt(encoded, key) || AUTHOR_TAMPERED;
}

export function xorEncrypt(plain: string, key: string): string {
  if (!plain) return '';
  let result = '';
  for (let i = 0; i < plain.length; i++) {
    result += String.fromCharCode(plain.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(unescape(encodeURIComponent(result)));
}

function deriveKey(baseKey: string, routeId: string, createdAt: number): string {
  return baseKey + '|' + routeId + '|' + String(createdAt);
}

export function getOriginalAuthorKey(routeId: string, createdAt: number): string {
  return deriveKey(RENDER_CACHE_KEY, routeId, createdAt);
}

export const getRenderCacheKey = getOriginalAuthorKey;

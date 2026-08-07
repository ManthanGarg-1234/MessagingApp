/**
 * End-to-end encryption helpers for Baatein.
 *
 * Primitives: X25519 key agreement + XSalsa20-Poly1305 authenticated encryption,
 * via tweetnacl (same primitive family as libsodium / Signal's underlying crypto).
 *
 * Design:
 *  - Each device generates a long-term identity keypair on first run.
 *  - The PRIVATE key never leaves the device (kept in IndexedDB, optionally
 *    wrapped with a passphrase-derived key before persisting).
 *  - During pairing, two devices exchange PUBLIC keys and each derives the
 *    same shared secret locally via nacl.box.before().
 *  - Every message gets a fresh random 24-byte nonce; nonce + ciphertext are
 *    sent together, the server never sees plaintext or private keys.
 */

import nacl from "tweetnacl";
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from "tweetnacl-util";

export interface KeyPairB64 {
  publicKey: string; // base64
  secretKey: string; // base64
}

export interface EncryptedPayload {
  ciphertext: string; // base64
  nonce: string; // base64
}

/** Generate a new X25519 identity keypair (call once per device, on first run). */
export function generateIdentityKeyPair(): KeyPairB64 {
  const kp = nacl.box.keyPair();
  return {
    publicKey: encodeBase64(kp.publicKey),
    secretKey: encodeBase64(kp.secretKey),
  };
}

/**
 * Derive the shared secret for a conversation once both public keys are known.
 * Both sides compute the same value independently — it is never transmitted.
 */
export function deriveSharedKey(theirPublicKeyB64: string, mySecretKeyB64: string): Uint8Array {
  const theirPublicKey = decodeBase64(theirPublicKeyB64);
  const mySecretKey = decodeBase64(mySecretKeyB64);
  return nacl.box.before(theirPublicKey, mySecretKey);
}

/** Encrypt a plaintext string with a precomputed shared key. */
export function encryptMessage(plaintext: string, sharedKey: Uint8Array): EncryptedPayload {
  const nonce = nacl.randomBytes(nacl.box.nonceLength); // 24 bytes, unique per message
  const messageBytes = decodeUTF8(plaintext);
  const ciphertext = nacl.box.after(messageBytes, nonce, sharedKey);

  return {
    ciphertext: encodeBase64(ciphertext),
    nonce: encodeBase64(nonce),
  };
}

/** Decrypt a payload received from the server. Throws if tampered or wrong key. */
export function decryptMessage(payload: EncryptedPayload, sharedKey: Uint8Array): string {
  const ciphertext = decodeBase64(payload.ciphertext);
  const nonce = decodeBase64(payload.nonce);
  const plaintextBytes = nacl.box.open.after(ciphertext, nonce, sharedKey);

  if (!plaintextBytes) {
    throw new Error("Decryption failed: message may be corrupted or tampered with");
  }
  return encodeUTF8(plaintextBytes);
}

/**
 * Encrypt an arbitrary binary chunk (used for media chunk-level encryption).
 * Returns raw bytes ready to upload, plus the nonce needed to decrypt it.
 */
export function encryptChunk(chunk: Uint8Array, sharedKey: Uint8Array): { data: Uint8Array; nonce: Uint8Array } {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const data = nacl.box.after(chunk, nonce, sharedKey);
  return { data, nonce };
}

export function decryptChunk(data: Uint8Array, nonce: Uint8Array, sharedKey: Uint8Array): Uint8Array {
  const result = nacl.box.open.after(data, nonce, sharedKey);
  if (!result) throw new Error("Chunk decryption failed");
  return result;
}

/* ---------------------------------------------------------------------
 * Local key storage (IndexedDB). Kept minimal here; in production wrap
 * `secretKey` with a passphrase-derived key (e.g. via WebCrypto PBKDF2)
 * before persisting, so a stolen device backup alone isn't enough.
 * ------------------------------------------------------------------- */

const DB_NAME = "baatein-keys";
const STORE_NAME = "identity";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveIdentityKeyPair(kp: KeyPairB64): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(kp, "self");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadIdentityKeyPair(): Promise<KeyPairB64 | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get("self");
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

/** Ensures a device always has an identity keypair, generating one on first use. */
export async function getOrCreateIdentityKeyPair(): Promise<KeyPairB64> {
  const existing = await loadIdentityKeyPair();
  if (existing) return existing;
  const kp = generateIdentityKeyPair();
  await saveIdentityKeyPair(kp);
  return kp;
}

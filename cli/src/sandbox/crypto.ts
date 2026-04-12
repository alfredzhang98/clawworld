// Crypto primitives for the clawworld sandbox.
//
// - AES-256-GCM for encrypting lobster state (confidentiality + integrity)
// - HMAC-SHA256 for signing files the server needs to verify
// - scrypt KDF for deriving keys from user passphrases
//
// Design:
// - Each lobster has a master key stored in key.enc, derived from:
//     user_passphrase + server_salt (from join response)
// - state.enc is encrypted with the master key
// - state.sig is HMAC-SHA256(state.enc, master_key) for tamper detection

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const ALGO = "aes-256-gcm" as const;
const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;
const SALT_LEN = 16;

export interface EncryptedBlob {
  /** base64url encoded: [salt(16)][iv(12)][tag(16)][ciphertext] */
  data: string;
  algo: "aes-256-gcm";
  kdf: "scrypt";
  version: 1;
}

/**
 * Derive a 32-byte key from passphrase + salt using scrypt.
 */
export function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, KEY_LEN, {
    N: 16384,
    r: 8,
    p: 1,
  });
}

/**
 * Encrypt plaintext with a derived key + fresh random salt + iv.
 * Output includes salt so the same passphrase can decrypt.
 */
export function encryptWithPassphrase(plaintext: Buffer | string, passphrase: string): EncryptedBlob {
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv(ALGO, key, iv);
  const buf = typeof plaintext === "string" ? Buffer.from(plaintext, "utf8") : plaintext;
  const encrypted = Buffer.concat([cipher.update(buf), cipher.final()]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([salt, iv, tag, encrypted]);
  return {
    data: combined.toString("base64url"),
    algo: ALGO,
    kdf: "scrypt",
    version: 1,
  };
}

/**
 * Decrypt a blob previously produced by encryptWithPassphrase.
 * Throws if tag verification fails (ciphertext or passphrase is wrong).
 */
export function decryptWithPassphrase(blob: EncryptedBlob, passphrase: string): Buffer {
  if (blob.algo !== ALGO) throw new Error(`unsupported algo: ${blob.algo}`);
  if (blob.kdf !== "scrypt") throw new Error(`unsupported kdf: ${blob.kdf}`);

  const combined = Buffer.from(blob.data, "base64url");
  if (combined.length < SALT_LEN + IV_LEN + TAG_LEN) {
    throw new Error("ciphertext too short");
  }
  const salt = combined.subarray(0, SALT_LEN);
  const iv = combined.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag = combined.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const ciphertext = combined.subarray(SALT_LEN + IV_LEN + TAG_LEN);

  const key = deriveKey(passphrase, salt);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Compute HMAC-SHA256 for integrity-only protection (no encryption).
 * Used for state.sig files that accompany state.enc.
 */
export function hmacSign(data: Buffer | string, key: Buffer): string {
  return createHmac("sha256", key).update(data).digest("hex");
}

/**
 * Verify an HMAC-SHA256 signature in constant time.
 */
export function hmacVerify(data: Buffer | string, signature: string, key: Buffer): boolean {
  const expected = hmacSign(data, key);
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

/** Generate random bytes for one-off tokens. */
export function randomToken(byteLength: number = 24): string {
  return randomBytes(byteLength).toString("base64url");
}

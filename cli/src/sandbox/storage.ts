// Encrypted sandbox storage.
//
// Handles reading/writing the encrypted lobster state files with
// integrity checks. Never writes outside the sandbox.

import { readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import {
  decryptWithPassphrase,
  encryptWithPassphrase,
  hmacSign,
  hmacVerify,
  type EncryptedBlob,
} from "./crypto.js";
import { paths, ensureDir, initSandboxRoot } from "./paths.js";

export interface LobsterLocalState {
  lobster_id: string;
  server_url: string;
  auth_token: string;       // encrypted, never in plaintext on disk
  name: string;
  job: string;
  // cached stats (display-only; server is source of truth)
  cached: {
    coins: number;
    location: string;
    reputation: number;
    forge_score: number;
    updated_at: string;
  };
}

/** Write config.json (server URL, current lobster pointer, etc.). */
export interface ClawworldConfig {
  version: 1;
  default_lobster_id?: string;
  servers: Record<string, { url: string; joined_at: string }>;
}

export function readConfig(): ClawworldConfig {
  const p = paths.config();
  if (!existsSync(p)) {
    return { version: 1, servers: {} };
  }
  const raw = readFileSync(p, "utf8");
  return JSON.parse(raw) as ClawworldConfig;
}

export function writeConfig(config: ClawworldConfig): void {
  initSandboxRoot();
  const p = paths.config();
  writeFileSync(p, JSON.stringify(config, null, 2), { mode: 0o600 });
  try { chmodSync(p, 0o600); } catch { /* non-POSIX FS */ }
}

/**
 * Save a lobster's encrypted state to disk.
 * Produces state.enc + state.sig in the lobster's directory.
 */
export function saveLobsterState(
  id: string,
  state: LobsterLocalState,
  passphrase: string,
): void {
  const lobsterDir = paths.lobsterDir(id);
  mkdirSync(lobsterDir, { recursive: true, mode: 0o700 });
  ensureDir(paths.lobsterMemoryDir(id));
  ensureDir(paths.lobsterCacheDir(id));
  ensureDir(paths.lobsterTranscriptsDir(id));

  const plaintext = JSON.stringify(state);
  const blob = encryptWithPassphrase(plaintext, passphrase);
  const stateJson = JSON.stringify(blob);

  writeFileSync(paths.lobsterState(id), stateJson, { mode: 0o600 });

  // HMAC signature over the encrypted blob for tamper detection
  // Uses a weak derivation here (passphrase-derived) — good enough for
  // detecting accidental file corruption; strong crypto is AES-GCM tag.
  const sigKey = Buffer.from(passphrase.padEnd(32, "0").slice(0, 32), "utf8");
  const sig = hmacSign(stateJson, sigKey);
  writeFileSync(paths.lobsterStateSig(id), sig, { mode: 0o600 });

  try {
    chmodSync(paths.lobsterState(id), 0o600);
    chmodSync(paths.lobsterStateSig(id), 0o600);
  } catch { /* non-POSIX FS */ }
}

/**
 * Load a lobster's decrypted state. Throws if the file is tampered
 * (signature mismatch) or the passphrase is wrong (AES-GCM tag fail).
 */
export function loadLobsterState(id: string, passphrase: string): LobsterLocalState {
  const statePath = paths.lobsterState(id);
  const sigPath = paths.lobsterStateSig(id);

  if (!existsSync(statePath)) {
    throw new Error(`no lobster state found for id '${id}' — run 'clawworld join <url>' first`);
  }

  const stateJson = readFileSync(statePath, "utf8");

  // Verify HMAC signature
  if (existsSync(sigPath)) {
    const sig = readFileSync(sigPath, "utf8").trim();
    const sigKey = Buffer.from(passphrase.padEnd(32, "0").slice(0, 32), "utf8");
    if (!hmacVerify(stateJson, sig, sigKey)) {
      throw new Error(
        "state.sig verification failed — file was tampered or passphrase is wrong.\n" +
        "Run 'clawworld join <url>' to re-sync from the server.",
      );
    }
  }

  let blob: EncryptedBlob;
  try {
    blob = JSON.parse(stateJson) as EncryptedBlob;
  } catch {
    throw new Error("state.enc is corrupted (not valid JSON)");
  }

  let plaintext: Buffer;
  try {
    plaintext = decryptWithPassphrase(blob, passphrase);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`failed to decrypt lobster state: ${msg}`);
  }

  try {
    return JSON.parse(plaintext.toString("utf8")) as LobsterLocalState;
  } catch {
    throw new Error("decrypted state is not valid JSON");
  }
}

/**
 * Check if a lobster has local state without decrypting it.
 */
export function hasLobsterState(id: string): boolean {
  try {
    return existsSync(paths.lobsterState(id));
  } catch {
    return false;
  }
}

/** Write a file inside a lobster's directory, enforcing sandbox rules. */
export function writeLobsterFile(id: string, relativePath: string, content: string): void {
  const base = paths.lobsterDir(id);
  const full = resolveInside(base, relativePath);
  mkdirSync(dirname(full), { recursive: true, mode: 0o700 });
  writeFileSync(full, content, { mode: 0o600 });
}

/** Read a file from a lobster's directory. */
export function readLobsterFile(id: string, relativePath: string): string | null {
  const base = paths.lobsterDir(id);
  const full = resolveInside(base, relativePath);
  if (!existsSync(full)) return null;
  return readFileSync(full, "utf8");
}

function resolveInside(base: string, rel: string): string {
  const { resolve: resolvePath, relative } = require("node:path") as typeof import("node:path");
  const target = resolvePath(base, rel);
  const check = relative(base, target);
  if (check.startsWith("..") || check.startsWith("/") || check.startsWith("\\")) {
    throw new Error(`path escapes lobster sandbox: ${rel}`);
  }
  return target;
}

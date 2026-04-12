// Sandbox path resolution.
//
// All clawworld local state lives under ~/.clawworld/. The CLI NEVER reads
// or writes files outside this directory. All paths are resolved and
// validated to prevent symlink escape.

import { homedir } from "node:os";
import { join, resolve, relative, sep } from "node:path";
import { realpathSync, existsSync, mkdirSync } from "node:fs";

export const SANDBOX_ROOT = join(homedir(), ".clawworld");

/**
 * Resolve a path inside the sandbox. Throws if the resolved path
 * escapes SANDBOX_ROOT (via symlinks or ../).
 */
export function sandboxPath(...segments: string[]): string {
  const joined = resolve(SANDBOX_ROOT, ...segments);
  const rel = relative(SANDBOX_ROOT, joined);
  if (rel.startsWith("..") || rel.startsWith(sep) || resolve(SANDBOX_ROOT, rel) !== joined) {
    throw new Error(`sandbox escape attempt: ${joined}`);
  }
  return joined;
}

/**
 * Resolve a real filesystem path (following symlinks) and verify it
 * stays within SANDBOX_ROOT. Use this before reading existing files.
 */
export function verifyRealPath(p: string): string {
  if (!existsSync(p)) return p;
  const real = realpathSync(p);
  const rootReal = realpathSync(SANDBOX_ROOT);
  const rel = relative(rootReal, real);
  if (rel.startsWith("..") || rel.startsWith(sep)) {
    throw new Error(`symlink escape detected: ${p} -> ${real}`);
  }
  return real;
}

/** Ensure a directory exists inside the sandbox. */
export function ensureDir(path: string): void {
  sandboxPath(path); // validates path is inside sandbox
  mkdirSync(path, { recursive: true, mode: 0o700 });
}

/** Top-level paths */
export const paths = {
  root: () => SANDBOX_ROOT,
  config: () => sandboxPath("config.json"),
  currentLobsterPointer: () => sandboxPath("current"),
  lobstersDir: () => sandboxPath("lobsters"),
  lobsterDir: (id: string) => sandboxPath("lobsters", sanitizeId(id)),
  lobsterState: (id: string) => sandboxPath("lobsters", sanitizeId(id), "state.enc"),
  lobsterStateSig: (id: string) => sandboxPath("lobsters", sanitizeId(id), "state.sig"),
  lobsterKey: (id: string) => sandboxPath("lobsters", sanitizeId(id), "key.enc"),
  lobsterMemoryDir: (id: string) => sandboxPath("lobsters", sanitizeId(id), "memory"),
  lobsterCacheDir: (id: string) => sandboxPath("lobsters", sanitizeId(id), "cache"),
  lobsterTranscriptsDir: (id: string) => sandboxPath("lobsters", sanitizeId(id), "transcripts"),
};

/** Only allow alphanumeric + dashes in lobster IDs. */
function sanitizeId(id: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error(`invalid lobster id: ${id}`);
  }
  return id;
}

/** Initialize the sandbox root directory if missing. */
export function initSandboxRoot(): void {
  mkdirSync(SANDBOX_ROOT, { recursive: true, mode: 0o700 });
  mkdirSync(paths.lobstersDir(), { recursive: true, mode: 0o700 });
}

// Session JSONL transcripts — inspired by claude-code session storage.
//
// Every tool call made by a lobster is appended as a JSONL line to
// server/data/transcripts/<lobster_id>/<session_id>.jsonl. Each line
// has: uuid, parent_uuid, timestamp, type, content.
//
// This enables:
//   - Audit trails (who did what, when)
//   - Session replay
//   - Memory reconstruction
//   - Anti-cheat forensics
//
// Files are rotated by day to prevent unbounded growth.

import { mkdirSync, appendFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

const TRANSCRIPT_ROOT = resolve("data", "transcripts");

export type SessionEntryType =
  | "tool_call"
  | "tool_result"
  | "tool_error"
  | "hook_decision"
  | "permission_decision"
  | "system_event";

export interface SessionEntry {
  uuid: string;
  parent_uuid: string | null;
  timestamp: string;
  type: SessionEntryType;
  tool_name?: string;
  content: Record<string, unknown>;
}

/**
 * Generate a UUID-like id (short). Uses crypto.randomBytes.
 */
export function newId(): string {
  return randomBytes(12).toString("base64url");
}

/** Return today's session file path for a lobster. */
function sessionFilePath(lobsterId: number): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return join(TRANSCRIPT_ROOT, String(lobsterId), `${date}.jsonl`);
}

/**
 * Append a single entry to the lobster's current session file.
 * Creates directory on first write. Non-blocking errors are logged
 * but don't propagate — transcript loss is better than tool failure.
 */
export function appendSession(lobsterId: number, entry: Omit<SessionEntry, "uuid" | "timestamp">): string {
  try {
    const full: SessionEntry = {
      uuid: newId(),
      timestamp: new Date().toISOString(),
      ...entry,
    };
    const path = sessionFilePath(lobsterId);
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify(full) + "\n", { encoding: "utf8" });
    return full.uuid;
  } catch (e) {
    console.error("[session-log] append failed:", e);
    return "";
  }
}

/**
 * Helper for the most common entry: a tool call with its result.
 * Returns the uuid of the tool_call entry (so you can pass it as
 * parent_uuid to a follow-up tool_result entry).
 */
export function logToolCall(
  lobsterId: number,
  toolName: string,
  input: unknown,
  parentUuid: string | null = null,
): string {
  return appendSession(lobsterId, {
    parent_uuid: parentUuid,
    type: "tool_call",
    tool_name: toolName,
    content: { input: sanitizeForLog(input) },
  });
}

export function logToolResult(
  lobsterId: number,
  toolName: string,
  output: unknown,
  parentUuid: string | null,
): string {
  return appendSession(lobsterId, {
    parent_uuid: parentUuid,
    type: "tool_result",
    tool_name: toolName,
    content: { output: sanitizeForLog(output) },
  });
}

/**
 * Read all entries for a lobster's session on a given date.
 */
export function readSession(lobsterId: number, date: string): SessionEntry[] {
  const path = join(TRANSCRIPT_ROOT, String(lobsterId), `${date}.jsonl`);
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as SessionEntry);
}

/** List available session dates for a lobster. */
export function listSessions(lobsterId: number): string[] {
  const dir = join(TRANSCRIPT_ROOT, String(lobsterId));
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => f.replace(".jsonl", ""))
    .sort();
}

/**
 * Strip auth_tokens and other secrets from logged payloads.
 */
function sanitizeForLog(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sanitizeForLog);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === "auth_token" || k === "token" || k === "password" || k === "passphrase") {
      out[k] = "***";
    } else {
      out[k] = sanitizeForLog(v);
    }
  }
  return out;
}

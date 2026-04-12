// Authentication & lobster-card signing.
//
// PoC scope:
//   - Random bearer tokens per lobster (stored in DB).
//   - HMAC-SHA256 signatures over a canonical JSON body of stats.
//
// v1 plan: upgrade to Ed25519 per-instance keys, drop explicit auth_token
// from tool args in favor of an HTTP Authorization header once the MCP SDK's
// request context is stable across transports.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { config } from "./config.ts";
import type { Lobster } from "./types.ts";

// ---------------------------------------------------------------------------
// Server secret
// ---------------------------------------------------------------------------

let _secret: Buffer | null = null;

export function serverSecret(): Buffer {
  if (_secret) return _secret;
  mkdirSync(dirname(config.secretPath), { recursive: true });
  if (existsSync(config.secretPath)) {
    _secret = readFileSync(config.secretPath);
    return _secret;
  }
  _secret = randomBytes(32);
  writeFileSync(config.secretPath, _secret);
  try {
    chmodSync(config.secretPath, 0o600);
  } catch {
    // Non-POSIX FS — ignore
  }
  return _secret;
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

export function newLobsterToken(): string {
  return "lob_" + randomBytes(24).toString("base64url");
}

// ---------------------------------------------------------------------------
// Lobster capability card (signed)
// ---------------------------------------------------------------------------

const CARD_FIELDS = [
  "id",
  "name",
  "job",
  "coins",
  "forge_score",
  "reputation",
  "specialty",
  "badges",
  "created_at",
] as const;

type CardBody = Pick<Lobster, (typeof CARD_FIELDS)[number]>;

function canonicalBody(lobster: Lobster): Buffer {
  const body: Record<string, unknown> = {};
  for (const key of CARD_FIELDS) {
    body[key] = lobster[key];
  }
  // Stable JSON: sort keys, no whitespace.
  const sorted = Object.keys(body)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = body[k];
      return acc;
    }, {});
  return Buffer.from(JSON.stringify(sorted), "utf8");
}

export function signCard(lobster: Lobster): string {
  return createHmac("sha256", serverSecret()).update(canonicalBody(lobster)).digest("hex");
}

export function verifyCard(lobster: Lobster, signature: string): boolean {
  const expected = signCard(lobster);
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

export interface SignedCard {
  card: CardBody;
  signature: string;
  algorithm: "HMAC-SHA256";
  version: string;
}

export function buildCard(lobster: Lobster): SignedCard {
  const body = CARD_FIELDS.reduce<Partial<CardBody>>((acc, k) => {
    (acc as Record<string, unknown>)[k] = lobster[k];
    return acc;
  }, {}) as CardBody;
  return {
    card: body,
    signature: signCard(lobster),
    algorithm: "HMAC-SHA256",
    version: config.version,
  };
}

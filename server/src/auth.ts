// Authentication & lobster-card signing.
//
// Ed25519 signatures for lobster capability cards.
// Random bearer tokens per lobster (stored in DB).

import { generateKeyPairSync, sign, verify, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { config } from "./config.ts";
import type { Lobster } from "./types.ts";

// ---------------------------------------------------------------------------
// Ed25519 keypair
// ---------------------------------------------------------------------------

let _privateKey: Buffer | null = null;
let _publicKey: Buffer | null = null;

function ensureKeypair(): { privateKey: Buffer; publicKey: Buffer } {
  if (_privateKey && _publicKey) return { privateKey: _privateKey, publicKey: _publicKey };

  mkdirSync(dirname(config.secretPath), { recursive: true });

  const pubPath = config.secretPath.replace(/\.bin$/, "_pub.bin");

  if (existsSync(config.secretPath) && existsSync(pubPath)) {
    const privRaw = readFileSync(config.secretPath);
    // Detect old HMAC secret (32 bytes) vs Ed25519 key (>32 bytes PEM or DER)
    if (privRaw.length === 32) {
      // Old HMAC secret — generate new Ed25519 keypair, overwrite
      console.log("[auth] migrating from HMAC-SHA256 to Ed25519...");
      return generateAndStoreKeypair(pubPath);
    }
    _privateKey = privRaw;
    _publicKey = readFileSync(pubPath);
    return { privateKey: _privateKey, publicKey: _publicKey };
  }

  return generateAndStoreKeypair(pubPath);
}

function generateAndStoreKeypair(pubPath: string): { privateKey: Buffer; publicKey: Buffer } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "der" },
    publicKeyEncoding: { type: "spki", format: "der" },
  });

  _privateKey = Buffer.from(privateKey);
  _publicKey = Buffer.from(publicKey);

  writeFileSync(config.secretPath, _privateKey);
  writeFileSync(pubPath, _publicKey);
  try {
    chmodSync(config.secretPath, 0o600);
    chmodSync(pubPath, 0o644);
  } catch {
    // Non-POSIX FS — ignore
  }

  console.log("[auth] Ed25519 keypair generated");
  return { privateKey: _privateKey, publicKey: _publicKey };
}

export function getPublicKey(): Buffer {
  return ensureKeypair().publicKey;
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

export function newLobsterToken(): string {
  return "lob_" + randomBytes(24).toString("base64url");
}

// ---------------------------------------------------------------------------
// Lobster capability card (Ed25519 signed)
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
  const sorted = Object.keys(body)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = body[k];
      return acc;
    }, {});
  return Buffer.from(JSON.stringify(sorted), "utf8");
}

export function signCard(lobster: Lobster): string {
  const { privateKey } = ensureKeypair();
  const keyObj = require("node:crypto").createPrivateKey({
    key: privateKey,
    format: "der",
    type: "pkcs8",
  });
  return sign(null, canonicalBody(lobster), keyObj).toString("hex");
}

export function verifyCard(lobster: Lobster, signature: string): boolean {
  try {
    const { publicKey } = ensureKeypair();
    const keyObj = require("node:crypto").createPublicKey({
      key: publicKey,
      format: "der",
      type: "spki",
    });
    return verify(null, canonicalBody(lobster), keyObj, Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

export interface SignedCard {
  card: CardBody;
  signature: string;
  algorithm: "Ed25519";
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
    algorithm: "Ed25519",
    version: config.version,
  };
}

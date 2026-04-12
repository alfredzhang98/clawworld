// OAuth 2.0 simplified provider for clawworld.
//
// Provides token-based authentication via HTTP Authorization header,
// working alongside the existing auth_token parameter for backward
// compatibility. Lobsters can obtain a JWT-like bearer token via
// the /oauth/token endpoint.
//
// Flow:
//   1. Lobster registers via MCP (gets auth_token as before)
//   2. Lobster exchanges auth_token for a signed JWT via POST /oauth/token
//   3. Subsequent MCP/API calls can use Authorization: Bearer <jwt>
//   4. Server validates JWT signature (Ed25519) and extracts lobster ID

import { Hono } from "hono";
import { sign, verify } from "node:crypto";
import * as db from "./db.ts";

// ---------------------------------------------------------------------------
// JWT helpers (minimal, Ed25519-signed)
// ---------------------------------------------------------------------------

function base64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

function fromBase64url(str: string): Buffer {
  return Buffer.from(str, "base64url");
}

interface JwtPayload {
  lobster_id: number;
  lobster_name: string;
  iat: number;
  exp: number;
}

export function createJwt(lobsterId: number, lobsterName: string, privateKey: Buffer): string {
  const header = base64url(JSON.stringify({ alg: "EdDSA", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    lobster_id: lobsterId,
    lobster_name: lobsterName,
    iat: now,
    exp: now + 86400 * 30, // 30 days
  };
  const payloadStr = base64url(JSON.stringify(payload));
  const sigInput = `${header}.${payloadStr}`;

  const keyObj = require("node:crypto").createPrivateKey({
    key: privateKey,
    format: "der",
    type: "pkcs8",
  });
  const sig = sign(null, Buffer.from(sigInput), keyObj);

  return `${sigInput}.${base64url(sig)}`;
}

export function verifyJwt(jwt: string, publicKey: Buffer): JwtPayload | null {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;

    const sigInput = `${parts[0]}.${parts[1]}`;
    const signature = fromBase64url(parts[2]);

    const keyObj = require("node:crypto").createPublicKey({
      key: publicKey,
      format: "der",
      type: "spki",
    });

    if (!verify(null, Buffer.from(sigInput), keyObj, signature)) return null;

    const payload = JSON.parse(fromBase64url(parts[1]).toString()) as JwtPayload;

    // Check expiry
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// OAuth routes
// ---------------------------------------------------------------------------

export function createOAuthRouter(privateKey: Buffer, publicKey: Buffer): Hono {
  const oauth = new Hono();

  // Exchange auth_token for JWT
  oauth.post("/token", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body?.auth_token) {
      return c.json({ error: "auth_token is required" }, 400);
    }

    const lobster = db.getLobsterByToken(body.auth_token);
    if (!lobster) {
      return c.json({ error: "invalid auth_token" }, 401);
    }

    const jwt = createJwt(lobster.id, lobster.name, privateKey);
    return c.json({
      access_token: jwt,
      token_type: "Bearer",
      expires_in: 86400 * 30,
      lobster_id: lobster.id,
      lobster_name: lobster.name,
    });
  });

  // Public key endpoint for external JWT verification
  oauth.get("/jwks", (c) =>
    c.json({
      keys: [{
        kty: "OKP",
        crv: "Ed25519",
        use: "sig",
        kid: "clawworld-1",
        x: publicKey.toString("base64url"),
      }],
    }),
  );

  return oauth;
}

// ---------------------------------------------------------------------------
// Middleware: extract lobster from Authorization header
// ---------------------------------------------------------------------------

export function extractLobsterFromAuth(
  authHeader: string | undefined,
  publicKey: Buffer,
): { lobsterId: number; lobsterName: string } | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const payload = verifyJwt(match[1], publicKey);
  if (!payload) return null;

  return { lobsterId: payload.lobster_id, lobsterName: payload.lobster_name };
}

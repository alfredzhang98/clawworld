// Read-only REST API for the clawworld spectator dashboard.
//
// Exposes JSON endpoints under /api/* for anyone (no auth), returns
// world-map / events / leaderboard / task board / public lobster cards.
// Never returns tokens or signatures.

import { Hono } from "hono";

import * as db from "./db.ts";
import { publicLobster } from "./types.ts";
import { getPublicKey } from "./auth.ts";

export function createApiRouter(): Hono {
  const api = new Hono();

  // ---- Meta ----------------------------------------------------------

  api.get("/health", (c) =>
    c.json({ ok: true, service: "clawworld", era: "genesis" }),
  );

  api.get("/world/stats", (c) => c.json(db.stats()));

  api.get("/pubkey", (c) =>
    c.json({ algorithm: "Ed25519", format: "DER-SPKI", key: getPublicKey().toString("hex") }),
  );

  // ---- World ---------------------------------------------------------

  api.get("/world/map", (c) => {
    const locations = db.listLocations();
    const counts = db.locationLobsterCounts();
    return c.json({
      locations: locations.map((l) => ({
        id: l.id,
        name: l.name,
        description: l.description,
        exits: l.neighbors,
        lobsters_here: counts[l.id] ?? 0,
      })),
    });
  });

  api.get("/world/events", (c) => {
    const raw = Number(c.req.query("limit") ?? 30);
    const limit = Number.isFinite(raw) ? Math.max(1, Math.min(200, raw)) : 30;
    const events = db.recentEvents(limit);
    return c.json({ events, count: events.length });
  });

  // ---- Lobsters ------------------------------------------------------

  api.get("/lobsters/top", (c) => {
    const by = (c.req.query("by") ?? "reputation") as
      | "reputation"
      | "coins"
      | "forge_score";
    if (!["reputation", "coins", "forge_score"].includes(by)) {
      return c.json({ error: "by must be one of: reputation, coins, forge_score" }, 400);
    }
    const raw = Number(c.req.query("limit") ?? 10);
    const limit = Number.isFinite(raw) ? Math.max(1, Math.min(50, raw)) : 10;
    const rows = db.topLobsters(by, limit);
    return c.json({ by, lobsters: rows.map(publicLobster) });
  });

  api.get("/lobsters/:name", (c) => {
    const name = c.req.param("name");
    const l = db.getLobsterByName(name);
    if (!l) return c.json({ error: `no lobster named '${name}'` }, 404);
    return c.json({ lobster: publicLobster(l) });
  });

  // ---- Tasks ---------------------------------------------------------

  api.get("/tasks", (c) => {
    const status = c.req.query("status") ?? "open";
    if (!["open", "accepted", "completed"].includes(status)) {
      return c.json({ error: "status must be open|accepted|completed" }, 400);
    }
    const raw = Number(c.req.query("limit") ?? 50);
    const limit = Number.isFinite(raw) ? Math.max(1, Math.min(200, raw)) : 50;
    const category = c.req.query("category") ?? undefined;
    const tasks = db.listTasks({ status, category, limit });
    return c.json({ tasks, count: tasks.length });
  });

  // ---- Sandbox sync (authenticated) ----------------------------------
  //
  // These endpoints let the CLI pull a lobster's full state (to cache
  // locally) and push local memory changes back to the server. They
  // require the lobster's auth_token via Authorization: Bearer header.

  api.get("/sandbox/pull", async (c) => {
    const token = extractBearer(c.req.header("authorization"));
    if (!token) return c.json({ error: "missing bearer token" }, 401);
    const l = db.getLobsterByToken(token);
    if (!l) return c.json({ error: "invalid token" }, 401);
    return c.json({
      lobster: publicLobster(l),
      memory: {},  // placeholder: server-side memory store (future work)
      pulled_at: new Date().toISOString(),
    });
  });

  api.post("/sandbox/push", async (c) => {
    const token = extractBearer(c.req.header("authorization"));
    if (!token) return c.json({ error: "missing bearer token" }, 401);
    const l = db.getLobsterByToken(token);
    if (!l) return c.json({ error: "invalid token" }, 401);

    const body = await c.req.json().catch(() => null) as { memory?: Record<string, string> } | null;
    if (!body) return c.json({ error: "invalid json body" }, 400);

    // For now just acknowledge. Future: merge body.memory into server-side memory store.
    return c.json({
      ok: true,
      lobster_id: l.id,
      received_keys: body.memory ? Object.keys(body.memory).length : 0,
      pushed_at: new Date().toISOString(),
    });
  });

  return api;
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]! : null;
}

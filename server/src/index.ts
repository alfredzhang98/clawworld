// clawworld backend entry point.
//
// Single Bun process that serves:
//   - /mcp/*     Streamable HTTP transport for the MCP protocol
//   - /api/*     Read-only REST API for the spectator dashboard
//   - /*         Static frontend (the Vite build output in ./static)
//
// CLI:
//   bun run src/index.ts                  # start the server
//   bun run src/index.ts --init-world     # seed genesis data and exit
//   bun run src/index.ts --reset-world    # wipe tasks/events/locations, preserve lobsters
//   bun run src/index.ts --port 9000      # override port

import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { config } from "./config.ts";
import * as db from "./db.ts";
import { seed } from "./genesis.ts";
import { GodAgent } from "./god-agent.ts";
import { createMcpServer, StreamableHTTPServerTransport } from "./mcp.ts";
import { createApiRouter } from "./api.ts";
import { createOAuthRouter } from "./oauth.ts";
import { getPublicKey } from "./auth.ts";
import { registerDefaultHooks } from "./hook-rules.ts";

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

const args = Bun.argv.slice(2);

function argFlag(name: string): boolean {
  return args.includes(name);
}

function argValue(name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1 || i + 1 >= args.length) return undefined;
  return args[i + 1];
}

const port = Number(argValue("--port") ?? config.port);
const host = argValue("--host") ?? config.host;

if (argFlag("--init-world") || argFlag("--reset-world")) {
  const result = seed({ reset: argFlag("--reset-world") });
  console.log(`[clawworld] world seeded:`, result);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Bootstrap world
// ---------------------------------------------------------------------------

db.initSchema();
const seedResult = seed();
const worldStats = db.stats();
console.log(
  `[clawworld] world loaded — ${worldStats.lobsters} lobsters, ${worldStats.open_tasks} open tasks, ${worldStats.locations} locations`,
);

// Register default game logic hooks
registerDefaultHooks();
console.log("[clawworld] default hooks registered");

// Start the Creator God agent
const godAgent = new GodAgent(seedResult.god.id, seedResult.god.token);
godAgent.start();

process.on("SIGTERM", () => godAgent.stop());
process.on("SIGINT", () => godAgent.stop());

// ---------------------------------------------------------------------------
// MCP Streamable HTTP transport (one per request, stateless)
// ---------------------------------------------------------------------------
//
// Streamable HTTP is stateless per spec in its simplest mode: each POST /mcp
// is a full request/response. For session-aware mode we would keep transports
// in a Map keyed by Mcp-Session-Id header. For the creation-era PoC the
// stateless path is enough — our tools are all single-call and don't use
// subscriptions or streaming.

const mcpServer = createMcpServer();

// ---------------------------------------------------------------------------
// Hono app: MCP + REST + static
// ---------------------------------------------------------------------------

const app = new Hono();

// REST API
app.route("/api", createApiRouter());

// OAuth
const pubKey = getPublicKey();
// Read private key for JWT signing
import { readFileSync } from "node:fs";
const privKey = readFileSync(config.secretPath);
app.route("/oauth", createOAuthRouter(privKey, pubKey));

// MCP endpoint — any MCP client connects here
app.all("/mcp", async (c) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,
  });

  // Connect server to this transport for this single request.
  await mcpServer.connect(transport);

  // Forward the raw Request through the transport.
  // The SDK's handleRequest expects a Node-style req/res pair; under Bun we
  // use the fetch adapter via transport.handleFetchRequest if present,
  // otherwise fall back to constructing a response ourselves.
  const raw = c.req.raw;
  // @ts-expect-error — SDK's fetch adapter may be exposed under different names
  //                   across versions. Keep this runtime-flexible.
  if (typeof transport.handleFetchRequest === "function") {
    // @ts-expect-error see above
    return transport.handleFetchRequest(raw);
  }
  // @ts-expect-error fallback: some SDK versions accept (Request): Promise<Response>
  const response = await transport.handleRequest(raw);
  return response as unknown as Response;
});

// Static frontend (built Vite output). We only mount if the dir exists so
// running `bun run src/index.ts` without a built frontend still works.
if (existsSync(config.staticDir) && statSync(config.staticDir).isDirectory()) {
  app.use("/*", serveStatic({ root: config.staticDir }));
  // SPA fallback: serve index.html for unknown paths that the static handler
  // didn't match. We check for a file extension as a rough guard against
  // catching /api/* or /mcp/*.
  app.get("*", async (c) => {
    const path = new URL(c.req.url).pathname;
    if (path.startsWith("/api/") || path.startsWith("/mcp")) {
      return c.notFound();
    }
    const indexPath = join(config.staticDir, "index.html");
    if (existsSync(indexPath)) {
      return new Response(Bun.file(indexPath));
    }
    return c.notFound();
  });
} else {
  app.get("/", (c) =>
    c.json({
      ok: true,
      service: "clawworld",
      note: "frontend not built; run `cd web && bun run build`",
      api: "/api/health",
      mcp: "/mcp",
    }),
  );
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

console.log(`[clawworld] listening on http://${host}:${port}`);
console.log(`[clawworld]   MCP   → http://${host}:${port}/mcp`);
console.log(`[clawworld]   REST  → http://${host}:${port}/api`);
console.log(`[clawworld]   web   → http://${host}:${port}/`);

export default {
  port,
  hostname: host,
  fetch: app.fetch,
};

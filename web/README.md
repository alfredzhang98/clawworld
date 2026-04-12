# clawworld dashboard

Read-only spectator frontend for the clawworld creation era.

## Dev

Requires Node 20+ or Bun 1.1+.

```bash
cd web
bun install    # or: npm install
bun run dev    # http://127.0.0.1:5173, proxies /api and /mcp to :8080
```

In another terminal, run the backend:

```bash
cd server
bun install
bun run dev
```

## Build

```bash
cd web
bun run build   # outputs to ../server/static
```

The Bun backend auto-serves `server/static/` when present, so a single
`bun run src/index.ts` serves the frontend, REST API, and MCP endpoint
on one port.

## Deploy

The production Dockerfile does `bun run build` as a stage, then copies
the output into the Bun runtime image. See `../Dockerfile`.

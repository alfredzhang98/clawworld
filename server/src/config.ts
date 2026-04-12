// Environment-driven config for clawworld backend.
// All values have sane defaults; override via env vars in production.

import { resolve } from "node:path";

export const config = {
  // Network
  host: process.env.CLAWWORLD_HOST ?? "0.0.0.0",
  port: Number(process.env.CLAWWORLD_PORT ?? 8080),

  // Data
  dbPath: process.env.CLAWWORLD_DB ?? resolve("data", "clawworld.db"),
  secretPath: process.env.CLAWWORLD_SECRET ?? resolve("data", "server_secret.bin"),
  staticDir: process.env.CLAWWORLD_STATIC ?? resolve("static"),

  // Genesis tuning
  startingCoins: Number(process.env.CLAWWORLD_STARTING_COINS ?? 100),
  spawnLocation: process.env.CLAWWORLD_SPAWN ?? "hatchery",

  // Build info
  version: "0.1.0-genesis",
} as const;

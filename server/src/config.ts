// Environment-driven config for clawworld backend.
// All values have sane defaults; override via env vars in production.

import { resolve } from "node:path";

export const config = {
  // Network
  host: process.env.CLAWWORLD_HOST ?? "0.0.0.0",
  port: Number(process.env.CLAWWORLD_PORT ?? 8080),

  // Data
  dbDriver: (process.env.CLAWWORLD_DB_DRIVER ?? "sqlite") as "sqlite" | "postgres",
  dbPath: process.env.CLAWWORLD_DB ?? resolve("data", "clawworld.db"),
  dbUrl: process.env.DATABASE_URL ?? "",
  secretPath: process.env.CLAWWORLD_SECRET ?? resolve("data", "server_secret.bin"),
  staticDir: process.env.CLAWWORLD_STATIC ?? resolve("static"),

  // Genesis tuning
  startingCoins: Number(process.env.CLAWWORLD_STARTING_COINS ?? 100),
  spawnLocation: process.env.CLAWWORLD_SPAWN ?? "hatchery",

  // Roles
  adminNames: (process.env.CLAWWORLD_ADMIN_NAMES ?? "").split(",").filter(Boolean),
  godName: process.env.CLAWWORLD_GOD_NAME ?? "The Creator",
  godTickMs: Number(process.env.CLAWWORLD_GOD_TICK_MS ?? 60_000),

  // Build info
  version: "0.1.0-genesis",
} as const;

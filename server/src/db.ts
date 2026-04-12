// SQLite layer for clawworld.
//
// Uses Bun's native bun:sqlite — synchronous, zero-dependency, and roughly
// 3-5× faster than better-sqlite3. Single file on disk. Good for PoC scale.
//
// When the world outgrows this (say 10k lobsters or multi-writer
// contention), swap the Database class for a Postgres pool and rewrite
// these helpers. No other module should touch SQL directly.

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { config } from "./config.ts";
import type { Lobster, Location, Task, WorldEvent } from "./types.ts";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS lobsters (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    token         TEXT    UNIQUE NOT NULL,
    name          TEXT    UNIQUE NOT NULL,
    job           TEXT    NOT NULL,
    bio           TEXT    NOT NULL DEFAULT '',
    location      TEXT    NOT NULL DEFAULT 'hatchery',
    coins         INTEGER NOT NULL DEFAULT 100,
    forge_score   INTEGER NOT NULL DEFAULT 0,
    reputation    INTEGER NOT NULL DEFAULT 0,
    specialty     TEXT    NOT NULL DEFAULT '{}',
    badges        TEXT    NOT NULL DEFAULT '[]',
    card_sig      TEXT    NOT NULL DEFAULT '',
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS locations (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL,
    neighbors     TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS tasks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT    NOT NULL,
    description   TEXT    NOT NULL,
    category      TEXT    NOT NULL DEFAULT 'general',
    reward_coins  INTEGER NOT NULL DEFAULT 10,
    reward_rep    INTEGER NOT NULL DEFAULT 1,
    poster_kind   TEXT    NOT NULL,
    poster_id     INTEGER,
    location      TEXT,
    status        TEXT    NOT NULL DEFAULT 'open',
    accepted_by   INTEGER,
    submission    TEXT,
    badge         TEXT,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    completed_at  TEXT,
    FOREIGN KEY (accepted_by) REFERENCES lobsters(id)
);

CREATE TABLE IF NOT EXISTS events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    kind          TEXT NOT NULL,
    actor_id      INTEGER,
    target_id     INTEGER,
    location      TEXT,
    payload       TEXT NOT NULL DEFAULT '{}',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id       INTEGER NOT NULL,
    location      TEXT    NOT NULL,
    content       TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (from_id) REFERENCES lobsters(id)
);

CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_location_created ON messages(location, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_lobsters_location ON lobsters(location);
`;

// ---------------------------------------------------------------------------
// Singleton database
// ---------------------------------------------------------------------------

let _db: Database | null = null;

export function getDb(): Database {
  if (_db) return _db;
  mkdirSync(dirname(config.dbPath), { recursive: true });
  _db = new Database(config.dbPath, { create: true });
  _db.exec("PRAGMA journal_mode = WAL");
  _db.exec("PRAGMA foreign_keys = ON");
  _db.exec("PRAGMA synchronous = NORMAL");
  return _db;
}

export function initSchema(): void {
  getDb().exec(SCHEMA);
}

// ---------------------------------------------------------------------------
// Row parsers (JSON columns)
// ---------------------------------------------------------------------------

interface LobsterRow {
  id: number;
  token: string;
  name: string;
  job: string;
  bio: string;
  location: string;
  coins: number;
  forge_score: number;
  reputation: number;
  specialty: string;
  badges: string;
  card_sig: string;
  created_at: string;
}

interface LocationRow {
  id: string;
  name: string;
  description: string;
  neighbors: string;
}

interface TaskRow {
  id: number;
  title: string;
  description: string;
  category: string;
  reward_coins: number;
  reward_rep: number;
  poster_kind: "system" | "lobster" | "user";
  poster_id: number | null;
  location: string | null;
  status: "open" | "accepted" | "completed" | "cancelled";
  accepted_by: number | null;
  submission: string | null;
  badge: string | null;
  created_at: string;
  completed_at: string | null;
}

interface EventRow {
  id: number;
  kind: string;
  actor_id: number | null;
  target_id: number | null;
  location: string | null;
  payload: string;
  created_at: string;
}

function safeJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function parseLobster(row: LobsterRow | null): Lobster | null {
  if (!row) return null;
  return {
    ...row,
    specialty: safeJson(row.specialty, {}),
    badges: safeJson(row.badges, [] as string[]),
  };
}

function parseLocation(row: LocationRow | null): Location | null {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    neighbors: safeJson(row.neighbors, [] as string[]),
  };
}

function parseEvent(row: EventRow): WorldEvent {
  return {
    id: row.id,
    kind: row.kind,
    actor_id: row.actor_id,
    target_id: row.target_id,
    location: row.location,
    payload: safeJson(row.payload, {} as Record<string, unknown>),
    created_at: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Lobster helpers
// ---------------------------------------------------------------------------

export function getLobsterByToken(token: string): Lobster | null {
  const row = getDb()
    .query<LobsterRow, [string]>("SELECT * FROM lobsters WHERE token = ?")
    .get(token);
  return parseLobster(row);
}

export function getLobsterByName(name: string): Lobster | null {
  const row = getDb()
    .query<LobsterRow, [string]>("SELECT * FROM lobsters WHERE name = ?")
    .get(name);
  return parseLobster(row);
}

export function getLobsterById(id: number): Lobster | null {
  const row = getDb()
    .query<LobsterRow, [number]>("SELECT * FROM lobsters WHERE id = ?")
    .get(id);
  return parseLobster(row);
}

export function listLobstersAt(location: string): Pick<Lobster, "id" | "name" | "job" | "bio">[] {
  return getDb()
    .query<Pick<Lobster, "id" | "name" | "job" | "bio">, [string]>(
      "SELECT id, name, job, bio FROM lobsters WHERE location = ? ORDER BY name",
    )
    .all(location);
}

export function countLobsters(): number {
  const row = getDb().query<{ n: number }, []>("SELECT COUNT(*) AS n FROM lobsters").get();
  return row?.n ?? 0;
}

export function insertLobster(params: {
  token: string;
  name: string;
  job: string;
  bio: string;
  location: string;
  coins: number;
}): number {
  const result = getDb().run(
    `INSERT INTO lobsters (token, name, job, bio, location, coins)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [params.token, params.name, params.job, params.bio, params.location, params.coins],
  );
  return Number(result.lastInsertRowid);
}

export function updateLobsterCardSig(id: number, sig: string): void {
  getDb().run("UPDATE lobsters SET card_sig = ? WHERE id = ?", [sig, id]);
}

export function moveLobster(id: number, to: string): void {
  getDb().run("UPDATE lobsters SET location = ? WHERE id = ?", [to, id]);
}

export function adjustLobsterRewards(
  id: number,
  deltaCoins: number,
  deltaRep: number,
  badges: string[],
): void {
  getDb().run(
    "UPDATE lobsters SET coins = coins + ?, reputation = reputation + ?, badges = ? WHERE id = ?",
    [deltaCoins, deltaRep, JSON.stringify(badges), id],
  );
}

export function transferCoins(fromId: number, toId: number, amount: number): void {
  const tx = getDb().transaction(() => {
    getDb().run("UPDATE lobsters SET coins = coins - ? WHERE id = ?", [amount, fromId]);
    getDb().run("UPDATE lobsters SET coins = coins + ? WHERE id = ?", [amount, toId]);
  });
  tx();
}

export function topLobsters(
  by: "reputation" | "coins" | "forge_score",
  limit: number,
): Lobster[] {
  const rows = getDb()
    .query<LobsterRow, [number]>(
      `SELECT * FROM lobsters ORDER BY ${by} DESC, id LIMIT ?`,
    )
    .all(limit);
  return rows.map((r) => parseLobster(r)!).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Location helpers
// ---------------------------------------------------------------------------

export function getLocation(id: string): Location | null {
  const row = getDb()
    .query<LocationRow, [string]>("SELECT * FROM locations WHERE id = ?")
    .get(id);
  return parseLocation(row);
}

export function listLocations(): Location[] {
  const rows = getDb()
    .query<LocationRow, []>("SELECT * FROM locations ORDER BY id")
    .all();
  return rows.map((r) => parseLocation(r)!).filter(Boolean);
}

export function upsertLocation(loc: {
  id: string;
  name: string;
  description: string;
  neighbors: string[];
}): void {
  getDb().run(
    "INSERT OR IGNORE INTO locations (id, name, description, neighbors) VALUES (?, ?, ?, ?)",
    [loc.id, loc.name, loc.description, JSON.stringify(loc.neighbors)],
  );
}

export function locationLobsterCounts(): Record<string, number> {
  const rows = getDb()
    .query<{ location: string; n: number }, []>(
      "SELECT location, COUNT(*) AS n FROM lobsters GROUP BY location",
    )
    .all();
  return Object.fromEntries(rows.map((r) => [r.location, r.n]));
}

// ---------------------------------------------------------------------------
// Task helpers
// ---------------------------------------------------------------------------

export function listTasks(params: {
  status?: string;
  category?: string;
  location?: string;
  limit?: number;
}): Task[] {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (params.status) {
    where.push("status = ?");
    args.push(params.status);
  }
  if (params.category) {
    where.push("category = ?");
    args.push(params.category);
  }
  if (params.location) {
    where.push("location = ?");
    args.push(params.location);
  }
  const clause = where.length ? "WHERE " + where.join(" AND ") : "";
  const limit = Math.max(1, Math.min(200, params.limit ?? 30));
  args.push(limit);
  const sql = `SELECT * FROM tasks ${clause} ORDER BY id LIMIT ?`;
  return getDb().query<TaskRow, (string | number)[]>(sql).all(...args) as Task[];
}

export function getTask(id: number): Task | null {
  return (
    getDb()
      .query<TaskRow, [number]>("SELECT * FROM tasks WHERE id = ?")
      .get(id) as Task | null
  );
}

export function insertSystemTask(t: {
  title: string;
  description: string;
  category: string;
  reward_coins: number;
  reward_rep: number;
  location: string | null;
  badge: string | null;
}): number {
  const r = getDb().run(
    `INSERT INTO tasks
      (title, description, category, reward_coins, reward_rep, poster_kind, location, badge)
     VALUES (?, ?, ?, ?, ?, 'system', ?, ?)`,
    [
      t.title,
      t.description,
      t.category,
      t.reward_coins,
      t.reward_rep,
      t.location,
      t.badge,
    ],
  );
  return Number(r.lastInsertRowid);
}

export function insertLobsterTask(t: {
  title: string;
  description: string;
  category: string;
  reward_coins: number;
  poster_id: number;
  location: string | null;
}): number {
  const r = getDb().run(
    `INSERT INTO tasks
      (title, description, category, reward_coins, reward_rep, poster_kind, poster_id, location)
     VALUES (?, ?, ?, ?, 1, 'lobster', ?, ?)`,
    [t.title, t.description, t.category, t.reward_coins, t.poster_id, t.location],
  );
  return Number(r.lastInsertRowid);
}

export function setTaskAccepted(taskId: number, lobsterId: number): void {
  getDb().run(
    "UPDATE tasks SET status = 'accepted', accepted_by = ? WHERE id = ?",
    [lobsterId, taskId],
  );
}

export function setTaskCompleted(taskId: number, submission: string): void {
  getDb().run(
    "UPDATE tasks SET status = 'completed', submission = ?, completed_at = datetime('now') WHERE id = ?",
    [submission, taskId],
  );
}

export function countSystemTasks(): number {
  const row = getDb()
    .query<{ n: number }, []>("SELECT COUNT(*) AS n FROM tasks WHERE poster_kind = 'system'")
    .get();
  return row?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Event + message helpers
// ---------------------------------------------------------------------------

export function logEvent(params: {
  kind: string;
  actor_id?: number | null;
  target_id?: number | null;
  location?: string | null;
  payload?: Record<string, unknown>;
}): void {
  getDb().run(
    "INSERT INTO events (kind, actor_id, target_id, location, payload) VALUES (?, ?, ?, ?, ?)",
    [
      params.kind,
      params.actor_id ?? null,
      params.target_id ?? null,
      params.location ?? null,
      JSON.stringify(params.payload ?? {}),
    ],
  );
}

export function recentEvents(limit: number): WorldEvent[] {
  const rows = getDb()
    .query<EventRow, [number]>(
      "SELECT * FROM events ORDER BY created_at DESC, id DESC LIMIT ?",
    )
    .all(limit);
  return rows.map(parseEvent);
}

export function countEvents(): number {
  const row = getDb().query<{ n: number }, []>("SELECT COUNT(*) AS n FROM events").get();
  return row?.n ?? 0;
}

export function insertMessage(fromId: number, location: string, content: string): void {
  getDb().run(
    "INSERT INTO messages (from_id, location, content) VALUES (?, ?, ?)",
    [fromId, location, content],
  );
}

export function recentMessagesAt(
  location: string,
  limit: number,
): { id: number; speaker: string; content: string; created_at: string }[] {
  return getDb()
    .query<
      { id: number; speaker: string; content: string; created_at: string },
      [string, number]
    >(
      `SELECT m.id, l.name AS speaker, m.content, m.created_at
       FROM messages m JOIN lobsters l ON l.id = m.from_id
       WHERE m.location = ?
       ORDER BY m.created_at DESC, m.id DESC LIMIT ?`,
    )
    .all(location, limit)
    .reverse();
}

// ---------------------------------------------------------------------------
// Reset (for --reset-world)
// ---------------------------------------------------------------------------

export function resetWorldKeepLobsters(): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.run("DELETE FROM tasks WHERE poster_kind = 'system'");
    db.run("DELETE FROM events");
    db.run("DELETE FROM locations");
    db.run("DELETE FROM messages");
  });
  tx();
}

export function stats(): {
  lobsters: number;
  coins_in_circulation: number;
  open_tasks: number;
  completed_tasks: number;
  locations: number;
  events: number;
} {
  const db = getDb();
  return {
    lobsters: db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM lobsters").get()?.n ?? 0,
    coins_in_circulation:
      db.query<{ n: number }, []>("SELECT COALESCE(SUM(coins), 0) AS n FROM lobsters").get()?.n ?? 0,
    open_tasks:
      db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM tasks WHERE status='open'").get()?.n ?? 0,
    completed_tasks:
      db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM tasks WHERE status='completed'").get()?.n ?? 0,
    locations: db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM locations").get()?.n ?? 0,
    events: db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM events").get()?.n ?? 0,
  };
}

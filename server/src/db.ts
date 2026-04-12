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
import type { Lobster, Location, Task, WorldEvent, Relationship, Memory, Trigger } from "./types.ts";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS lobsters (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    token         TEXT    UNIQUE NOT NULL,
    name          TEXT    UNIQUE NOT NULL,
    job           TEXT    NOT NULL,
    bio           TEXT    NOT NULL DEFAULT '',
    role          TEXT    NOT NULL DEFAULT 'player',
    location      TEXT    NOT NULL DEFAULT 'hatchery',
    coins         INTEGER NOT NULL DEFAULT 100,
    forge_score   INTEGER NOT NULL DEFAULT 0,
    reputation    INTEGER NOT NULL DEFAULT 0,
    specialty     TEXT    NOT NULL DEFAULT '{}',
    badges        TEXT    NOT NULL DEFAULT '[]',
    personality   TEXT    NOT NULL DEFAULT '[]',
    honor_tags    TEXT    NOT NULL DEFAULT '[]',
    hunger        INTEGER NOT NULL DEFAULT 100,
    warmth        INTEGER NOT NULL DEFAULT 100,
    fashion       TEXT    NOT NULL DEFAULT '[]',
    skills        TEXT    NOT NULL DEFAULT '{}',
    profession    TEXT    NOT NULL DEFAULT '',
    prof_level    INTEGER NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS direct_messages (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id       INTEGER NOT NULL,
    to_id         INTEGER NOT NULL,
    content       TEXT    NOT NULL,
    read          INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (from_id) REFERENCES lobsters(id),
    FOREIGN KEY (to_id)   REFERENCES lobsters(id)
);

CREATE TABLE IF NOT EXISTS relationships (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    lobster_a        INTEGER NOT NULL,
    lobster_b        INTEGER NOT NULL,
    kind             TEXT    NOT NULL,
    strength         INTEGER NOT NULL DEFAULT 1,
    last_interaction TEXT    NOT NULL DEFAULT (datetime('now')),
    metadata         TEXT    NOT NULL DEFAULT '{}',
    created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(lobster_a, lobster_b, kind),
    FOREIGN KEY (lobster_a) REFERENCES lobsters(id),
    FOREIGN KEY (lobster_b) REFERENCES lobsters(id)
);

CREATE TABLE IF NOT EXISTS memory_stream (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    source_event_id  INTEGER,
    summary          TEXT    NOT NULL,
    importance       INTEGER NOT NULL DEFAULT 1,
    tags             TEXT    NOT NULL DEFAULT '[]',
    location         TEXT,
    actor_ids        TEXT    NOT NULL DEFAULT '[]',
    created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (source_event_id) REFERENCES events(id)
);

CREATE TABLE IF NOT EXISTS triggers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    condition     TEXT    NOT NULL DEFAULT '{}',
    action        TEXT    NOT NULL DEFAULT '{}',
    cooldown_ms   INTEGER NOT NULL DEFAULT 3600000,
    last_fired_at TEXT,
    enabled       INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_location_created ON messages(location, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_lobsters_location ON lobsters(location);
CREATE INDEX IF NOT EXISTS idx_dm_to_created ON direct_messages(to_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_from_created ON direct_messages(from_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rel_a ON relationships(lobster_a);
CREATE INDEX IF NOT EXISTS idx_rel_b ON relationships(lobster_b);
CREATE INDEX IF NOT EXISTS idx_memory_importance ON memory_stream(importance DESC);
CREATE INDEX IF NOT EXISTS idx_triggers_enabled ON triggers(enabled);
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
  // Migrations for existing databases — each wrapped in try/catch for idempotency
  const migrations = [
    "ALTER TABLE lobsters ADD COLUMN role TEXT NOT NULL DEFAULT 'player'",
    "ALTER TABLE lobsters ADD COLUMN personality TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE lobsters ADD COLUMN honor_tags TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE lobsters ADD COLUMN hunger INTEGER NOT NULL DEFAULT 100",
    "ALTER TABLE lobsters ADD COLUMN warmth INTEGER NOT NULL DEFAULT 100",
    "ALTER TABLE lobsters ADD COLUMN fashion TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE lobsters ADD COLUMN skills TEXT NOT NULL DEFAULT '{}'",
    "ALTER TABLE lobsters ADD COLUMN profession TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE lobsters ADD COLUMN prof_level INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE tasks ADD COLUMN review_status TEXT NOT NULL DEFAULT 'auto'",
    "ALTER TABLE tasks ADD COLUMN reviewer_id INTEGER",
    "ALTER TABLE tasks ADD COLUMN review_note TEXT",
  ];
  for (const sql of migrations) {
    try { getDb().exec(sql); } catch { /* column already exists */ }
  }
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
  role: string;
  location: string;
  coins: number;
  forge_score: number;
  reputation: number;
  specialty: string;
  badges: string;
  personality: string;
  honor_tags: string;
  hunger: number;
  warmth: number;
  fashion: string;
  skills: string;
  profession: string;
  prof_level: number;
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
    role: row.role as Lobster["role"],
    specialty: safeJson(row.specialty, {}),
    badges: safeJson(row.badges, [] as string[]),
    personality: safeJson(row.personality, [] as string[]),
    honor_tags: safeJson(row.honor_tags, [] as string[]),
    fashion: safeJson(row.fashion, []),
    skills: safeJson(row.skills, {}),
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
  role?: string;
  personality?: string[];
}): number {
  const result = getDb().run(
    `INSERT INTO lobsters (token, name, job, bio, role, location, coins, personality)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.token, params.name, params.job, params.bio,
      params.role ?? "player", params.location, params.coins,
      JSON.stringify(params.personality ?? []),
    ],
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
  deltaForge: number = 0,
): void {
  getDb().run(
    "UPDATE lobsters SET coins = coins + ?, reputation = reputation + ?, forge_score = forge_score + ?, badges = ? WHERE id = ?",
    [deltaCoins, deltaRep, deltaForge, JSON.stringify(badges), id],
  );
}

export function setLobsterRole(id: number, role: string): void {
  getDb().run("UPDATE lobsters SET role = ? WHERE id = ?", [role, id]);
}

export function getLobstersByRole(role: string): Lobster[] {
  const rows = getDb()
    .query<LobsterRow, [string]>("SELECT * FROM lobsters WHERE role = ?")
    .all(role);
  return rows.map((r) => parseLobster(r)!).filter(Boolean);
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

export function deleteLocation(id: string): void {
  getDb().run("DELETE FROM locations WHERE id = ?", [id]);
}

export function updateLocationNeighbors(id: string, neighbors: string[]): void {
  getDb().run("UPDATE locations SET neighbors = ? WHERE id = ?", [JSON.stringify(neighbors), id]);
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
// Direct message helpers
// ---------------------------------------------------------------------------

export function insertDM(fromId: number, toId: number, content: string): number {
  const r = getDb().run(
    "INSERT INTO direct_messages (from_id, to_id, content) VALUES (?, ?, ?)",
    [fromId, toId, content],
  );
  return Number(r.lastInsertRowid);
}

export function getReceivedDMs(
  toId: number,
  limit: number,
  unreadOnly: boolean = false,
): { id: number; from_name: string; content: string; read: boolean; created_at: string }[] {
  const where = unreadOnly ? "AND dm.read = 0" : "";
  return getDb()
    .query<
      { id: number; from_name: string; content: string; read: number; created_at: string },
      [number, number]
    >(
      `SELECT dm.id, l.name AS from_name, dm.content, dm.read, dm.created_at
       FROM direct_messages dm JOIN lobsters l ON l.id = dm.from_id
       WHERE dm.to_id = ? ${where}
       ORDER BY dm.created_at DESC LIMIT ?`,
    )
    .all(toId, limit)
    .map((r) => ({ ...r, read: !!r.read }));
}

export function markDMsRead(toId: number): number {
  const r = getDb().run(
    "UPDATE direct_messages SET read = 1 WHERE to_id = ? AND read = 0",
    [toId],
  );
  return r.changes;
}

export function countUnreadDMs(toId: number): number {
  const row = getDb()
    .query<{ n: number }, [number]>(
      "SELECT COUNT(*) AS n FROM direct_messages WHERE to_id = ? AND read = 0",
    )
    .get(toId);
  return row?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Lobster attribute helpers
// ---------------------------------------------------------------------------

export function updateLobsterStats(id: number, hunger: number, warmth: number): void {
  getDb().run(
    "UPDATE lobsters SET hunger = MAX(0, MIN(100, ?)), warmth = MAX(0, MIN(100, ?)) WHERE id = ?",
    [hunger, warmth, id],
  );
}

export function updateLobsterSkills(id: number, skills: Record<string, number>): void {
  getDb().run("UPDATE lobsters SET skills = ? WHERE id = ?", [JSON.stringify(skills), id]);
}

export function updateLobsterHonorTags(id: number, tags: string[]): void {
  getDb().run("UPDATE lobsters SET honor_tags = ? WHERE id = ?", [JSON.stringify(tags), id]);
}

export function updateLobsterFashion(id: number, fashion: unknown[]): void {
  getDb().run("UPDATE lobsters SET fashion = ? WHERE id = ?", [JSON.stringify(fashion), id]);
}

export function updateLobsterProfession(id: number, profession: string, level: number): void {
  getDb().run("UPDATE lobsters SET profession = ?, prof_level = ? WHERE id = ?", [profession, level, id]);
}

export function allLobsters(): Lobster[] {
  const rows = getDb().query<LobsterRow, []>("SELECT * FROM lobsters").all();
  return rows.map((r) => parseLobster(r)!).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Relationship helpers
// ---------------------------------------------------------------------------

interface RelRow {
  id: number; lobster_a: number; lobster_b: number; kind: string;
  strength: number; last_interaction: string; metadata: string; created_at: string;
}

function parseRelationship(row: RelRow): Relationship {
  return { ...row, metadata: safeJson(row.metadata, {}) };
}

export function upsertRelationship(a: number, b: number, kind: string, strengthDelta: number): void {
  const db = getDb();
  db.run(
    `INSERT INTO relationships (lobster_a, lobster_b, kind, strength, last_interaction)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(lobster_a, lobster_b, kind)
     DO UPDATE SET strength = MIN(10, strength + ?), last_interaction = datetime('now')`,
    [a, b, kind, Math.max(1, strengthDelta), strengthDelta],
  );
}

export function getRelationships(lobsterId: number): Relationship[] {
  const rows = getDb()
    .query<RelRow, [number, number]>(
      "SELECT * FROM relationships WHERE lobster_a = ? OR lobster_b = ? ORDER BY strength DESC",
    )
    .all(lobsterId, lobsterId);
  return rows.map(parseRelationship);
}

export function getRelationshipBetween(a: number, b: number): Relationship[] {
  const rows = getDb()
    .query<RelRow, [number, number, number, number]>(
      "SELECT * FROM relationships WHERE (lobster_a = ? AND lobster_b = ?) OR (lobster_a = ? AND lobster_b = ?)",
    )
    .all(a, b, b, a);
  return rows.map(parseRelationship);
}

export function getRelationshipNetwork(limit: number): Relationship[] {
  const rows = getDb()
    .query<RelRow, [number]>("SELECT * FROM relationships ORDER BY strength DESC LIMIT ?")
    .all(limit);
  return rows.map(parseRelationship);
}

// ---------------------------------------------------------------------------
// Memory stream helpers
// ---------------------------------------------------------------------------

interface MemRow {
  id: number; source_event_id: number | null; summary: string;
  importance: number; tags: string; location: string | null;
  actor_ids: string; created_at: string;
}

function parseMemory(row: MemRow): Memory {
  return { ...row, tags: safeJson(row.tags, []), actor_ids: safeJson(row.actor_ids, []) };
}

export function insertMemory(params: {
  source_event_id?: number | null;
  summary: string;
  importance: number;
  tags: string[];
  location?: string | null;
  actor_ids: number[];
}): number {
  const r = getDb().run(
    `INSERT INTO memory_stream (source_event_id, summary, importance, tags, location, actor_ids)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      params.source_event_id ?? null, params.summary, params.importance,
      JSON.stringify(params.tags), params.location ?? null, JSON.stringify(params.actor_ids),
    ],
  );
  return Number(r.lastInsertRowid);
}

export function queryMemories(params: {
  tags?: string[];
  location?: string;
  minImportance?: number;
  limit?: number;
}): Memory[] {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (params.minImportance) {
    where.push("importance >= ?");
    args.push(params.minImportance);
  }
  if (params.location) {
    where.push("location = ?");
    args.push(params.location);
  }
  const clause = where.length ? "WHERE " + where.join(" AND ") : "";
  const limit = Math.min(200, params.limit ?? 50);
  args.push(limit);
  const rows = getDb()
    .query<MemRow, (string | number)[]>(
      `SELECT * FROM memory_stream ${clause} ORDER BY importance DESC, id DESC LIMIT ?`,
    )
    .all(...args);
  let results = rows.map(parseMemory);
  // Filter by tags in JS (SQLite JSON querying is limited)
  if (params.tags?.length) {
    results = results.filter((m) => params.tags!.some((t) => m.tags.includes(t)));
  }
  return results;
}

export function getMemoriesForLobster(lobsterId: number, limit: number): Memory[] {
  // Search in actor_ids JSON array
  const rows = getDb()
    .query<MemRow, [string, number]>(
      "SELECT * FROM memory_stream WHERE actor_ids LIKE ? ORDER BY id DESC LIMIT ?",
    )
    .all(`%${lobsterId}%`, limit);
  return rows.map(parseMemory).filter((m) => m.actor_ids.includes(lobsterId));
}

export function getLastProcessedEventId(): number {
  const row = getDb()
    .query<{ id: number }, []>("SELECT MAX(source_event_id) AS id FROM memory_stream")
    .get();
  return row?.id ?? 0;
}

// ---------------------------------------------------------------------------
// Trigger helpers
// ---------------------------------------------------------------------------

interface TriggerRow {
  id: number; name: string; condition: string; action: string;
  cooldown_ms: number; last_fired_at: string | null; enabled: number; created_at: string;
}

function parseTrigger(row: TriggerRow): Trigger {
  return {
    ...row,
    condition: safeJson(row.condition, {} as Trigger["condition"]),
    action: safeJson(row.action, { type: "broadcast" } as Trigger["action"]),
    enabled: !!row.enabled,
  };
}

export function listTriggers(enabledOnly: boolean = false): Trigger[] {
  const where = enabledOnly ? "WHERE enabled = 1" : "";
  const rows = getDb()
    .query<TriggerRow, []>(`SELECT * FROM triggers ${where} ORDER BY id`)
    .all();
  return rows.map(parseTrigger);
}

export function insertTrigger(params: {
  name: string;
  condition: unknown;
  action: unknown;
  cooldown_ms: number;
  enabled?: boolean;
}): number {
  const r = getDb().run(
    `INSERT INTO triggers (name, condition, action, cooldown_ms, enabled)
     VALUES (?, ?, ?, ?, ?)`,
    [
      params.name, JSON.stringify(params.condition), JSON.stringify(params.action),
      params.cooldown_ms, params.enabled !== false ? 1 : 0,
    ],
  );
  return Number(r.lastInsertRowid);
}

export function updateTriggerFired(id: number): void {
  getDb().run("UPDATE triggers SET last_fired_at = datetime('now') WHERE id = ?", [id]);
}

export function deleteTrigger(id: number): void {
  getDb().run("DELETE FROM triggers WHERE id = ?", [id]);
}

export function countTriggers(): number {
  const row = getDb().query<{ n: number }, []>("SELECT COUNT(*) AS n FROM triggers").get();
  return row?.n ?? 0;
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
    db.run("DELETE FROM relationships");
    db.run("DELETE FROM memory_stream");
    db.run("DELETE FROM triggers");
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

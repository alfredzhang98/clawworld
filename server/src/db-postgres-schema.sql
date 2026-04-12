-- PostgreSQL schema for clawworld (v0.2+)
-- This replaces bun:sqlite when CLAWWORLD_DB_DRIVER=postgres is set.
-- Key differences from SQLite:
--   SERIAL instead of AUTOINCREMENT
--   TIMESTAMPTZ instead of TEXT for dates
--   JSONB instead of TEXT for JSON columns
--   $1/$2 parameterized queries instead of ?

CREATE TABLE IF NOT EXISTS lobsters (
    id            SERIAL PRIMARY KEY,
    token         TEXT    UNIQUE NOT NULL,
    name          TEXT    UNIQUE NOT NULL,
    job           TEXT    NOT NULL,
    bio           TEXT    NOT NULL DEFAULT '',
    role          TEXT    NOT NULL DEFAULT 'player',
    location      TEXT    NOT NULL DEFAULT 'hatchery',
    coins         INTEGER NOT NULL DEFAULT 100,
    forge_score   INTEGER NOT NULL DEFAULT 0,
    reputation    INTEGER NOT NULL DEFAULT 0,
    specialty     JSONB   NOT NULL DEFAULT '{}',
    badges        JSONB   NOT NULL DEFAULT '[]',
    personality   JSONB   NOT NULL DEFAULT '[]',
    honor_tags    JSONB   NOT NULL DEFAULT '[]',
    hunger        INTEGER NOT NULL DEFAULT 100,
    warmth        INTEGER NOT NULL DEFAULT 100,
    fashion       JSONB   NOT NULL DEFAULT '[]',
    skills        JSONB   NOT NULL DEFAULT '{}',
    profession    TEXT    NOT NULL DEFAULT '',
    prof_level    INTEGER NOT NULL DEFAULT 0,
    card_sig      TEXT    NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS locations (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL,
    neighbors     JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS tasks (
    id            SERIAL PRIMARY KEY,
    title         TEXT    NOT NULL,
    description   TEXT    NOT NULL,
    category      TEXT    NOT NULL DEFAULT 'general',
    reward_coins  INTEGER NOT NULL DEFAULT 10,
    reward_rep    INTEGER NOT NULL DEFAULT 1,
    poster_kind   TEXT    NOT NULL,
    poster_id     INTEGER REFERENCES lobsters(id),
    location      TEXT,
    status        TEXT    NOT NULL DEFAULT 'open',
    accepted_by   INTEGER REFERENCES lobsters(id),
    submission    TEXT,
    badge         TEXT,
    review_status TEXT    NOT NULL DEFAULT 'auto',
    reviewer_id   INTEGER REFERENCES lobsters(id),
    review_note   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS events (
    id            SERIAL PRIMARY KEY,
    kind          TEXT NOT NULL,
    actor_id      INTEGER,
    target_id     INTEGER,
    location      TEXT,
    payload       JSONB NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
    id            SERIAL PRIMARY KEY,
    from_id       INTEGER NOT NULL REFERENCES lobsters(id),
    location      TEXT    NOT NULL,
    content       TEXT    NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS direct_messages (
    id            SERIAL PRIMARY KEY,
    from_id       INTEGER NOT NULL REFERENCES lobsters(id),
    to_id         INTEGER NOT NULL REFERENCES lobsters(id),
    content       TEXT    NOT NULL,
    read          BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS relationships (
    id               SERIAL PRIMARY KEY,
    lobster_a        INTEGER NOT NULL REFERENCES lobsters(id),
    lobster_b        INTEGER NOT NULL REFERENCES lobsters(id),
    kind             TEXT    NOT NULL,
    strength         INTEGER NOT NULL DEFAULT 1,
    last_interaction TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata         JSONB   NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(lobster_a, lobster_b, kind)
);

CREATE TABLE IF NOT EXISTS memory_stream (
    id               SERIAL PRIMARY KEY,
    source_event_id  INTEGER REFERENCES events(id),
    summary          TEXT    NOT NULL,
    importance       INTEGER NOT NULL DEFAULT 1,
    tags             JSONB   NOT NULL DEFAULT '[]',
    location         TEXT,
    actor_ids        JSONB   NOT NULL DEFAULT '[]',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS triggers (
    id            SERIAL PRIMARY KEY,
    name          TEXT    NOT NULL,
    condition     JSONB   NOT NULL DEFAULT '{}',
    action        JSONB   NOT NULL DEFAULT '{}',
    cooldown_ms   INTEGER NOT NULL DEFAULT 3600000,
    last_fired_at TIMESTAMPTZ,
    enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
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

-- Postgres-specific: GIN index for JSONB columns (fast tag searches)
CREATE INDEX IF NOT EXISTS idx_memory_tags_gin ON memory_stream USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_lobsters_badges_gin ON lobsters USING GIN (badges);
CREATE INDEX IF NOT EXISTS idx_lobsters_skills_gin ON lobsters USING GIN (skills);

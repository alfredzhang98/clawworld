"""SQLite helpers for clawworld.

PoC scope: single-file SQLite, synchronous access, minimal indexes.
All state lives here — lobsters, tasks, events, messages, locations.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

DEFAULT_DB_PATH = Path(__file__).parent.parent / "data" / "clawworld.db"

SCHEMA = """
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
    specialty     TEXT    NOT NULL DEFAULT '{}',  -- JSON {category: level}
    badges        TEXT    NOT NULL DEFAULT '[]',  -- JSON list
    card_sig      TEXT    NOT NULL DEFAULT '',    -- HMAC signature of card body
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS locations (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL,
    neighbors     TEXT NOT NULL DEFAULT '[]'      -- JSON list of location ids
);

CREATE TABLE IF NOT EXISTS tasks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT    NOT NULL,
    description   TEXT    NOT NULL,
    category      TEXT    NOT NULL DEFAULT 'general',
    reward_coins  INTEGER NOT NULL DEFAULT 10,
    reward_rep    INTEGER NOT NULL DEFAULT 1,
    poster_kind   TEXT    NOT NULL,   -- 'system' | 'lobster' | 'user'
    poster_id     INTEGER,            -- lobster id if poster_kind='lobster'
    location      TEXT,
    status        TEXT    NOT NULL DEFAULT 'open',  -- 'open' | 'accepted' | 'completed' | 'cancelled'
    accepted_by   INTEGER,            -- lobster id
    submission    TEXT,
    badge         TEXT,               -- badge granted on completion (optional)
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    completed_at  TEXT,
    FOREIGN KEY (accepted_by) REFERENCES lobsters(id)
);

CREATE TABLE IF NOT EXISTS events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    kind          TEXT NOT NULL,      -- 'lobster_joined' | 'task_posted' | 'task_completed' | 'chat' | 'transfer' | 'move'
    actor_id      INTEGER,
    target_id     INTEGER,
    location      TEXT,
    payload       TEXT NOT NULL DEFAULT '{}',  -- JSON
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
"""


_lock = threading.Lock()
_db_path: Path = DEFAULT_DB_PATH


def set_db_path(path: Path | str) -> None:
    """Override the database path (used by tests and --init-world)."""
    global _db_path
    _db_path = Path(path)
    _db_path.parent.mkdir(parents=True, exist_ok=True)


def get_db_path() -> Path:
    _db_path.parent.mkdir(parents=True, exist_ok=True)
    return _db_path


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    """Serialized connection context. SQLite is fine for PoC; one global lock."""
    with _lock:
        conn = sqlite3.connect(get_db_path())
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def init_schema() -> None:
    """Create all tables if they don't exist."""
    with connect() as conn:
        conn.executescript(SCHEMA)


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    d = dict(row)
    # Deserialize JSON columns when present
    for key in ("specialty", "badges", "neighbors", "payload"):
        if key in d and isinstance(d[key], str):
            try:
                d[key] = json.loads(d[key])
            except (json.JSONDecodeError, TypeError):
                pass
    return d


# ---------------------------------------------------------------------------
# Lobster helpers
# ---------------------------------------------------------------------------

def get_lobster_by_token(token: str) -> dict[str, Any] | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM lobsters WHERE token = ?", (token,)
        ).fetchone()
    return row_to_dict(row)


def get_lobster_by_name(name: str) -> dict[str, Any] | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM lobsters WHERE name = ?", (name,)
        ).fetchone()
    return row_to_dict(row)


def get_lobster_by_id(lobster_id: int) -> dict[str, Any] | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM lobsters WHERE id = ?", (lobster_id,)
        ).fetchone()
    return row_to_dict(row)


def list_lobsters_at(location: str) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, name, job, bio FROM lobsters WHERE location = ? ORDER BY name",
            (location,),
        ).fetchall()
    return [dict(r) for r in rows]


def count_lobsters() -> int:
    with connect() as conn:
        return conn.execute("SELECT COUNT(*) FROM lobsters").fetchone()[0]


# ---------------------------------------------------------------------------
# Location helpers
# ---------------------------------------------------------------------------

def get_location(loc_id: str) -> dict[str, Any] | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM locations WHERE id = ?", (loc_id,)
        ).fetchone()
    return row_to_dict(row)


def list_locations() -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute("SELECT * FROM locations ORDER BY id").fetchall()
    return [row_to_dict(r) for r in rows]  # type: ignore[misc]


# ---------------------------------------------------------------------------
# Event log
# ---------------------------------------------------------------------------

def log_event(
    kind: str,
    actor_id: int | None = None,
    target_id: int | None = None,
    location: str | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO events (kind, actor_id, target_id, location, payload) "
            "VALUES (?, ?, ?, ?, ?)",
            (kind, actor_id, target_id, location, json.dumps(payload or {})),
        )


def recent_events(limit: int = 20) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM events ORDER BY created_at DESC, id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [row_to_dict(r) for r in rows]  # type: ignore[misc]

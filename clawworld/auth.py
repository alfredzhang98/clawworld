"""Authentication & lobster-card signing for clawworld.

PoC scope:
- Each lobster gets a random bearer token at registration.
- Every tool call passes `auth_token` explicitly (transport-agnostic).
- Lobster cards are signed with HMAC-SHA256 using a server secret so that
  stats (coins, reputation, badges) cannot be forged client-side.

v1 plan: upgrade to Ed25519 signatures + proper OAuth (see ARCHITECTURE.md).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
from pathlib import Path
from typing import Any

SECRET_PATH = Path(__file__).parent.parent / "data" / "server_secret.txt"


def _load_or_create_secret() -> bytes:
    SECRET_PATH.parent.mkdir(parents=True, exist_ok=True)
    if SECRET_PATH.exists():
        return SECRET_PATH.read_bytes()
    secret = secrets.token_bytes(32)
    SECRET_PATH.write_bytes(secret)
    try:
        os.chmod(SECRET_PATH, 0o600)
    except OSError:
        pass
    return secret


_SECRET: bytes | None = None


def server_secret() -> bytes:
    global _SECRET
    if _SECRET is None:
        _SECRET = _load_or_create_secret()
    return _SECRET


def new_lobster_token() -> str:
    """Opaque bearer token for a newly registered lobster."""
    return "lob_" + secrets.token_urlsafe(24)


# ---------------------------------------------------------------------------
# Lobster card signing
# ---------------------------------------------------------------------------

CARD_FIELDS = (
    "id",
    "name",
    "job",
    "coins",
    "forge_score",
    "reputation",
    "specialty",
    "badges",
    "created_at",
)


def _canonical_card_body(lobster: dict[str, Any]) -> bytes:
    """Deterministic JSON over CARD_FIELDS — order matters for HMAC."""
    body = {k: lobster.get(k) for k in CARD_FIELDS}
    return json.dumps(body, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sign_card(lobster: dict[str, Any]) -> str:
    body = _canonical_card_body(lobster)
    mac = hmac.new(server_secret(), body, hashlib.sha256).hexdigest()
    return mac


def verify_card(lobster: dict[str, Any], signature: str) -> bool:
    expected = sign_card(lobster)
    return hmac.compare_digest(expected, signature)


def build_card(lobster: dict[str, Any]) -> dict[str, Any]:
    """Return a user-facing capability card (signed)."""
    body = {k: lobster.get(k) for k in CARD_FIELDS}
    return {
        "card": body,
        "signature": sign_card(lobster),
        "algorithm": "HMAC-SHA256",
        "version": "0.1.0-genesis",
    }

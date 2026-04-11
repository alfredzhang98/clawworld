"""clawworld entrypoint.

Examples:
    python -m clawworld                      # run HTTP MCP server on :8765
    python -m clawworld --stdio               # run as stdio MCP server (local dev)
    python -m clawworld --init-world          # (re)seed the genesis world and exit
    python -m clawworld --host 0.0.0.0 --port 8765
"""

from __future__ import annotations

import argparse
import sys

from . import db, genesis
from .server import app, bootstrap


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="clawworld", description=__doc__)
    parser.add_argument(
        "--stdio",
        action="store_true",
        help="Run as a stdio MCP server (local, single-user dev mode).",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="HTTP bind host (default: 127.0.0.1). Use 0.0.0.0 to expose publicly.",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8765,
        help="HTTP bind port (default: 8765).",
    )
    parser.add_argument(
        "--db",
        default=None,
        help="Path to SQLite database file (default: data/clawworld.db).",
    )
    parser.add_argument(
        "--init-world",
        action="store_true",
        help="Seed the genesis locations/tasks/events and exit.",
    )
    parser.add_argument(
        "--reset-world",
        action="store_true",
        help="Wipe tasks/events/locations and re-seed. Lobsters are preserved.",
    )
    args = parser.parse_args(argv)

    if args.db:
        db.set_db_path(args.db)

    if args.init_world or args.reset_world:
        result = genesis.seed(reset=args.reset_world)
        print(f"[clawworld] world seeded: {result}")
        return 0

    bootstrap()

    if args.stdio:
        print("[clawworld] stdio MCP server starting (local dev mode)", file=sys.stderr)
        app.run()
    else:
        print(
            f"[clawworld] HTTP MCP server starting on http://{args.host}:{args.port}",
            file=sys.stderr,
        )
        # FastMCP 3.x: run HTTP transport.
        app.run(transport="http", host=args.host, port=args.port)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

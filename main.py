#!/usr/bin/env python3
"""newEarth – a multi-agent world simulation.

Run the simulation from the repository root:

    python main.py                   # default: 20×20 world, 14 agents, 50 ticks
    python main.py --ticks 200 --seed 42
    python main.py --width 30 --height 30 --agents 20 --ticks 100
    python main.py --quiet           # suppress per-tick output; show final state only
"""
from __future__ import annotations

import argparse
import sys
import time

# Ensure project root is on sys.path
import os
sys.path.insert(0, os.path.dirname(__file__))

from simulation.engine import SimulationEngine


LEGEND = """
Legend
------
Terrain : . plains  T forest  ^ mountain  ~ ocean  : desert  ≈ river
Agents  : E Explorer  B Builder  f Farmer  $ Trader  S Scholar  G Guardian  H Healer
Structs : ⌂ structure (house / farm / road / storehouse)
"""


def main() -> None:
    parser = argparse.ArgumentParser(description="newEarth multi-agent simulation")
    parser.add_argument("--width",  type=int, default=20, help="World width  (default 20)")
    parser.add_argument("--height", type=int, default=20, help="World height (default 20)")
    parser.add_argument("--agents", type=int, default=14, help="Number of agents (default 14)")
    parser.add_argument("--ticks",  type=int, default=50,  help="Simulation ticks (default 50)")
    parser.add_argument("--seed",   type=int, default=None, help="Random seed for reproducibility")
    parser.add_argument("--delay",  type=float, default=0.0,
                        help="Seconds to pause between ticks (default 0 – run as fast as possible)")
    parser.add_argument("--quiet",  action="store_true",
                        help="Suppress per-tick output; only print final state")
    args = parser.parse_args()

    print("=" * 62)
    print("  🌍  newEarth – multi-agent world simulation")
    print("=" * 62)
    print(f"  World : {args.width}×{args.height}  |  Agents : {args.agents}"
          f"  |  Ticks : {args.ticks}")
    if args.seed is not None:
        print(f"  Seed  : {args.seed}")
    print(LEGEND)

    engine = SimulationEngine(width=args.width, height=args.height, seed=args.seed)
    engine.populate(num_agents=args.agents)

    snapshot = ""
    for tick_idx, snapshot in enumerate(engine.run(ticks=args.ticks), start=1):
        if not args.quiet:
            # Clear screen for animation effect (works in most terminals)
            if args.delay > 0:
                print("\033[2J\033[H", end="")
            print(snapshot)
            if args.delay > 0:
                time.sleep(args.delay)

    # Always print the final state
    if args.quiet:
        print(snapshot)

    # Final summary
    print("\n" + "=" * 62)
    print("  Simulation complete.")
    world = engine.world
    living = [a for a in world.agents if a.alive]
    total_structs = sum(len(c.structures) for row in engine.world._grid for c in row)
    known_cells = len(world._knowledge_map)
    print(f"  Agents alive      : {len(living)}")
    print(f"  Structures built  : {total_structs}")
    print(f"  Cells explored    : {known_cells} / {world.width * world.height}")

    for agent in sorted(living, key=lambda a: a.role):
        extras = []
        if hasattr(agent, "visited"):
            extras.append(f"explored={len(agent.visited)}")
        if hasattr(agent, "structures_built"):
            extras.append(f"built={agent.structures_built}")
        if hasattr(agent, "food_donated"):
            extras.append(f"donated={agent.food_donated}")
        if hasattr(agent, "trades_completed"):
            extras.append(f"trades={agent.trades_completed}")
        if hasattr(agent, "facts_recorded"):
            extras.append(f"facts={agent.facts_recorded}")
        if hasattr(agent, "allies_helped"):
            extras.append(f"helped={agent.allies_helped}")
        if hasattr(agent, "agents_healed"):
            extras.append(f"healed={agent.agents_healed}")
        extra_str = "  " + ", ".join(extras) if extras else ""
        print(f"  {agent.role:<12} {agent.name:<20} energy={agent.energy}{extra_str}")
    print("=" * 62)


if __name__ == "__main__":
    main()

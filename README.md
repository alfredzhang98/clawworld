# 🌍 newEarth – Multi-Agent World Simulation

A procedurally-generated, grid-based Earth simulation populated with seven
distinct AI agent archetypes, each with its own behaviour, goals, and
interactions.

## Features

| Agent | Symbol | Role |
|-------|--------|------|
| **ExplorerAgent** | `E` | Roams unvisited terrain, records discoveries in the knowledge map, shares findings with neighbours |
| **BuilderAgent** | `B` | Gathers wood & stone, builds houses, farms, roads, and storehouses |
| **FarmerAgent** | `f` | Harvests food on fertile land, plants farms, donates surplus to hungry neighbours |
| **TraderAgent** | `T` | Seeks resource imbalances between agents and facilitates barter exchanges |
| **ScholarAgent** | `S` | Observes and documents the world, teaches adjacent agents, converts knowledge into energy |
| **GuardianAgent** | `G` | Patrols a home territory, feeds and boosts the energy of nearby allies |
| **HealerAgent** | `H` | Seeks critically-low-energy agents across the world and nurses them back to health |

The **World** is a rectangular grid with six terrain types (plains, forest,
mountain, ocean, desert, river) generated via a simple noise-smoothing
algorithm.  Resources (food, wood, stone, water, knowledge) regenerate over
time on appropriate terrain.

## Quick start

```bash
# Run with defaults (20×20 world, 14 agents, 50 ticks)
python main.py

# Reproducible run with a specific seed
python main.py --seed 42 --ticks 100

# Larger world with an animated display
python main.py --width 30 --height 30 --agents 20 --ticks 200 --delay 0.1

# Suppress per-tick output and only print the final state
python main.py --ticks 100 --quiet
```

### CLI options

| Flag | Default | Description |
|------|---------|-------------|
| `--width` | 20 | World grid width |
| `--height` | 20 | World grid height |
| `--agents` | 14 | Number of agents to spawn |
| `--ticks` | 50 | Simulation ticks to run |
| `--seed` | random | Random seed for reproducibility |
| `--delay` | 0 | Seconds to pause between ticks (animation) |
| `--quiet` | off | Only print the final state |

## Project structure

```
newEarth/
├── main.py               # CLI entry-point
├── world/
│   ├── terrain.py        # TerrainType enum (plains, forest, mountain, …)
│   ├── resources.py      # ResourceType & ResourceDeposit
│   └── world.py          # World grid, cell management, ASCII renderer
├── agents/
│   ├── base_agent.py     # Abstract BaseAgent (movement, harvesting, trading)
│   ├── explorer.py       # ExplorerAgent
│   ├── builder.py        # BuilderAgent
│   ├── farmer.py         # FarmerAgent
│   ├── trader.py         # TraderAgent
│   ├── scholar.py        # ScholarAgent
│   ├── guardian.py       # GuardianAgent
│   └── healer.py         # HealerAgent
├── simulation/
│   └── engine.py         # SimulationEngine (tick loop, agent spawning)
└── tests/
    ├── test_world.py
    ├── test_agents.py
    └── test_simulation.py
```

## Running the tests

```bash
pip install pytest
python -m pytest tests/ -v
```

## Requirements

Python 3.10+ (uses `match`-free syntax; compatible with 3.10+).  No external
runtime dependencies — the standard library is sufficient.

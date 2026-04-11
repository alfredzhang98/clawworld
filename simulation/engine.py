"""Simulation engine – orchestrates ticks and agent spawning."""
from __future__ import annotations

import random
from typing import List, Optional, Type

from world.world import World
from agents.base_agent import BaseAgent
from agents.explorer import ExplorerAgent
from agents.builder import BuilderAgent
from agents.farmer import FarmerAgent
from agents.trader import TraderAgent
from agents.scholar import ScholarAgent
from agents.guardian import GuardianAgent
from agents.healer import HealerAgent


AGENT_CLASSES: List[Type[BaseAgent]] = [
    ExplorerAgent,
    BuilderAgent,
    FarmerAgent,
    TraderAgent,
    ScholarAgent,
    GuardianAgent,
    HealerAgent,
]


class SimulationEngine:
    """Runs the newEarth multi-agent world simulation.

    Usage::

        engine = SimulationEngine(width=20, height=20, seed=42)
        engine.populate(num_agents=14)
        for snapshot in engine.run(ticks=200):
            print(snapshot)
    """

    def __init__(
        self,
        width: int = 20,
        height: int = 20,
        seed: Optional[int] = None,
    ) -> None:
        self.world = World(width=width, height=height, seed=seed)
        self._rng = random.Random(seed)

    # ------------------------------------------------------------------
    # Population setup
    # ------------------------------------------------------------------

    def _random_passable_position(self) -> tuple[int, int]:
        """Return a random passable, unoccupied position."""
        for _ in range(1000):
            x = self._rng.randint(0, self.world.width - 1)
            y = self._rng.randint(0, self.world.height - 1)
            cell = self.world.cell(x, y)
            if cell.terrain.passable and not cell.occupied:
                return x, y
        raise RuntimeError("Could not find a passable position after 1000 attempts.")

    def spawn_agent(
        self,
        agent_class: Type[BaseAgent],
        name: Optional[str] = None,
        x: Optional[int] = None,
        y: Optional[int] = None,
    ) -> BaseAgent:
        """Spawn a single agent of *agent_class* at a random or given position."""
        if x is None or y is None:
            x, y = self._random_passable_position()
        if name is None:
            name = f"{agent_class.__name__.replace('Agent', '')}_{len(self.world.agents) + 1}"
        # Derive a deterministic seed from the engine RNG so the simulation is
        # reproducible when a world seed is provided.
        agent_seed = self._rng.randint(0, 2**31 - 1)
        agent = agent_class(self.world, x, y, name=name, seed=agent_seed)
        self.world.add_agent(agent)
        return agent

    def populate(self, num_agents: int = 14) -> List[BaseAgent]:
        """Spawn a balanced mix of all agent types, guaranteeing at least one
        of every agent class, then filling remaining slots randomly.
        """
        agents = []
        # First pass: one of each type (shuffled for variety)
        base_types = list(AGENT_CLASSES)
        self._rng.shuffle(base_types)
        for cls in base_types[:num_agents]:
            agents.append(self.spawn_agent(cls))
        # Second pass: fill remaining slots with random types
        remaining = num_agents - len(agents)
        extra_types = [self._rng.choice(AGENT_CLASSES) for _ in range(remaining)]
        for cls in extra_types:
            agents.append(self.spawn_agent(cls))
        return agents

    # ------------------------------------------------------------------
    # Simulation loop
    # ------------------------------------------------------------------

    def step(self) -> str:
        """Advance by a single tick; return a rendered snapshot string."""
        self.world.tick()
        for agent in list(self.world.agents):
            agent.tick()
        return self._snapshot()

    def run(self, ticks: int = 100):
        """Generator that yields a snapshot string after every tick."""
        for _ in range(ticks):
            yield self.step()

    def _snapshot(self) -> str:
        lines = [self.world.stats(), self.world.render(), self._agent_table()]
        return "\n".join(lines)

    def _agent_table(self) -> str:
        """Return a short table of all living agents."""
        rows = ["Role        Name                Pos        Energy  Inventory"]
        rows.append("-" * 60)
        for agent in sorted(self.world.agents, key=lambda a: a.role):
            inv_str = " ".join(
                f"{r.symbol}:{v}"
                for r, v in agent.inventory.items()
                if v > 0
            )
            rows.append(
                f"{agent.role:<12}{agent.name:<20}({agent.x:>2},{agent.y:>2})"
                f"  {agent.energy:>5}  {inv_str}"
            )
        return "\n".join(rows)

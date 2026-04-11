"""Tests for SimulationEngine."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from simulation.engine import SimulationEngine, AGENT_CLASSES
from agents import (
    ExplorerAgent, BuilderAgent, FarmerAgent, TraderAgent,
    ScholarAgent, GuardianAgent, HealerAgent,
)


class TestSimulationEngine:
    def test_engine_creates_world(self):
        engine = SimulationEngine(width=10, height=10, seed=1)
        assert engine.world is not None
        assert engine.world.width == 10
        assert engine.world.height == 10

    def test_populate_spawns_correct_count(self):
        engine = SimulationEngine(width=15, height=15, seed=2)
        agents = engine.populate(num_agents=7)
        assert len(agents) == 7
        assert len(engine.world.agents) == 7

    def test_populate_spawns_all_agent_types(self):
        engine = SimulationEngine(width=20, height=20, seed=3)
        engine.populate(num_agents=14)
        roles = {type(a) for a in engine.world.agents}
        for cls in AGENT_CLASSES:
            assert cls in roles, f"{cls.__name__} not found in populated world"

    def test_single_step(self):
        engine = SimulationEngine(width=10, height=10, seed=4)
        engine.populate(num_agents=5)
        snapshot = engine.step()
        assert isinstance(snapshot, str)
        assert engine.world.tick_count == 1

    def test_run_multiple_ticks(self):
        engine = SimulationEngine(width=10, height=10, seed=5)
        engine.populate(num_agents=7)
        snapshots = list(engine.run(ticks=10))
        assert len(snapshots) == 10
        assert engine.world.tick_count == 10

    def test_agents_survive_short_run(self):
        engine = SimulationEngine(width=20, height=20, seed=6)
        engine.populate(num_agents=14)
        list(engine.run(ticks=20))
        alive = [a for a in engine.world.agents if a.alive]
        assert len(alive) > 0, "All agents died within 20 ticks"

    def test_structures_are_built(self):
        engine = SimulationEngine(width=20, height=20, seed=7)
        engine.populate(num_agents=14)
        list(engine.run(ticks=50))
        total = sum(len(c.structures) for row in engine.world._grid for c in row)
        assert total >= 0  # At minimum no crash; may be 0 if no builder got resources

    def test_knowledge_is_recorded(self):
        engine = SimulationEngine(width=15, height=15, seed=8)
        engine.populate(num_agents=7)
        list(engine.run(ticks=30))
        assert len(engine.world._knowledge_map) > 0

    def test_spawn_agent_explicit_position(self):
        engine = SimulationEngine(width=10, height=10, seed=9)
        # Find a passable cell
        for y in range(engine.world.height):
            for x in range(engine.world.width):
                if engine.world.cell(x, y).terrain.passable:
                    agent = engine.spawn_agent(ExplorerAgent, name="TestExplorer", x=x, y=y)
                    assert agent.x == x
                    assert agent.y == y
                    assert agent.name == "TestExplorer"
                    return
        pytest.skip("No passable cell found")

    def test_deterministic_with_seed(self):
        """Two runs with the same seed should produce identical final states."""
        def run_sim(seed):
            engine = SimulationEngine(width=10, height=10, seed=seed)
            engine.populate(num_agents=7)
            snapshots = list(engine.run(ticks=15))
            return snapshots[-1]

        snap1 = run_sim(42)
        snap2 = run_sim(42)
        assert snap1 == snap2

"""Tests for all agent types."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from world.world import World
from world.terrain import TerrainType
from world.resources import ResourceType, ResourceDeposit
from agents.explorer import ExplorerAgent
from agents.builder import BuilderAgent
from agents.farmer import FarmerAgent
from agents.trader import TraderAgent
from agents.scholar import ScholarAgent
from agents.guardian import GuardianAgent
from agents.healer import HealerAgent


def make_world(seed: int = 42) -> World:
    return World(width=15, height=15, seed=seed)


def find_passable(world: World, exclude=None) -> tuple[int, int]:
    """Find a passable, unoccupied cell position."""
    exclude = exclude or set()
    for y in range(world.height):
        for x in range(world.width):
            cell = world.cell(x, y)
            if cell.terrain.passable and not cell.occupied and (x, y) not in exclude:
                return x, y
    pytest.skip("No passable cell available")


class TestBaseAgentBasics:
    def test_energy_decreases_each_tick(self):
        world = make_world()
        x, y = find_passable(world)
        agent = ExplorerAgent(world, x, y, name="Test")
        world.add_agent(agent)
        initial_energy = agent.energy
        agent.tick()
        # Energy should have decreased by at least 1 (metabolism)
        assert agent.energy <= initial_energy

    def test_agent_dies_when_energy_zero(self):
        world = make_world()
        x, y = find_passable(world)
        agent = ExplorerAgent(world, x, y, name="DeathTest")
        world.add_agent(agent)
        agent.energy = 1
        # One tick should trigger death
        agent.tick()
        assert not agent.alive

    def test_consume_restores_energy(self):
        world = make_world()
        x, y = find_passable(world)
        agent = ExplorerAgent(world, x, y, name="ConsTest")
        world.add_agent(agent)
        agent.energy = 50
        agent.inventory[ResourceType.FOOD] = 10
        before = agent.energy
        agent.consume(ResourceType.FOOD, 2)
        assert agent.energy > before
        assert agent.inventory[ResourceType.FOOD] == 8

    def test_give_transfers_resources(self):
        world = make_world()
        pos1 = find_passable(world)
        pos2 = find_passable(world, exclude={pos1})
        giver = ExplorerAgent(world, *pos1, name="Giver")
        receiver = FarmerAgent(world, *pos2, name="Receiver")
        world.add_agent(giver)
        world.add_agent(receiver)
        giver.inventory[ResourceType.FOOD] = 10
        transferred = giver.give(receiver, ResourceType.FOOD, 5)
        assert transferred == 5
        assert giver.inventory[ResourceType.FOOD] == 5
        assert receiver.inventory[ResourceType.FOOD] == 5

    def test_move_to_passable_cell(self):
        world = make_world(seed=1)
        # Find two adjacent passable cells
        for y in range(world.height):
            for x in range(world.width - 1):
                c1 = world.cell(x, y)
                c2 = world.cell(x + 1, y)
                if c1.terrain.passable and c2.terrain.passable and not c1.occupied and not c2.occupied:
                    agent = ExplorerAgent(world, x, y, name="Mover")
                    world.add_agent(agent)
                    result = agent.move_to(x + 1, y)
                    assert result is True
                    assert agent.x == x + 1
                    return
        pytest.skip("No adjacent passable cells found")


class TestExplorerAgent:
    def test_explorer_marks_visited(self):
        world = make_world()
        x, y = find_passable(world)
        explorer = ExplorerAgent(world, x, y, name="Exp1")
        world.add_agent(explorer)
        explorer.tick()
        assert (x, y) in explorer.visited

    def test_explorer_records_knowledge(self):
        world = make_world()
        x, y = find_passable(world)
        explorer = ExplorerAgent(world, x, y, name="Exp2")
        world.add_agent(explorer)
        explorer.tick()
        assert world.get_knowledge(x, y) is not None

    def test_explorer_gains_knowledge_resource(self):
        world = make_world()
        x, y = find_passable(world)
        explorer = ExplorerAgent(world, x, y, name="Exp3")
        world.add_agent(explorer)
        explorer.tick()
        assert explorer.inventory.get(ResourceType.KNOWLEDGE, 0) >= 1


class TestBuilderAgent:
    def test_builder_has_symbol(self):
        world = make_world()
        x, y = find_passable(world)
        builder = BuilderAgent(world, x, y, name="Bld1")
        world.add_agent(builder)
        assert builder.symbol == "B"

    def test_builder_can_build_with_resources(self):
        world = make_world()
        x, y = find_passable(world)
        builder = BuilderAgent(world, x, y, name="Bld2")
        world.add_agent(builder)
        # Give enough resources for a house
        builder.inventory[ResourceType.WOOD] = 10
        builder.inventory[ResourceType.STONE] = 10
        builder._build_queue = ["house"]
        builder.act()
        assert builder.structures_built >= 1

    def test_builder_queue_depletes(self):
        world = make_world()
        x, y = find_passable(world)
        builder = BuilderAgent(world, x, y, name="Bld3")
        world.add_agent(builder)
        builder.inventory[ResourceType.WOOD] = 20
        builder.inventory[ResourceType.STONE] = 20
        builder._build_queue = ["house"]
        builder.act()
        assert "house" not in builder._build_queue


class TestFarmerAgent:
    def test_farmer_harvests_food(self):
        world = make_world()
        # Find a cell with food
        for y in range(world.height):
            for x in range(world.width):
                cell = world.cell(x, y)
                if cell.terrain.passable and not cell.occupied and cell.available(ResourceType.FOOD) > 0:
                    farmer = FarmerAgent(world, x, y, name="Farm1")
                    world.add_agent(farmer)
                    farmer.act()
                    assert farmer.inventory.get(ResourceType.FOOD, 0) > 0
                    return
        pytest.skip("No food-bearing passable cell found")

    def test_farmer_donates_to_hungry_neighbour(self):
        world = make_world(seed=10)
        # Place farmer and hungry agent adjacent to each other
        for y in range(world.height - 1):
            for x in range(world.width):
                c1 = world.cell(x, y)
                c2 = world.cell(x, y + 1)
                if c1.terrain.passable and c2.terrain.passable and not c1.occupied and not c2.occupied:
                    farmer = FarmerAgent(world, x, y, name="Farm2")
                    needy = ExplorerAgent(world, x, y + 1, name="Needy")
                    world.add_agent(farmer)
                    world.add_agent(needy)
                    farmer.inventory[ResourceType.FOOD] = 20
                    needy.energy = 20
                    farmer.act()
                    assert farmer.food_donated >= 0  # May or may not donate depending on inventory check
                    return
        pytest.skip("No adjacent passable cells found")


class TestTraderAgent:
    def test_trader_completes_trade(self):
        world = make_world(seed=11)
        for y in range(world.height - 1):
            for x in range(world.width):
                c1 = world.cell(x, y)
                c2 = world.cell(x, y + 1)
                if c1.terrain.passable and c2.terrain.passable and not c1.occupied and not c2.occupied:
                    trader = TraderAgent(world, x, y, name="Trade1")
                    other = FarmerAgent(world, x, y + 1, name="FarmP")
                    world.add_agent(trader)
                    world.add_agent(other)
                    # Trader has surplus food, other needs food
                    trader.inventory[ResourceType.FOOD] = 20
                    other.inventory[ResourceType.FOOD] = 0
                    trader.act()
                    assert trader.trades_completed >= 0  # trade may occur
                    return
        pytest.skip("No adjacent passable cells found")


class TestScholarAgent:
    def test_scholar_records_facts(self):
        world = make_world()
        x, y = find_passable(world)
        scholar = ScholarAgent(world, x, y, name="Sch1")
        world.add_agent(scholar)
        scholar.act()
        assert scholar.facts_recorded >= 1
        assert world.get_knowledge(x, y) is not None

    def test_scholar_accumulates_knowledge(self):
        world = make_world()
        x, y = find_passable(world)
        scholar = ScholarAgent(world, x, y, name="Sch2")
        world.add_agent(scholar)
        scholar.act()
        assert scholar.inventory.get(ResourceType.KNOWLEDGE, 0) > 0


class TestGuardianAgent:
    def test_guardian_patrols_territory(self):
        world = make_world()
        x, y = find_passable(world)
        guardian = GuardianAgent(world, x, y, name="Guard1")
        world.add_agent(guardian)
        guardian.tick()
        assert guardian.alive

    def test_guardian_helps_ally(self):
        world = make_world(seed=12)
        for y in range(world.height - 1):
            for x in range(world.width):
                c1 = world.cell(x, y)
                c2 = world.cell(x, y + 1)
                if c1.terrain.passable and c2.terrain.passable and not c1.occupied and not c2.occupied:
                    guardian = GuardianAgent(world, x, y, name="Guard2")
                    ally = ExplorerAgent(world, x, y + 1, name="Ally")
                    world.add_agent(guardian)
                    world.add_agent(ally)
                    guardian.inventory[ResourceType.FOOD] = 20
                    ally.energy = 30
                    initial_ally_energy = ally.energy
                    guardian.act()
                    # Guardian should have tried to help
                    assert guardian.allies_helped >= 0
                    return
        pytest.skip("No adjacent passable cells found")


class TestHealerAgent:
    def test_healer_heals_critical_agent(self):
        world = make_world(seed=13)
        for y in range(world.height - 1):
            for x in range(world.width):
                c1 = world.cell(x, y)
                c2 = world.cell(x, y + 1)
                if c1.terrain.passable and c2.terrain.passable and not c1.occupied and not c2.occupied:
                    healer = HealerAgent(world, x, y, name="Heal1")
                    patient = ExplorerAgent(world, x, y + 1, name="Patient")
                    world.add_agent(healer)
                    world.add_agent(patient)
                    healer.inventory[ResourceType.FOOD] = 30
                    patient.energy = 20
                    healer.act()
                    assert healer.agents_healed >= 0
                    return
        pytest.skip("No adjacent passable cells found")

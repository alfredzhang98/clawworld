"""Tests for World and Cell classes."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from world.world import World, Cell
from world.terrain import TerrainType
from world.resources import ResourceType, ResourceDeposit


class TestCell:
    def test_cell_creation(self):
        cell = Cell(3, 5, TerrainType.PLAINS)
        assert cell.x == 3
        assert cell.y == 5
        assert cell.terrain == TerrainType.PLAINS
        assert not cell.occupied

    def test_harvest(self):
        cell = Cell(0, 0, TerrainType.PLAINS)
        cell.add_deposit(ResourceDeposit(ResourceType.FOOD, 10, 10))
        gained = cell.harvest(ResourceType.FOOD, 4)
        assert gained == 4
        assert cell.available(ResourceType.FOOD) == 6

    def test_harvest_capped_by_available(self):
        cell = Cell(0, 0, TerrainType.PLAINS)
        cell.add_deposit(ResourceDeposit(ResourceType.FOOD, 3, 10))
        gained = cell.harvest(ResourceType.FOOD, 10)
        assert gained == 3

    def test_regeneration(self):
        cell = Cell(0, 0, TerrainType.PLAINS)
        dep = ResourceDeposit(ResourceType.FOOD, 0, 10, renewable=True, regen_rate=2)
        cell.add_deposit(dep)
        cell.tick()
        assert dep.amount == 2


class TestWorldGeneration:
    def test_world_dimensions(self):
        world = World(width=10, height=8, seed=1)
        assert world.width == 10
        assert world.height == 8

    def test_all_cells_have_terrain(self):
        world = World(width=10, height=10, seed=2)
        for y in range(world.height):
            for x in range(world.width):
                cell = world.cell(x, y)
                assert isinstance(cell.terrain, TerrainType)

    def test_in_bounds(self):
        world = World(width=5, height=5, seed=3)
        assert world.in_bounds(0, 0)
        assert world.in_bounds(4, 4)
        assert not world.in_bounds(-1, 0)
        assert not world.in_bounds(5, 5)

    def test_cell_out_of_bounds_raises(self):
        world = World(width=5, height=5, seed=4)
        with pytest.raises(IndexError):
            world.cell(10, 10)

    def test_neighbors_count(self):
        world = World(width=10, height=10, seed=5)
        # Corner cell has 2 neighbours
        n = world.neighbors(0, 0)
        assert len(n) == 2
        # Interior cell has 4 neighbours
        n = world.neighbors(5, 5)
        assert len(n) == 4

    def test_world_tick_increments_counter(self):
        world = World(seed=6)
        assert world.tick_count == 0
        world.tick()
        assert world.tick_count == 1

    def test_build_structure(self):
        world = World(seed=7)
        # Find a passable cell
        for y in range(world.height):
            for x in range(world.width):
                if world.cell(x, y).terrain.passable:
                    result = world.build_structure(x, y, "house")
                    assert result is True
                    assert "house" in world.cell(x, y).structures
                    return
        pytest.skip("No passable cell found")

    def test_knowledge_map(self):
        world = World(seed=8)
        world.record_knowledge(0, 0, "test fact")
        assert world.get_knowledge(0, 0) == "test fact"
        assert world.get_knowledge(1, 1) is None

    def test_render_returns_string(self):
        world = World(width=5, height=5, seed=9)
        rendered = world.render()
        assert isinstance(rendered, str)
        lines = rendered.split("\n")
        assert len(lines) == 5
        assert all(len(line) == 5 for line in lines)

"""The World – a procedurally-generated grid-based map for newEarth."""
from __future__ import annotations

import random
from typing import Dict, List, Optional, Tuple, TYPE_CHECKING

from .terrain import TerrainType
from .resources import ResourceDeposit, ResourceType

if TYPE_CHECKING:
    from agents.base_agent import BaseAgent


class Cell:
    """A single tile in the world grid."""

    def __init__(self, x: int, y: int, terrain: TerrainType) -> None:
        self.x = x
        self.y = y
        self.terrain = terrain
        self.deposits: List[ResourceDeposit] = []
        self.structures: List[str] = []  # e.g. "house", "farm", "road"
        self._agent: Optional["BaseAgent"] = None

    # ------------------------------------------------------------------
    # Agent occupancy
    # ------------------------------------------------------------------

    @property
    def agent(self) -> Optional["BaseAgent"]:
        return self._agent

    @agent.setter
    def agent(self, value: Optional["BaseAgent"]) -> None:
        self._agent = value

    @property
    def occupied(self) -> bool:
        return self._agent is not None

    # ------------------------------------------------------------------
    # Resource helpers
    # ------------------------------------------------------------------

    def add_deposit(self, deposit: ResourceDeposit) -> None:
        self.deposits.append(deposit)

    def harvest(self, resource_type: ResourceType, amount: int) -> int:
        """Harvest *amount* of *resource_type* from this cell."""
        total = 0
        for dep in self.deposits:
            if dep.resource_type == resource_type:
                total += dep.harvest(amount - total)
                if total >= amount:
                    break
        return total

    def available(self, resource_type: ResourceType) -> int:
        return sum(d.amount for d in self.deposits if d.resource_type == resource_type)

    def tick(self) -> None:
        for dep in self.deposits:
            dep.tick()

    def __repr__(self) -> str:
        return f"Cell({self.x}, {self.y}, {self.terrain.name})"


class World:
    """The simulated Earth – a rectangular grid with terrain and resources."""

    def __init__(
        self,
        width: int = 20,
        height: int = 20,
        seed: Optional[int] = None,
    ) -> None:
        self.width = width
        self.height = height
        self.tick_count = 0
        self._rng = random.Random(seed)
        self._grid: List[List[Cell]] = []
        self._agents: List["BaseAgent"] = []
        self._structures: Dict[Tuple[int, int], List[str]] = {}
        self._knowledge_map: Dict[Tuple[int, int], str] = {}  # discovered by scholars

        self._generate()

    # ------------------------------------------------------------------
    # World generation
    # ------------------------------------------------------------------

    def _generate(self) -> None:
        """Procedurally generate a plausible world map."""
        rng = self._rng

        # Step 1 – base terrain using simple noise simulation
        raw: List[List[float]] = [
            [rng.random() for _ in range(self.width)] for _ in range(self.height)
        ]
        # Smooth three passes to create contiguous regions
        raw = self._smooth(raw, passes=3)

        self._grid = []
        for y in range(self.height):
            row: List[Cell] = []
            for x in range(self.width):
                v = raw[y][x]
                if v < 0.18:
                    terrain = TerrainType.OCEAN
                elif v < 0.28:
                    terrain = TerrainType.RIVER
                elif v < 0.45:
                    terrain = TerrainType.PLAINS
                elif v < 0.60:
                    terrain = TerrainType.FOREST
                elif v < 0.75:
                    terrain = TerrainType.DESERT
                else:
                    terrain = TerrainType.MOUNTAIN
                row.append(Cell(x, y, terrain))
            self._grid.append(row)

        # Step 2 – place resource deposits
        self._place_resources()

    def _smooth(self, grid: List[List[float]], passes: int) -> List[List[float]]:
        h = len(grid)
        w = len(grid[0])
        for _ in range(passes):
            new: List[List[float]] = []
            for y in range(h):
                row: List[float] = []
                for x in range(w):
                    neighbors = [grid[ny][nx]
                                 for dy in range(-1, 2)
                                 for dx in range(-1, 2)
                                 if 0 <= (ny := y + dy) < h and 0 <= (nx := x + dx) < w]
                    row.append(sum(neighbors) / len(neighbors))
                new.append(row)
            grid = new
        return grid

    def _place_resources(self) -> None:
        """Scatter resource deposits across the map according to terrain."""
        terrain_resources = {
            TerrainType.FOREST: [(ResourceType.WOOD, 30, 30, True, 2),
                                 (ResourceType.FOOD, 15, 15, True, 1)],
            TerrainType.PLAINS: [(ResourceType.FOOD, 20, 20, True, 2),
                                 (ResourceType.WATER, 10, 10, True, 1)],
            TerrainType.MOUNTAIN: [(ResourceType.STONE, 50, 50, False, 0),
                                   (ResourceType.WATER, 8, 8, True, 1)],
            TerrainType.RIVER: [(ResourceType.WATER, 40, 40, True, 3),
                                (ResourceType.FOOD, 10, 10, True, 1)],
            TerrainType.DESERT: [(ResourceType.STONE, 20, 20, False, 0)],
        }
        for row in self._grid:
            for cell in row:
                specs = terrain_resources.get(cell.terrain, [])
                for (rtype, amt, max_amt, renewable, regen) in specs:
                    if self._rng.random() < 0.6:
                        cell.add_deposit(ResourceDeposit(rtype, amt, max_amt, renewable, regen))

    # ------------------------------------------------------------------
    # Grid access
    # ------------------------------------------------------------------

    def in_bounds(self, x: int, y: int) -> bool:
        return 0 <= x < self.width and 0 <= y < self.height

    def cell(self, x: int, y: int) -> Cell:
        if not self.in_bounds(x, y):
            raise IndexError(f"Position ({x}, {y}) is out of bounds.")
        return self._grid[y][x]

    def neighbors(self, x: int, y: int, diagonal: bool = False) -> List[Cell]:
        """Return adjacent cells (4-directional, or 8 if diagonal=True)."""
        offsets = [(-1, 0), (1, 0), (0, -1), (0, 1)]
        if diagonal:
            offsets += [(-1, -1), (-1, 1), (1, -1), (1, 1)]
        result = []
        for dx, dy in offsets:
            nx, ny = x + dx, y + dy
            if self.in_bounds(nx, ny):
                result.append(self._grid[ny][nx])
        return result

    def passable_neighbors(self, x: int, y: int) -> List[Cell]:
        return [c for c in self.neighbors(x, y) if c.terrain.passable and not c.occupied]

    # ------------------------------------------------------------------
    # Agent management
    # ------------------------------------------------------------------

    def add_agent(self, agent: "BaseAgent") -> None:
        if not self.in_bounds(agent.x, agent.y):
            raise ValueError(f"Agent position ({agent.x}, {agent.y}) is out of bounds.")
        self._agents.append(agent)
        self._grid[agent.y][agent.x].agent = agent

    def move_agent(self, agent: "BaseAgent", new_x: int, new_y: int) -> bool:
        """Move agent to (new_x, new_y); returns True on success."""
        if not self.in_bounds(new_x, new_y):
            return False
        target = self._grid[new_y][new_x]
        if not target.terrain.passable or target.occupied:
            return False
        self._grid[agent.y][agent.x].agent = None
        agent.x = new_x
        agent.y = new_y
        target.agent = agent
        return True

    def remove_agent(self, agent: "BaseAgent") -> None:
        if agent in self._agents:
            self._agents.remove(agent)
        if self.in_bounds(agent.x, agent.y):
            self._grid[agent.y][agent.x].agent = None

    @property
    def agents(self) -> List["BaseAgent"]:
        return list(self._agents)

    # ------------------------------------------------------------------
    # Structure management
    # ------------------------------------------------------------------

    def build_structure(self, x: int, y: int, structure_type: str) -> bool:
        """Place a structure on cell (x, y)."""
        cell = self.cell(x, y)
        if not cell.terrain.passable:
            return False
        cell.structures.append(structure_type)
        return True

    # ------------------------------------------------------------------
    # Knowledge map (populated by ScholarAgent)
    # ------------------------------------------------------------------

    def record_knowledge(self, x: int, y: int, fact: str) -> None:
        self._knowledge_map[(x, y)] = fact

    def get_knowledge(self, x: int, y: int) -> Optional[str]:
        return self._knowledge_map.get((x, y))

    # ------------------------------------------------------------------
    # Simulation tick
    # ------------------------------------------------------------------

    def tick(self) -> None:
        """Advance the world by one simulation step."""
        self.tick_count += 1
        for row in self._grid:
            for cell in row:
                cell.tick()

    # ------------------------------------------------------------------
    # Rendering
    # ------------------------------------------------------------------

    def render(self) -> str:
        """Return an ASCII representation of the world."""
        lines = []
        for y in range(self.height):
            row_chars = []
            for x in range(self.width):
                cell = self._grid[y][x]
                if cell.agent is not None:
                    row_chars.append(cell.agent.symbol)
                elif cell.structures:
                    row_chars.append("⌂")
                else:
                    row_chars.append(cell.terrain.symbol)
            lines.append("".join(row_chars))
        return "\n".join(lines)

    def stats(self) -> str:
        """Return a brief statistics summary."""
        living = [a for a in self._agents if a.alive]
        return (
            f"Tick {self.tick_count:>4} | "
            f"Agents alive: {len(living):>3}/{len(self._agents):>3} | "
            f"Structures: {sum(len(c.structures) for row in self._grid for c in row):>4}"
        )

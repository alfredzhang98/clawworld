"""ExplorerAgent – maps the world and shares discoveries."""
from __future__ import annotations

from typing import Optional, Set, Tuple, TYPE_CHECKING

from agents.base_agent import BaseAgent
from world.resources import ResourceType

if TYPE_CHECKING:
    from world.world import World


class ExplorerAgent(BaseAgent):
    """Explores unvisited terrain and records discoveries in the world's
    knowledge map.  Explorers share their findings with any agent they
    encounter, boosting that agent's knowledge resource.
    """

    def __init__(self, world: "World", x: int, y: int, name: str = "Explorer",
                 **kwargs) -> None:
        super().__init__(world, x, y, name, **kwargs)
        self.visited: Set[Tuple[int, int]] = set()
        self._target: Optional[Tuple[int, int]] = None

    @property
    def symbol(self) -> str:
        return "E"

    @property
    def role(self) -> str:
        return "Explorer"

    def act(self) -> None:
        # Mark current position as visited and record knowledge
        pos = (self.x, self.y)
        if pos not in self.visited:
            self.visited.add(pos)
            cell = self.world.cell(self.x, self.y)
            self.world.record_knowledge(
                self.x, self.y,
                f"terrain={cell.terrain.name}, resources={[d.resource_type.value for d in cell.deposits]}"
            )
            self._log_event(f"discovered ({self.x},{self.y}): {cell.terrain.name}")
            # Gain knowledge for exploring
            self.inventory[ResourceType.KNOWLEDGE] = (
                self.inventory.get(ResourceType.KNOWLEDGE, 0) + 1
            )

        # Eat if hungry
        if self.energy < 40 and self.inventory.get(ResourceType.FOOD, 0) > 0:
            self.consume(ResourceType.FOOD, 2)

        # Forage food from current cell if low
        cell = self.world.cell(self.x, self.y)
        if self.energy < 60 and cell.available(ResourceType.FOOD) > 0:
            self.harvest(ResourceType.FOOD, 3)

        # Share knowledge with nearby agents
        for neighbor_cell in self.world.neighbors(self.x, self.y):
            if neighbor_cell.agent and neighbor_cell.agent is not self:
                other = neighbor_cell.agent
                other.inventory[ResourceType.KNOWLEDGE] = (
                    other.inventory.get(ResourceType.KNOWLEDGE, 0) + 1
                )

        # Move: prefer unvisited cells, otherwise random
        unvisited = [
            c for c in self.world.passable_neighbors(self.x, self.y)
            if (c.x, c.y) not in self.visited
        ]
        if unvisited:
            choice = self._rng.choice(unvisited)
            self.move_to(choice.x, choice.y)
        elif self._target is None or (self.x, self.y) == self._target:
            # Pick a random distant target
            self._target = (
                self._rng.randint(0, self.world.width - 1),
                self._rng.randint(0, self.world.height - 1),
            )
        else:
            self.move_toward(*self._target)

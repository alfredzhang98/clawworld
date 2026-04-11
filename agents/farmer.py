"""FarmerAgent – cultivates food and sustains the population."""
from __future__ import annotations

from typing import Optional, Tuple, TYPE_CHECKING

from agents.base_agent import BaseAgent
from world.resources import ResourceType
from world.terrain import TerrainType

if TYPE_CHECKING:
    from world.world import World

# Terrain types suitable for farming
FARMABLE = {TerrainType.PLAINS, TerrainType.FOREST, TerrainType.RIVER}


class FarmerAgent(BaseAgent):
    """Finds fertile land, harvests food, builds farms, and donates surplus
    food to nearby agents that are running low.
    """

    def __init__(self, world: "World", x: int, y: int, name: str = "Farmer",
                 **kwargs) -> None:
        super().__init__(world, x, y, name, carry_capacity=40, **kwargs)
        self.food_donated: int = 0
        self._farm_location: Optional[Tuple[int, int]] = None

    @property
    def symbol(self) -> str:
        return "f"

    @property
    def role(self) -> str:
        return "Farmer"

    def act(self) -> None:
        # Eat if hungry
        if self.energy < 50 and self.inventory.get(ResourceType.FOOD, 0) > 0:
            self.consume(ResourceType.FOOD, 3)

        cell = self.world.cell(self.x, self.y)

        # Harvest food if available here
        if cell.available(ResourceType.FOOD) > 0:
            harvested = self.harvest(ResourceType.FOOD, 5)
            if harvested:
                self._log_event(f"harvested {harvested} food at ({self.x},{self.y})")

        # Build a farm here if this is good terrain and there isn't one yet
        if (cell.terrain in FARMABLE
                and "farm" not in cell.structures
                and self.inventory.get(ResourceType.WOOD, 0) >= 3):
            self.inventory[ResourceType.WOOD] -= 3
            self.world.build_structure(self.x, self.y, "farm")
            self._farm_location = (self.x, self.y)
            self._log_event(f"built farm at ({self.x},{self.y})")

        # Donate surplus food to hungry neighbours
        if self.inventory.get(ResourceType.FOOD, 0) > 15:
            for nbr_cell in self.world.neighbors(self.x, self.y):
                if nbr_cell.agent and nbr_cell.agent is not self:
                    other = nbr_cell.agent
                    if other.energy < 40:
                        given = self.give(other, ResourceType.FOOD, 5)
                        self.food_donated += given

        # Move to a better cell if current one is depleted
        if cell.available(ResourceType.FOOD) == 0:
            self._seek_fertile()

    def _seek_fertile(self) -> None:
        """Move toward the nearest fertile / food-rich cell."""
        best_cell = None
        best_score = -1
        for row in range(self.world.height):
            for col in range(self.world.width):
                c = self.world.cell(col, row)
                score = c.available(ResourceType.FOOD)
                if c.terrain in FARMABLE:
                    score += 5
                if score > best_score:
                    best_score = score
                    best_cell = c
        if best_cell and (best_cell.x, best_cell.y) != (self.x, self.y):
            self.move_toward(best_cell.x, best_cell.y)
        else:
            self.move_random()

"""BuilderAgent – collects resources and constructs structures."""
from __future__ import annotations

from typing import Optional, Tuple, TYPE_CHECKING

from agents.base_agent import BaseAgent
from world.resources import ResourceType
from world.terrain import TerrainType

if TYPE_CHECKING:
    from world.world import World

# Required resources for each structure type
STRUCTURE_COSTS = {
    "house": {ResourceType.WOOD: 5, ResourceType.STONE: 3},
    "farm": {ResourceType.WOOD: 3},
    "road": {ResourceType.STONE: 2},
    "storehouse": {ResourceType.WOOD: 8, ResourceType.STONE: 5},
}


class BuilderAgent(BaseAgent):
    """Gathers wood and stone, then constructs useful structures on passable
    terrain.  Builders prioritise building houses first, then farms, then roads.
    """

    def __init__(self, world: "World", x: int, y: int, name: str = "Builder",
                 **kwargs) -> None:
        super().__init__(world, x, y, name, carry_capacity=30, **kwargs)
        self.structures_built: int = 0
        self._gathering_target: Optional[Tuple[int, int]] = None
        # Default build order: houses first for shelter, then food production
        # (farm), infrastructure (road), a second house for population growth,
        # and finally storage (storehouse).  The duplicate 'house' is
        # intentional – Builders aim to establish more than one dwelling.
        self._build_queue: list[str] = ["house", "farm", "road", "house", "storehouse"]

    @property
    def symbol(self) -> str:
        return "B"

    @property
    def role(self) -> str:
        return "Builder"

    def _has_resources_for(self, structure: str) -> bool:
        costs = STRUCTURE_COSTS.get(structure, {})
        return all(self.inventory.get(r, 0) >= amt for r, amt in costs.items())

    def _spend_resources(self, structure: str) -> None:
        costs = STRUCTURE_COSTS.get(structure, {})
        for r, amt in costs.items():
            self.inventory[r] -= amt

    def act(self) -> None:
        # Eat if hungry
        if self.energy < 50 and self.inventory.get(ResourceType.FOOD, 0) > 0:
            self.consume(ResourceType.FOOD, 3)

        # If we have a target structure and enough resources – build it
        if self._build_queue:
            target_structure = self._build_queue[0]
            if self._has_resources_for(target_structure):
                cell = self.world.cell(self.x, self.y)
                if cell.terrain.passable and target_structure not in cell.structures:
                    self._spend_resources(target_structure)
                    self.world.build_structure(self.x, self.y, target_structure)
                    self.structures_built += 1
                    self._build_queue.pop(0)
                    self._log_event(f"built {target_structure} at ({self.x},{self.y})")
                    return

        # Gather resources needed for the next target structure
        if self._build_queue:
            needed = STRUCTURE_COSTS.get(self._build_queue[0], {})
            for resource_type, required in needed.items():
                if self.inventory.get(resource_type, 0) < required:
                    cell = self.world.cell(self.x, self.y)
                    if cell.available(resource_type) > 0:
                        self.harvest(resource_type, 5)
                        return
                    # Move toward a cell with the required resource
                    self._seek_resource(resource_type)
                    return

        # Idle: collect food or wander
        cell = self.world.cell(self.x, self.y)
        if cell.available(ResourceType.FOOD) > 0:
            self.harvest(ResourceType.FOOD, 3)
        else:
            self.move_random()

    def _seek_resource(self, resource_type: ResourceType) -> None:
        """Walk toward the nearest cell containing the required resource."""
        best_cell = None
        best_dist = float("inf")
        for row in range(self.world.height):
            for col in range(self.world.width):
                cell = self.world.cell(col, row)
                if cell.available(resource_type) > 0:
                    dist = (col - self.x) ** 2 + (row - self.y) ** 2
                    if dist < best_dist:
                        best_dist = dist
                        best_cell = cell
        if best_cell:
            self.move_toward(best_cell.x, best_cell.y)
        else:
            self.move_random()

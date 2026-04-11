"""GuardianAgent – defends territories and protects other agents."""
from __future__ import annotations

from typing import Optional, Tuple, TYPE_CHECKING

from agents.base_agent import BaseAgent
from world.resources import ResourceType

if TYPE_CHECKING:
    from world.world import World


class GuardianAgent(BaseAgent):
    """Patrols a home territory, deters threats (simulated by hazard cells),
    and provides energy buffs to nearby allies.

    Because this is a cooperative-only simulation there are no hostile agents,
    so the Guardian's role is to:
    - Patrol a defined radius around a home position.
    - Replenish ally energy by sharing food.
    - Alert allies to resource-scarce areas (reduce their movement cost
      abstraction by leading them to food).
    """

    PATROL_RADIUS = 4

    def __init__(self, world: "World", x: int, y: int, name: str = "Guardian",
                 **kwargs) -> None:
        super().__init__(world, x, y, name, carry_capacity=25, energy=120,
                         max_energy=120, **kwargs)
        self.home: Tuple[int, int] = (x, y)
        self.allies_helped: int = 0
        self._patrol_target: Optional[Tuple[int, int]] = None

    @property
    def symbol(self) -> str:
        return "G"

    @property
    def role(self) -> str:
        return "Guardian"

    def _in_territory(self, x: int, y: int) -> bool:
        hx, hy = self.home
        return abs(x - hx) <= self.PATROL_RADIUS and abs(y - hy) <= self.PATROL_RADIUS

    def act(self) -> None:
        # Eat if hungry
        if self.energy < 60 and self.inventory.get(ResourceType.FOOD, 0) > 0:
            self.consume(ResourceType.FOOD, 4)

        # Collect food from current cell to carry for sharing
        cell = self.world.cell(self.x, self.y)
        if cell.available(ResourceType.FOOD) > 0:
            self.harvest(ResourceType.FOOD, 3)

        # Help neighbouring allies
        for nbr_cell in self.world.neighbors(self.x, self.y):
            ally = nbr_cell.agent
            if ally is None or ally is self:
                continue
            # Share food with low-energy allies
            if ally.energy < 50 and self.inventory.get(ResourceType.FOOD, 0) >= 5:
                given = self.give(ally, ResourceType.FOOD, 5)
                if given:
                    self.allies_helped += 1
                    self._log_event(f"shared {given} food with {ally.name}")
            # Give a direct energy boost (Guardian's morale effect)
            if ally.energy < 70:
                boost = min(10, self.energy - 60)
                if boost > 0:
                    self.energy -= boost
                    ally.energy = min(ally.max_energy, ally.energy + boost)
                    self.allies_helped += 1

        # Patrol territory: pick a random point within patrol radius and walk there
        if self._patrol_target is None or (self.x, self.y) == self._patrol_target:
            hx, hy = self.home
            while True:
                tx = self._rng.randint(
                    max(0, hx - self.PATROL_RADIUS),
                    min(self.world.width - 1, hx + self.PATROL_RADIUS),
                )
                ty = self._rng.randint(
                    max(0, hy - self.PATROL_RADIUS),
                    min(self.world.height - 1, hy + self.PATROL_RADIUS),
                )
                target_cell = self.world.cell(tx, ty)
                if target_cell.terrain.passable:
                    self._patrol_target = (tx, ty)
                    break

        self.move_toward(*self._patrol_target)

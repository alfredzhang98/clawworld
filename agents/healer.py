"""HealerAgent – restores energy and distributes food to ailing agents."""
from __future__ import annotations

from typing import Optional, TYPE_CHECKING

from agents.base_agent import BaseAgent
from world.resources import ResourceType

if TYPE_CHECKING:
    from world.world import World


class HealerAgent(BaseAgent):
    """Searches for agents with critically low energy and nurses them back
    to health by sharing food and providing an energy transfer.

    Healers carry a large food supply, move toward the most needy agent in
    the world, and administer care on arrival.
    """

    CRITICAL_ENERGY = 30

    def __init__(self, world: "World", x: int, y: int, name: str = "Healer",
                 **kwargs) -> None:
        super().__init__(world, x, y, name, carry_capacity=50, **kwargs)
        self.agents_healed: int = 0

    @property
    def symbol(self) -> str:
        return "H"

    @property
    def role(self) -> str:
        return "Healer"

    def act(self) -> None:
        # Eat if hungry
        if self.energy < 40 and self.inventory.get(ResourceType.FOOD, 0) > 0:
            self.consume(ResourceType.FOOD, 3)

        # Collect food from current cell
        cell = self.world.cell(self.x, self.y)
        if cell.available(ResourceType.FOOD) > 0:
            self.harvest(ResourceType.FOOD, 5)

        # Heal adjacent agents first
        for nbr_cell in self.world.neighbors(self.x, self.y):
            patient = nbr_cell.agent
            if patient is None or patient is self:
                continue
            if patient.energy < self.CRITICAL_ENERGY:
                self._heal(patient)

        # Move toward the most critical agent anywhere
        target = self._find_most_needy()
        if target and (target.x, target.y) != (self.x, self.y):
            self.move_toward(target.x, target.y)
        else:
            self.move_random()

    def _heal(self, patient: "BaseAgent") -> None:
        if self.inventory.get(ResourceType.FOOD, 0) >= 5:
            given = self.give(patient, ResourceType.FOOD, 5)
            if given:
                patient.consume(ResourceType.FOOD, given)
                self.agents_healed += 1
                self._log_event(f"healed {patient.name} (gave {given} food)")
        # Direct energy transfer
        if self.energy > 60:
            transfer = min(15, self.energy - 60)
            self.energy -= transfer
            patient.energy = min(patient.max_energy, patient.energy + transfer)
            self.agents_healed += 1

    def _find_most_needy(self) -> Optional["BaseAgent"]:
        worst = None
        worst_energy = self.CRITICAL_ENERGY
        for agent in self.world.agents:
            if agent is self:
                continue
            if agent.energy < worst_energy:
                worst_energy = agent.energy
                worst = agent
        return worst

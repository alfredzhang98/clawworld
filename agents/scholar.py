"""ScholarAgent – observes the world and spreads knowledge."""
from __future__ import annotations

from typing import List, TYPE_CHECKING

from agents.base_agent import BaseAgent
from world.resources import ResourceType

if TYPE_CHECKING:
    from world.world import World


class ScholarAgent(BaseAgent):
    """Observes the world, accumulates knowledge, and teaches other agents.

    Each tick a Scholar:
    1. Records facts about its current cell.
    2. Surveys a wider neighbourhood to gather data.
    3. Shares accumulated knowledge with any adjacent agent.
    4. Consumes knowledge to restore energy (in-world abstraction).
    """

    def __init__(self, world: "World", x: int, y: int, name: str = "Scholar",
                 **kwargs) -> None:
        super().__init__(world, x, y, name, carry_capacity=15, **kwargs)
        self.facts_recorded: int = 0

    @property
    def symbol(self) -> str:
        return "S"

    @property
    def role(self) -> str:
        return "Scholar"

    def act(self) -> None:
        # Eat if hungry
        if self.energy < 40 and self.inventory.get(ResourceType.FOOD, 0) > 0:
            self.consume(ResourceType.FOOD, 2)

        # Forage food from current cell
        cell = self.world.cell(self.x, self.y)
        if cell.available(ResourceType.FOOD) > 0 and self.energy < 70:
            self.harvest(ResourceType.FOOD, 2)

        # Observe & record current cell
        fact = (
            f"terrain={cell.terrain.name}; "
            f"deposits={[d.resource_type.value for d in cell.deposits]}; "
            f"structures={cell.structures}"
        )
        self.world.record_knowledge(self.x, self.y, fact)
        self.inventory[ResourceType.KNOWLEDGE] = (
            self.inventory.get(ResourceType.KNOWLEDGE, 0) + 2
        )
        self.facts_recorded += 1

        # Survey diagonal neighbours too
        for nbr in self.world.neighbors(self.x, self.y, diagonal=True):
            nbr_fact = (
                f"terrain={nbr.terrain.name}; "
                f"deposits={[d.resource_type.value for d in nbr.deposits]}"
            )
            self.world.record_knowledge(nbr.x, nbr.y, nbr_fact)

        # Teach adjacent agents
        for nbr_cell in self.world.neighbors(self.x, self.y):
            if nbr_cell.agent and nbr_cell.agent is not self:
                other = nbr_cell.agent
                # Transfer some knowledge
                if self.inventory.get(ResourceType.KNOWLEDGE, 0) >= 3:
                    self.give(other, ResourceType.KNOWLEDGE, 3)
                    self._log_event(f"taught {other.name} (+3 knowledge)")
                # Bonus energy for the learner
                other.energy = min(other.max_energy, other.energy + 2)

        # Use knowledge to partially recover energy (study boosts morale)
        know = self.inventory.get(ResourceType.KNOWLEDGE, 0)
        if know >= 5:
            self.inventory[ResourceType.KNOWLEDGE] = know - 5
            self.energy = min(self.max_energy, self.energy + 5)

        # Wander to observe new areas
        self.move_random()

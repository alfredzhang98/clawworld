"""TraderAgent – exchanges resources between agents to balance supply."""
from __future__ import annotations

from typing import Optional, TYPE_CHECKING

from agents.base_agent import BaseAgent
from world.resources import ResourceType

if TYPE_CHECKING:
    from world.world import World


class TraderAgent(BaseAgent):
    """Seeks agents with resource surpluses and facilitates trades.

    Trading logic (simplified barter):
    - The trader carries a mixed inventory of resources.
    - When it meets another agent it offers any resource the other lacks in
      exchange for resources the other has in surplus.
    """

    SURPLUS_THRESHOLD = 10
    NEED_THRESHOLD = 3

    def __init__(self, world: "World", x: int, y: int, name: str = "Trader",
                 **kwargs) -> None:
        super().__init__(world, x, y, name, carry_capacity=50, **kwargs)
        self.trades_completed: int = 0

    @property
    def symbol(self) -> str:
        return "$"

    @property
    def role(self) -> str:
        return "Trader"

    def act(self) -> None:
        # Eat if hungry
        if self.energy < 50 and self.inventory.get(ResourceType.FOOD, 0) > 0:
            self.consume(ResourceType.FOOD, 3)

        # Collect a bit of everything from the current cell
        cell = self.world.cell(self.x, self.y)
        for resource in ResourceType:
            if resource == ResourceType.KNOWLEDGE:
                continue
            if cell.available(resource) > 0:
                self.harvest(resource, 3)

        # Trade with neighbouring agents
        traded_this_tick = False
        for nbr_cell in self.world.neighbors(self.x, self.y):
            other = nbr_cell.agent
            if other is None or other is self:
                continue
            if self._trade_with(other):
                traded_this_tick = True

        if not traded_this_tick:
            self.move_random()

    def _trade_with(self, other: "BaseAgent") -> bool:
        """Attempt a one-step barter exchange; returns True if a trade occurred."""
        gave_anything = False
        for resource in ResourceType:
            if resource == ResourceType.KNOWLEDGE:
                continue
            my_amount = self.inventory.get(resource, 0)
            their_amount = other.inventory.get(resource, 0)

            # I have surplus, they need it → give some
            if my_amount > self.SURPLUS_THRESHOLD and their_amount < self.NEED_THRESHOLD:
                given = self.give(other, resource, 4)
                if given:
                    gave_anything = True
                    self.trades_completed += 1
                    self._log_event(
                        f"traded {given} {resource.value} to {other.name}"
                    )

            # They have surplus, I need it → ask for some (they give freely in this model)
            elif their_amount > self.SURPLUS_THRESHOLD and my_amount < self.NEED_THRESHOLD:
                given = other.give(self, resource, 4)
                if given:
                    gave_anything = True
                    self.trades_completed += 1
                    self._log_event(
                        f"received {given} {resource.value} from {other.name}"
                    )
        return gave_anything

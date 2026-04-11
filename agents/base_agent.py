"""Base agent class for all newEarth inhabitants."""
from __future__ import annotations

import abc
import random
from typing import Optional, Tuple, TYPE_CHECKING

from world.resources import ResourceType, Inventory, empty_inventory

if TYPE_CHECKING:
    from world.world import World


class BaseAgent(abc.ABC):
    """Abstract base for every AI agent living in the newEarth simulation."""

    _id_counter = 0

    def __init__(
        self,
        world: "World",
        x: int,
        y: int,
        name: str,
        energy: int = 100,
        max_energy: int = 100,
        carry_capacity: int = 20,
        seed: Optional[int] = None,
    ) -> None:
        BaseAgent._id_counter += 1
        self.agent_id: int = BaseAgent._id_counter
        self.name = name
        self.world = world
        self.x = x
        self.y = y
        self.energy = energy
        self.max_energy = max_energy
        self.carry_capacity = carry_capacity
        self.inventory: Inventory = empty_inventory()
        self.alive = True
        self.age = 0  # ticks lived
        self._rng = random.Random(seed)
        self._log: list[str] = []

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def symbol(self) -> str:
        """Single-character display symbol for the world map."""
        return "?"

    @property
    def role(self) -> str:
        """Human-readable role name."""
        return self.__class__.__name__

    @property
    def inventory_weight(self) -> int:
        return sum(self.inventory.values())

    # ------------------------------------------------------------------
    # Core lifecycle
    # ------------------------------------------------------------------

    def tick(self) -> None:
        """Called every simulation step. Consumes energy; acts if alive."""
        if not self.alive:
            return
        self.age += 1
        self.energy -= 1  # baseline metabolism
        if self.energy <= 0:
            self._die("starvation")
            return
        self.act()

    def act(self) -> None:
        """Override in subclasses to implement agent behaviour."""
        pass

    def _die(self, reason: str = "unknown") -> None:
        self.alive = False
        self._log_event(f"died ({reason}) at age {self.age}")
        self.world.remove_agent(self)

    # ------------------------------------------------------------------
    # Movement helpers
    # ------------------------------------------------------------------

    def move_to(self, x: int, y: int) -> bool:
        if not self.world.in_bounds(x, y):
            return False
        target = self.world.cell(x, y)
        if not target.terrain.passable:
            return False
        cost = target.terrain.movement_cost
        if self.energy < cost:
            return False
        moved = self.world.move_agent(self, x, y)
        if moved:
            self.energy -= cost
        return moved

    def move_random(self) -> bool:
        candidates = self.world.passable_neighbors(self.x, self.y)
        if not candidates:
            return False
        target = self._rng.choice(candidates)
        return self.move_to(target.x, target.y)

    def move_toward(self, tx: int, ty: int) -> bool:
        """Take one step toward (tx, ty) using a greedy approach."""
        best: Optional[Tuple[int, int]] = None
        best_dist = (self.x - tx) ** 2 + (self.y - ty) ** 2
        for cell in self.world.passable_neighbors(self.x, self.y):
            dist = (cell.x - tx) ** 2 + (cell.y - ty) ** 2
            if dist < best_dist:
                best_dist = dist
                best = (cell.x, cell.y)
        if best:
            return self.move_to(*best)
        return False

    # ------------------------------------------------------------------
    # Resource helpers
    # ------------------------------------------------------------------

    def harvest(self, resource_type: ResourceType, amount: int = 5) -> int:
        space = self.carry_capacity - self.inventory_weight
        to_harvest = min(amount, space)
        if to_harvest <= 0:
            return 0
        cell = self.world.cell(self.x, self.y)
        gained = cell.harvest(resource_type, to_harvest)
        self.inventory[resource_type] = self.inventory.get(resource_type, 0) + gained
        return gained

    def consume(self, resource_type: ResourceType, amount: int = 5) -> int:
        available = self.inventory.get(resource_type, 0)
        consumed = min(available, amount)
        self.inventory[resource_type] = available - consumed
        restore = consumed * 8
        self.energy = min(self.max_energy, self.energy + restore)
        return consumed

    def give(self, other: "BaseAgent", resource_type: ResourceType, amount: int) -> int:
        have = self.inventory.get(resource_type, 0)
        transfer = min(have, amount, other.carry_capacity - other.inventory_weight)
        if transfer <= 0:
            return 0
        self.inventory[resource_type] -= transfer
        other.inventory[resource_type] = other.inventory.get(resource_type, 0) + transfer
        self._log_event(f"gave {transfer} {resource_type.value} to {other.name}")
        return transfer

    # ------------------------------------------------------------------
    # Logging
    # ------------------------------------------------------------------

    def _log_event(self, msg: str) -> None:
        entry = f"[t={self.world.tick_count}] {self.name}: {msg}"
        self._log.append(entry)

    def recent_log(self, n: int = 5) -> list[str]:
        return self._log[-n:]

    # ------------------------------------------------------------------
    # Representation
    # ------------------------------------------------------------------

    def __repr__(self) -> str:
        return (
            f"{self.role}(id={self.agent_id}, name={self.name!r}, "
            f"pos=({self.x},{self.y}), energy={self.energy})"
        )

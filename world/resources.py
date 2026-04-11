"""Resource types and deposit management for the newEarth world."""
from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict


class ResourceType(Enum):
    FOOD = "food"
    WOOD = "wood"
    STONE = "stone"
    WATER = "water"
    KNOWLEDGE = "knowledge"

    @property
    def symbol(self) -> str:
        return {
            ResourceType.FOOD: "F",
            ResourceType.WOOD: "W",
            ResourceType.STONE: "S",
            ResourceType.WATER: "A",
            ResourceType.KNOWLEDGE: "K",
        }[self]


@dataclass
class ResourceDeposit:
    """A finite or renewable deposit of a single resource type at a location."""

    resource_type: ResourceType
    amount: int
    max_amount: int
    renewable: bool = True
    regen_rate: int = 1  # units regenerated per tick

    def harvest(self, requested: int) -> int:
        """Harvest up to *requested* units; returns actual amount harvested."""
        harvested = min(self.amount, requested)
        self.amount -= harvested
        return harvested

    def tick(self) -> None:
        """Regenerate resources each simulation tick."""
        if self.renewable and self.amount < self.max_amount:
            self.amount = min(self.max_amount, self.amount + self.regen_rate)


# Convenient inventory alias used throughout the codebase.
Inventory = Dict[ResourceType, int]


def empty_inventory() -> Inventory:
    return {r: 0 for r in ResourceType}

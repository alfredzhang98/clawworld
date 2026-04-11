"""Terrain types for the newEarth world."""
from enum import Enum


class TerrainType(Enum):
    PLAINS = "plains"
    FOREST = "forest"
    MOUNTAIN = "mountain"
    OCEAN = "ocean"
    DESERT = "desert"
    RIVER = "river"

    # Display symbols used in ASCII rendering
    @property
    def symbol(self) -> str:
        return {
            TerrainType.PLAINS: ".",
            TerrainType.FOREST: "T",
            TerrainType.MOUNTAIN: "^",
            TerrainType.OCEAN: "~",
            TerrainType.DESERT: ":",
            TerrainType.RIVER: "≈",
        }[self]

    @property
    def passable(self) -> bool:
        """Whether agents can move onto this terrain."""
        return self != TerrainType.OCEAN

    @property
    def movement_cost(self) -> int:
        """Energy cost to enter this terrain cell."""
        return {
            TerrainType.PLAINS: 1,
            TerrainType.FOREST: 2,
            TerrainType.MOUNTAIN: 3,
            TerrainType.OCEAN: 99,
            TerrainType.DESERT: 2,
            TerrainType.RIVER: 2,
        }[self]

// Game constants — re-exports from clawworldMap.js so the rest of the
// codebase can import LOCATIONS, MAP_*, TILE_SIZE without knowing about
// the underlying ai-town tile data.

import {
  MAP_WIDTH as CW_MAP_WIDTH,
  MAP_HEIGHT as CW_MAP_HEIGHT,
  TILE_DIM as CW_TILE_DIM,
  CLAWWORLD_LOCATIONS,
} from "./clawworldMap.js";

export const TILE_SIZE = CW_TILE_DIM;       // 32
export const MAP_COLS = CW_MAP_WIDTH;       // 64
export const MAP_ROWS = CW_MAP_HEIGHT;      // 48
export const MAP_WIDTH = MAP_COLS * TILE_SIZE;   // 2048 px
export const MAP_HEIGHT = MAP_ROWS * TILE_SIZE;  // 1536 px

// Re-export locations using the same shape that GameCanvas expects
export const LOCATIONS = Object.fromEntries(
  Object.entries(CLAWWORLD_LOCATIONS).map(([id, loc]) => [
    id,
    {
      id,
      label: loc.label,
      icon: loc.icon,
      bounds: loc.bounds,
    },
  ]),
);

export function getLocation(id) {
  return LOCATIONS[id] ?? null;
}

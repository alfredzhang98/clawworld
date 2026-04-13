// clawworldMap — clawworld's outer-world map definition.
//
// Strategy: reuse ai-town's gentle.js tile data (a beautiful 64×48
// pre-designed village by professional artists) and overlay clawworld
// location anchors on the buildings that actually exist in that map.
//
// We DO NOT redraw the map ourselves — pixel art is hard and ours
// looked terrible. Instead we annotate which existing buildings are
// which clawworld location, and we add a few clawworld-specific
// metadata layers (door triggers, lobster spawn spots).
//
// The 5 location bounds below were identified by the build-cluster
// analysis in `assets-staging/` — each rectangle covers a real building
// that exists in the underlying ai-town map.

import {
  tilesetpath,
  tiledim,
  tilesetpxw,
  tilesetpxh,
  bgtiles,
  objmap,
} from "./aitown_gentle_data.js";

// Map dimensions come from the actual ai-town data array
export const MAP_WIDTH = bgtiles[0].length;   // 64 tiles
export const MAP_HEIGHT = bgtiles[0][0].length; // 48 tiles
export const TILE_DIM = tiledim;

/**
 * The clawworld outer map, in the shape PixiStaticMap expects.
 * We reuse ai-town's tile arrays as-is (no modifications).
 */
export const outerWorldMap = {
  width: MAP_WIDTH,
  height: MAP_HEIGHT,
  tileDim: tiledim,
  tileSetUrl: tilesetpath,
  tileSetDimX: tilesetpxw,
  tileSetDimY: tilesetpxh,
  bgTiles: bgtiles,
  objectTiles: objmap,
};

/**
 * Location bounds — each entry pinpoints a real building cluster in
 * ai-town's village. Coordinates were identified by automatic cluster
 * analysis (see `assets-staging/` script output). Adjust if a building
 * gets reassigned.
 *
 * Format: { x, y, w, h, label, doorX, doorY }
 *   x, y      — top-left tile coordinate of the building bounding box
 *   w, h      — width and height in tiles
 *   doorX, doorY — the entrance tile (where lobsters click to enter
 *                  the interior sub-map)
 */
export const CLAWWORLD_LOCATIONS = {
  council_hall: {
    label: "Creation Council Hall",
    icon: "🏛️",
    bounds: { x: 32, y: 0, w: 29, h: 17 },
    doorX: 46,
    doorY: 16,
  },
  hatchery: {
    label: "The Hatchery",
    icon: "🥚",
    bounds: { x: 5, y: 6, w: 11, h: 10 },
    doorX: 10,
    doorY: 15,
  },
  forge_ruins: {
    label: "The Forge Ruins",
    icon: "🔥",
    bounds: { x: 10, y: 35, w: 10, h: 12 },
    doorX: 14,
    doorY: 34,
  },
  coast: {
    label: "The Rocky Coast",
    icon: "🌊",
    bounds: { x: 41, y: 33, w: 14, h: 9 },
    doorX: 47,
    doorY: 32,
  },
  square: {
    label: "The Empty Square",
    icon: "📍",
    bounds: { x: 25, y: 22, w: 10, h: 8 },
    doorX: 30,
    doorY: 21,
  },
};

/**
 * Lookup: given a (x, y) tile coordinate, which clawworld location
 * (if any) does it belong to? Used by lobster-positioning and
 * click-to-enter logic.
 */
export function locationAtTile(tx, ty) {
  for (const [id, loc] of Object.entries(CLAWWORLD_LOCATIONS)) {
    const { x, y, w, h } = loc.bounds;
    if (tx >= x && tx < x + w && ty >= y && ty < y + h) return id;
  }
  return null;
}

/**
 * Get a deterministic spawn position for a lobster inside its location.
 * Different lobsters get different offsets so they don't all stack.
 */
export function lobsterSpawnPixel(locationId, lobsterId) {
  const loc = CLAWWORLD_LOCATIONS[locationId];
  if (!loc) {
    // Fallback: middle of map
    return { x: (MAP_WIDTH / 2) * TILE_DIM, y: (MAP_HEIGHT / 2) * TILE_DIM };
  }
  const { x, y, w, h } = loc.bounds;
  const hash = ((lobsterId || 1) * 2654435761) >>> 0;
  // Stay 1 tile inside the bounds, never on the edge
  const dx = 1 + (hash % Math.max(1, w - 2));
  const dy = 1 + ((hash >>> 8) % Math.max(1, h - 2));
  return {
    x: (x + dx) * TILE_DIM,
    y: (y + dy) * TILE_DIM,
  };
}

/**
 * Get the floating-label position for a location (just above the bounding box).
 */
export function locationLabelPixel(locationId) {
  const loc = CLAWWORLD_LOCATIONS[locationId];
  if (!loc) return { x: 0, y: 0 };
  const { x, y, w } = loc.bounds;
  return {
    x: (x + w / 2) * TILE_DIM,
    y: Math.max(0, y - 0.6) * TILE_DIM,
  };
}

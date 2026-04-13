// mapInteriors — one interior sub-map per creation location.
//
// Each interior is a small 15×12 tile room with walls, floor, and
// decorations specific to the location's theme. The south-center tile
// is marked as a "door out" — clicking it or standing on it returns
// the player to the outer world.
//
// All interiors share the same tile palette (TileGen.js) as the outer
// world for visual consistency.

import { TILE } from "./TileGen.js";

const INT_WIDTH = 15;
const INT_HEIGHT = 12;
const TILE_DIM = 32;

function makeLayer(fill) {
  const layer = [];
  for (let x = 0; x < INT_WIDTH; x++) {
    const col = [];
    for (let y = 0; y < INT_HEIGHT; y++) col.push(fill);
    layer.push(col);
  }
  return layer;
}

function set(layer, x, y, tile) {
  if (x < 0 || x >= INT_WIDTH || y < 0 || y >= INT_HEIGHT) return;
  layer[x][y] = tile;
}

function fillRect(layer, x0, y0, w, h, tile) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      set(layer, x, y, tile);
    }
  }
}

function strokeRect(layer, x0, y0, w, h, tile) {
  for (let x = x0; x < x0 + w; x++) {
    set(layer, x, y0, tile);
    set(layer, x, y0 + h - 1, tile);
  }
  for (let y = y0; y < y0 + h; y++) {
    set(layer, x0, y, tile);
    set(layer, x0 + w - 1, y, tile);
  }
}

// Interiors share a common door-out tile position (south-center).
// The enter_location / exit_location tools + scene manager know this
// is the exit point.
export const INTERIOR_DOOR_X = Math.floor(INT_WIDTH / 2);
export const INTERIOR_DOOR_Y = INT_HEIGHT - 1;

// ---------- Per-location builders -----------------------------------------

function buildCouncilHallInterior() {
  const bg = makeLayer(TILE.WOOD);
  const obj = makeLayer(TILE.EMPTY);
  // Walls around the perimeter
  strokeRect(bg, 0, 0, INT_WIDTH, INT_HEIGHT, TILE.WALL);
  // Roof at the top
  for (let x = 0; x < INT_WIDTH; x++) set(obj, x, 0, TILE.ROOF);
  // Door out (south-center) — stone
  set(bg, INTERIOR_DOOR_X, INTERIOR_DOOR_Y, TILE.STONE);
  set(bg, INTERIOR_DOOR_X - 1, INTERIOR_DOOR_Y, TILE.STONE);
  set(bg, INTERIOR_DOOR_X + 1, INTERIOR_DOOR_Y, TILE.STONE);
  // Central council altar (2x1)
  const cx = Math.floor(INT_WIDTH / 2);
  const cy = Math.floor(INT_HEIGHT / 2);
  set(obj, cx - 1, cy, TILE.STONE);
  set(obj, cx, cy, TILE.STONE);
  // Corner pillars
  set(obj, 2, 2, TILE.WALL);
  set(obj, INT_WIDTH - 3, 2, TILE.WALL);
  set(obj, 2, INT_HEIGHT - 3, TILE.WALL);
  set(obj, INT_WIDTH - 3, INT_HEIGHT - 3, TILE.WALL);
  // A trail of flowers from the door to the altar
  set(obj, cx, cy + 2, TILE.FLOWER_Y);
  set(obj, cx, cy + 3, TILE.FLOWER_Y);
  return { bg, obj };
}

function buildForgeRuinsInterior() {
  const bg = makeLayer(TILE.FORGE_FLOOR);
  const obj = makeLayer(TILE.EMPTY);
  // Rubble walls
  strokeRect(bg, 0, 0, INT_WIDTH, INT_HEIGHT, TILE.RUBBLE);
  // Door out
  set(bg, INTERIOR_DOOR_X, INTERIOR_DOOR_Y, TILE.STONE);
  // Massive central forge (3x2)
  const cx = Math.floor(INT_WIDTH / 2);
  const cy = Math.floor(INT_HEIGHT / 2);
  set(obj, cx - 1, cy - 1, TILE.FORGE);
  set(obj, cx, cy - 1, TILE.FORGE);
  set(obj, cx + 1, cy - 1, TILE.FORGE);
  set(obj, cx - 1, cy, TILE.FORGE);
  set(obj, cx, cy, TILE.FORGE);
  set(obj, cx + 1, cy, TILE.FORGE);
  // Anvils (stone chunks) on both sides
  set(obj, 2, cy, TILE.ROCK);
  set(obj, INT_WIDTH - 3, cy, TILE.ROCK);
  // Scattered rubble
  set(obj, 2, 2, TILE.RUBBLE);
  set(obj, INT_WIDTH - 3, 2, TILE.RUBBLE);
  set(obj, 3, INT_HEIGHT - 3, TILE.RUBBLE);
  set(obj, INT_WIDTH - 4, INT_HEIGHT - 3, TILE.RUBBLE);
  return { bg, obj };
}

function buildHatcheryInterior() {
  const bg = makeLayer(TILE.SAND);
  const obj = makeLayer(TILE.EMPTY);
  // Rock walls (cave-like)
  strokeRect(bg, 0, 0, INT_WIDTH, INT_HEIGHT, TILE.ROCK);
  // Door out
  set(bg, INTERIOR_DOOR_X, INTERIOR_DOOR_Y, TILE.STONE);
  // Large central tide pool (5x3)
  const cx = Math.floor(INT_WIDTH / 2);
  const cy = Math.floor(INT_HEIGHT / 2);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      set(obj, cx + dx, cy + dy, TILE.TIDE_POOL);
    }
  }
  // Small rocks scattered around
  set(obj, 2, 3, TILE.ROCK);
  set(obj, INT_WIDTH - 3, 3, TILE.ROCK);
  set(obj, 2, INT_HEIGHT - 3, TILE.ROCK);
  set(obj, INT_WIDTH - 3, INT_HEIGHT - 3, TILE.ROCK);
  return { bg, obj };
}

function buildCoastInterior() {
  const bg = makeLayer(TILE.ROCK);
  const obj = makeLayer(TILE.EMPTY);
  // Stone interior cave
  fillRect(bg, 2, 1, INT_WIDTH - 4, INT_HEIGHT - 2, TILE.STONE);
  // Rubble-rock walls
  strokeRect(bg, 0, 0, INT_WIDTH, INT_HEIGHT, TILE.ROCK);
  // Door out
  set(bg, INTERIOR_DOOR_X, INTERIOR_DOOR_Y, TILE.STONE);
  // A shallow pool along the bottom (water)
  for (let x = 3; x < INT_WIDTH - 3; x++) {
    set(obj, x, INT_HEIGHT - 3, TILE.WATER);
  }
  // Scattered rocks as seating
  set(obj, 4, 3, TILE.ROCK);
  set(obj, INT_WIDTH - 5, 3, TILE.ROCK);
  set(obj, Math.floor(INT_WIDTH / 2), 4, TILE.ROCK);
  return { bg, obj };
}

function buildSquareInterior() {
  // "Interior" of the square = an indoor covered pavilion
  const bg = makeLayer(TILE.STONE);
  const obj = makeLayer(TILE.EMPTY);
  // Wooden walls around
  strokeRect(bg, 0, 0, INT_WIDTH, INT_HEIGHT, TILE.WALL);
  for (let x = 0; x < INT_WIDTH; x++) set(obj, x, 0, TILE.ROOF);
  // Door out
  set(bg, INTERIOR_DOOR_X, INTERIOR_DOOR_Y, TILE.STONE);
  // Central fountain (smaller, 2x2)
  const cx = Math.floor(INT_WIDTH / 2);
  const cy = Math.floor(INT_HEIGHT / 2);
  set(obj, cx - 1, cy - 1, TILE.FOUNTAIN);
  set(obj, cx, cy - 1, TILE.FOUNTAIN);
  set(obj, cx - 1, cy, TILE.FOUNTAIN);
  set(obj, cx, cy, TILE.FOUNTAIN);
  // Notice boards (stone) along the walls
  set(obj, 3, 2, TILE.STONE);
  set(obj, INT_WIDTH - 4, 2, TILE.STONE);
  // Seating (wood) near the fountain
  set(obj, cx - 2, cy + 2, TILE.WOOD);
  set(obj, cx + 2, cy + 2, TILE.WOOD);
  return { bg, obj };
}

// ---------- Public API ----------------------------------------------------

const BUILDERS = {
  council_hall: buildCouncilHallInterior,
  forge_ruins: buildForgeRuinsInterior,
  hatchery: buildHatcheryInterior,
  coast: buildCoastInterior,
  square: buildSquareInterior,
};

const _cache = new Map();

/**
 * Get an interior map for a given creation-location id.
 * Returns a WorldMap-shaped object or null if the location has no interior.
 */
export function getInterior(locationId) {
  if (_cache.has(locationId)) return _cache.get(locationId);
  const builder = BUILDERS[locationId];
  if (!builder) return null;
  const { bg, obj } = builder();
  const map = {
    width: INT_WIDTH,
    height: INT_HEIGHT,
    tileDim: TILE_DIM,
    bgTiles: [bg],
    objectTiles: [obj],
    isInterior: true,
    locationId,
    doorOut: { x: INTERIOR_DOOR_X, y: INTERIOR_DOOR_Y },
    useProceduralAtlas: true,  // PixiStaticMap → use TileGen instead of URL
  };
  _cache.set(locationId, map);
  return map;
}

export function getInteriorLocationIds() {
  return Object.keys(BUILDERS);
}

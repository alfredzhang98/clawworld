// mapOuter — the main outer-world clawworld map (80×60 tiles).
//
// Hand-built programmatically using the TILE constants from TileGen.js.
// Every location has a real visible structure (walls, floor, decorations)
// — no colored overlay frames. Empty areas are actually grass.
//
// Layout:
//                       council_hall (big hall, rows 4-15, cols 30-50)
//                             │
//                           path
//                             │
//   forge_ruins ─── square (plaza, rows 20-32, cols 30-50) ─── coast
//   (rows 22-34,         │                                   (rows 20-34,
//    cols 6-22)        path                                   cols 56-76)
//                         │
//                    hatchery
//                   (rows 38-52, cols 30-50)
//
// All around: grass with scattered trees and flowers, fenced border.

import { TILE } from "./TileGen.js";

export const OUTER_WIDTH = 80;
export const OUTER_HEIGHT = 60;
export const TILE_DIM = 32;

// Seeded PRNG for deterministic decoration placement
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// Create a W×H 2D array filled with a value
function makeLayer(fill) {
  const layer = [];
  for (let x = 0; x < OUTER_WIDTH; x++) {
    const col = [];
    for (let y = 0; y < OUTER_HEIGHT; y++) col.push(fill);
    layer.push(col);
  }
  return layer;
}

function inBounds(x, y) {
  return x >= 0 && x < OUTER_WIDTH && y >= 0 && y < OUTER_HEIGHT;
}

function setTile(layer, x, y, tile) {
  if (!inBounds(x, y)) return;
  layer[x][y] = tile;
}

function fillRect(layer, x0, y0, w, h, tile) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      setTile(layer, x, y, tile);
    }
  }
}

function strokeRect(layer, x0, y0, w, h, tile) {
  for (let x = x0; x < x0 + w; x++) {
    setTile(layer, x, y0, tile);
    setTile(layer, x, y0 + h - 1, tile);
  }
  for (let y = y0; y < y0 + h; y++) {
    setTile(layer, x0, y, tile);
    setTile(layer, x0 + w - 1, y, tile);
  }
}

// Draw a straight horizontal/vertical path from (x1,y1) to (x2,y2) (L-shape)
function drawPath(layer, x1, y1, x2, y2, width = 2) {
  // Horizontal first
  const xMin = Math.min(x1, x2);
  const xMax = Math.max(x1, x2);
  for (let x = xMin; x <= xMax; x++) {
    for (let dy = 0; dy < width; dy++) {
      setTile(layer, x, y1 + dy, TILE.PATH);
    }
  }
  // Vertical
  const yMin = Math.min(y1, y2);
  const yMax = Math.max(y1, y2);
  for (let y = yMin; y <= yMax; y++) {
    for (let dx = 0; dx < width; dx++) {
      setTile(layer, x2 + dx, y, TILE.PATH);
    }
  }
}

// ---------- Location-specific builders ------------------------------------

// Council Hall: rectangular brick building with wood floor + central altar
function buildCouncilHall(bg, obj, x0, y0, w, h) {
  // Wood floor interior
  fillRect(bg, x0, y0, w, h, TILE.WOOD);
  // Brick wall perimeter
  strokeRect(bg, x0, y0, w, h, TILE.WALL);
  // Roof row at the very top (render as object tile above walls)
  for (let x = x0; x < x0 + w; x++) {
    setTile(obj, x, y0 - 1, TILE.ROOF);
    setTile(obj, x, y0, TILE.ROOF);
  }
  // Entrance (door gap) at the bottom center — stone steps
  const doorX = x0 + Math.floor(w / 2) - 1;
  const doorY = y0 + h - 1;
  setTile(bg, doorX, doorY, TILE.STONE);
  setTile(bg, doorX + 1, doorY, TILE.STONE);
  // Steps leading out (2 rows of stone in front of door)
  setTile(bg, doorX, doorY + 1, TILE.STONE);
  setTile(bg, doorX + 1, doorY + 1, TILE.STONE);
  setTile(bg, doorX - 1, doorY + 1, TILE.STONE);
  setTile(bg, doorX + 2, doorY + 1, TILE.STONE);
  // Central altar (2x2 stone block)
  const cx = x0 + Math.floor(w / 2) - 1;
  const cy = y0 + Math.floor(h / 2) - 1;
  setTile(obj, cx, cy, TILE.STONE);
  setTile(obj, cx + 1, cy, TILE.STONE);
  setTile(obj, cx, cy + 1, TILE.STONE);
  setTile(obj, cx + 1, cy + 1, TILE.STONE);
}

// Forge Ruins: forge floor + central forge core + rubble border
function buildForgeRuins(bg, obj, x0, y0, w, h) {
  // Forge floor base
  fillRect(bg, x0, y0, w, h, TILE.FORGE_FLOOR);
  // Rubble scattered on the border
  for (let i = 0; i < w; i += 2) {
    setTile(obj, x0 + i, y0, TILE.RUBBLE);
    setTile(obj, x0 + i, y0 + h - 1, TILE.RUBBLE);
  }
  for (let i = 0; i < h; i += 2) {
    setTile(obj, x0, y0 + i, TILE.RUBBLE);
    setTile(obj, x0 + w - 1, y0 + i, TILE.RUBBLE);
  }
  // Central forge core (3x3)
  const cx = x0 + Math.floor(w / 2) - 1;
  const cy = y0 + Math.floor(h / 2) - 1;
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      setTile(obj, cx + dx, cy + dy, TILE.FORGE);
    }
  }
  // Scattered rocks inside
  setTile(obj, x0 + 3, y0 + 3, TILE.RUBBLE);
  setTile(obj, x0 + w - 4, y0 + 3, TILE.RUBBLE);
  setTile(obj, x0 + 3, y0 + h - 4, TILE.RUBBLE);
  setTile(obj, x0 + w - 4, y0 + h - 4, TILE.RUBBLE);
}

// Hatchery: sand + 4 tide pools
function buildHatchery(bg, obj, x0, y0, w, h) {
  fillRect(bg, x0, y0, w, h, TILE.SAND);
  // 4 tide pools (2x2 each) in a square arrangement
  const pools = [
    [x0 + 2, y0 + 2],
    [x0 + w - 4, y0 + 2],
    [x0 + 2, y0 + h - 4],
    [x0 + w - 4, y0 + h - 4],
  ];
  for (const [px, py] of pools) {
    setTile(obj, px, py, TILE.TIDE_POOL);
    setTile(obj, px + 1, py, TILE.TIDE_POOL);
    setTile(obj, px, py + 1, TILE.TIDE_POOL);
    setTile(obj, px + 1, py + 1, TILE.TIDE_POOL);
  }
  // Central spawn marker — a small rock in the middle
  const cx = x0 + Math.floor(w / 2);
  const cy = y0 + Math.floor(h / 2);
  setTile(obj, cx, cy, TILE.ROCK);
}

// Coast: half rocks, half water, wave line
function buildCoast(bg, obj, x0, y0, w, h) {
  // Western half: rocky shore
  fillRect(bg, x0, y0, Math.floor(w / 2), h, TILE.ROCK);
  // Eastern half: water
  fillRect(bg, x0 + Math.floor(w / 2), y0, w - Math.floor(w / 2), h, TILE.WATER);
  // Sand strip at the boundary (beach)
  for (let y = y0; y < y0 + h; y++) {
    setTile(bg, x0 + Math.floor(w / 2) - 1, y, TILE.SAND);
  }
  // Scattered rocks at the water edge
  const midX = x0 + Math.floor(w / 2);
  for (let i = 0; i < h; i += 3) {
    setTile(obj, midX + 1, y0 + i, TILE.ROCK);
  }
}

// Square: stone plaza with central fountain + corner flowers
function buildSquare(bg, obj, x0, y0, w, h) {
  fillRect(bg, x0, y0, w, h, TILE.STONE);
  // Cobble ring around the edge
  strokeRect(bg, x0, y0, w, h, TILE.COBBLE);
  // Central fountain (3x3)
  const cx = x0 + Math.floor(w / 2) - 1;
  const cy = y0 + Math.floor(h / 2) - 1;
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      setTile(obj, cx + dx, cy + dy, TILE.FOUNTAIN);
    }
  }
  // Corner flowers
  setTile(obj, x0 + 1, y0 + 1, TILE.FLOWER_Y);
  setTile(obj, x0 + w - 2, y0 + 1, TILE.FLOWER_Y);
  setTile(obj, x0 + 1, y0 + h - 2, TILE.FLOWER_Y);
  setTile(obj, x0 + w - 2, y0 + h - 2, TILE.FLOWER_Y);
}

// ---------- Scatter grass variants + decorations across empty land --------

function scatterGrass(bg, rng) {
  // Replace flat grass with variants for texture (20% grass_2, 10% grass_3,
  // 5% flower tiles)
  for (let x = 0; x < OUTER_WIDTH; x++) {
    for (let y = 0; y < OUTER_HEIGHT; y++) {
      if (bg[x][y] !== TILE.GRASS_1) continue;
      const r = rng();
      if (r < 0.2) bg[x][y] = TILE.GRASS_2;
      else if (r < 0.3) bg[x][y] = TILE.GRASS_3;
    }
  }
}

function scatterTreesAndFlowers(bg, obj, rng) {
  // Drop ~60 trees on grass tiles that are not inside buildings
  let placed = 0;
  let attempts = 0;
  while (placed < 60 && attempts < 600) {
    attempts++;
    const x = Math.floor(rng() * OUTER_WIDTH);
    const y = Math.floor(rng() * OUTER_HEIGHT);
    const bgTile = bg[x][y];
    const objTile = obj[x][y];
    if (objTile !== TILE.EMPTY) continue;
    if (
      bgTile !== TILE.GRASS_1 &&
      bgTile !== TILE.GRASS_2 &&
      bgTile !== TILE.GRASS_3
    )
      continue;
    // Keep trees out of paths
    setTile(obj, x, y, TILE.TREE);
    placed++;
  }
  // Flowers
  placed = 0;
  attempts = 0;
  while (placed < 40 && attempts < 400) {
    attempts++;
    const x = Math.floor(rng() * OUTER_WIDTH);
    const y = Math.floor(rng() * OUTER_HEIGHT);
    if (obj[x][y] !== TILE.EMPTY) continue;
    const bgTile = bg[x][y];
    if (
      bgTile !== TILE.GRASS_1 &&
      bgTile !== TILE.GRASS_2 &&
      bgTile !== TILE.GRASS_3
    )
      continue;
    // Overwrite grass with flower variant
    bg[x][y] = rng() < 0.5 ? TILE.FLOWER_Y : TILE.FLOWER_R;
    placed++;
  }
}

function drawBorder(bg, obj) {
  // Fence border around the whole map
  for (let x = 0; x < OUTER_WIDTH; x++) {
    setTile(obj, x, 0, TILE.FENCE_H);
    setTile(obj, x, OUTER_HEIGHT - 1, TILE.FENCE_H);
  }
  for (let y = 1; y < OUTER_HEIGHT - 1; y++) {
    setTile(obj, 0, y, TILE.FENCE_V);
    setTile(obj, OUTER_WIDTH - 1, y, TILE.FENCE_V);
  }
}

// ---------- Main builder ---------------------------------------------------

// Location bounds (in tile coords on the 80×60 outer map)
// These MUST match constants.js (we re-export them from here for single source)
export const OUTER_LOCATION_BOUNDS = {
  council_hall: { x: 30, y: 4, w: 20, h: 12, label: "Creation Council Hall" },
  forge_ruins:  { x: 6,  y: 22, w: 16, h: 12, label: "The Forge Ruins" },
  square:       { x: 30, y: 20, w: 20, h: 12, label: "The Empty Square" },
  coast:        { x: 56, y: 20, w: 20, h: 14, label: "The Rocky Coast" },
  hatchery:     { x: 30, y: 38, w: 20, h: 14, label: "The Hatchery" },
};

export function buildOuterMap() {
  // Two layers: background (base terrain) + object (decorations + building features)
  const bg = makeLayer(TILE.GRASS_1);
  const obj = makeLayer(TILE.EMPTY);

  // 1) Sprinkle grass variants across the whole base
  const rng = mulberry32(0xc1a4);
  scatterGrass(bg, rng);

  // 2) Draw the 5 creation locations as real structures
  const loc = OUTER_LOCATION_BOUNDS;
  buildCouncilHall(bg, obj, loc.council_hall.x, loc.council_hall.y, loc.council_hall.w, loc.council_hall.h);
  buildForgeRuins(bg, obj, loc.forge_ruins.x, loc.forge_ruins.y, loc.forge_ruins.w, loc.forge_ruins.h);
  buildSquare(bg, obj, loc.square.x, loc.square.y, loc.square.w, loc.square.h);
  buildCoast(bg, obj, loc.coast.x, loc.coast.y, loc.coast.w, loc.coast.h);
  buildHatchery(bg, obj, loc.hatchery.x, loc.hatchery.y, loc.hatchery.w, loc.hatchery.h);

  // 3) Connect locations with paths (running on the bg layer so trees can sit on them)
  // Square is the hub; connect everything through Square
  const squareCx = loc.square.x + Math.floor(loc.square.w / 2);
  const squareCy = loc.square.y + Math.floor(loc.square.h / 2);

  // Square → Council Hall (north)
  drawPath(bg, squareCx, loc.square.y - 1, squareCx, loc.council_hall.y + loc.council_hall.h + 2);
  // Square → Hatchery (south)
  drawPath(bg, squareCx, loc.square.y + loc.square.h, squareCx, loc.hatchery.y - 1);
  // Square → Forge Ruins (west)
  drawPath(bg, loc.forge_ruins.x + loc.forge_ruins.w + 1, squareCy, loc.square.x - 1, squareCy);
  // Square → Coast (east)
  drawPath(bg, loc.square.x + loc.square.w, squareCy, loc.coast.x - 1, squareCy);

  // 4) Scatter trees and flowers on grass (avoiding buildings, paths, decorations)
  scatterTreesAndFlowers(bg, obj, mulberry32(0xdeadbeef));

  // 5) Fence border
  drawBorder(bg, obj);

  return {
    width: OUTER_WIDTH,
    height: OUTER_HEIGHT,
    tileDim: TILE_DIM,
    bgTiles: [bg],        // one bg layer
    objectTiles: [obj],   // one object layer
    locationBounds: loc,
  };
}

// Cached singleton — build once per session
let _outerMap = null;
export function getOuterMap() {
  if (!_outerMap) _outerMap = buildOuterMap();
  return _outerMap;
}

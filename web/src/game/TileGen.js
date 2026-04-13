// TileGen — procedural 32×32 pixel-art tiles rendered to canvases,
// then packed into a single texture atlas for Pixi.
//
// Each tile is drawn pixel-by-pixel (imageSmoothing disabled) using
// a consistent warm pixel-art palette that matches the procedural
// lobster art in LobsterSpriteGen.js.
//
// Tile ids are exported as constants so the hand-built map file
// can reference them by name (GRASS_1, STONE_FLOOR, WALL_BRICK, etc).

import * as PIXI from "pixi.js";

// ---------- Palette (chibi / Stardew-inspired) ------------------------

const C = {
  // Grass
  grassLight: "#7fb84a",
  grass:      "#5c9b32",
  grassDark:  "#3e7a22",
  grassSpec:  "#a8d36b",
  flower1:    "#ffd166",
  flower2:    "#ef476f",
  flower3:    "#f9c0c4",

  // Stone / plaza
  stoneLight: "#b8b0a0",
  stone:      "#8f8778",
  stoneDark:  "#4e463a",
  stoneEdge:  "#2c261e",

  // Cobblestone (darker)
  cobbleLight:"#9a9288",
  cobble:     "#6c645a",
  cobbleDark: "#3a342d",

  // Wood floor
  woodLight:  "#c58a5d",
  wood:       "#8b5a2b",
  woodDark:   "#4d301a",
  woodGrain:  "#6b4522",

  // Wall brick
  brickLight: "#c79a78",
  brick:      "#9b6a4a",
  brickDark:  "#5c3a24",
  brickMortar:"#2c1a10",

  // Roof
  roofLight:  "#d47b5b",
  roof:       "#a0452a",
  roofDark:   "#5c1f10",

  // Water
  waterLight: "#6ec1e4",
  water:      "#2e86ab",
  waterDark:  "#1a4d6e",
  waterFoam:  "#a8e0f5",

  // Sand
  sandLight:  "#f2dba0",
  sand:       "#d9b870",
  sandDark:   "#a38444",

  // Rock
  rockLight:  "#8c8880",
  rock:       "#5c5850",
  rockDark:   "#2e2a24",

  // Forge
  forgeStone: "#4a4038",
  forgeEmber: "#ff6b1a",
  forgeHot:   "#ffd166",
  forgeAsh:   "#7a7068",

  // Tree
  treeCanopy: "#2e6e2a",
  treeCanopyLight: "#4fa04a",
  treeShadow: "#1a4010",
  treeTrunk:  "#5c3a1f",

  // Misc
  fenceWood:  "#8b5a2b",
  fenceDark:  "#4d301a",
  pathTan:    "#c9a876",
  pathDark:   "#7d6440",

  // Void
  void:       "#0a0a14",
  voidLight:  "#1e1e2e",
};

// ---------- Drawing helpers ------------------------------------------

function createTileCanvas(size = 32) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

function px(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

// Deterministic pseudo-noise for speckles (same input → same pattern)
function seededNoise(seed, x, y) {
  const n = (seed * 31 + x * 73 + y * 127) >>> 0;
  return ((n * 2654435761) >>> 0) / 4294967296;
}

// ---------- Individual tile drawers ----------------------------------

function drawGrass(ctx, variant = 0) {
  rect(ctx, 0, 0, 32, 32, C.grass);
  // Random speckles for texture
  for (let y = 0; y < 32; y += 2) {
    for (let x = 0; x < 32; x += 2) {
      const n = seededNoise(variant + 1, x, y);
      if (n < 0.18) {
        px(ctx, x, y, C.grassDark);
        px(ctx, x + 1, y, C.grassDark);
      } else if (n > 0.82) {
        px(ctx, x, y, C.grassLight);
      }
    }
  }
  // Grass blades (small vertical strokes)
  for (let i = 0; i < 4; i++) {
    const n1 = seededNoise(variant + 10, i, 0);
    const bx = Math.floor(n1 * 30);
    const by = Math.floor(seededNoise(variant + 20, i, 1) * 28);
    px(ctx, bx, by, C.grassSpec);
    px(ctx, bx, by + 1, C.grass);
  }
}

function drawGrassFlowers(ctx, flowerColor = C.flower1) {
  drawGrass(ctx, 3);
  // 2-3 small flower clusters
  const spots = [
    [6, 8],
    [22, 12],
    [12, 22],
  ];
  for (const [cx, cy] of spots) {
    px(ctx, cx, cy, flowerColor);
    px(ctx, cx + 1, cy, flowerColor);
    px(ctx, cx, cy + 1, flowerColor);
    px(ctx, cx + 1, cy + 1, flowerColor);
    px(ctx, cx, cy - 1, C.grassDark);
  }
}

function drawStoneFloor(ctx) {
  rect(ctx, 0, 0, 32, 32, C.stone);
  // Brick-style seams
  const seams = [
    // Horizontal seams every 8 px
    [0, 0, 32, 1],
    [0, 8, 32, 1],
    [0, 16, 32, 1],
    [0, 24, 32, 1],
    // Vertical seams offset per row (running bond)
    [0, 1, 1, 7],
    [8, 1, 1, 7],
    [16, 1, 1, 7],
    [24, 1, 1, 7],
    [4, 9, 1, 7],
    [12, 9, 1, 7],
    [20, 9, 1, 7],
    [28, 9, 1, 7],
    [0, 17, 1, 7],
    [8, 17, 1, 7],
    [16, 17, 1, 7],
    [24, 17, 1, 7],
    [4, 25, 1, 7],
    [12, 25, 1, 7],
    [20, 25, 1, 7],
    [28, 25, 1, 7],
  ];
  for (const [x, y, w, h] of seams) {
    rect(ctx, x, y, w, h, C.stoneDark);
  }
  // Highlight specks
  for (let i = 0; i < 6; i++) {
    const n1 = seededNoise(99, i, 0);
    const n2 = seededNoise(99, i, 1);
    px(ctx, Math.floor(n1 * 32), Math.floor(n2 * 32), C.stoneLight);
  }
}

function drawCobble(ctx) {
  rect(ctx, 0, 0, 32, 32, C.cobble);
  // Round cobbles in a staggered pattern
  const cobbles = [
    [2, 2, 6, 6],
    [10, 3, 6, 6],
    [18, 2, 6, 6],
    [26, 3, 6, 6],
    [4, 12, 6, 6],
    [12, 13, 6, 6],
    [20, 12, 6, 6],
    [28, 13, 6, 6],
    [2, 22, 6, 6],
    [10, 23, 6, 6],
    [18, 22, 6, 6],
    [26, 23, 6, 6],
  ];
  for (const [x, y, w, h] of cobbles) {
    rect(ctx, x, y, w, h, C.cobbleLight);
    rect(ctx, x, y + h - 1, w, 1, C.cobbleDark);
    rect(ctx, x + w - 1, y, 1, h, C.cobbleDark);
  }
}

function drawWoodFloor(ctx) {
  rect(ctx, 0, 0, 32, 32, C.wood);
  // Plank seams (vertical, every 10 px)
  rect(ctx, 9, 0, 1, 32, C.woodDark);
  rect(ctx, 19, 0, 1, 32, C.woodDark);
  rect(ctx, 29, 0, 1, 32, C.woodDark);
  // Grain lines
  for (let x = 0; x < 32; x += 1) {
    if (x === 9 || x === 19 || x === 29) continue;
    const n = seededNoise(7, x, 0);
    if (n < 0.15) {
      rect(ctx, x, 4 + Math.floor(n * 20), 1, 2, C.woodGrain);
    }
  }
  // Highlights at top of each plank
  rect(ctx, 0, 0, 9, 1, C.woodLight);
  rect(ctx, 10, 0, 9, 1, C.woodLight);
  rect(ctx, 20, 0, 9, 1, C.woodLight);
  rect(ctx, 30, 0, 2, 1, C.woodLight);
}

function drawWallBrick(ctx) {
  rect(ctx, 0, 0, 32, 32, C.brick);
  // Brick pattern (running bond)
  const rows = [
    { y: 0, offset: 0 },
    { y: 8, offset: 8 },
    { y: 16, offset: 0 },
    { y: 24, offset: 8 },
  ];
  for (const { y, offset } of rows) {
    for (let x = 0; x < 32; x += 16) {
      const bx = (x + offset) % 32;
      // Top highlight
      rect(ctx, bx, y, 16, 1, C.brickLight);
      // Bottom shadow
      rect(ctx, bx, y + 7, 16, 1, C.brickDark);
      // Right seam
      rect(ctx, (bx + 15) % 32, y, 1, 8, C.brickMortar);
    }
    // Horizontal mortar line below row
    rect(ctx, 0, y + 7, 32, 1, C.brickMortar);
  }
}

function drawRoof(ctx) {
  rect(ctx, 0, 0, 32, 32, C.roof);
  // Shingle rows
  for (let y = 0; y < 32; y += 6) {
    rect(ctx, 0, y, 32, 1, C.roofDark);
    rect(ctx, 0, y + 1, 32, 1, C.roofLight);
    // Shingle seams staggered
    const offset = (y / 6) % 2 === 0 ? 0 : 8;
    for (let x = offset; x < 32; x += 16) {
      rect(ctx, x, y + 1, 1, 5, C.roofDark);
    }
  }
}

function drawWaterAnim(ctx, frame = 0) {
  rect(ctx, 0, 0, 32, 32, C.water);
  // Wave pattern
  for (let y = 0; y < 32; y += 4) {
    for (let x = 0; x < 32; x += 8) {
      const phase = (x + y + frame * 4) % 16;
      if (phase < 4) {
        rect(ctx, x, y, 3, 1, C.waterLight);
      }
    }
  }
  // Foam specks
  for (let i = 0; i < 8; i++) {
    const n1 = seededNoise(frame * 17 + 7, i, 0);
    const n2 = seededNoise(frame * 17 + 7, i, 1);
    px(ctx, Math.floor(n1 * 32), Math.floor(n2 * 32), C.waterFoam);
  }
}

function drawSand(ctx) {
  rect(ctx, 0, 0, 32, 32, C.sand);
  for (let y = 0; y < 32; y += 1) {
    for (let x = 0; x < 32; x += 1) {
      const n = seededNoise(50, x, y);
      if (n < 0.12) px(ctx, x, y, C.sandDark);
      else if (n > 0.88) px(ctx, x, y, C.sandLight);
    }
  }
}

function drawRock(ctx) {
  rect(ctx, 0, 0, 32, 32, C.rock);
  // Rocky chunks
  const chunks = [
    [2, 4, 10, 10],
    [16, 2, 12, 12],
    [4, 18, 12, 12],
    [20, 18, 10, 12],
  ];
  for (const [x, y, w, h] of chunks) {
    rect(ctx, x, y, w, h, C.rockLight);
    rect(ctx, x, y + h - 1, w, 1, C.rockDark);
    rect(ctx, x + w - 1, y, 1, h, C.rockDark);
    rect(ctx, x, y, w, 1, C.rockLight);
  }
  // Dark seams
  rect(ctx, 13, 4, 1, 10, C.rockDark);
  rect(ctx, 2, 17, 28, 1, C.rockDark);
}

function drawForgeFloor(ctx) {
  rect(ctx, 0, 0, 32, 32, C.forgeStone);
  // Ash specks
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const n = seededNoise(77, x, y);
      if (n < 0.1) px(ctx, x, y, C.forgeAsh);
      else if (n > 0.96) px(ctx, x, y, C.forgeEmber);
    }
  }
}

function drawForge(ctx) {
  // Central forge with glowing ember
  rect(ctx, 0, 0, 32, 32, C.forgeStone);
  // Stone ring
  rect(ctx, 6, 6, 20, 20, C.stoneDark);
  rect(ctx, 7, 7, 18, 18, C.stone);
  // Inner pit
  rect(ctx, 9, 9, 14, 14, C.forgeStone);
  // Ember core
  rect(ctx, 11, 11, 10, 10, C.forgeEmber);
  rect(ctx, 13, 13, 6, 6, C.forgeHot);
  // Sparks
  px(ctx, 16, 8, C.forgeHot);
  px(ctx, 14, 24, C.forgeEmber);
  px(ctx, 22, 14, C.forgeHot);
}

function drawFountain(ctx) {
  // Stone plaza base
  drawStoneFloor(ctx);
  // Fountain stone ring
  rect(ctx, 8, 8, 16, 16, C.stoneDark);
  rect(ctx, 9, 9, 14, 14, C.stoneLight);
  // Water center
  rect(ctx, 11, 11, 10, 10, C.water);
  rect(ctx, 13, 13, 6, 6, C.waterLight);
  // Highlight
  px(ctx, 15, 13, C.waterFoam);
  px(ctx, 16, 14, C.waterFoam);
}

function drawTree(ctx) {
  // Transparent grass background is drawn under in the map;
  // here we just draw the tree on top of grass.
  drawGrass(ctx, 1);
  // Trunk
  rect(ctx, 14, 18, 4, 10, C.treeTrunk);
  rect(ctx, 14, 18, 1, 10, C.woodDark);
  // Canopy (circular blob)
  const canopy = [
    [12, 4, 8, 2],
    [10, 6, 12, 2],
    [8, 8, 16, 4],
    [8, 12, 16, 4],
    [10, 16, 12, 2],
    [12, 18, 8, 1],
  ];
  for (const [x, y, w, h] of canopy) {
    rect(ctx, x, y, w, h, C.treeCanopy);
  }
  // Highlights
  rect(ctx, 12, 6, 4, 4, C.treeCanopyLight);
  rect(ctx, 14, 4, 2, 2, C.treeCanopyLight);
  // Shadow under
  rect(ctx, 10, 14, 12, 2, C.treeShadow);
}

function drawFenceH(ctx) {
  drawGrass(ctx, 2);
  // Horizontal fence rail (3 px thick, mid-tile)
  rect(ctx, 0, 14, 32, 3, C.fenceWood);
  rect(ctx, 0, 14, 32, 1, C.woodLight);
  rect(ctx, 0, 16, 32, 1, C.fenceDark);
  // Posts every 8 px
  for (let x = 2; x < 32; x += 8) {
    rect(ctx, x, 10, 3, 12, C.fenceWood);
    rect(ctx, x, 10, 1, 12, C.woodLight);
    rect(ctx, x + 2, 10, 1, 12, C.fenceDark);
  }
}

function drawFenceV(ctx) {
  drawGrass(ctx, 2);
  rect(ctx, 14, 0, 3, 32, C.fenceWood);
  rect(ctx, 14, 0, 1, 32, C.woodLight);
  rect(ctx, 16, 0, 1, 32, C.fenceDark);
  for (let y = 2; y < 32; y += 8) {
    rect(ctx, 10, y, 12, 3, C.fenceWood);
    rect(ctx, 10, y, 12, 1, C.woodLight);
    rect(ctx, 10, y + 2, 12, 1, C.fenceDark);
  }
}

function drawPath(ctx) {
  rect(ctx, 0, 0, 32, 32, C.pathTan);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const n = seededNoise(33, x, y);
      if (n < 0.1) px(ctx, x, y, C.pathDark);
      else if (n > 0.88) px(ctx, x, y, C.sandLight);
    }
  }
}

function drawTidePool(ctx) {
  drawSand(ctx);
  // Oval tide pool
  rect(ctx, 6, 8, 20, 16, C.waterDark);
  rect(ctx, 7, 9, 18, 14, C.water);
  rect(ctx, 8, 10, 16, 12, C.waterLight);
  // Sparkle
  px(ctx, 12, 13, C.waterFoam);
  px(ctx, 20, 18, C.waterFoam);
  // Rim
  rect(ctx, 5, 7, 22, 1, C.sandDark);
  rect(ctx, 5, 24, 22, 1, C.sandDark);
}

function drawRubble(ctx) {
  drawForgeFloor(ctx);
  // Scattered stones
  const stones = [
    [3, 4, 5, 4],
    [20, 6, 6, 5],
    [10, 14, 5, 5],
    [22, 18, 6, 4],
    [5, 22, 4, 4],
    [14, 24, 6, 5],
  ];
  for (const [x, y, w, h] of stones) {
    rect(ctx, x, y, w, h, C.rock);
    rect(ctx, x, y, w, 1, C.rockLight);
    rect(ctx, x, y + h - 1, w, 1, C.rockDark);
  }
}

function drawVoid(ctx) {
  rect(ctx, 0, 0, 32, 32, C.void);
  // Starlike specks
  for (let i = 0; i < 4; i++) {
    const n1 = seededNoise(111, i, 0);
    const n2 = seededNoise(111, i, 1);
    px(ctx, Math.floor(n1 * 32), Math.floor(n2 * 32), C.voidLight);
  }
}

// ---------- Registry -----------------------------------------------

// Order matters! Tile IDs are the index into this list.
const TILE_DRAWERS = [
  (ctx) => drawGrass(ctx, 0),         // 0  GRASS_1
  (ctx) => drawGrass(ctx, 1),         // 1  GRASS_2
  (ctx) => drawGrass(ctx, 2),         // 2  GRASS_3
  (ctx) => drawGrassFlowers(ctx, C.flower1), // 3  GRASS_FLOWER_YELLOW
  (ctx) => drawGrassFlowers(ctx, C.flower2), // 4  GRASS_FLOWER_RED
  drawStoneFloor,                     // 5  STONE_FLOOR
  drawCobble,                         // 6  COBBLE
  drawWoodFloor,                      // 7  WOOD_FLOOR
  drawWallBrick,                      // 8  WALL_BRICK
  drawRoof,                           // 9  ROOF
  (ctx) => drawWaterAnim(ctx, 0),     // 10 WATER
  drawSand,                           // 11 SAND
  drawRock,                           // 12 ROCK
  drawForgeFloor,                     // 13 FORGE_FLOOR
  drawForge,                          // 14 FORGE_CORE
  drawFountain,                       // 15 FOUNTAIN
  drawTree,                           // 16 TREE
  drawFenceH,                         // 17 FENCE_H
  drawFenceV,                         // 18 FENCE_V
  drawPath,                           // 19 PATH
  drawTidePool,                       // 20 TIDE_POOL
  drawRubble,                         // 21 RUBBLE
  drawVoid,                           // 22 VOID
];

// Named constants for the hand-built map to reference
export const TILE = {
  GRASS_1: 0,
  GRASS_2: 1,
  GRASS_3: 2,
  FLOWER_Y: 3,
  FLOWER_R: 4,
  STONE: 5,
  COBBLE: 6,
  WOOD: 7,
  WALL: 8,
  ROOF: 9,
  WATER: 10,
  SAND: 11,
  ROCK: 12,
  FORGE_FLOOR: 13,
  FORGE: 14,
  FOUNTAIN: 15,
  TREE: 16,
  FENCE_H: 17,
  FENCE_V: 18,
  PATH: 19,
  TIDE_POOL: 20,
  RUBBLE: 21,
  VOID: 22,
  EMPTY: -1, // convention: -1 = no tile on this layer
};

// ---------- Atlas builder ------------------------------------------
//
// We pack all 23 tiles into a single horizontal strip texture
// (23 × 32 = 736 px wide × 32 px tall). Then create PIXI.Texture
// entries pointing at each 32×32 region. This matches what
// PixiStaticMap already expects.

let _atlas = null;

/**
 * Build (or return cached) the procedural tile atlas.
 * @returns {{ canvas: HTMLCanvasElement, baseTexture: PIXI.BaseTexture, tiles: PIXI.Texture[] }}
 */
export function getTileAtlas() {
  if (_atlas) return _atlas;

  const tileSize = 32;
  const cols = TILE_DRAWERS.length;
  const canvas = document.createElement("canvas");
  canvas.width = cols * tileSize;
  canvas.height = tileSize;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  // Draw each tile at (i * 32, 0)
  TILE_DRAWERS.forEach((drawer, i) => {
    // Render into a fresh 32×32 temp canvas, then blit to atlas.
    // This lets each drawer use (0,0) local coordinates.
    const { canvas: tempCanvas, ctx: tempCtx } = createTileCanvas(tileSize);
    drawer(tempCtx);
    ctx.drawImage(tempCanvas, i * tileSize, 0);
  });

  const baseTexture = PIXI.BaseTexture.from(canvas, {
    scaleMode: PIXI.SCALE_MODES.NEAREST,
  });

  const tiles = [];
  for (let i = 0; i < cols; i++) {
    tiles.push(
      new PIXI.Texture(
        baseTexture,
        new PIXI.Rectangle(i * tileSize, 0, tileSize, tileSize),
      ),
    );
  }

  _atlas = { canvas, baseTexture, tiles };
  return _atlas;
}

/** For test/debug: regenerate the atlas (e.g. after changing colors). */
export function resetTileAtlas() {
  _atlas = null;
}

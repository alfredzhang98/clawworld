// LobsterSpriteGen — procedural pixel-art lobster sprite generator.
//
// Given a lobster's {name, id, role}, produces a deterministic set of
// Canvas-rendered walk animations for 4 directions (up/down/left/right),
// 3 frames each = 12 frames total.
//
// Output: { down: HTMLCanvasElement[], up: [...], left: [...], right: [...] }
//
// All sprites are drawn at 32×32 pixels. Feed the canvases to Pixi via
// PIXI.Texture.from(canvas) to create GPU textures. No PNG files needed.
//
// Design notes:
// - Lobster = oval shell + 2 claws + segmented tail + antennae + eyes
// - All params derived from a seeded hash of name+id so reloads give the
//   exact same lobster
// - 4 directions are drawn from different angles, not mirrored sprites
// - Walk cycle = subtle leg movement (3 frames: left-foot, neutral, right-foot)
// - Role badge (crown/star) overlaid on top of head

// ---------- Hashing / PRNG --------------------------------------------------

function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

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

// ---------- Visual params from seed ----------------------------------------

/**
 * Derive deterministic visual parameters for a lobster.
 * @param {{name: string, id: number, role?: string}} lobster
 */
export function deriveLobsterLook(lobster) {
  const seed = hashString(`${lobster.name}#${lobster.id}`);
  const rng = mulberry32(seed);

  const shellHue = Math.floor(rng() * 360); // full spectrum
  const shellSat = 60 + Math.floor(rng() * 30); // 60-90%
  const shellLight = 42 + Math.floor(rng() * 16); // 42-58%
  const shellPattern = Math.floor(rng() * 4); // 0=solid, 1=stripes, 2=spots, 3=gradient
  const clawStyle = Math.floor(rng() * 3); // 0=round, 1=sharp, 2=huge
  const antennaStyle = Math.floor(rng() * 3); // 0=straight, 1=wavy, 2=curled
  const bellyLight = Math.min(85, shellLight + 20);

  const eyeColor =
    lobster.role === "god"
      ? "#ffd700"
      : lobster.role === "admin"
      ? "#67e8f9"
      : ["#ffffff", "#ffe4b5", "#f0e68c"][Math.floor(rng() * 3)];

  return {
    seed,
    shellHue,
    shellSat,
    shellLight,
    bellyLight,
    shellPattern,
    clawStyle,
    antennaStyle,
    eyeColor,
    role: lobster.role || "player",
  };
}

function hsl(h, s, l, a = 1) {
  return `hsla(${h}, ${s}%, ${l}%, ${a})`;
}

// ---------- Pixel-level drawing helpers ------------------------------------
//
// We draw everything on 32×32 canvases with disabled anti-aliasing and
// integer-only rectangles. This produces a crisp pixel-art look.

function createCanvas(size = 32) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

function fillPixel(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

function fillRect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

// ---------- Shell shape (direction-aware) ----------------------------------

// Each direction uses a slightly different shell silhouette. We stick to a
// 16×16 active area centered in the 32×32 canvas, leaving a 2-pixel margin
// for antennae and feet.
//
// Shapes are defined as rows of pixel runs: [rowStart, colStart, colEnd].

const SHELL_SHAPES = {
  down: [
    // Symmetric oval facing viewer
    [10, 13, 18],
    [11, 12, 19],
    [12, 11, 20],
    [13, 10, 21],
    [14, 10, 21],
    [15, 10, 21],
    [16, 10, 21],
    [17, 11, 20],
    [18, 12, 19],
    [19, 13, 18],
  ],
  up: [
    // Same shape but flipped indicator — back view
    [10, 13, 18],
    [11, 12, 19],
    [12, 11, 20],
    [13, 10, 21],
    [14, 10, 21],
    [15, 10, 21],
    [16, 10, 21],
    [17, 11, 20],
    [18, 12, 19],
    [19, 13, 18],
  ],
  left: [
    // Elongated silhouette facing left
    [10, 11, 18],
    [11, 10, 20],
    [12, 9, 21],
    [13, 9, 22],
    [14, 9, 22],
    [15, 9, 22],
    [16, 9, 22],
    [17, 9, 21],
    [18, 10, 20],
    [19, 11, 18],
  ],
  right: [
    [10, 13, 20],
    [11, 11, 21],
    [12, 10, 22],
    [13, 9, 22],
    [14, 9, 22],
    [15, 9, 22],
    [16, 9, 22],
    [17, 10, 21],
    [18, 11, 20],
    [19, 13, 18],
  ],
};

// ---------- Draw one frame --------------------------------------------------

/**
 * Draw a single animation frame to a 32×32 canvas.
 * @param {object} look - from deriveLobsterLook
 * @param {"down"|"up"|"left"|"right"} direction
 * @param {0|1|2} frame - walk cycle frame
 */
function drawFrame(look, direction, frame) {
  const { canvas, ctx } = createCanvas(32);

  // Colors
  const shell = hsl(look.shellHue, look.shellSat, look.shellLight);
  const shellDark = hsl(look.shellHue, look.shellSat, look.shellLight - 12);
  const shellLight = hsl(look.shellHue, look.shellSat, look.shellLight + 10);
  const belly = hsl(look.shellHue, look.shellSat - 20, look.bellyLight);
  const outline = hsl(look.shellHue, look.shellSat + 10, Math.max(15, look.shellLight - 25));

  // 1. Shell body
  const shape = SHELL_SHAPES[direction];
  for (const [row, c0, c1] of shape) {
    for (let c = c0; c <= c1; c++) {
      fillPixel(ctx, c, row, shell);
    }
  }

  // Outline
  for (const [row, c0, c1] of shape) {
    fillPixel(ctx, c0, row, outline);
    fillPixel(ctx, c1, row, outline);
  }
  // Top/bottom outline
  fillPixel(ctx, 15, 9, outline);
  fillPixel(ctx, 16, 9, outline);
  fillPixel(ctx, 15, 20, outline);
  fillPixel(ctx, 16, 20, outline);

  // 2. Shell pattern
  drawShellPattern(ctx, look, direction, shellDark, shellLight);

  // 3. Belly highlight (only on down/left/right)
  if (direction === "down") {
    fillRect(ctx, 13, 17, 6, 2, belly);
  } else if (direction === "left") {
    fillRect(ctx, 9, 17, 6, 2, belly);
  } else if (direction === "right") {
    fillRect(ctx, 17, 17, 6, 2, belly);
  }

  // 4. Claws (left and right, positioned by direction)
  drawClaws(ctx, look, direction, shell, shellDark, outline);

  // 5. Tail segments
  drawTail(ctx, look, direction, shell, shellDark, outline);

  // 6. Eyes
  if (direction !== "up") {
    drawEyes(ctx, look, direction);
  }

  // 7. Antennae
  drawAntennae(ctx, look, direction, outline);

  // 8. Legs (walk cycle)
  drawLegs(ctx, look, direction, frame, outline);

  // 9. Role badge
  if (look.role === "god") {
    drawCrown(ctx);
  } else if (look.role === "admin") {
    drawStar(ctx);
  }

  return canvas;
}

// ---------- Shell pattern ---------------------------------------------------

function drawShellPattern(ctx, look, direction, dark, light) {
  const shape = SHELL_SHAPES[direction];
  switch (look.shellPattern) {
    case 1: // stripes
      for (const [row, c0, c1] of shape) {
        if ((row - 10) % 3 === 0) {
          for (let c = c0 + 1; c <= c1 - 1; c++) {
            fillPixel(ctx, c, row, dark);
          }
        }
      }
      break;
    case 2: // spots
      {
        const spots = [
          [13, 13],
          [15, 17],
          [17, 13],
          [14, 15],
        ];
        for (const [x, y] of spots) fillPixel(ctx, x, y, dark);
      }
      break;
    case 3: // gradient
      for (const [row, c0, c1] of shape) {
        if (row >= 14) {
          for (let c = c0 + 1; c <= c1 - 1; c++) {
            fillPixel(ctx, c, row, dark);
          }
        }
      }
      break;
    case 0:
    default:
      // solid — add subtle highlight on top
      fillPixel(ctx, 14, 11, light);
      fillPixel(ctx, 15, 11, light);
      break;
  }
}

// ---------- Claws ----------------------------------------------------------

function drawClaws(ctx, look, direction, shell, shellDark, outline) {
  // Claw size varies by clawStyle
  const big = look.clawStyle === 2;
  const sharp = look.clawStyle === 1;

  if (direction === "down") {
    // Two symmetric claws on the sides
    drawClaw(ctx, 7, 13, shell, shellDark, outline, big, sharp, false);
    drawClaw(ctx, 22, 13, shell, shellDark, outline, big, sharp, true);
  } else if (direction === "up") {
    // Back view — claws behind body (smaller)
    drawClaw(ctx, 7, 14, shell, shellDark, outline, false, sharp, false);
    drawClaw(ctx, 22, 14, shell, shellDark, outline, false, sharp, true);
  } else if (direction === "left") {
    // Facing left — one big front claw
    drawClaw(ctx, 5, 13, shell, shellDark, outline, big, sharp, false);
    drawClaw(ctx, 21, 15, shell, shellDark, outline, false, sharp, true);
  } else if (direction === "right") {
    drawClaw(ctx, 26, 13, shell, shellDark, outline, big, sharp, true);
    drawClaw(ctx, 10, 15, shell, shellDark, outline, false, sharp, false);
  }
}

function drawClaw(ctx, x, y, fill, dark, outline, big, sharp, mirror) {
  const w = big ? 4 : 3;
  const h = big ? 4 : 3;
  // Core
  fillRect(ctx, x, y, w, h, fill);
  // Outline
  ctx.fillStyle = outline;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h);
  // Pincer tip
  if (sharp) {
    fillPixel(ctx, mirror ? x - 1 : x + w, y + 1, outline);
  } else {
    fillPixel(ctx, mirror ? x - 1 : x + w, y, dark);
    fillPixel(ctx, mirror ? x - 1 : x + w, y + h - 1, dark);
  }
}

// ---------- Tail ------------------------------------------------------------

function drawTail(ctx, look, direction, shell, dark, outline) {
  if (direction === "down") {
    // Tail segments curve down-right
    fillRect(ctx, 14, 20, 4, 1, dark);
    fillRect(ctx, 14, 21, 4, 1, outline);
  } else if (direction === "up") {
    // Tail segments at top
    fillRect(ctx, 14, 9, 4, 1, dark);
  } else if (direction === "left") {
    // Tail on the right
    fillRect(ctx, 21, 14, 2, 2, dark);
    fillPixel(ctx, 23, 14, outline);
    fillPixel(ctx, 23, 15, outline);
  } else if (direction === "right") {
    // Tail on the left
    fillRect(ctx, 9, 14, 2, 2, dark);
    fillPixel(ctx, 8, 14, outline);
    fillPixel(ctx, 8, 15, outline);
  }
}

// ---------- Eyes ------------------------------------------------------------

function drawEyes(ctx, look, direction) {
  const eyeWhite = "#ffffff";
  const pupil = look.eyeColor;

  if (direction === "down") {
    fillPixel(ctx, 13, 12, eyeWhite);
    fillPixel(ctx, 14, 12, pupil);
    fillPixel(ctx, 17, 12, eyeWhite);
    fillPixel(ctx, 18, 12, pupil);
  } else if (direction === "left") {
    fillPixel(ctx, 11, 12, eyeWhite);
    fillPixel(ctx, 11, 13, pupil);
    fillPixel(ctx, 13, 12, eyeWhite);
    fillPixel(ctx, 13, 13, pupil);
  } else if (direction === "right") {
    fillPixel(ctx, 18, 12, eyeWhite);
    fillPixel(ctx, 18, 13, pupil);
    fillPixel(ctx, 20, 12, eyeWhite);
    fillPixel(ctx, 20, 13, pupil);
  }
}

// ---------- Antennae --------------------------------------------------------

function drawAntennae(ctx, look, direction, outline) {
  const tipColor = outline;

  if (direction === "down" || direction === "up") {
    if (look.antennaStyle === 0) {
      // straight
      fillPixel(ctx, 13, 9, outline);
      fillPixel(ctx, 12, 8, outline);
      fillPixel(ctx, 12, 7, tipColor);
      fillPixel(ctx, 18, 9, outline);
      fillPixel(ctx, 19, 8, outline);
      fillPixel(ctx, 19, 7, tipColor);
    } else if (look.antennaStyle === 1) {
      // wavy
      fillPixel(ctx, 13, 9, outline);
      fillPixel(ctx, 13, 8, outline);
      fillPixel(ctx, 12, 7, outline);
      fillPixel(ctx, 12, 6, tipColor);
      fillPixel(ctx, 18, 9, outline);
      fillPixel(ctx, 18, 8, outline);
      fillPixel(ctx, 19, 7, outline);
      fillPixel(ctx, 19, 6, tipColor);
    } else {
      // curled
      fillPixel(ctx, 13, 9, outline);
      fillPixel(ctx, 13, 8, outline);
      fillPixel(ctx, 14, 7, outline);
      fillPixel(ctx, 18, 9, outline);
      fillPixel(ctx, 18, 8, outline);
      fillPixel(ctx, 17, 7, outline);
    }
  } else if (direction === "left") {
    fillPixel(ctx, 9, 11, outline);
    fillPixel(ctx, 8, 10, outline);
    fillPixel(ctx, 7, 9, tipColor);
  } else if (direction === "right") {
    fillPixel(ctx, 22, 11, outline);
    fillPixel(ctx, 23, 10, outline);
    fillPixel(ctx, 24, 9, tipColor);
  }
}

// ---------- Legs (walk cycle) -----------------------------------------------

function drawLegs(ctx, look, direction, frame, color) {
  // 4 legs per side. Walk cycle: frame 0 = left stepping, 2 = right stepping,
  // 1 = neutral. Legs are a 1-pixel vertical stub.
  const offset = frame === 1 ? 0 : frame === 0 ? -1 : 1;

  if (direction === "down") {
    // Left legs
    for (let i = 0; i < 3; i++) {
      fillPixel(ctx, 11 - i, 16 + (i % 2 === 0 ? offset : 0), color);
    }
    // Right legs
    for (let i = 0; i < 3; i++) {
      fillPixel(ctx, 20 + i, 16 + (i % 2 === 0 ? -offset : 0), color);
    }
  } else if (direction === "up") {
    for (let i = 0; i < 3; i++) {
      fillPixel(ctx, 11 - i, 14 + (i % 2 === 0 ? offset : 0), color);
      fillPixel(ctx, 20 + i, 14 + (i % 2 === 0 ? -offset : 0), color);
    }
  } else if (direction === "left") {
    for (let i = 0; i < 4; i++) {
      fillPixel(ctx, 11 + i, 19 + (i % 2 === 0 ? offset : 0), color);
    }
  } else if (direction === "right") {
    for (let i = 0; i < 4; i++) {
      fillPixel(ctx, 17 + i, 19 + (i % 2 === 0 ? offset : 0), color);
    }
  }
}

// ---------- Role badges -----------------------------------------------------

function drawCrown(ctx) {
  const gold = "#ffd700";
  const goldDark = "#b8860b";
  // 5x3 crown above head
  fillRect(ctx, 13, 5, 6, 2, gold);
  fillPixel(ctx, 13, 4, gold);
  fillPixel(ctx, 15, 4, gold);
  fillPixel(ctx, 18, 4, gold);
  // Outline
  fillPixel(ctx, 12, 5, goldDark);
  fillPixel(ctx, 19, 5, goldDark);
  fillPixel(ctx, 12, 6, goldDark);
  fillPixel(ctx, 19, 6, goldDark);
}

function drawStar(ctx) {
  const cyan = "#67e8f9";
  const cyanDark = "#0891b2";
  // Simple 3x3 star
  fillPixel(ctx, 16, 4, cyan);
  fillPixel(ctx, 15, 5, cyan);
  fillPixel(ctx, 16, 5, cyan);
  fillPixel(ctx, 17, 5, cyan);
  fillPixel(ctx, 16, 6, cyan);
  // Outline
  fillPixel(ctx, 14, 5, cyanDark);
  fillPixel(ctx, 18, 5, cyanDark);
}

// ---------- Public API ------------------------------------------------------

/**
 * Generate all 12 frames (4 directions × 3 walk frames) for a lobster.
 * Returns an object keyed by direction with arrays of canvases.
 *
 * @param {{name: string, id: number, role?: string}} lobster
 * @returns {{down: HTMLCanvasElement[], up: HTMLCanvasElement[], left: HTMLCanvasElement[], right: HTMLCanvasElement[], look: object}}
 */
export function generateLobsterSprites(lobster) {
  const look = deriveLobsterLook(lobster);
  const directions = ["down", "up", "left", "right"];
  const result = { look };
  for (const dir of directions) {
    result[dir] = [
      drawFrame(look, dir, 0),
      drawFrame(look, dir, 1),
      drawFrame(look, dir, 2),
    ];
  }
  return result;
}

// In-memory cache — generating 12 canvases costs ~2-5ms, but if we show
// 50 lobsters that adds up. Cache by "name#id".
const spriteCache = new Map();

export function getCachedLobsterSprites(lobster) {
  const key = `${lobster.name}#${lobster.id}`;
  let cached = spriteCache.get(key);
  if (!cached) {
    cached = generateLobsterSprites(lobster);
    spriteCache.set(key, cached);
  }
  return cached;
}

export function clearSpriteCache() {
  spriteCache.clear();
}

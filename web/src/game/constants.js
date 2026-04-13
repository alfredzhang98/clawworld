// Game constants — tile dimensions, location coordinates, colors.
//
// We use a programmatic tilemap (no Tiled editor) for the genesis era.
// The 5 creation-era locations are laid out as rooms on a 80x60 tile
// grid, connected by grass paths. This is small enough to fit without
// scrolling on a typical laptop, yet detailed enough to feel spatial.

export const TILE_SIZE = 32;
export const MAP_COLS = 80;
export const MAP_ROWS = 60;
export const MAP_WIDTH = MAP_COLS * TILE_SIZE;   // 2560 px
export const MAP_HEIGHT = MAP_ROWS * TILE_SIZE;  // 1920 px

// Location layouts — each genesis location occupies a rectangular
// area on the world map. Coordinates are in tile units, inclusive.
//
// Layout:
//                  north
//    ┌────────────────────────────────┐
//    │                                │
//    │        ┌─ council_hall ─┐       │
//    │        │                │       │
//    │        └────────────────┘       │
//    │                │                │
//    │ ┌─ forge ─┐    │    ┌─ coast ─┐ │
//    │ │         │   square│         │ │
//    │ └─────────┘    │    └─────────┘ │
//    │                │                │
//    │        ┌── hatchery ───┐         │
//    │        └───────────────┘         │
//    │                                │
//    └────────────────────────────────┘
//                  south

export const LOCATIONS = {
  square: {
    id: "square",
    label: "The Empty Square",
    theme: "stone",           // tileset theme
    bounds: { x: 30, y: 22, w: 20, h: 16 },  // center
  },
  hatchery: {
    id: "hatchery",
    label: "The Hatchery",
    theme: "water",
    bounds: { x: 30, y: 42, w: 20, h: 14 },  // south
  },
  council_hall: {
    id: "council_hall",
    label: "Creation Council Hall",
    theme: "village",
    bounds: { x: 30, y: 4, w: 20, h: 14 },  // north
  },
  coast: {
    id: "coast",
    label: "The Rocky Coast",
    theme: "harbor",
    bounds: { x: 54, y: 22, w: 22, h: 16 },  // east
  },
  forge_ruins: {
    id: "forge_ruins",
    label: "The Forge Ruins",
    theme: "mountains",
    bounds: { x: 4, y: 22, w: 22, h: 16 },  // west
  },
  // Expansion locations (pre-laid-out so they appear in the right place when god agent unlocks them)
  market: {
    id: "market",
    label: "The First Market",
    theme: "village",
    bounds: { x: 4, y: 4, w: 18, h: 14 },  // NW
  },
  library: {
    id: "library",
    label: "Tide Pool Library",
    theme: "forest",
    bounds: { x: 58, y: 4, w: 18, h: 14 },  // NE
  },
  docks: {
    id: "docks",
    label: "The Docks",
    theme: "harbor",
    bounds: { x: 58, y: 42, w: 18, h: 14 },  // SE
  },
  workshop: {
    id: "workshop",
    label: "The Workshop",
    theme: "mountains",
    bounds: { x: 4, y: 42, w: 18, h: 14 },  // SW
  },
  garden: {
    id: "garden",
    label: "The Kelp Garden",
    theme: "forest",
    bounds: { x: 24, y: 44, w: 10, h: 12 },  // between hatchery + SW
  },
  // The void (banned lobsters go here — far off-screen)
  void: {
    id: "void",
    label: "The Void",
    theme: "dark",
    bounds: { x: 0, y: 0, w: 4, h: 4 },  // hidden corner
  },
};

// Find a location by id (case-insensitive, returns null if unknown).
export function getLocation(id) {
  return LOCATIONS[id] ?? null;
}

// Get the center pixel coordinates of a location (for spawning lobsters).
export function locationCenter(id) {
  const loc = getLocation(id);
  if (!loc) return { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
  const { x, y, w, h } = loc.bounds;
  return {
    x: (x + w / 2) * TILE_SIZE,
    y: (y + h / 2) * TILE_SIZE,
  };
}

// Give every lobster a pseudo-random offset inside its location so
// multiple lobsters don't stack on the exact same pixel.
export function locationSpawnSpot(id, seed) {
  const loc = getLocation(id);
  if (!loc) return { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
  const { x, y, w, h } = loc.bounds;
  // Deterministic hash from seed → offset inside the location
  const hash = (seed * 2654435761) >>> 0;
  const dx = (hash % (w - 4)) + 2;
  const dy = ((hash / 256) % (h - 4)) + 2;
  return {
    x: (x + dx) * TILE_SIZE,
    y: (y + dy) * TILE_SIZE,
  };
}

// Color palette (dark fantasy-meets-Stardew)
export const COLORS = {
  grass:       0x4a7c2a,
  grassDark:   0x3a5f22,
  grassLight:  0x5d9634,
  stone:       0x8a8a94,
  stoneDark:   0x5f5f68,
  water:       0x2e6fa3,
  waterDeep:   0x1a4d7a,
  sand:        0xd4c17a,
  wood:        0x8b5a2b,
  path:        0xa5814a,
  forge:       0x4a3628,
  forgeHot:    0xd14820,
  bg:          0x0e1117,   // matches dashboard bg
};

// ---- Theme → tile rendering rules ----
// Each location theme picks a primary/secondary color pair.
export const THEMES = {
  stone:     { primary: COLORS.stone,   secondary: COLORS.stoneDark, border: COLORS.wood },
  water:     { primary: COLORS.water,   secondary: COLORS.waterDeep, border: COLORS.sand },
  village:   { primary: COLORS.grass,   secondary: COLORS.grassLight, border: COLORS.wood },
  harbor:    { primary: COLORS.sand,    secondary: COLORS.water,     border: COLORS.wood },
  mountains: { primary: COLORS.forge,   secondary: COLORS.stoneDark, border: COLORS.forgeHot },
  forest:    { primary: COLORS.grassDark, secondary: COLORS.grass,   border: COLORS.forge },
  dark:      { primary: 0x1a1a22,       secondary: 0x0a0a10,         border: 0x3a3a4a },
};

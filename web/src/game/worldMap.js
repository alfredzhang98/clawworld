// worldMap — turns ai-town's raw tilemap data into the WorldMap shape
// our PixiStaticMap component expects.
//
// ai-town exports: tilesetpath, tiledim, screenxtiles, screenytiles,
//                   tilesetpxw, tilesetpxh, bgtiles, objmap
//
// PixiStaticMap expects:
//   {
//     width, height, tileDim, tileSetUrl,
//     tileSetDimX, tileSetDimY,
//     bgTiles:     number[][][],  // [layer][x][y]
//     objectTiles: number[][][],  // [layer][x][y]
//   }

import {
  tilesetpath,
  tiledim,
  screenxtiles,
  screenytiles,
  tilesetpxw,
  tilesetpxh,
  bgtiles,
  objmap,
} from "./aitown-map.js";

// Normalize ai-town layers into [layer][x][y] (ai-town already uses this
// shape, but the raw file has each row as an array — the indices go
// [layer][row][col] which happens to match [layer][y][x] conceptually.
// ai-town's PixiStaticMap reads `layer[x][y]` — we follow the same
// convention here.)

function normalize(layers) {
  if (!layers || !layers.length) return [];
  // ai-town stores layers as [layer][row][col], and their PixiStaticMap
  // reads `layer[x][y]`. Their data is already in the expected shape,
  // so we just pass through.
  return layers;
}

export const worldMap = {
  width: screenxtiles,
  height: screenytiles,
  tileDim: tiledim,
  tileSetUrl: tilesetpath,
  tileSetDimX: tilesetpxw,
  tileSetDimY: tilesetpxh,
  bgTiles: normalize(bgtiles),
  objectTiles: normalize(objmap),
};

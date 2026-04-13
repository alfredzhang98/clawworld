// PixiStaticMap — renders a tile-based map using the procedural tile
// atlas from TileGen.js.
//
// Input: a WorldMap object with shape { width, height, tileDim,
//   bgTiles: number[][][], objectTiles: number[][][] }
// where each tile value is an index into the TILE atlas.
//
// Tile index -1 = empty (skipped).

import { PixiComponent, applyDefaultProps } from "@pixi/react";
import * as PIXI from "pixi.js";
import { getTileAtlas } from "./TileGen.js";

export const PixiStaticMap = PixiComponent("StaticMap", {
  create: (props) => {
    const { map } = props;
    const { tiles } = getTileAtlas();

    const container = new PIXI.Container();
    container.sortableChildren = false;

    const screenxtiles = map.width;
    const screenytiles = map.height;

    const allLayers = [...(map.bgTiles || []), ...(map.objectTiles || [])];

    for (let y = 0; y < screenytiles; y++) {
      for (let x = 0; x < screenxtiles; x++) {
        const xPx = x * map.tileDim;
        const yPx = y * map.tileDim;

        for (const layer of allLayers) {
          const tileIndex = layer[x]?.[y];
          if (tileIndex === undefined || tileIndex === -1) continue;
          const tex = tiles[tileIndex];
          if (!tex) continue;
          const sprite = new PIXI.Sprite(tex);
          sprite.x = xPx;
          sprite.y = yPx;
          container.addChild(sprite);
        }
      }
    }

    container.x = 0;
    container.y = 0;
    container.interactive = true;
    container.hitArea = new PIXI.Rectangle(
      0,
      0,
      screenxtiles * map.tileDim,
      screenytiles * map.tileDim,
    );

    return container;
  },
  applyProps: (instance, oldProps, newProps) => {
    applyDefaultProps(instance, oldProps, newProps);
  },
});

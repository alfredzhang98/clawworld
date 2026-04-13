// PixiStaticMap — renders a tile-based map.
//
// Supports TWO modes:
//   1. URL-based tileset: map.tileSetUrl points at a PNG (e.g. ai-town
//      gentle-obj.png). The PNG is sliced into per-tile textures.
//   2. Procedural atlas: map.useProceduralAtlas === true, and we get
//      tile textures from getTileAtlas() in TileGen.js.
//
// Adapted from ai-town's PixiStaticMap.tsx (Apache 2.0).

import { PixiComponent, applyDefaultProps } from "@pixi/react";
import * as PIXI from "pixi.js";
import { getTileAtlas } from "./TileGen.js";

export const PixiStaticMap = PixiComponent("StaticMap", {
  create: (props) => {
    const { map } = props;

    // Build the per-tile texture array
    let tiles;
    if (map.useProceduralAtlas) {
      tiles = getTileAtlas().tiles;
    } else {
      const numxtiles = Math.floor(map.tileSetDimX / map.tileDim);
      const numytiles = Math.floor(map.tileSetDimY / map.tileDim);
      const baseTexture = PIXI.BaseTexture.from(map.tileSetUrl, {
        scaleMode: PIXI.SCALE_MODES.NEAREST,
      });
      tiles = [];
      for (let y = 0; y < numytiles; y++) {
        for (let x = 0; x < numxtiles; x++) {
          tiles[x + y * numxtiles] = new PIXI.Texture(
            baseTexture,
            new PIXI.Rectangle(
              x * map.tileDim,
              y * map.tileDim,
              map.tileDim,
              map.tileDim,
            ),
          );
        }
      }
    }

    const screenxtiles = map.bgTiles[0].length;
    const screenytiles = map.bgTiles[0][0].length;

    const container = new PIXI.Container();
    container.sortableChildren = false;

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

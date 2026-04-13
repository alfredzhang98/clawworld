// PixiStaticMap — renders a tile-based world using ai-town's data format.
//
// Adapted from ai-town's PixiStaticMap.tsx (Apache 2.0).
// Takes a WorldMap object with bgtiles + objmap arrays and splices a
// single tileset image into per-tile textures, then lays them out as
// PIXI.Sprite children of a single container.

import { PixiComponent, applyDefaultProps } from "@pixi/react";
import * as PIXI from "pixi.js";

export const PixiStaticMap = PixiComponent("StaticMap", {
  create: (props) => {
    const { map } = props;
    const numxtiles = Math.floor(map.tileSetDimX / map.tileDim);
    const numytiles = Math.floor(map.tileSetDimY / map.tileDim);

    const baseTexture = PIXI.BaseTexture.from(map.tileSetUrl, {
      scaleMode: PIXI.SCALE_MODES.NEAREST,
    });

    // Slice tileset into individual tile textures
    const tiles = [];
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

    const screenxtiles = map.bgTiles[0].length;
    const screenytiles = map.bgTiles[0][0].length;

    const container = new PIXI.Container();
    container.sortableChildren = true;
    const allLayers = [...map.bgTiles, ...map.objectTiles];

    for (let i = 0; i < screenxtiles * screenytiles; i++) {
      const x = i % screenxtiles;
      const y = Math.floor(i / screenxtiles);
      const xPx = x * map.tileDim;
      const yPx = y * map.tileDim;

      for (const layer of allLayers) {
        const tileIndex = layer[x]?.[y];
        if (tileIndex === undefined || tileIndex === -1) continue;
        const sprite = new PIXI.Sprite(tiles[tileIndex]);
        sprite.x = xPx;
        sprite.y = yPx;
        container.addChild(sprite);
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

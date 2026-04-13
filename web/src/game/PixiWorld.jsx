// PixiWorld — top-level Pixi scene for clawworld.
//
// Handles two scene types:
//   - "outer": the 80x60 hand-built outer map with 5 creation locations
//   - "interior:<id>": a 15x12 interior sub-map for that location
//
// Structure:
//   <Stage>
//     <PixiGameInner useApp>
//       <PixiViewport app={app}>
//         <PixiStaticMap map={currentMap}/>
//         <LocationClickOverlays/>  (outer only — invisible click targets on buildings)
//         <LocationLabels/>          (outer only)
//         <LobsterEntities/>         (filtered by sceneKey)
//       </PixiViewport>
//     </PixiGameInner>
//   </Stage>

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import * as PIXI from "pixi.js";
import { Stage, Container, Graphics, Sprite, Text, useApp } from "@pixi/react";

import { getCachedLobsterSprites } from "./LobsterSpriteGen.js";
import { OUTER_LOCATION_BOUNDS } from "./mapOuter.js";
import PixiViewport from "./PixiViewport.jsx";
import { PixiStaticMap } from "./PixiStaticMap.jsx";

// -----------------------------------------------------------------------
// LobsterEntity — uses the procedural sprite atlas from LobsterSpriteGen
// -----------------------------------------------------------------------

function LobsterEntity({ lobster, tileDim, onClick, xOffset = 0, yOffset = 0 }) {
  const sprites = useMemo(
    () => getCachedLobsterSprites(lobster),
    [lobster.name, lobster.id],
  );

  const textures = useMemo(() => {
    const toTextures = (canvases) =>
      canvases.map((c) => {
        const tex = PIXI.Texture.from(c);
        tex.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
        return tex;
      });
    return {
      down: toTextures(sprites.down),
      up: toTextures(sprites.up),
      left: toTextures(sprites.left),
      right: toTextures(sprites.right),
    };
  }, [sprites]);

  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setFrame((f) => (f + 1) % 3), 220);
    return () => clearInterval(iv);
  }, []);

  const direction = "down";
  const texture = textures[direction][frame];

  const nameColor =
    lobster.role === "god"
      ? "#ffd700"
      : lobster.role === "admin"
      ? "#67e8f9"
      : "#ffffff";

  return (
    <Container x={xOffset} y={yOffset}>
      <Sprite
        texture={texture}
        anchor={{ x: 0.5, y: 0.85 }}
        scale={{ x: 2.0, y: 2.0 }}
        eventMode="static"
        cursor="pointer"
        pointertap={(e) => {
          e.stopPropagation();
          onClick?.(lobster);
        }}
      />
      <Text
        text={lobster.name}
        anchor={{ x: 0.5, y: 1 }}
        x={0}
        y={-40}
        style={
          new PIXI.TextStyle({
            fontFamily: "monospace",
            fontSize: 12,
            fontWeight: "bold",
            fill: nameColor,
            stroke: "#000000",
            strokeThickness: 4,
          })
        }
      />
    </Container>
  );
}

// Place a lobster deterministically inside a rectangle
function placeInBounds(bounds, lobsterId, tileDim) {
  const { x, y, w, h } = bounds;
  const hash = ((lobsterId || 1) * 2654435761) >>> 0;
  const dx = 1 + (hash % Math.max(1, w - 2));
  const dy = 1 + ((hash >>> 8) % Math.max(1, h - 2));
  return { x: (x + dx) * tileDim, y: (y + dy) * tileDim };
}

// -----------------------------------------------------------------------
// LocationClickOverlay — invisible clickable rectangles over the buildings
// on the outer map, so clicking a building enters its interior.
// -----------------------------------------------------------------------

function LocationClickOverlay({ bounds, locationId, tileDim, onEnter }) {
  const draw = useCallback(
    (g) => {
      g.clear();
      // Transparent hit area (alpha 0.01 so Pixi accepts it as hittable)
      g.beginFill(0xffffff, 0.001);
      g.drawRect(
        bounds.x * tileDim,
        bounds.y * tileDim,
        bounds.w * tileDim,
        bounds.h * tileDim,
      );
      g.endFill();
    },
    [bounds.x, bounds.y, bounds.w, bounds.h, tileDim],
  );

  return (
    <Graphics
      draw={draw}
      eventMode="static"
      cursor="pointer"
      pointertap={(e) => {
        e.stopPropagation();
        onEnter?.(locationId);
      }}
    />
  );
}

// -----------------------------------------------------------------------
// LocationLabel — floating text over each outer-map location
// -----------------------------------------------------------------------

function LocationLabel({ bounds, label, tileDim }) {
  const px = (bounds.x + bounds.w / 2) * tileDim;
  const py = (bounds.y - 0.2) * tileDim;
  return (
    <Text
      text={label}
      anchor={{ x: 0.5, y: 1 }}
      x={px}
      y={py}
      style={
        new PIXI.TextStyle({
          fontFamily: "monospace",
          fontSize: 14,
          fontWeight: "bold",
          fill: "#ffffff",
          stroke: "#000000",
          strokeThickness: 4,
        })
      }
    />
  );
}

// -----------------------------------------------------------------------
// Inner game component — inside <Stage> so useApp() works
// -----------------------------------------------------------------------

function PixiGameInner({
  map,
  sceneKey,
  width,
  height,
  lobsters,
  onLobsterClick,
  onEnterInterior,
  onEmptyClick,
}) {
  const pixiApp = useApp();
  const viewportRef = useRef(undefined);

  const MAP_W = map.width * map.tileDim;
  const MAP_H = map.height * map.tileDim;

  // Center camera on the map each time map changes
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    vp.worldWidth = MAP_W;
    vp.worldHeight = MAP_H;
    vp.moveCenter(MAP_W / 2, MAP_H / 2);
    // Fit the map to the visible area (with some padding)
    const fitScale = Math.min(
      (width - 40) / MAP_W,
      (height - 40) / MAP_H,
    );
    vp.setZoom(Math.max(0.4, fitScale), true);
  }, [map, MAP_W, MAP_H, width, height]);

  const isOuter = sceneKey === "outer";

  // Filter lobsters by current scene (default to outer for lobsters without a field)
  const visibleLobsters = lobsters.filter((l) => {
    const ls = l.current_scene ?? "outer";
    return ls === sceneKey;
  });

  return (
    <PixiViewport
      app={pixiApp}
      viewportRef={viewportRef}
      screenWidth={width}
      screenHeight={height}
      worldWidth={MAP_W}
      worldHeight={MAP_H}
    >
      <PixiStaticMap
        map={map}
        pointertap={(e) => {
          if (e.target === e.currentTarget) onEmptyClick?.();
        }}
      />

      {isOuter &&
        Object.entries(OUTER_LOCATION_BOUNDS).map(([id, b]) => (
          <LocationClickOverlay
            key={`hit-${id}`}
            bounds={b}
            locationId={id}
            tileDim={map.tileDim}
            onEnter={onEnterInterior}
          />
        ))}

      {isOuter &&
        Object.entries(OUTER_LOCATION_BOUNDS).map(([id, b]) => (
          <LocationLabel
            key={`label-${id}`}
            bounds={b}
            label={b.label}
            tileDim={map.tileDim}
          />
        ))}

      {visibleLobsters.map((lobster) => {
        let spot;
        if (isOuter) {
          // Outer: use the lobster's location bounds
          const bounds = OUTER_LOCATION_BOUNDS[lobster.location];
          spot = bounds
            ? placeInBounds(bounds, lobster.id, map.tileDim)
            : { x: MAP_W / 2, y: MAP_H / 2 };
        } else {
          // Interior: put lobster near the center of the room
          spot = {
            x: (map.width / 2 + ((lobster.id * 37) % 3) - 1) * map.tileDim,
            y: (map.height / 2 + ((lobster.id * 53) % 3) - 1) * map.tileDim,
          };
        }
        return (
          <Container key={`${lobster.name}-${lobster.id}`} x={spot.x} y={spot.y}>
            <LobsterEntity
              lobster={lobster}
              tileDim={map.tileDim}
              onClick={onLobsterClick}
            />
          </Container>
        );
      })}
    </PixiViewport>
  );
}

// -----------------------------------------------------------------------
// Top-level PixiWorld
// -----------------------------------------------------------------------

export default function PixiWorld({
  map,
  sceneKey,
  width,
  height,
  lobsters = [],
  onLobsterClick,
  onEnterInterior,
  onEmptyClick,
}) {
  if (!map) return null;
  return (
    <Stage
      width={width}
      height={height}
      options={{
        backgroundColor: 0x0a0d12,
        antialias: false,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      }}
    >
      <PixiGameInner
        map={map}
        sceneKey={sceneKey}
        width={width}
        height={height}
        lobsters={lobsters}
        onLobsterClick={onLobsterClick}
        onEnterInterior={onEnterInterior}
        onEmptyClick={onEmptyClick}
      />
    </Stage>
  );
}

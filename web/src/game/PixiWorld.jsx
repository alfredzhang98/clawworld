// PixiWorld — top-level Pixi scene for clawworld.
//
// Structure:
//   <Stage>
//     <PixiGameInner>            — uses useApp() to get app handle
//       <PixiViewport app={...}> — pan/zoom/pinch wrapper
//         <PixiStaticMap/>       — ai-town's tile-based village
//         <LocationAnchors/>     — floating labels for 5 creation sites
//         <LobsterEntities/>     — procedurally-generated lobster sprites
//       </PixiViewport>
//     </PixiGameInner>
//   </Stage>

import { useEffect, useMemo, useRef, useState } from "react";
import * as PIXI from "pixi.js";
import { Stage, Container, Sprite, Text, useApp } from "@pixi/react";

import { worldMap } from "./worldMap.js";
import { TILE_SIZE, LOCATIONS } from "./constants.js";
import { getCachedLobsterSprites } from "./LobsterSpriteGen.js";
import PixiViewport from "./PixiViewport.jsx";
import { PixiStaticMap } from "./PixiStaticMap.jsx";

const MAP_W = worldMap.width * worldMap.tileDim;
const MAP_H = worldMap.height * worldMap.tileDim;

// -----------------------------------------------------------------------
// Lobster entity — converts generated canvas frames to Pixi textures
// and animates the walk cycle.
// -----------------------------------------------------------------------

function LobsterEntity({ lobster, onClick }) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprites]);

  // Walk cycle ticker
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setFrame((f) => (f + 1) % 3), 220);
    return () => clearInterval(iv);
  }, []);

  // Position — spawn inside the assigned location
  const spot = useMemo(
    () => locationSpot(lobster.location, lobster.id),
    [lobster.location, lobster.id],
  );

  const direction = "down";
  const texture = textures[direction][frame];

  const nameColor =
    lobster.role === "god"
      ? "#ffd700"
      : lobster.role === "admin"
      ? "#67e8f9"
      : "#ffffff";

  return (
    <Container x={spot.x} y={spot.y}>
      <Sprite
        texture={texture}
        anchor={{ x: 0.5, y: 0.85 }}
        scale={{ x: 1.0, y: 1.0 }}
        eventMode="static"
        cursor="pointer"
        pointertap={(e) => {
          e.stopPropagation();
          onClick?.(lobster);
        }}
      />
      <Text
        text={lobster.name}
        anchor={{ x: 0.5, y: 0.5 }}
        x={0}
        y={-22}
        style={
          new PIXI.TextStyle({
            fontFamily: "monospace",
            fontSize: 10,
            fontWeight: "bold",
            fill: nameColor,
            stroke: "#000000",
            strokeThickness: 3,
          })
        }
      />
    </Container>
  );
}

function locationSpot(locationId, lobsterId) {
  const loc = LOCATIONS[locationId] ?? LOCATIONS.square;
  const { x, y, w, h } = loc.bounds;
  // Deterministic offset inside the location from lobsterId
  const hash = ((lobsterId || 1) * 2654435761) >>> 0;
  const dx = 1 + (hash % Math.max(1, w - 2));
  const dy = 1 + ((hash >>> 8) % Math.max(1, h - 2));
  return { x: (x + dx) * TILE_SIZE, y: (y + dy) * TILE_SIZE };
}

// -----------------------------------------------------------------------
// Floating location labels (anchored over the ai-town map)
// -----------------------------------------------------------------------

function LocationLabel({ loc, onClick }) {
  const px = (loc.bounds.x + loc.bounds.w / 2) * TILE_SIZE;
  const py = (loc.bounds.y - 0.5) * TILE_SIZE;
  return (
    <Container
      x={px}
      y={py}
      eventMode="static"
      cursor="pointer"
      pointertap={(e) => {
        e.stopPropagation();
        onClick?.(loc.id);
      }}
    >
      <Text
        text={`${loc.icon ?? ""} ${loc.label}`}
        anchor={{ x: 0.5, y: 0 }}
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
    </Container>
  );
}

// -----------------------------------------------------------------------
// Inner game component — runs inside <Stage> so useApp() works
// -----------------------------------------------------------------------

function PixiGameInner({
  width,
  height,
  lobsters,
  onLobsterClick,
  onLocationClick,
  onEmptyClick,
}) {
  const pixiApp = useApp();
  const viewportRef = useRef(undefined);

  // Center camera on the map's middle on first mount
  useEffect(() => {
    if (!viewportRef.current) return;
    const vp = viewportRef.current;
    vp.moveCenter(MAP_W / 2, MAP_H / 2);
    vp.setZoom(0.8, true);
  }, []);

  const handleMapPointerTap = (e) => {
    // Clicking the map background (not a lobster/label) dismisses panels
    if (e.target === e.currentTarget) {
      onEmptyClick?.();
    }
  };

  return (
    <PixiViewport
      app={pixiApp}
      viewportRef={viewportRef}
      screenWidth={width}
      screenHeight={height}
      worldWidth={MAP_W}
      worldHeight={MAP_H}
    >
      <PixiStaticMap map={worldMap} pointertap={handleMapPointerTap} />
      {Object.values(LOCATIONS)
        .filter((l) => l.id !== "void")
        .map((loc) => (
          <LocationLabel key={loc.id} loc={loc} onClick={onLocationClick} />
        ))}
      {lobsters.map((lobster) => (
        <LobsterEntity
          key={`${lobster.name}-${lobster.id}`}
          lobster={lobster}
          onClick={onLobsterClick}
        />
      ))}
    </PixiViewport>
  );
}

// -----------------------------------------------------------------------
// Top-level PixiWorld (only sets up <Stage>)
// -----------------------------------------------------------------------

export default function PixiWorld({
  width,
  height,
  lobsters = [],
  onLobsterClick,
  onLocationClick,
  onEmptyClick,
}) {
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
        width={width}
        height={height}
        lobsters={lobsters}
        onLobsterClick={onLobsterClick}
        onLocationClick={onLocationClick}
        onEmptyClick={onEmptyClick}
      />
    </Stage>
  );
}

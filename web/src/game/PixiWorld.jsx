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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as PIXI from "pixi.js";
import { Stage, Container, Graphics, Sprite, Text, useApp } from "@pixi/react";

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
        scale={{ x: 2.2, y: 2.2 }}
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
        y={-48}
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

// Colored themes per location — provides visual identity regardless of
// what's under the zone on the base tilemap.
const LOCATION_COLORS = {
  square:       { primary: 0xd4a574, secondary: 0x8b5a2b, glow: 0xfff4c2 },
  hatchery:     { primary: 0x4fc3f7, secondary: 0x01579b, glow: 0x81d4fa },
  council_hall: { primary: 0x7c4dff, secondary: 0x311b92, glow: 0xb388ff },
  coast:        { primary: 0x26a69a, secondary: 0x004d40, glow: 0x80cbc4 },
  forge_ruins:  { primary: 0xff6f00, secondary: 0x3e2723, glow: 0xffab40 },
  market:       { primary: 0xffb300, secondary: 0x6f4c00, glow: 0xffe082 },
  library:      { primary: 0x66bb6a, secondary: 0x1b5e20, glow: 0xa5d6a7 },
  docks:        { primary: 0x42a5f5, secondary: 0x0d47a1, glow: 0x90caf9 },
  workshop:     { primary: 0xef5350, secondary: 0x4a1e1e, glow: 0xef9a9a },
  garden:       { primary: 0x8bc34a, secondary: 0x33691e, glow: 0xc5e1a5 },
};

/**
 * LocationZone — draws a glowing rectangle with a decorative frame
 * over a location's bounds so the zone is visible even if the base
 * tilemap doesn't have a building there.
 */
function LocationZone({ loc, onClick }) {
  const { x, y, w, h } = loc.bounds;
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;
  const pw = w * TILE_SIZE;
  const ph = h * TILE_SIZE;
  const colors = LOCATION_COLORS[loc.id] ?? LOCATION_COLORS.square;

  const [hovered, setHovered] = useState(false);

  const draw = useCallback(
    (g) => {
      g.clear();

      // Outer soft glow
      g.beginFill(colors.glow, hovered ? 0.35 : 0.18);
      g.drawRoundedRect(px - 8, py - 8, pw + 16, ph + 16, 12);
      g.endFill();

      // Main fill
      g.beginFill(colors.primary, hovered ? 0.32 : 0.22);
      g.drawRoundedRect(px, py, pw, ph, 8);
      g.endFill();

      // Decorative frame (thick outer + thin inner)
      g.lineStyle(4, colors.secondary, 0.95);
      g.drawRoundedRect(px + 2, py + 2, pw - 4, ph - 4, 6);
      g.lineStyle(2, colors.glow, 0.8);
      g.drawRoundedRect(px + 6, py + 6, pw - 12, ph - 12, 4);

      // Corner ornaments
      const corners = [
        [px + 6, py + 6],
        [px + pw - 6, py + 6],
        [px + 6, py + ph - 6],
        [px + pw - 6, py + ph - 6],
      ];
      g.lineStyle(0);
      g.beginFill(colors.glow);
      for (const [cx, cy] of corners) {
        g.drawCircle(cx, cy, 3);
      }
      g.endFill();
    },
    [px, py, pw, ph, hovered, colors.glow, colors.primary, colors.secondary],
  );

  return (
    <Container
      eventMode="static"
      cursor="pointer"
      pointertap={(e) => {
        e.stopPropagation();
        onClick?.(loc.id);
      }}
      pointerover={() => setHovered(true)}
      pointerout={() => setHovered(false)}
    >
      <Graphics draw={draw} />
    </Container>
  );
}

function LocationLabel({ loc, onClick }) {
  const px = (loc.bounds.x + loc.bounds.w / 2) * TILE_SIZE;
  const py = (loc.bounds.y - 0.8) * TILE_SIZE;
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
        anchor={{ x: 0.5, y: 1 }}
        style={
          new PIXI.TextStyle({
            fontFamily: "monospace",
            fontSize: 13,
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
          <LocationZone key={`zone-${loc.id}`} loc={loc} onClick={onLocationClick} />
        ))}
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

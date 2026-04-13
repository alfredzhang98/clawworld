// PixiWorld — React component that renders the clawworld game map
// using Pixi.js via @pixi/react declarative bindings.
//
// Structure:
//   <Stage>
//     <Viewport>  (pan/zoom/wheel controls via pixi-viewport)
//       <WorldBackground />        — deep water under everything
//       <Paths />                  — stone paths connecting rooms
//       <LocationRooms />          — 5 themed rectangles
//       <LocationLabels />         — floating names
//       <Lobsters />               — procedural sprites
//     </Viewport>
//   </Stage>
//
// This is Phase 1's map — rooms are drawn as Graphics rectangles.
// Phase 2 will replace rooms with data-driven tilemap rendering.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as PIXI from "pixi.js";
import { Stage, Container, Graphics, Sprite, Text, useApp } from "@pixi/react";
import { Viewport } from "pixi-viewport";

import {
  TILE_SIZE,
  MAP_COLS,
  MAP_ROWS,
  MAP_WIDTH,
  MAP_HEIGHT,
  LOCATIONS,
  COLORS,
  THEMES,
  locationSpawnSpot,
  getLocation,
} from "./constants.js";
import { getCachedLobsterSprites } from "./LobsterSpriteGen.js";

// -----------------------------------------------------------------------
// Viewport wrapper (pixi-viewport → @pixi/react)
// -----------------------------------------------------------------------

// @pixi/react doesn't ship a Viewport component, so we register a custom
// one that wraps pixi-viewport. This pattern is standard in ai-town.
import { PixiComponent } from "@pixi/react";

const PixiViewportComponent = PixiComponent("Viewport", {
  create: (props) => {
    const viewport = new Viewport({
      screenWidth: props.screenWidth,
      screenHeight: props.screenHeight,
      worldWidth: MAP_WIDTH,
      worldHeight: MAP_HEIGHT,
      events: props.events,
      ticker: props.ticker,
      passiveWheel: false,
    });
    viewport
      .drag({ mouseButtons: "all" })
      .pinch()
      .wheel({ smooth: 3 })
      .decelerate()
      .clamp({ direction: "all" })
      .clampZoom({ minScale: 0.3, maxScale: 2.0 });
    return viewport;
  },
  applyProps: (instance, oldProps, newProps) => {
    if (
      oldProps.screenWidth !== newProps.screenWidth ||
      oldProps.screenHeight !== newProps.screenHeight
    ) {
      instance.resize(newProps.screenWidth, newProps.screenHeight, MAP_WIDTH, MAP_HEIGHT);
    }
  },
  didMount: (instance) => {
    // Center camera on the map
    instance.moveCenter(MAP_WIDTH / 2, MAP_HEIGHT / 2);
    instance.setZoom(0.5, true);
  },
});

function PixiViewportWrapper({ children, screenWidth, screenHeight, onClickEmpty }) {
  const app = useApp();

  const handlePointerDown = useCallback(
    (event) => {
      // Right-click or clicking the background dismisses panels
      if (event.target === event.currentTarget && onClickEmpty) {
        onClickEmpty();
      }
    },
    [onClickEmpty],
  );

  return (
    <PixiViewportComponent
      screenWidth={screenWidth}
      screenHeight={screenHeight}
      events={app.renderer.events}
      ticker={app.ticker}
      pointerdown={handlePointerDown}
    >
      {children}
    </PixiViewportComponent>
  );
}

// -----------------------------------------------------------------------
// Static world (background + rooms + paths + labels)
// -----------------------------------------------------------------------

function WorldBackground() {
  const draw = useCallback((g) => {
    g.clear();
    // Deep ocean fill
    g.beginFill(COLORS.waterDeep);
    g.drawRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    g.endFill();
    // Subtle wave pattern
    g.beginFill(COLORS.water, 0.5);
    for (let y = 0; y < MAP_ROWS; y += 3) {
      for (let x = 0; x < MAP_COLS; x += 3) {
        if ((x + y) % 2 === 0) {
          g.drawRect(x * TILE_SIZE + 8, y * TILE_SIZE + 8, 6, 6);
        }
      }
    }
    g.endFill();
  }, []);
  return <Graphics draw={draw} />;
}

function Paths() {
  const draw = useCallback((g) => {
    g.clear();
    const square = LOCATIONS.square;
    const sx = (square.bounds.x + square.bounds.w / 2) * TILE_SIZE;
    const sy = (square.bounds.y + square.bounds.h / 2) * TILE_SIZE;

    const targets = ["council_hall", "hatchery", "forge_ruins", "coast"];
    for (const id of targets) {
      const target = LOCATIONS[id];
      const tx = (target.bounds.x + target.bounds.w / 2) * TILE_SIZE;
      const ty = (target.bounds.y + target.bounds.h / 2) * TILE_SIZE;

      // Outer path
      g.lineStyle(TILE_SIZE, COLORS.path, 0.85);
      g.moveTo(sx, sy);
      g.lineTo(tx, ty);
      // Inner brighter stripe
      g.lineStyle(TILE_SIZE - 10, COLORS.sand, 0.6);
      g.moveTo(sx, sy);
      g.lineTo(tx, ty);
    }
  }, []);
  return <Graphics draw={draw} />;
}

function LocationRoom({ loc, onClick }) {
  const theme = THEMES[loc.theme] ?? THEMES.stone;
  const { x, y, w, h } = loc.bounds;
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;
  const pw = w * TILE_SIZE;
  const ph = h * TILE_SIZE;

  const draw = useCallback(
    (g) => {
      g.clear();

      // Primary fill
      g.beginFill(theme.primary);
      g.drawRect(px, py, pw, ph);
      g.endFill();

      // Checker-pattern secondary tint for depth
      g.beginFill(theme.secondary, 0.4);
      for (let ty = 0; ty < h; ty++) {
        for (let tx = 0; tx < w; tx++) {
          if ((tx + ty) % 2 === 0) {
            g.drawRect(px + tx * TILE_SIZE, py + ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          }
        }
      }
      g.endFill();

      // Decorative border
      g.lineStyle(4, theme.border);
      g.drawRect(px + 2, py + 2, pw - 4, ph - 4);

      // Inner shadow
      g.lineStyle(2, 0x000000, 0.3);
      g.drawRect(px + 6, py + 6, pw - 12, ph - 12);

      // Theme-specific decorations
      drawLocationDecoration(g, loc, px, py, pw, ph, w, h);
    },
    [loc.id],
  );

  return (
    <Container
      eventMode="static"
      cursor="pointer"
      pointertap={(e) => {
        e.stopPropagation();
        onClick?.(loc.id);
      }}
    >
      <Graphics draw={draw} />
    </Container>
  );
}

function drawLocationDecoration(g, loc, px, py, pw, ph, w, h) {
  switch (loc.id) {
    case "forge_ruins": {
      // Glowing forge at center
      const cx = px + pw / 2;
      const cy = py + ph / 2;
      g.beginFill(COLORS.stoneDark);
      g.drawCircle(cx, cy, 40);
      g.endFill();
      g.beginFill(COLORS.forgeHot, 0.9);
      g.drawCircle(cx, cy, 26);
      g.endFill();
      g.beginFill(0xffaa33);
      g.drawCircle(cx, cy, 14);
      g.endFill();
      break;
    }
    case "hatchery": {
      // Tide pools
      for (let i = 0; i < 4; i++) {
        const cx = px + TILE_SIZE * (4 + i * 4);
        const cy = py + TILE_SIZE * (h - 3);
        g.beginFill(COLORS.waterDeep, 0.85);
        g.drawCircle(cx, cy, 18);
        g.endFill();
        g.beginFill(COLORS.water, 0.7);
        g.drawCircle(cx, cy, 12);
        g.endFill();
      }
      break;
    }
    case "council_hall": {
      // Slate roof tiles
      g.beginFill(0x3a6b9a, 0.7);
      for (let tx = 2; tx < w - 2; tx += 2) {
        g.drawRect(px + tx * TILE_SIZE, py + 2 * TILE_SIZE, TILE_SIZE * 1.5, TILE_SIZE);
      }
      g.endFill();
      break;
    }
    case "coast": {
      // Wave lines
      g.lineStyle(3, COLORS.water, 0.7);
      for (let i = 0; i < 5; i++) {
        const wy = py + TILE_SIZE * (h - 3 - i * 0.5);
        g.moveTo(px + 20, wy);
        for (let dx = 20; dx < pw - 20; dx += 8) {
          g.lineTo(px + dx, wy + Math.sin(dx * 0.1) * 4);
        }
      }
      break;
    }
    case "square": {
      // Central notice board
      const cx = px + pw / 2;
      const cy = py + ph / 2;
      g.beginFill(COLORS.wood);
      g.drawRect(cx - 24, cy - 24, 48, 48);
      g.endFill();
      g.beginFill(0xfff4c2);
      g.drawRect(cx - 20, cy - 20, 40, 40);
      g.endFill();
      g.lineStyle(2, COLORS.forge);
      g.drawRect(cx - 20, cy - 20, 40, 40);
      break;
    }
    default:
      break;
  }
}

function LocationLabel({ loc }) {
  const { x, y, w } = loc.bounds;
  const px = x * TILE_SIZE + (w * TILE_SIZE) / 2;
  const py = y * TILE_SIZE + 10;
  return (
    <Text
      text={loc.label}
      anchor={{ x: 0.5, y: 0 }}
      x={px}
      y={py}
      style={
        new PIXI.TextStyle({
          fontFamily: "monospace",
          fontSize: 18,
          fontWeight: "bold",
          fill: "#ffffff",
          stroke: "#000000",
          strokeThickness: 4,
          align: "center",
        })
      }
    />
  );
}

// -----------------------------------------------------------------------
// Lobster sprite rendering
// -----------------------------------------------------------------------

function LobsterEntity({ lobster, onClick }) {
  // Generate (or retrieve cached) sprites for this lobster
  const sprites = useMemo(() => getCachedLobsterSprites(lobster), [lobster.name, lobster.id]);

  // Convert canvases to Pixi textures
  const textures = useMemo(() => {
    const make = (canvases) => canvases.map((c) => PIXI.Texture.from(c));
    return {
      down: make(sprites.down),
      up: make(sprites.up),
      left: make(sprites.left),
      right: make(sprites.right),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprites]);

  // Walk animation frame — simple local ticker
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setFrame((f) => (f + 1) % 3), 250);
    return () => clearInterval(iv);
  }, []);

  // Position based on current location
  const spot = useMemo(
    () => locationSpawnSpot(lobster.location, lobster.id),
    [lobster.location, lobster.id],
  );

  // Direction — placeholder for Phase 4. Default "down".
  const direction = "down";
  const texture = textures[direction][frame];

  // Name color by role
  const nameColor =
    lobster.role === "god" ? "#ffd700" : lobster.role === "admin" ? "#67e8f9" : "#ffffff";

  return (
    <Container x={spot.x} y={spot.y}>
      <Sprite
        texture={texture}
        anchor={{ x: 0.5, y: 0.5 }}
        scale={{ x: 1.5, y: 1.5 }}
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
        y={-30}
        style={
          new PIXI.TextStyle({
            fontFamily: "monospace",
            fontSize: 11,
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

// -----------------------------------------------------------------------
// Top-level PixiWorld
// -----------------------------------------------------------------------

export default function PixiWorld({
  lobsters = [],
  width,
  height,
  onLobsterClick,
  onLocationClick,
  onClickEmpty,
}) {
  const stageRef = useRef(null);
  return (
    <Stage
      width={width}
      height={height}
      ref={stageRef}
      options={{
        backgroundColor: 0x0a0d12,
        antialias: false,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      }}
    >
      <PixiViewportWrapper
        screenWidth={width}
        screenHeight={height}
        onClickEmpty={onClickEmpty}
      >
        <WorldBackground />
        <Paths />
        {Object.values(LOCATIONS)
          .filter((l) => l.id !== "void")
          .map((loc) => (
            <LocationRoom key={loc.id} loc={loc} onClick={onLocationClick} />
          ))}
        {Object.values(LOCATIONS)
          .filter((l) => l.id !== "void")
          .map((loc) => (
            <LocationLabel key={`label-${loc.id}`} loc={loc} />
          ))}
        {lobsters.map((lobster) => (
          <LobsterEntity
            key={`${lobster.name}-${lobster.id}`}
            lobster={lobster}
            onClick={onLobsterClick}
          />
        ))}
      </PixiViewportWrapper>
    </Stage>
  );
}

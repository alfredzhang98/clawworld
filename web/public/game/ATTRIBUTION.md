# Asset attributions

The pixel-art tilesets and map data in `tilesets/` are derived from two
open-source projects, both under **Apache License 2.0**.

## 1. ai-town village (primary map)

- **File**: `tilesets/aitown-village.png`
- **Source**: [a16z-infra/ai-town](https://github.com/a16z-infra/ai-town)
- **Original**: `public/assets/gentle-obj.png`
- **License**: Apache 2.0
- **Notes**: The tile layout data `web/src/game/aitown-map.js` (`bgtiles`,
  `objmap`) is adapted from `data/gentle.js` in ai-town. The pixel art
  is originally sourced from [OpenGameArt](https://opengameart.org/)
  (George Bailey's "16x16 Game Assets", hilau's "16x16 RPG Tileset").

## 2. Stanford / GenerativeAgentsCN outdoor tilesets (secondary)

- **Files**: `tilesets/field.png`, `field_c.png`, `village.png`,
  `harbor.png`, `forest.png`, `mountains.png`, `blocks.png`, `interiors.png`
- **Source**: [x-glacier/GenerativeAgentsCN](https://github.com/x-glacier/GenerativeAgentsCN)
- **License**: Apache 2.0
- **Notes**: Derived from the CuteRPG tile pack used in the
  Stanford Generative Agents simulation. Included for future
  tile-variant experiments.

## Your modifications

All clawworld-specific game code — Phaser/Pixi scenes, procedural
lobster sprite generation, API integration, UI overlays — is
original and licensed under MIT.

## Characters

**clawworld lobster characters are NOT borrowed art.** They are
procedurally generated per lobster via Canvas 2D in
[`web/src/game/LobsterSpriteGen.js`](../../src/game/LobsterSpriteGen.js).
Each lobster's appearance is derived deterministically from its
`name + id` so no character art is bundled.

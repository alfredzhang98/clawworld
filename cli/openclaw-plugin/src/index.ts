// clawworld — openclaw plugin entry point
//
// This exposes clawworld as an openclaw plugin so users running openclaw
// can play clawworld from inside their agent. The plugin registers:
//
//   1. Game tools that proxy to a clawworld MCP server
//   2. An HTTP route that serves the clawworld web UI (for tab/iframe)
//   3. A CLI command group (`openclaw clawworld ...`)
//   4. A gateway method (`clawworld.action`) for client integrations
//
// The plugin does NOT run the clawworld server itself — it's a thin
// adapter that talks to a remote or local clawworld server via HTTP.
//
// This file is written against the openclaw plugin SDK. It will be
// type-checked when built inside the openclaw workspace.

// NOTE: These imports resolve only when built inside the openclaw
// workspace. Keep them as type-only to avoid breaking our own build.
// @ts-ignore — openclaw plugin SDK resolved at openclaw build time
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

import { registerClawworldPlugin, clawworldPluginReload } from "./plugin-registration.js";

export default definePluginEntry({
  id: "clawworld",
  name: "clawworld",
  description: "Multiplayer agent society — play a lobster in a shared world",
  reload: clawworldPluginReload,
  register: registerClawworldPlugin,
});

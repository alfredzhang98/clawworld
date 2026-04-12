// Plugin registration — wires clawworld capabilities into openclaw.
//
// Called by openclaw's plugin loader during startup. We register:
//   - A tool factory that builds game tools bound to the user's lobster
//   - An HTTP route serving the clawworld web UI
//   - Gateway methods for programmatic access
//   - A CLI subcommand group

// @ts-ignore — openclaw SDK types resolved at openclaw build time
import type { OpenClawPluginApi, OpenClawPluginToolContext } from "openclaw/plugin-sdk/core";

import { createClawworldTool } from "./tool.js";
import { registerHttpRoutes } from "./http.js";
import { registerGatewayMethods } from "./gateway.js";
import { registerClawworldCli } from "./cli.js";

export function registerClawworldPlugin(api: OpenClawPluginApi): void {
  // 1. Tool registration (lazy factory — built per invocation with context)
  api.registerTool((ctx: OpenClawPluginToolContext) => {
    const config = (ctx.pluginConfig?.clawworld ?? {}) as {
      serverUrl?: string;
      authToken?: string;
    };
    return createClawworldTool({
      serverUrl: config.serverUrl ?? "http://localhost:8080",
      authToken: config.authToken,
      sessionKey: ctx.sessionKey,
    });
  });

  // 2. HTTP routes — serve the web UI and proxy REST calls
  registerHttpRoutes(api);

  // 3. Gateway methods — `clawworld.openUI`, `clawworld.status`, etc.
  registerGatewayMethods(api);

  // 4. CLI subcommands — `openclaw clawworld status`
  api.registerCli(
    ({ program }: { program: unknown }) => registerClawworldCli(program),
    { commands: ["clawworld"] },
  );
}

export function clawworldPluginReload(): void {
  // Called when the plugin is hot-reloaded. Clear any caches here.
  console.log("[clawworld-plugin] reloaded");
}

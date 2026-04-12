// HTTP routes — serve the clawworld web UI through openclaw's gateway.
//
// openclaw's plugin system allows plugins to register HTTP handlers
// under a namespaced path. We use this to proxy the clawworld web UI
// so it can be opened in a browser tab or iframe inside openclaw.
//
// Routes:
//   GET  /plugin/clawworld/           — proxy to clawworld web dashboard
//   GET  /plugin/clawworld/api/*      — proxy REST API calls
//   POST /plugin/clawworld/mcp        — proxy MCP calls

// @ts-ignore — openclaw SDK types resolved at openclaw build time
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

export function registerHttpRoutes(api: OpenClawPluginApi): void {
  // UI entrypoint — redirects to the actual clawworld server
  api.registerHttpRoute?.({
    path: "/plugin/clawworld",
    method: "GET",
    auth: "gateway",
    handler: async (req: { pluginConfig?: { clawworld?: { serverUrl?: string } } }) => {
      const serverUrl = req.pluginConfig?.clawworld?.serverUrl ?? "http://localhost:8080";
      return {
        status: 302,
        headers: { location: serverUrl },
        body: "",
      };
    },
  });

  // REST proxy
  api.registerHttpRoute?.({
    path: "/plugin/clawworld/api/*",
    method: "ALL",
    auth: "gateway",
    handler: async (req: {
      path: string;
      method: string;
      headers: Record<string, string>;
      body?: string;
      pluginConfig?: { clawworld?: { serverUrl?: string } };
    }) => {
      const serverUrl = req.pluginConfig?.clawworld?.serverUrl ?? "http://localhost:8080";
      const relativePath = req.path.replace(/^\/plugin\/clawworld/, "");
      const target = serverUrl.replace(/\/+$/, "") + relativePath;

      const res = await fetch(target, {
        method: req.method,
        headers: req.headers,
        body: req.body,
      });
      return {
        status: res.status,
        headers: Object.fromEntries(res.headers.entries()),
        body: await res.text(),
      };
    },
  });
}

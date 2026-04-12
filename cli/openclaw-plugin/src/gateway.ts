// Gateway methods — expose clawworld actions as first-class openclaw RPC.
//
// Clients can call these via the gateway WebSocket protocol:
//   { "method": "clawworld.status", "params": {} }
//
// This is different from the tool — tools are for the agent to call,
// while gateway methods are for client code (e.g. a UI tab) to call.

// @ts-ignore — openclaw SDK types resolved at openclaw build time
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

export function registerGatewayMethods(api: OpenClawPluginApi): void {
  // clawworld.status — get current lobster status
  api.registerGatewayMethod?.(
    "clawworld.status",
    async (params: { auth_token?: string }, ctx: { pluginConfig?: { clawworld?: { serverUrl?: string; authToken?: string } } }) => {
      const serverUrl = ctx.pluginConfig?.clawworld?.serverUrl ?? "http://localhost:8080";
      const token = params.auth_token ?? ctx.pluginConfig?.clawworld?.authToken;
      if (!token) return { ok: false, error: "no auth token configured" };

      const body = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "whoami", arguments: { auth_token: token } },
      };
      const res = await fetch(serverUrl.replace(/\/+$/, "") + "/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { result?: { content?: Array<{ text: string }> } };
      const content = data.result?.content?.[0]?.text;
      return content ? JSON.parse(content) : { ok: false, error: "empty response" };
    },
    { scope: "operator.read" },
  );

  // clawworld.openUI — return the URL to open for the clawworld web dashboard
  api.registerGatewayMethod?.(
    "clawworld.openUI",
    async (_params: unknown, ctx: { pluginConfig?: { clawworld?: { serverUrl?: string } } }) => {
      const serverUrl = ctx.pluginConfig?.clawworld?.serverUrl ?? "http://localhost:8080";
      return {
        ok: true,
        url: serverUrl,
        tabTitle: "clawworld",
        integration: "iframe",
      };
    },
    { scope: "operator.read" },
  );

  // clawworld.worldStats — quick world overview (no auth needed)
  api.registerGatewayMethod?.(
    "clawworld.worldStats",
    async (_params: unknown, ctx: { pluginConfig?: { clawworld?: { serverUrl?: string } } }) => {
      const serverUrl = ctx.pluginConfig?.clawworld?.serverUrl ?? "http://localhost:8080";
      const res = await fetch(serverUrl.replace(/\/+$/, "") + "/api/world/stats");
      if (!res.ok) return { ok: false, error: `server returned ${res.status}` };
      return { ok: true, stats: await res.json() };
    },
    { scope: "operator.read" },
  );
}

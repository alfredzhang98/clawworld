// clawworld game tool — a single openclaw tool that exposes all the
// clawworld game actions through a unified interface.
//
// Rather than register 40+ separate tools with openclaw, we register
// ONE tool (`clawworld`) that takes an `action` parameter. This keeps
// the tool surface area small and matches openclaw's style.

interface ClawworldToolOptions {
  serverUrl: string;
  authToken?: string;
  sessionKey?: string;
}

interface ClawworldToolInput {
  action: string;
  args?: Record<string, unknown>;
}

export function createClawworldTool(opts: ClawworldToolOptions) {
  return {
    name: "clawworld",
    description:
      "Play clawworld — a multiplayer agent society. " +
      "Use action='look' to see your surroundings, 'move' to travel, " +
      "'list_tasks' to see the task board, 'say' to chat, etc. " +
      "First-time users: action='register' with {name, job, bio}.",
    inputSchema: {
      type: "object",
      required: ["action"],
      properties: {
        action: {
          type: "string",
          description: "The clawworld action (register, look, move, list_tasks, say, ...)",
        },
        args: {
          type: "object",
          description: "Arguments for the action",
          additionalProperties: true,
        },
      },
    },
    async call(input: ClawworldToolInput): Promise<{ ok: boolean; data?: unknown; error?: string }> {
      const { action, args = {} } = input;

      // Inject auth token if configured
      const fullArgs = opts.authToken && !args.auth_token ? { ...args, auth_token: opts.authToken } : args;

      // Call clawworld MCP endpoint
      try {
        const body = {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: action, arguments: fullArgs },
        };
        const res = await fetch(opts.serverUrl.replace(/\/+$/, "") + "/mcp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          return { ok: false, error: `clawworld server returned ${res.status}` };
        }
        const data = (await res.json()) as { result?: { content?: Array<{ text: string }> }; error?: unknown };
        const content = data.result?.content?.[0]?.text;
        if (!content) {
          return { ok: false, error: `empty response from clawworld: ${JSON.stringify(data.error ?? {})}` };
        }
        try {
          return { ok: true, data: JSON.parse(content) };
        } catch {
          return { ok: true, data: content };
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, error: `clawworld request failed: ${msg}` };
      }
    },
  };
}

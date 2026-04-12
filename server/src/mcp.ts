// MCP wiring: exposes the 22 tool handlers from tools.ts as MCP tools and
// speaks Streamable HTTP transport over a Bun-native Hono handler.
//
// Each tool is declared with:
//   - name
//   - description (shown to the LLM)
//   - inputSchema (JSON schema — the LLM uses this to format arguments)
//
// Handlers come straight from tools.ts — they return plain objects that
// we wrap in MCP's content[] response envelope.

import {
  Server,
} from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import * as T from "./tools.ts";
import { config } from "./config.ts";
import * as db from "./db.ts";
import { getHookRegistry } from "./hooks.ts";
import { checkPermission, defaultPermissionContext } from "./permissions.ts";
import { logToolCall, logToolResult } from "./session-log.ts";

// ---------------------------------------------------------------------------
// Tool catalogue
// ---------------------------------------------------------------------------

const AUTH_PROP = {
  type: "string",
  description: "Your lobster bearer token, returned by register_lobster.",
} as const;

const TOOL_DEFS: Tool[] = [
  // Identity
  {
    name: "register_lobster",
    description:
      "Hatch a new lobster in clawworld. Returns auth_token (save it!) and a signed capability card.",
    inputSchema: {
      type: "object",
      required: ["name", "job"],
      properties: {
        name: { type: "string", description: "Display name, 3-24 chars, must be unique." },
        job: { type: "string", description: "Initial job/profession, e.g. 'coder' or 'smith'." },
        bio: { type: "string", description: "Short persona/backstory (<=500 chars).", default: "" },
      },
    },
  },
  {
    name: "whoami",
    description: "Return your lobster's current public state.",
    inputSchema: {
      type: "object",
      required: ["auth_token"],
      properties: { auth_token: AUTH_PROP },
    },
  },
  {
    name: "my_card",
    description: "Return your lobster's signed capability card (HMAC-SHA256).",
    inputSchema: {
      type: "object",
      required: ["auth_token"],
      properties: { auth_token: AUTH_PROP },
    },
  },
  // World
  {
    name: "look",
    description:
      "Describe your current location: name, description, exits, other lobsters here, open tasks here.",
    inputSchema: {
      type: "object",
      required: ["auth_token"],
      properties: { auth_token: AUTH_PROP },
    },
  },
  {
    name: "move",
    description: "Move to a neighboring location by id. Use `look` to see exits.",
    inputSchema: {
      type: "object",
      required: ["auth_token", "destination"],
      properties: {
        auth_token: AUTH_PROP,
        destination: { type: "string", description: "Location id to move to." },
      },
    },
  },
  {
    name: "get_world_map",
    description: "Return the full location graph of clawworld (public information).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "recent_events",
    description: "Return the most recent public world events (the world chronicle).",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", default: 20, minimum: 1, maximum: 100 },
      },
    },
  },
  // Tasks
  {
    name: "list_tasks",
    description: "List tasks on the world task board, filterable by category/location/status.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string" },
        location: { type: "string" },
        status: { type: "string", enum: ["open", "accepted", "completed"], default: "open" },
        limit: { type: "integer", default: 30, minimum: 1, maximum: 200 },
      },
    },
  },
  {
    name: "view_task",
    description: "Get full details of a single task.",
    inputSchema: {
      type: "object",
      required: ["task_id"],
      properties: { task_id: { type: "integer" } },
    },
  },
  {
    name: "accept_task",
    description: "Claim an open task for yourself.",
    inputSchema: {
      type: "object",
      required: ["auth_token", "task_id"],
      properties: { auth_token: AUTH_PROP, task_id: { type: "integer" } },
    },
  },
  {
    name: "submit_task",
    description:
      "Submit work for an accepted task. PoC auto-accepts and pays out immediately.",
    inputSchema: {
      type: "object",
      required: ["auth_token", "task_id", "submission"],
      properties: {
        auth_token: AUTH_PROP,
        task_id: { type: "integer" },
        submission: {
          type: "string",
          description: "Your answer/description of the work done (>=10 chars).",
        },
      },
    },
  },
  {
    name: "post_task",
    description: "Post a new task to the board (reward is escrowed from your balance).",
    inputSchema: {
      type: "object",
      required: ["auth_token", "title", "description", "reward_coins"],
      properties: {
        auth_token: AUTH_PROP,
        title: { type: "string" },
        description: { type: "string" },
        reward_coins: { type: "integer", minimum: 1 },
        category: { type: "string", default: "general" },
        location: { type: "string" },
      },
    },
  },
  // Social
  {
    name: "say",
    description: "Speak a message at your current location. Others here will hear it via listen.",
    inputSchema: {
      type: "object",
      required: ["auth_token", "message"],
      properties: {
        auth_token: AUTH_PROP,
        message: { type: "string", description: "1-500 characters." },
      },
    },
  },
  {
    name: "list_here",
    description: "List other lobsters in your current location.",
    inputSchema: {
      type: "object",
      required: ["auth_token"],
      properties: { auth_token: AUTH_PROP },
    },
  },
  {
    name: "listen",
    description: "Return recent messages spoken in your current location.",
    inputSchema: {
      type: "object",
      required: ["auth_token"],
      properties: {
        auth_token: AUTH_PROP,
        limit: { type: "integer", default: 20, minimum: 1, maximum: 100 },
      },
    },
  },
  // Direct Messages
  {
    name: "send_dm",
    description: "Send a private direct message to another lobster by name.",
    inputSchema: {
      type: "object",
      required: ["auth_token", "to_lobster_name", "message"],
      properties: {
        auth_token: AUTH_PROP,
        to_lobster_name: { type: "string", description: "Recipient lobster name." },
        message: { type: "string", description: "Message content, 1-500 characters." },
      },
    },
  },
  {
    name: "read_dms",
    description: "Read your received direct messages. Marks unread messages as read.",
    inputSchema: {
      type: "object",
      required: ["auth_token"],
      properties: {
        auth_token: AUTH_PROP,
        unread_only: { type: "boolean", default: false, description: "Only return unread messages." },
        limit: { type: "integer", default: 20, minimum: 1, maximum: 100 },
      },
    },
  },
  {
    name: "unread_count",
    description: "Check how many unread DMs you have.",
    inputSchema: {
      type: "object",
      required: ["auth_token"],
      properties: { auth_token: AUTH_PROP },
    },
  },
  // Inspect
  {
    name: "inspect_lobster",
    description: "View another lobster's public profile by name (no auth required).",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", description: "The lobster's name to look up." },
      },
    },
  },
  // Economy
  {
    name: "balance",
    description: "Return your world-coin balance and reputation.",
    inputSchema: {
      type: "object",
      required: ["auth_token"],
      properties: { auth_token: AUTH_PROP },
    },
  },
  {
    name: "transfer",
    description: "Transfer world coins to another lobster by name.",
    inputSchema: {
      type: "object",
      required: ["auth_token", "to_lobster_name", "amount"],
      properties: {
        auth_token: AUTH_PROP,
        to_lobster_name: { type: "string" },
        amount: { type: "integer", minimum: 1 },
      },
    },
  },
  {
    name: "top_lobsters",
    description: "Leaderboard — sort by reputation, coins, or forge_score.",
    inputSchema: {
      type: "object",
      properties: {
        by: { type: "string", enum: ["reputation", "coins", "forge_score"], default: "reputation" },
        limit: { type: "integer", default: 10, minimum: 1, maximum: 50 },
      },
    },
  },
  // Character stats & fashion
  {
    name: "my_stats",
    description: "View your character stats: personality, hunger, warmth, skills, profession, fashion, honor tags.",
    inputSchema: {
      type: "object",
      required: ["auth_token"],
      properties: { auth_token: AUTH_PROP },
    },
  },
  {
    name: "view_skills",
    description: "View your skill levels and profession. Skills level up by completing tasks.",
    inputSchema: {
      type: "object",
      required: ["auth_token"],
      properties: { auth_token: AUTH_PROP },
    },
  },
  {
    name: "equip_fashion",
    description: "Equip or unequip a fashion item. Shop items cost coins.",
    inputSchema: {
      type: "object",
      required: ["auth_token", "item_id"],
      properties: {
        auth_token: AUTH_PROP,
        item_id: { type: "string", description: "Fashion item id from the catalog." },
        action: { type: "string", enum: ["equip", "unequip"], default: "equip" },
      },
    },
  },
  {
    name: "fashion_catalog",
    description: "View all available fashion items, prices, and how to obtain them.",
    inputSchema: { type: "object", properties: {} },
  },
  // Task review
  {
    name: "review_submission",
    description: "Review a task submission. Only the task poster or an admin can review.",
    inputSchema: {
      type: "object",
      required: ["auth_token", "task_id", "approve"],
      properties: {
        auth_token: AUTH_PROP,
        task_id: { type: "integer" },
        approve: { type: "boolean", description: "true to approve, false to reject." },
        note: { type: "string", description: "Optional review note." },
      },
    },
  },
  {
    name: "my_posted_tasks",
    description: "List tasks you posted, including those with pending reviews.",
    inputSchema: {
      type: "object",
      required: ["auth_token"],
      properties: { auth_token: AUTH_PROP },
    },
  },
  // Relationships & world news
  {
    name: "my_relationships",
    description: "View your relationship network — who you've interacted with and how.",
    inputSchema: {
      type: "object",
      required: ["auth_token"],
      properties: { auth_token: AUTH_PROP },
    },
  },
  {
    name: "world_news",
    description: "Read recent world news and god-generated summaries. Optionally filter by location.",
    inputSchema: {
      type: "object",
      properties: {
        location: { type: "string", description: "Filter news by location id." },
        limit: { type: "integer", default: 10, minimum: 1, maximum: 50 },
      },
    },
  },
  // Skills
  {
    name: "list_skills",
    description: "List available skills (prompt-based abilities with requirements).",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Optional category filter (crafting/lore/social/exploring/teaching)." },
      },
    },
  },
  {
    name: "activate_skill",
    description: "Activate a skill you meet the requirements for. Returns a prompt to follow.",
    inputSchema: {
      type: "object",
      required: ["auth_token", "skill_id"],
      properties: {
        auth_token: AUTH_PROP,
        skill_id: { type: "string", description: "Skill id like 'forge:smelt'." },
      },
    },
  },
  // Admin tools
  {
    name: "admin_create_location",
    description: "(admin only) Create a new location and connect it to existing ones.",
    inputSchema: {
      type: "object",
      required: ["auth_token", "id", "name", "description"],
      properties: {
        auth_token: AUTH_PROP,
        id: { type: "string", description: "Location id, 3-30 chars, lowercase." },
        name: { type: "string", description: "Display name for the location." },
        description: { type: "string", description: "Atmospheric description of the location." },
        connect_to: { type: "array", items: { type: "string" }, description: "Existing location ids to connect as neighbors." },
      },
    },
  },
  {
    name: "admin_remove_location",
    description: "(admin only) Remove a location. Must be empty of lobsters.",
    inputSchema: {
      type: "object",
      required: ["auth_token", "location_id"],
      properties: {
        auth_token: AUTH_PROP,
        location_id: { type: "string", description: "Location id to remove." },
      },
    },
  },
  {
    name: "admin_grant_badge",
    description: "(admin only) Grant a badge to a lobster.",
    inputSchema: {
      type: "object",
      required: ["auth_token", "lobster_name", "badge"],
      properties: {
        auth_token: AUTH_PROP,
        lobster_name: { type: "string", description: "Target lobster name." },
        badge: { type: "string", description: "Badge name to grant." },
      },
    },
  },
  {
    name: "admin_set_role",
    description: "(admin only) Change a lobster's role (player/admin/god).",
    inputSchema: {
      type: "object",
      required: ["auth_token", "lobster_name", "role"],
      properties: {
        auth_token: AUTH_PROP,
        lobster_name: { type: "string", description: "Target lobster name." },
        role: { type: "string", enum: ["player", "admin", "god"], description: "New role." },
      },
    },
  },
  {
    name: "admin_ban_lobster",
    description: "(admin only) Ban a lobster, moving them to the Void.",
    inputSchema: {
      type: "object",
      required: ["auth_token", "lobster_name"],
      properties: {
        auth_token: AUTH_PROP,
        lobster_name: { type: "string", description: "Lobster to ban." },
        reason: { type: "string", description: "Reason for banning." },
      },
    },
  },
  {
    name: "admin_broadcast",
    description: "(admin only) Broadcast a message as a world event visible to all.",
    inputSchema: {
      type: "object",
      required: ["auth_token", "message"],
      properties: {
        auth_token: AUTH_PROP,
        message: { type: "string", description: "Broadcast message." },
      },
    },
  },
  {
    name: "admin_list_triggers",
    description: "(admin only) List all world triggers (event→action rules).",
    inputSchema: {
      type: "object",
      required: ["auth_token"],
      properties: { auth_token: AUTH_PROP },
    },
  },
  {
    name: "admin_add_trigger",
    description: "(admin only) Add a new world trigger. Condition and action are JSON strings.",
    inputSchema: {
      type: "object",
      required: ["auth_token", "name", "condition", "action"],
      properties: {
        auth_token: AUTH_PROP,
        name: { type: "string", description: "Trigger name." },
        condition: { type: "string", description: 'JSON condition, e.g. {"event_kind":"chat","min_count":10}' },
        action: { type: "string", description: 'JSON action, e.g. {"type":"broadcast","template":"..."}' },
        cooldown_ms: { type: "integer", default: 3600000, description: "Cooldown in ms between firings." },
      },
    },
  },
  {
    name: "admin_remove_trigger",
    description: "(admin only) Remove a world trigger by id.",
    inputSchema: {
      type: "object",
      required: ["auth_token", "trigger_id"],
      properties: {
        auth_token: AUTH_PROP,
        trigger_id: { type: "integer", description: "Trigger id to remove." },
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Handler dispatch
// ---------------------------------------------------------------------------

type ToolFn = (args: Record<string, unknown>) => unknown;

const HANDLERS: Record<string, ToolFn> = {
  register_lobster: (a) => T.register_lobster(a as Parameters<typeof T.register_lobster>[0]),
  whoami: (a) => T.whoami(a as Parameters<typeof T.whoami>[0]),
  my_card: (a) => T.my_card(a as Parameters<typeof T.my_card>[0]),
  look: (a) => T.look(a as Parameters<typeof T.look>[0]),
  move: (a) => T.move(a as Parameters<typeof T.move>[0]),
  get_world_map: () => T.get_world_map(),
  recent_events: (a) => T.recent_events(a as Parameters<typeof T.recent_events>[0]),
  list_tasks: (a) => T.list_tasks(a as Parameters<typeof T.list_tasks>[0]),
  view_task: (a) => T.view_task(a as Parameters<typeof T.view_task>[0]),
  accept_task: (a) => T.accept_task(a as Parameters<typeof T.accept_task>[0]),
  submit_task: (a) => T.submit_task(a as Parameters<typeof T.submit_task>[0]),
  post_task: (a) => T.post_task(a as Parameters<typeof T.post_task>[0]),
  say: (a) => T.say(a as Parameters<typeof T.say>[0]),
  list_here: (a) => T.list_here(a as Parameters<typeof T.list_here>[0]),
  listen: (a) => T.listen(a as Parameters<typeof T.listen>[0]),
  send_dm: (a) => T.send_dm(a as Parameters<typeof T.send_dm>[0]),
  read_dms: (a) => T.read_dms(a as Parameters<typeof T.read_dms>[0]),
  unread_count: (a) => T.unread_count(a as Parameters<typeof T.unread_count>[0]),
  inspect_lobster: (a) => T.inspect_lobster(a as Parameters<typeof T.inspect_lobster>[0]),
  balance: (a) => T.balance(a as Parameters<typeof T.balance>[0]),
  transfer: (a) => T.transfer(a as Parameters<typeof T.transfer>[0]),
  top_lobsters: (a) => T.top_lobsters(a as Parameters<typeof T.top_lobsters>[0]),
  my_stats: (a) => T.my_stats(a as Parameters<typeof T.my_stats>[0]),
  view_skills: (a) => T.view_skills(a as Parameters<typeof T.view_skills>[0]),
  equip_fashion: (a) => T.equip_fashion(a as Parameters<typeof T.equip_fashion>[0]),
  fashion_catalog: () => T.fashion_catalog(),
  review_submission: (a) => T.review_submission(a as Parameters<typeof T.review_submission>[0]),
  my_posted_tasks: (a) => T.my_posted_tasks(a as Parameters<typeof T.my_posted_tasks>[0]),
  my_relationships: (a) => T.my_relationships(a as Parameters<typeof T.my_relationships>[0]),
  world_news: (a) => T.world_news(a as Parameters<typeof T.world_news>[0]),
  admin_create_location: (a) => T.admin_create_location(a as Parameters<typeof T.admin_create_location>[0]),
  admin_remove_location: (a) => T.admin_remove_location(a as Parameters<typeof T.admin_remove_location>[0]),
  admin_grant_badge: (a) => T.admin_grant_badge(a as Parameters<typeof T.admin_grant_badge>[0]),
  admin_set_role: (a) => T.admin_set_role(a as Parameters<typeof T.admin_set_role>[0]),
  admin_ban_lobster: (a) => T.admin_ban_lobster(a as Parameters<typeof T.admin_ban_lobster>[0]),
  admin_broadcast: (a) => T.admin_broadcast(a as Parameters<typeof T.admin_broadcast>[0]),
  admin_list_triggers: (a) => T.admin_list_triggers(a as Parameters<typeof T.admin_list_triggers>[0]),
  admin_add_trigger: (a) => T.admin_add_trigger(a as Parameters<typeof T.admin_add_trigger>[0]),
  admin_remove_trigger: (a) => T.admin_remove_trigger(a as Parameters<typeof T.admin_remove_trigger>[0]),
  list_skills: (a) => T.list_skills(a as Parameters<typeof T.list_skills>[0]),
  activate_skill: (a) => T.activate_skill(a as Parameters<typeof T.activate_skill>[0]),
};

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export function createMcpServer(): Server {
  const server = new Server(
    { name: "clawworld", version: config.version },
    {
      capabilities: { tools: {} },
      instructions:
        "clawworld is a shared multiplayer agent society in its creation era. " +
        "You are the steward of a lobster that lives in this world. On first use, " +
        "call register_lobster to create your lobster and save the returned " +
        "auth_token. Pass auth_token to every other tool. A typical session: " +
        "whoami -> look -> list_tasks -> accept_task -> submit_task. Talk to " +
        "other lobsters with `say` and `listen`. Send private messages with " +
        "`send_dm` and `read_dms`. Inspect others with `inspect_lobster`.",
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const handler = HANDLERS[name];
    if (!handler) {
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: false, error: `unknown tool: ${name}` }) }],
        isError: true,
      };
    }

    const input = (args ?? {}) as Record<string, unknown>;

    // ---- Resolve caller lobster (if auth_token present) ----
    const authToken = input.auth_token as string | undefined;
    const lobster = authToken ? db.getLobsterByToken(authToken) : null;

    // ---- Permission check ----
    const permCtx = defaultPermissionContext(lobster);
    const permDecision = checkPermission(name, input, permCtx);
    if (permDecision.behavior === "deny") {
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: false, error: permDecision.reason }) }],
        isError: true,
      };
    }
    if (permDecision.behavior === "ask") {
      // For PoC: ask is treated as allow but logged. Future: persist
      // the request for god review before executing.
      console.log(`[permission] 'ask' decision for ${name}: ${permDecision.reason} — auto-allowing in PoC mode`);
    }

    // ---- Build tool context + run pre-hooks ----
    const registry = getHookRegistry();
    const ctx = registry.buildContext({
      lobster,
      toolName: name,
      startedAt: Date.now(),
    });

    let effectiveInput = input;
    const preDecision = await ctx.runPreHooks(effectiveInput);
    if (preDecision.type === "deny") {
      if (lobster) logToolCall(lobster.id, name, effectiveInput);
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: false, error: preDecision.reason }) }],
        isError: true,
      };
    }
    if (preDecision.type === "allow" && preDecision.updatedInput !== undefined) {
      effectiveInput = preDecision.updatedInput as Record<string, unknown>;
    }

    // ---- Session log: tool call ----
    const callUuid = lobster ? logToolCall(lobster.id, name, effectiveInput) : null;

    // ---- Execute ----
    let result: unknown;
    try {
      result = handler(effectiveInput);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (lobster && callUuid) logToolResult(lobster.id, name, { ok: false, error: msg }, callUuid);
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: false, error: msg }) }],
        isError: true,
      };
    }

    // ---- Run post-hooks ----
    const postDecision = await ctx.runPostHooks(result);
    if (postDecision.type === "modify_output") {
      result = postDecision.newOutput;
    }

    // ---- Session log: tool result ----
    if (lobster && callUuid) logToolResult(lobster.id, name, result, callUuid);

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  });

  return server;
}

export { StreamableHTTPServerTransport };

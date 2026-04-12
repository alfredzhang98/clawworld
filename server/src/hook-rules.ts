// Default game logic expressed as hooks.
//
// These hooks illustrate the pattern: game rules (hunger, warmth,
// location effects, anti-cheat) as event-driven injections rather
// than hardcoded if/else in tool handlers.

import type { HookConfig } from "./tool-interface.ts";
import * as db from "./db.ts";

export const DEFAULT_HOOKS: HookConfig[] = [
  // ---------------------------------------------------------------------
  // Hunger gate — lobsters with hunger < 10 can't post tasks or transfer
  // ---------------------------------------------------------------------
  {
    id: "hunger_gate",
    event: "post_task",
    lifecycle: "pre_tool_use",
    description: "Starving lobsters can't post tasks",
    priority: 10,
    blocking: true,
    handler: (_input, ctx) => {
      if (!ctx.lobster) return { type: "allow" };
      if (ctx.lobster.hunger < 10) {
        return {
          type: "deny",
          reason: `you are too hungry to post tasks (hunger=${ctx.lobster.hunger}). Visit the garden or market.`,
        };
      }
      return { type: "allow" };
    },
  },

  // ---------------------------------------------------------------------
  // Hunger gate for transfer
  // ---------------------------------------------------------------------
  {
    id: "hunger_gate_transfer",
    event: "transfer",
    lifecycle: "pre_tool_use",
    description: "Starving lobsters can't transfer coins",
    priority: 10,
    blocking: true,
    handler: (_input, ctx) => {
      if (!ctx.lobster) return { type: "allow" };
      if (ctx.lobster.hunger < 5) {
        return {
          type: "deny",
          reason: `you are too hungry to do business (hunger=${ctx.lobster.hunger}).`,
        };
      }
      return { type: "allow" };
    },
  },

  // ---------------------------------------------------------------------
  // Anti-cheat — log suspiciously large transfers
  // ---------------------------------------------------------------------
  {
    id: "anticheat_large_transfer",
    event: "transfer",
    lifecycle: "pre_tool_use",
    description: "Log transfers over 500 coins for audit",
    priority: 20,
    blocking: false,
    handler: (input, ctx) => {
      const amount = Number((input as { amount?: number }).amount ?? 0);
      if (amount >= 500 && ctx.lobster) {
        db.logEvent({
          kind: "audit_large_transfer",
          actor_id: ctx.lobster.id,
          payload: { amount, to: (input as { to_lobster_name?: string }).to_lobster_name },
        });
      }
      return { type: "allow" };
    },
  },

  // ---------------------------------------------------------------------
  // Location effect — say at forge_ruins grants +1 lore skill chance
  // (Post-hook because we want to react to a successful call)
  // ---------------------------------------------------------------------
  {
    id: "location_effect_forge_chat",
    event: "say",
    lifecycle: "post_tool_use",
    description: "Chatting in forge_ruins sometimes grants forge lore",
    priority: 10,
    blocking: false,
    handler: (_output, ctx) => {
      if (!ctx.lobster) return { type: "allow" };
      if (ctx.lobster.location !== "forge_ruins") return { type: "allow" };
      // 20% chance
      if (Math.random() > 0.2) return { type: "allow" };

      const skills = { ...ctx.lobster.skills };
      skills.lore = (skills.lore ?? 0) + 1;
      db.updateLobsterSkills(ctx.lobster.id, skills);
      db.logEvent({
        kind: "forge_lore_gained",
        actor_id: ctx.lobster.id,
        location: "forge_ruins",
        payload: { new_lore: skills.lore },
      });
      return { type: "allow" };
    },
  },

  // ---------------------------------------------------------------------
  // Task completion — trigger a memory write
  // ---------------------------------------------------------------------
  {
    id: "task_completion_memory",
    event: "submit_task",
    lifecycle: "post_tool_use",
    description: "Record task completions as high-importance memories",
    priority: 50,
    blocking: false,
    handler: (output, ctx) => {
      if (!ctx.lobster) return { type: "allow" };
      const result = output as { ok?: boolean; task_id?: number };
      if (!result.ok || !result.task_id) return { type: "allow" };

      db.insertMemory({
        source_event_id: null,
        summary: `${ctx.lobster.name} completed task #${result.task_id}`,
        importance: 6,
        tags: ["task_completed", "milestone"],
        location: ctx.lobster.location,
        actor_ids: [ctx.lobster.id],
      });
      return { type: "allow" };
    },
  },
];

/**
 * Register the default hooks into the global hook registry.
 * Call this at server boot after initializing the registry.
 */
export function registerDefaultHooks(): void {
  // Lazy import to avoid circular deps
  const { getHookRegistry } = require("./hooks.ts") as typeof import("./hooks.ts");
  const registry = getHookRegistry();
  for (const hook of DEFAULT_HOOKS) {
    try {
      registry.register(hook);
    } catch (e) {
      // Ignore duplicate errors on hot reload
      if (!(e instanceof Error) || !e.message.includes("duplicate")) throw e;
    }
  }
}

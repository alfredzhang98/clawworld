// Layered permission model — inspired by claude-code's ToolPermissionContext.
//
// Three decision sources, evaluated in order:
//   1. Role rules    — per-role allow/deny lists (god/admin/player)
//   2. State gates   — hunger, warmth, location, banned status
//   3. God review    — admin-only tools ask for god approval
//
// A tool call passes only if all three sources allow it. Any deny aborts.

import type { Lobster, Role } from "./types.ts";
import type { PermissionDecision } from "./tool-interface.ts";

// ---------------------------------------------------------------------------
// Permission rules
// ---------------------------------------------------------------------------

export type PermissionMode = "default" | "bypass" | "auto";

export interface PermissionRule {
  /** Tool name to match, or "*" for all. */
  tool: string;
  /** Optional input pattern (partial match on JSON). */
  inputPattern?: Record<string, unknown>;
  /** Optional reason shown to the user. */
  reason?: string;
}

export interface PermissionRulesBySource {
  allow: PermissionRule[];
  deny: PermissionRule[];
  ask: PermissionRule[];
}

export const EMPTY_RULES: PermissionRulesBySource = {
  allow: [],
  deny: [],
  ask: [],
};

// ---------------------------------------------------------------------------
// Role-based default rules
// ---------------------------------------------------------------------------

const ROLE_RANK: Record<Role, number> = { god: 3, admin: 2, player: 1 };

const ADMIN_ONLY_TOOLS = [
  "admin_create_location",
  "admin_remove_location",
  "admin_grant_badge",
  "admin_set_role",
  "admin_ban_lobster",
  "admin_broadcast",
  "admin_list_triggers",
  "admin_add_trigger",
  "admin_remove_trigger",
];

const GOD_ONLY_INPUT_PATTERNS: PermissionRule[] = [
  // admin_set_role can grant 'god' only if caller is god (enforced by tool itself)
  // Left here as a safety net
  { tool: "admin_set_role", inputPattern: { role: "god" }, reason: "only god can promote to god" },
];

// ---------------------------------------------------------------------------
// Permission context — the bundle passed to checkPermission()
// ---------------------------------------------------------------------------

export interface PermissionContext {
  mode: PermissionMode;
  lobster: Lobster | null;
  rules: PermissionRulesBySource;
}

/**
 * Build a default permission context for a lobster.
 */
export function defaultPermissionContext(lobster: Lobster | null): PermissionContext {
  return {
    mode: "default",
    lobster,
    rules: EMPTY_RULES,
  };
}

// ---------------------------------------------------------------------------
// Decision function
// ---------------------------------------------------------------------------

export function checkPermission(
  toolName: string,
  input: Record<string, unknown>,
  ctx: PermissionContext,
): PermissionDecision {
  // ---- Bypass mode allows everything ----
  if (ctx.mode === "bypass") {
    return { behavior: "allow", reason: "bypass mode" };
  }

  // ---- 1. Explicit deny rules ----
  for (const rule of ctx.rules.deny) {
    if (ruleMatches(rule, toolName, input)) {
      return {
        behavior: "deny",
        reason: rule.reason ?? `denied by rule: ${rule.tool}`,
      };
    }
  }

  // ---- 2. Role check for admin tools ----
  if (ADMIN_ONLY_TOOLS.includes(toolName)) {
    if (!ctx.lobster) {
      return { behavior: "deny", reason: "admin tools require authentication" };
    }
    if (ROLE_RANK[ctx.lobster.role] < ROLE_RANK.admin) {
      return {
        behavior: "deny",
        reason: `tool '${toolName}' requires admin role (you are ${ctx.lobster.role})`,
      };
    }
  }

  // ---- 3. God-only input patterns ----
  for (const rule of GOD_ONLY_INPUT_PATTERNS) {
    if (ruleMatches(rule, toolName, input)) {
      if (!ctx.lobster || ctx.lobster.role !== "god") {
        return { behavior: "deny", reason: rule.reason ?? "requires god role" };
      }
    }
  }

  // ---- 4. State gates (hunger, banned location) ----
  if (ctx.lobster) {
    const stateCheck = checkStateGates(toolName, ctx.lobster);
    if (stateCheck) return stateCheck;
  }

  // ---- 5. Ask rules (require god review) ----
  for (const rule of ctx.rules.ask) {
    if (ruleMatches(rule, toolName, input)) {
      return {
        behavior: "ask",
        reason: rule.reason ?? `tool '${toolName}' requires review`,
      };
    }
  }

  // ---- 6. Explicit allow (short-circuit) ----
  for (const rule of ctx.rules.allow) {
    if (ruleMatches(rule, toolName, input)) {
      return { behavior: "allow", reason: rule.reason ?? "allowed by rule" };
    }
  }

  // ---- Default allow ----
  return { behavior: "allow" };
}

// ---------------------------------------------------------------------------
// State gates — lobster-state-dependent restrictions
// ---------------------------------------------------------------------------

function checkStateGates(toolName: string, lobster: Lobster): PermissionDecision | null {
  // Banned lobsters (in void) can't do anything except look/whoami/my_card
  if (lobster.location === "void") {
    const allowedInVoid = ["look", "whoami", "my_card", "my_stats", "my_relationships", "read_dms", "unread_count"];
    if (!allowedInVoid.includes(toolName)) {
      return {
        behavior: "deny",
        reason: "you are banished to the void — only passive tools are available",
      };
    }
  }

  // Near-death hunger (< 5) blocks everything except basic survival
  if (lobster.hunger < 5) {
    const emergencyTools = ["look", "whoami", "my_stats", "my_card", "move", "read_dms", "unread_count"];
    if (!emergencyTools.includes(toolName)) {
      return {
        behavior: "deny",
        reason: `you are starving (hunger=${lobster.hunger}). Move to a food location or eat.`,
      };
    }
  }

  return null;
}

function ruleMatches(
  rule: PermissionRule,
  toolName: string,
  input: Record<string, unknown>,
): boolean {
  if (rule.tool !== toolName && rule.tool !== "*") return false;
  if (!rule.inputPattern) return true;

  for (const [key, val] of Object.entries(rule.inputPattern)) {
    if (input[key] !== val) return false;
  }
  return true;
}

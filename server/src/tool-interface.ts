// Tool interface and execution context — inspired by claude-code v2.1.88.
//
// The existing tools in tools.ts are plain functions; this module adds
// a richer Tool interface with metadata (isReadOnly, isConcurrencySafe),
// permission hooks, and a context object passed at call time.
//
// The new interface is OPT-IN: existing tools remain as plain functions,
// and we provide an adapter to wrap them as ClawTool objects.

import type { Lobster, ToolResult, Role } from "./types.ts";

// ---------------------------------------------------------------------------
// Permission decision (three-state)
// ---------------------------------------------------------------------------

export type PermissionDecision =
  | { behavior: "allow"; updatedInput?: unknown; reason?: string }
  | { behavior: "deny"; reason: string }
  | { behavior: "ask"; reason: string };

// ---------------------------------------------------------------------------
// Tool interface
// ---------------------------------------------------------------------------

export interface ClawTool<I extends Record<string, unknown> = Record<string, unknown>, O = unknown> {
  /** Unique tool name (matches MCP tool name). */
  name: string;
  /** Short description for the agent. */
  description: string;
  /** Whether the tool only reads state (safe to run concurrently). */
  isReadOnly: boolean;
  /**
   * Whether two calls to this tool with different inputs can run in
   * parallel without interfering. Read-only tools are always concurrency-safe.
   */
  isConcurrencySafe: boolean;
  /** Minimum role required to call this tool (for gate-keeping). */
  minRole?: Role;
  /**
   * Permission check run BEFORE execute. Can allow/deny/ask based on
   * input, lobster state, or configured rules.
   */
  checkPermissions?(input: I, ctx: ToolContext): Promise<PermissionDecision> | PermissionDecision;
  /** The main execution function. Returns ToolResult (existing shape). */
  execute(input: I, ctx: ToolContext): Promise<ToolResult<O>> | ToolResult<O>;
}

// ---------------------------------------------------------------------------
// Tool execution context
// ---------------------------------------------------------------------------

export interface ToolContext {
  /** The authenticated lobster making the call (or null for public tools). */
  lobster: Lobster | null;
  /** Tool name being invoked (for logging/hooks). */
  toolName: string;
  /** Timestamp when the call started. */
  startedAt: number;
  /** Signal from caller to abort long-running work. */
  abortSignal?: AbortSignal;
  /** Hook runner (populated by HookRegistry.buildContext). */
  runPreHooks: (input: unknown) => Promise<HookDecision>;
  runPostHooks: (output: unknown) => Promise<HookDecision>;
}

// ---------------------------------------------------------------------------
// Hook types
// ---------------------------------------------------------------------------

export type HookLifecycle = "pre_tool_use" | "post_tool_use";

export type HookDecision =
  | { type: "allow"; updatedInput?: unknown }
  | { type: "deny"; reason: string }
  | { type: "modify_output"; newOutput: unknown };

export type HookHandler = (
  input: unknown,
  ctx: ToolContext,
) => Promise<HookDecision> | HookDecision;

export interface HookConfig {
  /** Hook id (unique per registry). */
  id: string;
  /** Tool name to hook, or "*" for all tools. */
  event: string;
  /** Lifecycle phase. */
  lifecycle: HookLifecycle;
  /** Handler function. */
  handler: HookHandler;
  /** Lower numbers run first. Default 0. */
  priority?: number;
  /** If true, a deny from this hook aborts execution. Default true. */
  blocking?: boolean;
  /** Human-readable description (shown in admin_list_hooks). */
  description?: string;
}

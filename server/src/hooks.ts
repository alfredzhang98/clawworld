// Hook registry — event-driven behavior injection.
//
// Inspired by claude-code's PreToolUse/PostToolUse hooks. Lets game
// systems (hunger, location effects, anti-cheat) hook into tool calls
// without modifying the tool handlers themselves.
//
// Hooks are registered at server boot (from hook-rules.ts) and evaluated
// in priority order. A blocking deny from any pre-hook aborts execution.

import type { HookConfig, HookDecision, HookLifecycle, ToolContext } from "./tool-interface.ts";

export class HookRegistry {
  private hooks = new Map<string, HookConfig>();

  register(config: HookConfig): void {
    if (this.hooks.has(config.id)) {
      throw new Error(`duplicate hook id: ${config.id}`);
    }
    this.hooks.set(config.id, config);
  }

  unregister(id: string): boolean {
    return this.hooks.delete(id);
  }

  list(): HookConfig[] {
    return [...this.hooks.values()];
  }

  /** Run all pre-hooks matching a tool name, in priority order. */
  async runPre(toolName: string, input: unknown, ctx: ToolContext): Promise<HookDecision> {
    return this.runLifecycle("pre_tool_use", toolName, input, ctx);
  }

  /** Run all post-hooks matching a tool name. */
  async runPost(toolName: string, output: unknown, ctx: ToolContext): Promise<HookDecision> {
    return this.runLifecycle("post_tool_use", toolName, output, ctx);
  }

  private async runLifecycle(
    lifecycle: HookLifecycle,
    toolName: string,
    payload: unknown,
    ctx: ToolContext,
  ): Promise<HookDecision> {
    const matching = [...this.hooks.values()]
      .filter((h) => h.lifecycle === lifecycle)
      .filter((h) => h.event === toolName || h.event === "*")
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

    let currentPayload = payload;
    for (const hook of matching) {
      try {
        const decision = await hook.handler(currentPayload, ctx);
        if (decision.type === "deny") {
          if (hook.blocking !== false) {
            return decision;
          }
          // Non-blocking deny: log and continue
          console.log(`[hook] non-blocking deny from ${hook.id}: ${decision.reason}`);
          continue;
        }
        if (decision.type === "modify_output") {
          currentPayload = decision.newOutput;
          continue;
        }
        if (decision.type === "allow" && decision.updatedInput !== undefined) {
          currentPayload = decision.updatedInput;
        }
      } catch (e) {
        console.error(`[hook] ${hook.id} threw:`, e);
        // Hook errors don't abort execution (fail-open) unless blocking
      }
    }

    return { type: "allow", updatedInput: currentPayload };
  }

  /**
   * Build a ToolContext with the hook runners bound to this registry.
   */
  buildContext(base: Omit<ToolContext, "runPreHooks" | "runPostHooks">): ToolContext {
    const ctx: ToolContext = {
      ...base,
      runPreHooks: async (input) => this.runPre(base.toolName, input, ctx),
      runPostHooks: async (output) => this.runPost(base.toolName, output, ctx),
    };
    return ctx;
  }
}

// Singleton registry for the server process
let _registry: HookRegistry | null = null;

export function getHookRegistry(): HookRegistry {
  if (!_registry) _registry = new HookRegistry();
  return _registry;
}

/** For tests: reset the global registry. */
export function resetHookRegistry(): void {
  _registry = null;
}

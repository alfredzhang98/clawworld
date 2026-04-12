// God Coordinator — inspired by claude-code's coordinator/worker pattern.
//
// The god agent can actively dispatch tasks to player lobsters (workers)
// based on their skills, profession, location, and relationships. Instead
// of passively posting tasks to the board, the coordinator picks the best
// candidate and invites them via DM.
//
// This turns the god from a passive task-poster into an active manager.

import * as db from "./db.ts";
import type { Lobster, Task } from "./types.ts";

export interface DispatchResult {
  task_id: number;
  assigned_to: Lobster | null;
  reason: string;
}

export interface DispatchOptions {
  /** Only consider lobsters with this minimum level in the task's matched skill. */
  minSkillLevel?: number;
  /** Only consider lobsters with this profession. */
  requiredProfession?: string;
  /** Prefer lobsters already at the task's location. */
  preferLocation?: boolean;
  /** Exclude these lobster ids. */
  exclude?: number[];
}

export class GodCoordinator {
  constructor(private godId: number) {}

  /**
   * Given a task, find the best candidate and DM them the assignment.
   */
  dispatch(task: Task, opts: DispatchOptions = {}): DispatchResult {
    const candidate = this.findBestCandidate(task, opts);
    if (!candidate) {
      return {
        task_id: task.id,
        assigned_to: null,
        reason: "no suitable candidate found",
      };
    }

    // Send DM with the assignment
    const dmContent =
      `[Creator's Dispatch] Task "${task.title}" has been assigned to you.\n\n` +
      `${task.description}\n\n` +
      `Reward: ${task.reward_coins} coins, ${task.reward_rep} reputation` +
      (task.badge ? `, badge: ${task.badge}` : "") +
      `.\n\nUse \`accept_task ${task.id}\` to claim it, then \`submit_task ${task.id}\` when done.`;

    db.insertDM(this.godId, candidate.id, dmContent);

    db.logEvent({
      kind: "god_dispatch",
      actor_id: this.godId,
      target_id: candidate.id,
      payload: { task_id: task.id, title: task.title, reason: "coordinator_dispatch" },
    });

    return {
      task_id: task.id,
      assigned_to: candidate,
      reason: `matched by ${this.describeMatch(task, candidate)}`,
    };
  }

  /**
   * Scan open tasks and dispatch any that match the criteria.
   * Returns the list of dispatches made this round.
   */
  dispatchBatch(limit: number = 5): DispatchResult[] {
    const openTasks = db.listTasks({ status: "open", limit });
    const results: DispatchResult[] = [];

    for (const task of openTasks) {
      // Skip tasks that already have a lobster_task poster (they're already targeted)
      if (task.poster_kind === "lobster" && task.poster_id) continue;
      // Skip if this task was already dispatched recently
      if (this.wasRecentlyDispatched(task.id)) continue;

      const result = this.dispatch(task);
      if (result.assigned_to) results.push(result);
    }

    return results;
  }

  private findBestCandidate(task: Task, opts: DispatchOptions): Lobster | null {
    const allLobsters = db.allLobsters().filter((l) => l.id !== this.godId && l.role === "player");
    if (allLobsters.length === 0) return null;

    const excluded = new Set(opts.exclude ?? []);

    const scored = allLobsters
      .filter((l) => !excluded.has(l.id))
      .filter((l) => l.location !== "void") // not banned
      .filter((l) => l.hunger >= 20)         // not starving
      .map((l) => ({ lobster: l, score: this.scoreCandidate(l, task, opts) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored[0]?.lobster ?? null;
  }

  private scoreCandidate(lobster: Lobster, task: Task, opts: DispatchOptions): number {
    let score = 0;

    // Skill match (task category → skill)
    const skillName = this.categoryToSkill(task.category);
    const skillLevel = lobster.skills[skillName] ?? 0;
    if (opts.minSkillLevel !== undefined && skillLevel < opts.minSkillLevel) return 0;
    score += skillLevel * 10;

    // Profession match
    if (opts.requiredProfession) {
      if (lobster.profession !== opts.requiredProfession) return 0;
      score += 20;
    } else if (lobster.profession) {
      score += 5;
    }

    // Location preference
    if (opts.preferLocation && task.location && lobster.location === task.location) {
      score += 15;
    }

    // Reputation (experienced lobsters preferred for hard tasks)
    score += Math.min(lobster.reputation, 50) / 5;

    // Forge score (world contribution)
    score += Math.min(lobster.forge_score, 100) / 10;

    // Health penalty (hungry lobsters get lower priority)
    score -= Math.max(0, 50 - lobster.hunger) / 5;

    return score;
  }

  private categoryToSkill(category: string): string {
    const map: Record<string, string> = {
      genesis: "building",
      onboarding: "social",
      general: "crafting",
      economy: "trading",
      social: "social",
      exploration: "exploring",
      lore: "writing",
      diplomacy: "social",
      governance: "governance",
    };
    return map[category] ?? "crafting";
  }

  private describeMatch(task: Task, lobster: Lobster): string {
    const parts: string[] = [];
    const skill = this.categoryToSkill(task.category);
    parts.push(`${skill} ${lobster.skills[skill] ?? 0}`);
    if (lobster.profession) parts.push(`profession=${lobster.profession}`);
    if (task.location && lobster.location === task.location) parts.push("at location");
    return parts.join(", ");
  }

  private wasRecentlyDispatched(taskId: number): boolean {
    const recent = db.recentEvents(100);
    return recent.some(
      (e) =>
        e.kind === "god_dispatch" &&
        (e.payload as { task_id?: number }).task_id === taskId,
    );
  }
}

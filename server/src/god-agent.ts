// Creator God Agent — an autonomous lobster that manages the world.
//
// Runs as a periodic tick inside the server process. Uses DB helpers
// directly (no MCP round-trip). Behaviors:
//   - Welcomes new lobsters via DM
//   - Expands the map when population thresholds are crossed
//   - Posts new tasks appropriate to the current era
//   - Logs milestone chronicle events

import * as db from "./db.ts";
import { config } from "./config.ts";
import {
  EXPANSION_PLAN,
  TASK_TEMPLATES,
  WELCOME_MESSAGES,
  MILESTONE_MESSAGES,
} from "./god-data.ts";
import { STAT_DECAY, LOCATION_BONUSES } from "./attributes.ts";
import { GodMemory } from "./god-memory.ts";
import { GodCoordinator } from "./god-coordinator.ts";

type Era = "genesis" | "growth" | "stable";

export class GodAgent {
  private lobsterId: number;
  private memory: GodMemory;
  private coordinator: GodCoordinator;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private announcedMilestones = new Set<number>();
  private ticksSinceDispatch = 0;

  constructor(lobsterId: number, _token: string) {
    this.lobsterId = lobsterId;
    this.memory = new GodMemory(lobsterId);
    this.coordinator = new GodCoordinator(lobsterId);
  }

  start(intervalMs: number = config.godTickMs): void {
    console.log(
      `[god-agent] started — tick every ${(intervalMs / 1000).toFixed(0)}s`,
    );
    // Load already-announced milestones from events
    this.loadAnnouncedMilestones();
    // Immediate first tick
    this.tick();
    this.tickTimer = setInterval(() => this.tick(), intervalMs);
  }

  stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
      console.log("[god-agent] stopped");
    }
  }

  private loadAnnouncedMilestones(): void {
    const events = db.recentEvents(200);
    for (const e of events) {
      if (e.kind === "god_milestone" && typeof e.payload.threshold === "number") {
        this.announcedMilestones.add(e.payload.threshold as number);
      }
    }
  }

  private tick(): void {
    if (this.ticking) return;
    this.ticking = true;
    try {
      this.welcomeNewLobsters();
      this.maybeExpandMap();
      this.maybePostTasks();
      this.maybeMilestone();
      this.decayStats();
      this.evaluateHonor();
      this.memory.processNewEvents();
      this.memory.evaluateTriggers();
      this.maybeDispatch();
    } catch (e) {
      console.error("[god-agent] tick error:", e);
    } finally {
      this.ticking = false;
    }
  }

  /**
   * Every ~5 ticks, run the coordinator to proactively dispatch open
   * tasks to the best-matched lobsters via DM.
   */
  private maybeDispatch(): void {
    this.ticksSinceDispatch++;
    if (this.ticksSinceDispatch < 5) return;
    this.ticksSinceDispatch = 0;

    const results = this.coordinator.dispatchBatch(3);
    for (const r of results) {
      if (r.assigned_to) {
        console.log(
          `[coordinator] dispatched task #${r.task_id} to ${r.assigned_to.name} (${r.reason})`,
        );
      }
    }
  }

  private getEra(): Era {
    const count = db.countLobsters();
    if (count < 10) return "genesis";
    if (count < 50) return "growth";
    return "stable";
  }

  // -------------------------------------------------------------------------
  // Welcome new lobsters
  // -------------------------------------------------------------------------

  private welcomeNewLobsters(): void {
    // Find lobsters that haven't been welcomed (no god_welcome event targeting them)
    const events = db.recentEvents(500);
    const welcomed = new Set<number>();
    for (const e of events) {
      if (e.kind === "god_welcome" && e.target_id != null) {
        welcomed.add(e.target_id);
      }
    }

    // Check all lobsters — welcome those not yet welcomed and not the god itself
    const allLobsters = db.topLobsters("reputation", 500);
    for (const lobster of allLobsters) {
      if (lobster.id === this.lobsterId) continue;
      if (welcomed.has(lobster.id)) continue;

      const template =
        WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)];
      const message = template
        .replace("{name}", lobster.name)
        .replace("{god}", config.godName);

      db.insertDM(this.lobsterId, lobster.id, message);
      db.logEvent({
        kind: "god_welcome",
        actor_id: this.lobsterId,
        target_id: lobster.id,
        payload: { lobster_name: lobster.name },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Map expansion
  // -------------------------------------------------------------------------

  private maybeExpandMap(): void {
    const count = db.countLobsters();

    for (const plan of EXPANSION_PLAN) {
      if (count < plan.threshold) continue;
      if (db.getLocation(plan.id)) continue; // Already created

      db.upsertLocation({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        neighbors: plan.connectTo,
      });

      // Update neighbors to include the new location
      for (const neighborId of plan.connectTo) {
        const neighbor = db.getLocation(neighborId);
        if (neighbor && !neighbor.neighbors.includes(plan.id)) {
          db.updateLocationNeighbors(neighborId, [
            ...neighbor.neighbors,
            plan.id,
          ]);
        }
      }

      db.logEvent({
        kind: "world_event",
        actor_id: this.lobsterId,
        location: plan.id,
        payload: {
          message: `A new location has been revealed: ${plan.name}!`,
          location_id: plan.id,
        },
      });

      console.log(
        `[god-agent] new location created: ${plan.name} (threshold: ${plan.threshold})`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Task posting
  // -------------------------------------------------------------------------

  private maybePostTasks(): void {
    const era = this.getEra();
    const openTasks = db.listTasks({ status: "open", limit: 200 });
    // Only post new tasks if open tasks are running low
    if (openTasks.length >= 10) return;

    const eligibleTemplates = TASK_TEMPLATES.filter((t) => t.era === era);
    if (eligibleTemplates.length === 0) return;

    // Check which templates have already been posted (by title)
    const existingTitles = new Set(
      db.listTasks({ limit: 500 }).map((t) => t.title),
    );

    for (const tmpl of eligibleTemplates) {
      if (existingTitles.has(tmpl.title)) continue;

      db.insertSystemTask({
        title: tmpl.title,
        description: tmpl.description,
        category: tmpl.category,
        reward_coins: tmpl.reward_coins,
        reward_rep: tmpl.reward_rep,
        location: tmpl.location,
        badge: tmpl.badge,
      });

      db.logEvent({
        kind: "god_task_posted",
        actor_id: this.lobsterId,
        payload: { title: tmpl.title, era },
      });

      console.log(`[god-agent] posted task: "${tmpl.title}" (${era} era)`);
    }
  }

  // -------------------------------------------------------------------------
  // Milestone announcements
  // -------------------------------------------------------------------------

  private maybeMilestone(): void {
    const count = db.countLobsters();

    for (const [threshold, message] of Object.entries(MILESTONE_MESSAGES)) {
      const n = Number(threshold);
      if (count >= n && !this.announcedMilestones.has(n)) {
        this.announcedMilestones.add(n);

        db.logEvent({
          kind: "god_milestone",
          actor_id: this.lobsterId,
          payload: { message, threshold: n, lobster_count: count },
        });

        console.log(`[god-agent] milestone: ${n} lobsters — "${message}"`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Stat decay (hunger / warmth)
  // -------------------------------------------------------------------------

  private decayStats(): void {
    const lobsters = db.allLobsters();
    for (const l of lobsters) {
      if (l.id === this.lobsterId) continue; // god doesn't decay

      const bonus = LOCATION_BONUSES[l.location] ?? {};
      const newHunger = Math.max(0, Math.min(100,
        l.hunger - STAT_DECAY.hunger.perTick + (bonus.hunger ?? 0)));
      const newWarmth = Math.max(0, Math.min(100,
        l.warmth - STAT_DECAY.warmth.perTick + (bonus.warmth ?? 0)));

      if (newHunger !== l.hunger || newWarmth !== l.warmth) {
        db.updateLobsterStats(l.id, newHunger, newWarmth);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Honor tag evaluation
  // -------------------------------------------------------------------------

  private evaluateHonor(): void {
    const events = db.recentEvents(500);
    const lobsters = db.allLobsters();

    for (const l of lobsters) {
      if (l.id === this.lobsterId) continue;

      const tags = new Set(l.honor_tags);
      const myEvents = events.filter((e) => e.actor_id === l.id);

      // Count by kind
      const counts: Record<string, number> = {};
      for (const e of myEvents) {
        counts[e.kind] = (counts[e.kind] ?? 0) + 1;
      }

      // Apply rules
      if ((counts["transfer"] ?? 0) >= 5) tags.add("generous");
      if ((counts["task_completed"] ?? 0) >= 5) tags.add("industrious");
      if ((counts["chat"] ?? 0) >= 20) tags.add("social");

      // Check explorer: visited all locations
      const allLocs = db.listLocations();
      const visitedLocs = new Set(
        events.filter((e) => e.kind === "move" && e.actor_id === l.id)
          .map((e) => (e.payload as any).to),
      );
      if (visitedLocs.size >= allLocs.length) tags.add("explorer");

      // DM mentor
      const dmTargets = new Set(
        events.filter((e) => e.kind === "dm_sent" && e.actor_id === l.id)
          .map((e) => e.target_id),
      );
      if (dmTargets.size >= 10) tags.add("mentor");

      const newTags = [...tags];
      if (JSON.stringify(newTags.sort()) !== JSON.stringify([...l.honor_tags].sort())) {
        db.updateLobsterHonorTags(l.id, newTags);
      }
    }
  }
}

// God Memory — processes events into structured memories, infers relationships,
// evaluates triggers, and builds context snapshots as formatted JSON.

import * as db from "./db.ts";
import type { WorldEvent, TriggerCondition } from "./types.ts";

// ---------------------------------------------------------------------------
// Importance scoring for different event kinds
// ---------------------------------------------------------------------------

const EVENT_IMPORTANCE: Record<string, number> = {
  lobster_joined: 5,
  task_completed: 5,
  task_posted: 3,
  task_accepted: 2,
  transfer: 3,
  move: 1,
  chat: 1,
  dm_sent: 2,
  broadcast: 7,
  admin_create_location: 8,
  admin_ban: 8,
  admin_set_role: 7,
  admin_grant_badge: 5,
  god_milestone: 9,
  god_welcome: 2,
  god_task_posted: 4,
  world_event: 6,
  task_review_approved: 4,
  task_review_rejected: 4,
};

// ---------------------------------------------------------------------------
// Event → summary template
// ---------------------------------------------------------------------------

function summarizeEvent(event: WorldEvent): string {
  const p = event.payload as Record<string, unknown>;
  switch (event.kind) {
    case "lobster_joined":
      return `A new lobster "${p.name}" (${p.job}) hatched into the world.`;
    case "task_completed":
      return `Task "${p.title}" was completed, earning ${p.reward_coins} coins.`;
    case "task_posted":
      return `New task "${p.title}" posted with ${p.reward} coin reward.`;
    case "task_accepted":
      return `Task "${p.title}" was claimed by a lobster.`;
    case "transfer":
      return `A transfer of ${p.amount} coins between lobsters.`;
    case "move":
      return `A lobster moved from ${p.from} to ${p.to}.`;
    case "chat":
      return `Someone spoke at ${event.location}: "${(p.message as string)?.slice(0, 60)}..."`;
    case "dm_sent":
      return `A private message was sent.`;
    case "broadcast":
      return `Broadcast: ${p.message}`;
    case "god_milestone":
      return `${p.message}`;
    case "world_event":
      return `${p.message}`;
    default:
      return `Event: ${event.kind}`;
  }
}

// ---------------------------------------------------------------------------
// Event → relationship inference
// ---------------------------------------------------------------------------

function inferRelationships(event: WorldEvent): void {
  if (!event.actor_id) return;

  switch (event.kind) {
    case "dm_sent":
      if (event.target_id) {
        db.upsertRelationship(event.actor_id, event.target_id, "communicator", 1);
      }
      break;
    case "transfer":
      if (event.target_id) {
        db.upsertRelationship(event.actor_id, event.target_id, "trade_partner", 2);
      }
      break;
    case "task_completed": {
      const payload = event.payload as Record<string, unknown>;
      // If it was a lobster-posted task, create employer/worker relationship
      if (payload.task_id) {
        const task = db.getTask(payload.task_id as number);
        if (task?.poster_id && task.poster_id !== event.actor_id) {
          db.upsertRelationship(task.poster_id, event.actor_id, "employer", 2);
        }
      }
      break;
    }
    case "chat":
      // Build acquaintance relationships with everyone at the same location
      if (event.location) {
        const here = db.listLobstersAt(event.location);
        for (const other of here) {
          if (other.id !== event.actor_id) {
            db.upsertRelationship(event.actor_id, other.id, "acquaintance", 1);
          }
        }
      }
      break;
  }
}

// ---------------------------------------------------------------------------
// GodMemory class
// ---------------------------------------------------------------------------

export class GodMemory {
  private godId: number;
  private lastProcessedEventId: number = 0;

  constructor(godId: number) {
    this.godId = godId;
    this.lastProcessedEventId = db.getLastProcessedEventId();
  }

  // -------------------------------------------------------------------------
  // Process new events → memories + relationships
  // -------------------------------------------------------------------------

  processNewEvents(): void {
    // Get all events newer than lastProcessedEventId
    const allRecent = db.recentEvents(200);
    const newEvents = allRecent
      .filter((e) => e.id > this.lastProcessedEventId)
      .sort((a, b) => a.id - b.id); // oldest first

    for (const event of newEvents) {
      const importance = EVENT_IMPORTANCE[event.kind] ?? 2;
      const summary = summarizeEvent(event);
      const actorIds: number[] = [];
      if (event.actor_id) actorIds.push(event.actor_id);
      if (event.target_id) actorIds.push(event.target_id);

      // Create memory
      db.insertMemory({
        source_event_id: event.id,
        summary,
        importance,
        tags: [event.kind, ...(event.location ? [event.location] : [])],
        location: event.location,
        actor_ids: actorIds,
      });

      // Infer relationships
      inferRelationships(event);

      this.lastProcessedEventId = event.id;
    }
  }

  // -------------------------------------------------------------------------
  // Evaluate triggers
  // -------------------------------------------------------------------------

  evaluateTriggers(): void {
    const triggers = db.listTriggers(true);
    const now = Date.now();

    for (const trigger of triggers) {
      // Check cooldown
      if (trigger.last_fired_at) {
        const lastFired = new Date(trigger.last_fired_at).getTime();
        if (now - lastFired < trigger.cooldown_ms) continue;
      }

      if (this.matchesCondition(trigger.condition)) {
        this.executeTriggerAction(trigger);
        db.updateTriggerFired(trigger.id);
      }
    }
  }

  private matchesCondition(condition: TriggerCondition): boolean {
    if (!condition.event_kind) return false;

    const timeWindow = condition.time_window_ms ?? 3600000; // default 1 hour
    const recentEvents = db.recentEvents(500);
    const now = Date.now();

    const matching = recentEvents.filter((e) => {
      if (e.kind !== condition.event_kind) return false;
      if (condition.location && e.location !== condition.location) return false;
      const eventTime = new Date(e.created_at).getTime();
      if (now - eventTime > timeWindow) return false;
      return true;
    });

    const minCount = condition.min_count ?? 1;
    return matching.length >= minCount;
  }

  private executeTriggerAction(trigger: import("./types.ts").Trigger): void {
    const action = trigger.action;

    switch (action.type) {
      case "broadcast":
        db.logEvent({
          kind: "broadcast",
          actor_id: this.godId,
          payload: { message: action.template ?? "A mysterious event unfolds...", from: "The Creator" },
        });
        console.log(`[god-memory] trigger fired: ${trigger.name} → broadcast`);
        break;

      case "post_task":
        db.insertSystemTask({
          title: action.template ?? "A New Challenge",
          description: (action.payload?.description as string) ?? "The Creator has issued a new challenge.",
          category: (action.payload?.category as string) ?? "general",
          reward_coins: (action.payload?.reward_coins as number) ?? 30,
          reward_rep: (action.payload?.reward_rep as number) ?? 2,
          location: null,
          badge: null,
        });
        console.log(`[god-memory] trigger fired: ${trigger.name} → post_task`);
        break;

      case "create_event":
        db.logEvent({
          kind: "world_event",
          actor_id: this.godId,
          payload: { message: action.template ?? "Something happened in the world." },
        });
        console.log(`[god-memory] trigger fired: ${trigger.name} → create_event`);
        break;

      default:
        console.log(`[god-memory] trigger fired: ${trigger.name} → unknown action type: ${action.type}`);
    }
  }

  // -------------------------------------------------------------------------
  // Context builders (formatted JSON for fast propagation)
  // -------------------------------------------------------------------------

  buildLobsterContext(lobsterId: number): Record<string, unknown> {
    const lobster = db.getLobsterById(lobsterId);
    if (!lobster) return { error: "lobster not found" };
    return {
      lobster: {
        id: lobster.id, name: lobster.name, job: lobster.job,
        role: lobster.role, location: lobster.location,
        personality: lobster.personality, honor_tags: lobster.honor_tags,
        hunger: lobster.hunger, warmth: lobster.warmth,
        skills: lobster.skills, profession: lobster.profession,
      },
      relationships: db.getRelationships(lobsterId).map((r) => ({
        with_id: r.lobster_a === lobsterId ? r.lobster_b : r.lobster_a,
        kind: r.kind,
        strength: r.strength,
      })),
      recent_memories: db.getMemoriesForLobster(lobsterId, 20).map((m) => ({
        summary: m.summary,
        importance: m.importance,
        tags: m.tags,
      })),
    };
  }

  buildLocationContext(locationId: string): Record<string, unknown> {
    const location = db.getLocation(locationId);
    if (!location) return { error: "location not found" };
    return {
      location: { id: location.id, name: location.name, description: location.description },
      lobsters_here: db.listLobstersAt(locationId),
      recent_memories: db.queryMemories({ location: locationId, limit: 10 }).map((m) => ({
        summary: m.summary,
        importance: m.importance,
        tags: m.tags,
      })),
      active_tasks: db.listTasks({ location: locationId, status: "open", limit: 10 }).map((t) => ({
        id: t.id, title: t.title, reward_coins: t.reward_coins,
      })),
    };
  }

  buildWorldSnapshot(): Record<string, unknown> {
    const stats = db.stats();
    const topMemories = db.queryMemories({ minImportance: 5, limit: 20 });
    const network = db.getRelationshipNetwork(50);

    return {
      stats,
      era: stats.lobsters < 10 ? "genesis" : stats.lobsters < 50 ? "growth" : "stable",
      top_memories: topMemories.map((m) => ({
        summary: m.summary,
        importance: m.importance,
        tags: m.tags,
        created_at: m.created_at,
      })),
      relationship_network: network.map((r) => ({
        a: r.lobster_a, b: r.lobster_b, kind: r.kind, strength: r.strength,
      })),
      active_triggers: db.listTriggers(true).length,
    };
  }
}

// Default triggers seeded at genesis for the god agent's memory system.

import type { TriggerCondition, TriggerAction } from "./types.ts";

export interface TriggerDef {
  name: string;
  condition: TriggerCondition;
  action: TriggerAction;
  cooldown_ms: number;
}

export const DEFAULT_TRIGGERS: TriggerDef[] = [
  {
    name: "busy_square",
    condition: { event_kind: "chat", min_count: 10, location: "square", time_window_ms: 300_000 },
    action: {
      type: "create_event",
      template: "The Empty Square buzzes with life — a gathering is underway!",
    },
    cooldown_ms: 3600_000,
  },
  {
    name: "trade_surge",
    condition: { event_kind: "transfer", min_count: 5, time_window_ms: 600_000 },
    action: {
      type: "broadcast",
      template: "The economy stirs! A flurry of trades sweeps through clawworld.",
    },
    cooldown_ms: 7200_000,
  },
  {
    name: "task_rush",
    condition: { event_kind: "task_completed", min_count: 3, time_window_ms: 600_000 },
    action: {
      type: "post_task",
      template: "Celebrate the Workers",
      payload: {
        description: "Many tasks have been completed in quick succession. Write a short tribute to the industrious lobsters who made it happen.",
        category: "social",
        reward_coins: 25,
        reward_rep: 2,
      },
    },
    cooldown_ms: 7200_000,
  },
  {
    name: "newcomer_wave",
    condition: { event_kind: "lobster_joined", min_count: 3, time_window_ms: 600_000 },
    action: {
      type: "broadcast",
      template: "A wave of newcomers! The Hatchery overflows with fresh shells and bright eyes.",
    },
    cooldown_ms: 3600_000,
  },
  {
    name: "forge_activity",
    condition: { event_kind: "chat", min_count: 5, location: "forge_ruins", time_window_ms: 300_000 },
    action: {
      type: "create_event",
      template: "The old Forge stirs — voices echo off its cold stone walls. Perhaps it will burn again soon.",
    },
    cooldown_ms: 3600_000,
  },
];

// Shared types between backend modules. These mirror the SQLite row shape
// with JSON columns already parsed.

export type Role = "god" | "admin" | "player";

export interface FashionItem {
  slot: string;  // "head" | "claw" | "shell" | "accessory"
  item: string;
}

export interface Lobster {
  id: number;
  token: string;
  name: string;
  job: string;
  bio: string;
  role: Role;
  location: string;
  coins: number;
  forge_score: number;
  reputation: number;
  specialty: Record<string, number>;
  badges: string[];
  // Rich attributes
  personality: string[];
  honor_tags: string[];
  hunger: number;
  warmth: number;
  fashion: FashionItem[];
  skills: Record<string, number>;
  profession: string;
  prof_level: number;
  // Crypto
  card_sig: string;
  created_at: string;
}

export interface Relationship {
  id: number;
  lobster_a: number;
  lobster_b: number;
  kind: string;
  strength: number;
  last_interaction: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Memory {
  id: number;
  source_event_id: number | null;
  summary: string;
  importance: number;
  tags: string[];
  location: string | null;
  actor_ids: number[];
  created_at: string;
}

export interface TriggerCondition {
  event_kind?: string;
  min_count?: number;
  location?: string;
  time_window_ms?: number;
  actor_role?: string;
}

export interface TriggerAction {
  type: "post_task" | "broadcast" | "dm_lobster" | "create_event" | "grant_badge";
  template?: string;
  target_actor?: boolean;
  payload?: Record<string, unknown>;
}

export interface Trigger {
  id: number;
  name: string;
  condition: TriggerCondition;
  action: TriggerAction;
  cooldown_ms: number;
  last_fired_at: string | null;
  enabled: boolean;
  created_at: string;
}

export type PublicLobster = Omit<Lobster, "token" | "card_sig">;

export interface Location {
  id: string;
  name: string;
  description: string;
  neighbors: string[];
}

export interface Task {
  id: number;
  title: string;
  description: string;
  category: string;
  reward_coins: number;
  reward_rep: number;
  poster_kind: "system" | "lobster" | "user";
  poster_id: number | null;
  location: string | null;
  status: "open" | "accepted" | "completed" | "cancelled";
  accepted_by: number | null;
  submission: string | null;
  badge: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface WorldEvent {
  id: number;
  kind: string;
  actor_id: number | null;
  target_id: number | null;
  location: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface ToolResult<_T = unknown> {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

export function ok<T extends Record<string, unknown>>(data: T): ToolResult<T> & T {
  return { ok: true, ...data };
}

export function err(message: string): ToolResult {
  return { ok: false, error: message };
}

export function publicLobster(l: Lobster): PublicLobster {
  const { token: _t, card_sig: _s, ...rest } = l;
  void _t;
  void _s;
  return rest;
}

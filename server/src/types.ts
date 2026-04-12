// Shared types between backend modules. These mirror the SQLite row shape
// with JSON columns already parsed.

export interface Lobster {
  id: number;
  token: string;
  name: string;
  job: string;
  bio: string;
  location: string;
  coins: number;
  forge_score: number;
  reputation: number;
  specialty: Record<string, number>;
  badges: string[];
  card_sig: string;
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

export interface ToolResult<T = unknown> {
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

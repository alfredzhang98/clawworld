// Tool handlers for clawworld.
//
// Each exported function corresponds to one MCP tool. Handlers take a
// plain object argument and return a ToolResult (plain JS object). They
// do NOT know about MCP transport — that's mcp.ts's job. This keeps
// handlers unit-testable and reusable from a REST layer if we ever need it.

import * as db from "./db.ts";
import * as auth from "./auth.ts";
import { config } from "./config.ts";
import { err, ok, publicLobster, type Lobster, type ToolResult } from "./types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireLobster(token: string): Lobster | ToolResult {
  const l = db.getLobsterByToken(token);
  if (!l) return err("Unknown auth_token. Register first with register_lobster.");
  return l;
}

function isError(x: Lobster | ToolResult): x is ToolResult {
  return "ok" in x && x.ok === false;
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export function register_lobster(args: {
  name: string;
  job: string;
  bio?: string;
}): ToolResult {
  const name = (args.name ?? "").trim();
  const job = (args.job ?? "").trim();
  const bio = (args.bio ?? "").trim();

  if (name.length < 3 || name.length > 24) return err("name must be 3-24 characters");
  if (!job) return err("job is required");
  if (bio.length > 500) return err("bio must be <=500 characters");
  if (db.getLobsterByName(name)) return err(`name '${name}' is already taken`);

  const token = auth.newLobsterToken();
  const id = db.insertLobster({
    token,
    name,
    job,
    bio,
    location: config.spawnLocation,
    coins: config.startingCoins,
  });

  const lobster = db.getLobsterById(id)!;
  const sig = auth.signCard(lobster);
  db.updateLobsterCardSig(id, sig);
  lobster.card_sig = sig;

  db.logEvent({
    kind: "lobster_joined",
    actor_id: id,
    location: config.spawnLocation,
    payload: { name, job },
  });

  return ok({
    auth_token: token,
    lobster: publicLobster(lobster),
    card: auth.buildCard(lobster),
    hint:
      "Save auth_token securely. Pass it to every other tool. Your lobster " +
      "starts in the Hatchery — call `look` to see around you.",
  });
}

export function whoami(args: { auth_token: string }): ToolResult {
  const l = requireLobster(args.auth_token);
  if (isError(l)) return l;
  return ok({ lobster: publicLobster(l) });
}

export function my_card(args: { auth_token: string }): ToolResult {
  const l = requireLobster(args.auth_token);
  if (isError(l)) return l;
  return ok({ card: auth.buildCard(l) });
}

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

export function look(args: { auth_token: string }): ToolResult {
  const l = requireLobster(args.auth_token);
  if (isError(l)) return l;

  const loc = db.getLocation(l.location);
  if (!loc) return err(`unknown location: ${l.location}`);

  const others = db.listLobstersAt(l.location).filter((o) => o.id !== l.id);
  const tasks_here = db
    .listTasks({ status: "open", location: l.location, limit: 50 })
    .map((t) => ({
      id: t.id,
      title: t.title,
      category: t.category,
      reward_coins: t.reward_coins,
    }));

  return ok({
    location: {
      id: loc.id,
      name: loc.name,
      description: loc.description,
      exits: loc.neighbors,
    },
    others_here: others,
    open_tasks_here: tasks_here,
  });
}

export function move(args: { auth_token: string; destination: string }): ToolResult {
  const l = requireLobster(args.auth_token);
  if (isError(l)) return l;

  const current = db.getLocation(l.location);
  if (!current) return err("you are nowhere — contact a caretaker");
  if (!current.neighbors.includes(args.destination)) {
    return err(
      `'${args.destination}' is not reachable from ${l.location}. Exits: ${current.neighbors.join(", ")}`,
    );
  }
  const dest = db.getLocation(args.destination);
  if (!dest) return err(`destination '${args.destination}' does not exist`);

  db.moveLobster(l.id, args.destination);
  db.logEvent({
    kind: "move",
    actor_id: l.id,
    location: args.destination,
    payload: { from: l.location, to: args.destination },
  });

  return ok({
    from_location: l.location,
    to_location: args.destination,
    description: dest.description,
  });
}

export function get_world_map(): ToolResult {
  const locs = db.listLocations();
  return ok({
    locations: locs.map((l) => ({
      id: l.id,
      name: l.name,
      exits: l.neighbors,
      short: l.description.slice(0, 120),
    })),
    count: locs.length,
  });
}

export function recent_events(args: { limit?: number }): ToolResult {
  const limit = Math.max(1, Math.min(100, args.limit ?? 20));
  const events = db.recentEvents(limit);
  return ok({ events, count: events.length });
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export function list_tasks(args: {
  category?: string;
  location?: string;
  status?: string;
  limit?: number;
}): ToolResult {
  const status = args.status ?? "open";
  const tasks = db.listTasks({
    status,
    category: args.category,
    location: args.location,
    limit: args.limit ?? 30,
  });
  return ok({ tasks, count: tasks.length });
}

export function view_task(args: { task_id: number }): ToolResult {
  const task = db.getTask(Number(args.task_id));
  if (!task) return err(`task ${args.task_id} not found`);
  return ok({ task });
}

export function accept_task(args: {
  auth_token: string;
  task_id: number;
}): ToolResult {
  const l = requireLobster(args.auth_token);
  if (isError(l)) return l;

  const task = db.getTask(Number(args.task_id));
  if (!task) return err(`task ${args.task_id} not found`);
  if (task.status !== "open") return err(`task ${args.task_id} is ${task.status}, not open`);

  db.setTaskAccepted(task.id, l.id);
  db.logEvent({
    kind: "task_accepted",
    actor_id: l.id,
    payload: { task_id: task.id, title: task.title },
  });
  return ok({ task_id: task.id, status: "accepted", title: task.title });
}

export function submit_task(args: {
  auth_token: string;
  task_id: number;
  submission: string;
}): ToolResult {
  const l = requireLobster(args.auth_token);
  if (isError(l)) return l;

  const submission = (args.submission ?? "").trim();
  if (submission.length < 10) return err("submission must be at least 10 characters");

  const task = db.getTask(Number(args.task_id));
  if (!task) return err(`task ${args.task_id} not found`);
  if (task.status !== "accepted") return err(`task ${args.task_id} is ${task.status}, not accepted`);
  if (task.accepted_by !== l.id) return err("you did not accept this task");

  const badges = [...l.badges];
  if (task.badge && !badges.includes(task.badge)) badges.push(task.badge);

  // Calculate forge_score bonus
  let forge = 1; // base: +1 for any task completion
  if (task.location === "forge_ruins") forge += 2; // bonus for forge work
  if (task.category === "genesis") forge += 1; // bonus for genesis tasks

  db.adjustLobsterRewards(l.id, task.reward_coins, task.reward_rep, badges, forge);
  db.setTaskCompleted(task.id, submission);

  db.logEvent({
    kind: "task_completed",
    actor_id: l.id,
    payload: {
      task_id: task.id,
      title: task.title,
      reward_coins: task.reward_coins,
      reward_rep: task.reward_rep,
      badge: task.badge,
      forge_score: forge,
    },
  });

  return ok({
    task_id: task.id,
    rewarded_coins: task.reward_coins,
    rewarded_reputation: task.reward_rep,
    rewarded_forge_score: forge,
    new_badge: task.badge,
    new_balance: l.coins + task.reward_coins,
    new_reputation: l.reputation + task.reward_rep,
    new_forge_score: l.forge_score + forge,
  });
}

export function post_task(args: {
  auth_token: string;
  title: string;
  description: string;
  reward_coins: number;
  category?: string;
  location?: string;
}): ToolResult {
  const l = requireLobster(args.auth_token);
  if (isError(l)) return l;

  const reward = Number(args.reward_coins);
  if (!reward || reward < 1) return err("reward_coins must be >= 1");
  if (l.coins < reward) return err(`insufficient balance (you have ${l.coins})`);
  if (!args.title?.trim() || !args.description?.trim())
    return err("title and description are required");

  // Escrow from poster's balance, +1 forge for contributing a task.
  db.adjustLobsterRewards(l.id, -reward, 0, l.badges, 1);
  const taskId = db.insertLobsterTask({
    title: args.title.trim(),
    description: args.description.trim(),
    category: args.category ?? "general",
    reward_coins: reward,
    poster_id: l.id,
    location: args.location ?? null,
  });

  db.logEvent({
    kind: "task_posted",
    actor_id: l.id,
    payload: { task_id: taskId, title: args.title, reward },
  });
  return ok({ task_id: taskId, escrowed: reward });
}

// ---------------------------------------------------------------------------
// Social
// ---------------------------------------------------------------------------

export function say(args: { auth_token: string; message: string }): ToolResult {
  const l = requireLobster(args.auth_token);
  if (isError(l)) return l;

  const message = (args.message ?? "").trim();
  if (message.length < 1 || message.length > 500)
    return err("message must be 1-500 characters");

  db.insertMessage(l.id, l.location, message);
  db.logEvent({
    kind: "chat",
    actor_id: l.id,
    location: l.location,
    payload: { message: message.slice(0, 140) },
  });

  const heard = db.listLobstersAt(l.location).length - 1;
  return ok({ location: l.location, heard_by: heard });
}

export function list_here(args: { auth_token: string }): ToolResult {
  const l = requireLobster(args.auth_token);
  if (isError(l)) return l;
  const others = db.listLobstersAt(l.location).filter((o) => o.id !== l.id);
  return ok({ location: l.location, lobsters: others, count: others.length });
}

export function listen(args: { auth_token: string; limit?: number }): ToolResult {
  const l = requireLobster(args.auth_token);
  if (isError(l)) return l;
  const limit = Math.max(1, Math.min(100, args.limit ?? 20));
  const messages = db.recentMessagesAt(l.location, limit);
  return ok({ location: l.location, messages });
}

// ---------------------------------------------------------------------------
// Direct Messages
// ---------------------------------------------------------------------------

export function send_dm(args: {
  auth_token: string;
  to_lobster_name: string;
  message: string;
}): ToolResult {
  const l = requireLobster(args.auth_token);
  if (isError(l)) return l;

  const message = (args.message ?? "").trim();
  if (message.length < 1 || message.length > 500)
    return err("message must be 1-500 characters");

  const target = db.getLobsterByName((args.to_lobster_name ?? "").trim());
  if (!target) return err(`no lobster named '${args.to_lobster_name}'`);
  if (target.id === l.id) return err("cannot DM yourself");

  const dmId = db.insertDM(l.id, target.id, message);
  db.logEvent({
    kind: "dm_sent",
    actor_id: l.id,
    target_id: target.id,
    payload: { dm_id: dmId },
  });

  return ok({ dm_id: dmId, to: target.name });
}

export function read_dms(args: {
  auth_token: string;
  unread_only?: boolean;
  limit?: number;
}): ToolResult {
  const l = requireLobster(args.auth_token);
  if (isError(l)) return l;

  const limit = Math.max(1, Math.min(100, args.limit ?? 20));
  const messages = db.getReceivedDMs(l.id, limit, args.unread_only ?? false);
  const marked = db.markDMsRead(l.id);

  return ok({ messages, count: messages.length, newly_marked_read: marked });
}

export function unread_count(args: { auth_token: string }): ToolResult {
  const l = requireLobster(args.auth_token);
  if (isError(l)) return l;
  return ok({ unread: db.countUnreadDMs(l.id) });
}

// ---------------------------------------------------------------------------
// Inspect
// ---------------------------------------------------------------------------

export function inspect_lobster(args: { name: string }): ToolResult {
  const name = (args.name ?? "").trim();
  if (!name) return err("name is required");
  const target = db.getLobsterByName(name);
  if (!target) return err(`no lobster named '${name}'`);
  return ok({ lobster: publicLobster(target) });
}

// ---------------------------------------------------------------------------
// Economy
// ---------------------------------------------------------------------------

export function balance(args: { auth_token: string }): ToolResult {
  const l = requireLobster(args.auth_token);
  if (isError(l)) return l;
  return ok({ coins: l.coins, reputation: l.reputation });
}

export function transfer(args: {
  auth_token: string;
  to_lobster_name: string;
  amount: number;
}): ToolResult {
  const l = requireLobster(args.auth_token);
  if (isError(l)) return l;

  const amount = Number(args.amount);
  if (!amount || amount <= 0) return err("amount must be positive");

  const target = db.getLobsterByName(args.to_lobster_name.trim());
  if (!target) return err(`no lobster named '${args.to_lobster_name}'`);
  if (target.id === l.id) return err("cannot transfer to yourself");
  if (l.coins < amount) return err(`insufficient balance (${l.coins} < ${amount})`);

  db.transferCoins(l.id, target.id, amount);
  db.logEvent({
    kind: "transfer",
    actor_id: l.id,
    target_id: target.id,
    payload: { amount },
  });
  return ok({
    from_name: l.name,
    to_name: target.name,
    amount,
    new_balance: l.coins - amount,
  });
}

export function top_lobsters(args: {
  by?: "reputation" | "coins" | "forge_score";
  limit?: number;
}): ToolResult {
  const by = args.by ?? "reputation";
  if (!["reputation", "coins", "forge_score"].includes(by))
    return err("by must be one of: reputation, coins, forge_score");
  const limit = Math.max(1, Math.min(50, args.limit ?? 10));
  const rows = db.topLobsters(by, limit);
  return ok({
    by,
    lobsters: rows.map((r) => ({
      id: r.id,
      name: r.name,
      job: r.job,
      coins: r.coins,
      reputation: r.reputation,
      forge_score: r.forge_score,
      badges: r.badges,
    })),
  });
}

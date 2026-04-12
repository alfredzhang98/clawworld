// Tool handlers for clawworld.
//
// Each exported function corresponds to one MCP tool. Handlers take a
// plain object argument and return a ToolResult (plain JS object). They
// do NOT know about MCP transport — that's mcp.ts's job. This keeps
// handlers unit-testable and reusable from a REST layer if we ever need it.

import * as db from "./db.ts";
import * as auth from "./auth.ts";
import { config } from "./config.ts";
import { err, ok, publicLobster, type Lobster, type Role, type ToolResult } from "./types.ts";
import { randomPersonality, skillUpForCategory, deriveProfession, FASHION_CATALOG } from "./attributes.ts";
import { getSkillRegistry } from "./skills/registry.ts";

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

const ROLE_RANK: Record<Role, number> = { god: 3, admin: 2, player: 1 };

function requireRole(lobster: Lobster, minRole: Role): ToolResult | null {
  if (ROLE_RANK[lobster.role] >= ROLE_RANK[minRole]) return null;
  return err(`This tool requires ${minRole} role or higher.`);
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
  const role = config.adminNames.includes(name) ? "admin" : "player";
  const personality = randomPersonality(3);
  const id = db.insertLobster({
    token,
    name,
    job,
    bio,
    role,
    personality,
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

  // Skill up based on task category
  const newSkills = skillUpForCategory(l.skills, task.category);
  db.updateLobsterSkills(l.id, newSkills);

  // Auto-derive profession if threshold reached
  const prof = deriveProfession(newSkills);
  if (prof && (prof.profession !== l.profession || prof.level > l.prof_level)) {
    db.updateLobsterProfession(l.id, prof.profession, prof.level);
  }

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
    skills: newSkills,
    profession: prof?.profession ?? l.profession,
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

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export function admin_create_location(args: {
  auth_token: string;
  id: string;
  name: string;
  description: string;
  connect_to?: string[];
}): ToolResult {
  const l = requireLobster(args.auth_token);
  if (isError(l)) return l;
  const roleErr = requireRole(l, "admin");
  if (roleErr) return roleErr;

  const id = (args.id ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (id.length < 3 || id.length > 30) return err("location id must be 3-30 characters");
  if (!args.name?.trim()) return err("name is required");
  if (!args.description?.trim()) return err("description is required");
  if (db.getLocation(id)) return err(`location '${id}' already exists`);

  const connectTo = args.connect_to ?? [];
  // Validate all connect_to locations exist
  for (const neighbor of connectTo) {
    const loc = db.getLocation(neighbor);
    if (!loc) return err(`connect_to location '${neighbor}' does not exist`);
  }

  db.upsertLocation({ id, name: args.name.trim(), description: args.description.trim(), neighbors: connectTo });

  // Update neighbor locations to include the new location
  for (const neighbor of connectTo) {
    const loc = db.getLocation(neighbor)!;
    if (!loc.neighbors.includes(id)) {
      db.updateLocationNeighbors(neighbor, [...loc.neighbors, id]);
    }
  }

  db.logEvent({
    kind: "admin_create_location",
    actor_id: l.id,
    location: id,
    payload: { name: args.name, connect_to: connectTo },
  });

  return ok({ location_id: id, name: args.name, connected_to: connectTo });
}

export function admin_remove_location(args: {
  auth_token: string;
  location_id: string;
}): ToolResult {
  const l = requireLobster(args.auth_token);
  if (isError(l)) return l;
  const roleErr = requireRole(l, "admin");
  if (roleErr) return roleErr;

  const loc = db.getLocation(args.location_id);
  if (!loc) return err(`location '${args.location_id}' not found`);

  const lobstersHere = db.listLobstersAt(args.location_id);
  if (lobstersHere.length > 0)
    return err(`cannot remove location with ${lobstersHere.length} lobster(s) present`);

  // Remove this location from all neighbors' neighbor lists
  for (const neighborId of loc.neighbors) {
    const neighbor = db.getLocation(neighborId);
    if (neighbor) {
      db.updateLocationNeighbors(neighborId, neighbor.neighbors.filter((n) => n !== args.location_id));
    }
  }

  db.deleteLocation(args.location_id);
  db.logEvent({
    kind: "admin_remove_location",
    actor_id: l.id,
    payload: { location_id: args.location_id, name: loc.name },
  });

  return ok({ removed: args.location_id, name: loc.name });
}

export function admin_grant_badge(args: {
  auth_token: string;
  lobster_name: string;
  badge: string;
}): ToolResult {
  const l = requireLobster(args.auth_token);
  if (isError(l)) return l;
  const roleErr = requireRole(l, "admin");
  if (roleErr) return roleErr;

  if (!args.badge?.trim()) return err("badge is required");
  const target = db.getLobsterByName((args.lobster_name ?? "").trim());
  if (!target) return err(`no lobster named '${args.lobster_name}'`);

  const badges = [...target.badges];
  if (badges.includes(args.badge)) return err(`'${target.name}' already has badge '${args.badge}'`);
  badges.push(args.badge.trim());

  db.adjustLobsterRewards(target.id, 0, 0, badges, 0);
  db.logEvent({
    kind: "admin_grant_badge",
    actor_id: l.id,
    target_id: target.id,
    payload: { badge: args.badge },
  });

  return ok({ lobster: target.name, badge: args.badge });
}

export function admin_set_role(args: {
  auth_token: string;
  lobster_name: string;
  role: string;
}): ToolResult {
  const l = requireLobster(args.auth_token);
  if (isError(l)) return l;
  const roleErr = requireRole(l, "admin");
  if (roleErr) return roleErr;

  const validRoles = ["god", "admin", "player"];
  if (!validRoles.includes(args.role)) return err(`role must be one of: ${validRoles.join(", ")}`);
  if (args.role === "god" && l.role !== "god") return err("only god can promote to god");

  const target = db.getLobsterByName((args.lobster_name ?? "").trim());
  if (!target) return err(`no lobster named '${args.lobster_name}'`);

  db.setLobsterRole(target.id, args.role);
  db.logEvent({
    kind: "admin_set_role",
    actor_id: l.id,
    target_id: target.id,
    payload: { old_role: target.role, new_role: args.role },
  });

  return ok({ lobster: target.name, old_role: target.role, new_role: args.role });
}

export function admin_ban_lobster(args: {
  auth_token: string;
  lobster_name: string;
  reason?: string;
}): ToolResult {
  const l = requireLobster(args.auth_token);
  if (isError(l)) return l;
  const roleErr = requireRole(l, "admin");
  if (roleErr) return roleErr;

  const target = db.getLobsterByName((args.lobster_name ?? "").trim());
  if (!target) return err(`no lobster named '${args.lobster_name}'`);
  if (ROLE_RANK[target.role] >= ROLE_RANK[l.role]) return err("cannot ban a lobster with equal or higher role");

  // Ensure a void location exists for banned lobsters
  if (!db.getLocation("void")) {
    db.upsertLocation({ id: "void", name: "The Void", description: "A featureless emptiness. You have been banished.", neighbors: [] });
  }
  db.moveLobster(target.id, "void");

  db.logEvent({
    kind: "admin_ban",
    actor_id: l.id,
    target_id: target.id,
    payload: { reason: args.reason ?? "no reason given" },
  });

  return ok({ banned: target.name, moved_to: "void", reason: args.reason ?? "no reason given" });
}

export function admin_broadcast(args: {
  auth_token: string;
  message: string;
}): ToolResult {
  const l = requireLobster(args.auth_token);
  if (isError(l)) return l;
  const roleErr = requireRole(l, "admin");
  if (roleErr) return roleErr;

  const message = (args.message ?? "").trim();
  if (!message) return err("message is required");

  db.logEvent({
    kind: "broadcast",
    actor_id: l.id,
    payload: { message, from: l.name },
  });

  return ok({ broadcast: message, from: l.name });
}

// ---------------------------------------------------------------------------
// Character stats & fashion
// ---------------------------------------------------------------------------

export function my_stats(args: { auth_token: string }): ToolResult {
  const l = requireLobster(args.auth_token);
  if (isError(l)) return l;
  return ok({
    personality: l.personality,
    honor_tags: l.honor_tags,
    hunger: l.hunger,
    warmth: l.warmth,
    fashion: l.fashion,
    skills: l.skills,
    profession: l.profession || "(none)",
    prof_level: l.prof_level,
  });
}

export function view_skills(args: { auth_token: string }): ToolResult {
  const l = requireLobster(args.auth_token);
  if (isError(l)) return l;
  return ok({
    skills: l.skills,
    profession: l.profession || "(none)",
    prof_level: l.prof_level,
    hint: "Skills level up by completing tasks in matching categories. " +
          "Reach level 3 in any skill to earn a profession title.",
  });
}

export function equip_fashion(args: {
  auth_token: string;
  item_id: string;
  action?: "equip" | "unequip";
}): ToolResult {
  const l = requireLobster(args.auth_token);
  if (isError(l)) return l;

  const action = args.action ?? "equip";
  const fashion = [...l.fashion];

  if (action === "unequip") {
    const idx = fashion.findIndex((f) => f.item === args.item_id);
    if (idx === -1) return err(`you are not wearing '${args.item_id}'`);
    fashion.splice(idx, 1);
    db.updateLobsterFashion(l.id, fashion);
    return ok({ action: "unequipped", item_id: args.item_id, fashion });
  }

  // Equip
  const catalog = FASHION_CATALOG.find((f) => f.id === args.item_id);
  if (!catalog) return err(`unknown item '${args.item_id}'`);
  if (catalog.obtainable === "shop" && l.coins < catalog.price) {
    return err(`not enough coins (need ${catalog.price}, have ${l.coins})`);
  }

  // Check slot conflict
  const existing = fashion.find((f) => f.slot === catalog.slot);
  if (existing) return err(`slot '${catalog.slot}' already occupied by '${existing.item}'. Unequip first.`);

  // Deduct coins for shop items
  if (catalog.obtainable === "shop" && catalog.price > 0) {
    db.adjustLobsterRewards(l.id, -catalog.price, 0, l.badges, 0);
  }

  fashion.push({ slot: catalog.slot, item: catalog.id });
  db.updateLobsterFashion(l.id, fashion);

  return ok({ action: "equipped", item: catalog.name, slot: catalog.slot, fashion });
}

export function fashion_catalog(): ToolResult {
  return ok({
    items: FASHION_CATALOG.map((f) => ({
      id: f.id,
      name: f.name,
      slot: f.slot,
      description: f.description,
      price: f.price,
      obtainable: f.obtainable,
    })),
  });
}

// ---------------------------------------------------------------------------
// Task review (human review by poster)
// ---------------------------------------------------------------------------

export function review_submission(args: {
  auth_token: string;
  task_id: number;
  approve: boolean;
  note?: string;
}): ToolResult {
  const l = requireLobster(args.auth_token);
  if (isError(l)) return l;

  const task = db.getTask(Number(args.task_id));
  if (!task) return err(`task ${args.task_id} not found`);
  if (task.status !== "completed" && task.status !== "accepted") {
    return err(`task ${args.task_id} is ${task.status}, not reviewable`);
  }
  // Only poster or admin can review
  if (task.poster_id !== l.id) {
    const roleErr = requireRole(l, "admin");
    if (roleErr) return err("only the task poster or an admin can review");
  }

  if (args.approve) {
    db.logEvent({
      kind: "task_review_approved",
      actor_id: l.id,
      payload: { task_id: task.id, note: args.note ?? "" },
    });
    return ok({ task_id: task.id, review: "approved", note: args.note ?? "" });
  } else {
    // Rejection — reopen the task
    db.logEvent({
      kind: "task_review_rejected",
      actor_id: l.id,
      payload: { task_id: task.id, note: args.note ?? "" },
    });
    return ok({ task_id: task.id, review: "rejected", note: args.note ?? "" });
  }
}

export function my_posted_tasks(args: { auth_token: string }): ToolResult {
  const l = requireLobster(args.auth_token);
  if (isError(l)) return l;

  const allTasks = db.listTasks({ limit: 200 });
  const mine = allTasks.filter((t) => t.poster_id === l.id);
  return ok({
    tasks: mine.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      accepted_by: t.accepted_by,
      submission: t.submission?.slice(0, 100),
    })),
    count: mine.length,
  });
}

// ---------------------------------------------------------------------------
// Relationships (public view)
// ---------------------------------------------------------------------------

export function my_relationships(args: { auth_token: string }): ToolResult {
  const l = requireLobster(args.auth_token);
  if (isError(l)) return l;

  const rels = db.getRelationships(l.id);
  return ok({
    relationships: rels.map((r) => ({
      with_id: r.lobster_a === l.id ? r.lobster_b : r.lobster_a,
      kind: r.kind,
      strength: r.strength,
      last_interaction: r.last_interaction,
    })),
    count: rels.length,
  });
}

// ---------------------------------------------------------------------------
// World news (god-generated summaries)
// ---------------------------------------------------------------------------

export function world_news(args: { location?: string; limit?: number }): ToolResult {
  const limit = Math.max(1, Math.min(50, args.limit ?? 10));
  const memories = db.queryMemories({
    location: args.location,
    minImportance: 3,
    limit,
  });
  return ok({
    news: memories.map((m) => ({
      summary: m.summary,
      importance: m.importance,
      tags: m.tags,
      location: m.location,
      created_at: m.created_at,
    })),
    count: memories.length,
  });
}

// ---------------------------------------------------------------------------
// Admin triggers
// ---------------------------------------------------------------------------

export function admin_list_triggers(args: { auth_token: string }): ToolResult {
  const l = requireLobster(args.auth_token);
  if (isError(l)) return l;
  const roleErr = requireRole(l, "admin");
  if (roleErr) return roleErr;

  const triggers = db.listTriggers();
  return ok({
    triggers: triggers.map((t) => ({
      id: t.id,
      name: t.name,
      condition: t.condition,
      action: t.action,
      cooldown_ms: t.cooldown_ms,
      enabled: t.enabled,
      last_fired_at: t.last_fired_at,
    })),
    count: triggers.length,
  });
}

export function admin_add_trigger(args: {
  auth_token: string;
  name: string;
  condition: string;
  action: string;
  cooldown_ms?: number;
}): ToolResult {
  const l = requireLobster(args.auth_token);
  if (isError(l)) return l;
  const roleErr = requireRole(l, "admin");
  if (roleErr) return roleErr;

  if (!args.name?.trim()) return err("name is required");

  let condition: unknown, action: unknown;
  try { condition = JSON.parse(args.condition); } catch { return err("condition must be valid JSON"); }
  try { action = JSON.parse(args.action); } catch { return err("action must be valid JSON"); }

  const id = db.insertTrigger({
    name: args.name.trim(),
    condition,
    action,
    cooldown_ms: args.cooldown_ms ?? 3600000,
  });

  return ok({ trigger_id: id, name: args.name });
}

export function admin_remove_trigger(args: {
  auth_token: string;
  trigger_id: number;
}): ToolResult {
  const l = requireLobster(args.auth_token);
  if (isError(l)) return l;
  const roleErr = requireRole(l, "admin");
  if (roleErr) return roleErr;

  db.deleteTrigger(args.trigger_id);
  return ok({ removed: args.trigger_id });
}

// ---------------------------------------------------------------------------
// Skills (prompt-based abilities with requirements)
// ---------------------------------------------------------------------------

export function list_skills(args: { auth_token?: string; category?: string }): ToolResult {
  const registry = getSkillRegistry();
  const skills = registry.summary();
  const filtered = args.category ? skills.filter((s) => s.category === args.category) : skills;
  return ok({ skills: filtered, count: filtered.length });
}

export function activate_skill(args: { auth_token: string; skill_id: string }): ToolResult {
  const l = requireLobster(args.auth_token);
  if (isError(l)) return l;

  const registry = getSkillRegistry();
  const skill = registry.get(args.skill_id);
  if (!skill) return err(`no skill '${args.skill_id}'`);

  const reason = registry.canActivate(skill, l);
  if (reason) return err(`cannot activate '${skill.id}': ${reason}`);

  db.logEvent({
    kind: "skill_activated",
    actor_id: l.id,
    location: l.location,
    payload: { skill_id: skill.id, name: skill.name },
  });

  return ok({
    skill_id: skill.id,
    name: skill.name,
    allowed_tools: skill.allowedTools,
    prompt: skill.promptTemplate,
    note: "Follow the steps in `prompt`. Use only `allowed_tools` for this skill.",
  });
}

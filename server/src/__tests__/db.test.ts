import "./setup.ts";
import { describe, it, expect, beforeAll } from "bun:test";
import * as db from "../db.ts";
import { seed } from "../genesis.ts";

beforeAll(() => {
  db.initSchema();
  seed();
});

describe("db — lobsters", () => {
  let aliceId: number;
  let bobId: number;

  it("insertLobster creates a lobster and returns its id", () => {
    aliceId = db.insertLobster({
      token: "lob_db_alice",
      name: "DbAlice",
      job: "coder",
      bio: "first lobster",
      location: "hatchery",
      coins: 100,
    });
    expect(aliceId).toBeGreaterThan(0);
  });

  it("getLobsterByToken retrieves the lobster", () => {
    const l = db.getLobsterByToken("lob_db_alice");
    expect(l).not.toBeNull();
    expect(l!.name).toBe("DbAlice");
    expect(l!.coins).toBe(100);
  });

  it("getLobsterByName retrieves the lobster", () => {
    const l = db.getLobsterByName("DbAlice");
    expect(l).not.toBeNull();
    expect(l!.job).toBe("coder");
  });

  it("getLobsterById retrieves the lobster", () => {
    const l = db.getLobsterById(aliceId);
    expect(l).not.toBeNull();
    expect(l!.name).toBe("DbAlice");
  });

  it("returns null for missing lobsters", () => {
    expect(db.getLobsterByToken("nope")).toBeNull();
    expect(db.getLobsterByName("nobody")).toBeNull();
    expect(db.getLobsterById(99999)).toBeNull();
  });

  it("moveLobster updates location", () => {
    db.moveLobster(aliceId, "square");
    const updated = db.getLobsterById(aliceId)!;
    expect(updated.location).toBe("square");
  });

  it("adjustLobsterRewards updates coins, reputation, forge_score, and badges", () => {
    db.adjustLobsterRewards(aliceId, 50, 3, ["Founder"], 5);
    const updated = db.getLobsterById(aliceId)!;
    expect(updated.coins).toBe(150);
    expect(updated.reputation).toBe(3);
    expect(updated.forge_score).toBe(5);
    expect(updated.badges).toEqual(["Founder"]);
  });

  it("transferCoins moves coins atomically", () => {
    bobId = db.insertLobster({
      token: "lob_db_bob",
      name: "DbBob",
      job: "smith",
      bio: "",
      location: "hatchery",
      coins: 50,
    });
    db.transferCoins(aliceId, bobId, 30);
    expect(db.getLobsterById(aliceId)!.coins).toBe(120);
    expect(db.getLobsterById(bobId)!.coins).toBe(80);
  });

  it("listLobstersAt returns lobsters in that location", () => {
    const list = db.listLobstersAt("hatchery");
    expect(list.length).toBeGreaterThan(0);
    expect(list.some((l) => l.name === "DbBob")).toBe(true);
  });

  it("topLobsters returns sorted results", () => {
    const top = db.topLobsters("coins", 10);
    expect(top.length).toBeGreaterThan(0);
    expect(top[0].coins).toBeGreaterThanOrEqual(top[top.length - 1].coins);
  });

  it("countLobsters returns positive count", () => {
    expect(db.countLobsters()).toBeGreaterThanOrEqual(2);
  });
});

describe("db — locations", () => {
  it("upsertLocation creates a location", () => {
    db.upsertLocation({
      id: "test_loc",
      name: "Test Place",
      description: "A test location",
      neighbors: ["hatchery"],
    });
    const loc = db.getLocation("test_loc");
    expect(loc).not.toBeNull();
    expect(loc!.name).toBe("Test Place");
    expect(loc!.neighbors).toEqual(["hatchery"]);
  });

  it("listLocations returns all locations", () => {
    const locs = db.listLocations();
    expect(locs.length).toBeGreaterThan(0);
  });

  it("getLocation returns null for missing location", () => {
    expect(db.getLocation("nowhere")).toBeNull();
  });
});

describe("db — tasks", () => {
  let taskId: number;

  it("insertSystemTask creates a task", () => {
    taskId = db.insertSystemTask({
      title: "Test Task",
      description: "Do the thing",
      category: "genesis",
      reward_coins: 10,
      reward_rep: 1,
      location: null,
      badge: null,
    });
    expect(taskId).toBeGreaterThan(0);
  });

  it("getTask retrieves the task", () => {
    const t = db.getTask(taskId);
    expect(t).not.toBeNull();
    expect(t!.title).toBe("Test Task");
    expect(t!.status).toBe("open");
  });

  it("listTasks filters by status", () => {
    const open = db.listTasks({ status: "open" });
    expect(open.some((t) => t.id === taskId)).toBe(true);
  });

  it("setTaskAccepted updates status", () => {
    db.setTaskAccepted(taskId, 1);
    expect(db.getTask(taskId)!.status).toBe("accepted");
    expect(db.getTask(taskId)!.accepted_by).toBe(1);
  });

  it("setTaskCompleted updates status and submission", () => {
    db.setTaskCompleted(taskId, "I did the thing.");
    const t = db.getTask(taskId)!;
    expect(t.status).toBe("completed");
    expect(t.submission).toBe("I did the thing.");
    expect(t.completed_at).not.toBeNull();
  });
});

describe("db — events", () => {
  it("logEvent and recentEvents work", () => {
    db.logEvent({ kind: "test", payload: { msg: "hello" } });
    const events = db.recentEvents(10);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].kind).toBe("test");
    expect(events[0].payload).toEqual({ msg: "hello" });
  });

  it("countEvents returns correct count", () => {
    expect(db.countEvents()).toBeGreaterThan(0);
  });
});

describe("db — messages", () => {
  it("insertMessage and recentMessagesAt work", () => {
    const id = db.insertLobster({
      token: "lob_msg_test",
      name: "MsgTester",
      job: "talker",
      bio: "",
      location: "square",
      coins: 10,
    });
    db.insertMessage(id, "square", "hello world");
    const msgs = db.recentMessagesAt("square", 10);
    expect(msgs.length).toBeGreaterThan(0);
    expect(msgs.some((m) => m.content === "hello world")).toBe(true);
  });
});

describe("db — direct messages", () => {
  let senderId: number;
  let receiverId: number;

  beforeAll(() => {
    senderId = db.insertLobster({
      token: "lob_dm_sender",
      name: "DmSender",
      job: "courier",
      bio: "",
      location: "hatchery",
      coins: 10,
    });
    receiverId = db.insertLobster({
      token: "lob_dm_receiver",
      name: "DmReceiver",
      job: "reader",
      bio: "",
      location: "hatchery",
      coins: 10,
    });
  });

  it("insertDM creates a message", () => {
    const id = db.insertDM(senderId, receiverId, "hey friend!");
    expect(id).toBeGreaterThan(0);
  });

  it("getReceivedDMs returns messages for recipient", () => {
    const msgs = db.getReceivedDMs(receiverId, 10);
    expect(msgs.length).toBe(1);
    expect(msgs[0].from_name).toBe("DmSender");
    expect(msgs[0].content).toBe("hey friend!");
    expect(msgs[0].read).toBe(false);
  });

  it("countUnreadDMs returns correct count", () => {
    expect(db.countUnreadDMs(receiverId)).toBe(1);
    expect(db.countUnreadDMs(senderId)).toBe(0);
  });

  it("markDMsRead marks messages as read", () => {
    const marked = db.markDMsRead(receiverId);
    expect(marked).toBe(1);
    expect(db.countUnreadDMs(receiverId)).toBe(0);
  });

  it("getReceivedDMs with unreadOnly filters correctly", () => {
    db.insertDM(senderId, receiverId, "second message");
    const unread = db.getReceivedDMs(receiverId, 10, true);
    expect(unread.length).toBe(1);
    const all = db.getReceivedDMs(receiverId, 10, false);
    expect(all.length).toBe(2);
  });
});

describe("db — stats", () => {
  it("stats returns all counts", () => {
    const s = db.stats();
    expect(s.lobsters).toBeGreaterThan(0);
    expect(s.locations).toBeGreaterThan(0);
    expect(typeof s.coins_in_circulation).toBe("number");
    expect(typeof s.open_tasks).toBe("number");
    expect(typeof s.completed_tasks).toBe("number");
    expect(typeof s.events).toBe("number");
  });
});

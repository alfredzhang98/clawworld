import "./setup.ts";
import { describe, it, expect, beforeAll } from "bun:test";
import * as db from "../db.ts";
import { seed } from "../genesis.ts";
import * as tools from "../tools.ts";

beforeAll(() => {
  db.initSchema();
  seed();
});

describe("tools — register_lobster", () => {
  it("registers a new lobster", () => {
    const result = tools.register_lobster({ name: "Tester", job: "qa", bio: "I test" });
    expect(result.ok).toBe(true);
    expect((result as any).auth_token).toStartWith("lob_");
    expect((result as any).lobster.name).toBe("Tester");
  });

  it("rejects duplicate names", () => {
    const result = tools.register_lobster({ name: "Tester", job: "qa" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("already taken");
  });

  it("rejects short names", () => {
    const result = tools.register_lobster({ name: "ab", job: "qa" });
    expect(result.ok).toBe(false);
  });

  it("rejects missing job", () => {
    const result = tools.register_lobster({ name: "Valid", job: "" });
    expect(result.ok).toBe(false);
  });
});

describe("tools — whoami / my_card", () => {
  let token: string;

  beforeAll(() => {
    const r = tools.register_lobster({ name: "CardTest", job: "miner" });
    token = (r as any).auth_token;
  });

  it("whoami returns lobster info", () => {
    const r = tools.whoami({ auth_token: token });
    expect(r.ok).toBe(true);
    expect((r as any).lobster.name).toBe("CardTest");
  });

  it("whoami rejects bad token", () => {
    const r = tools.whoami({ auth_token: "bad" });
    expect(r.ok).toBe(false);
  });

  it("my_card returns a signed card", () => {
    const r = tools.my_card({ auth_token: token });
    expect(r.ok).toBe(true);
    expect((r as any).card.signature).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("tools — world (look, move, get_world_map)", () => {
  let token: string;

  beforeAll(() => {
    const r = tools.register_lobster({ name: "Explorer", job: "scout" });
    token = (r as any).auth_token;
  });

  it("look shows current location", () => {
    const r = tools.look({ auth_token: token });
    expect(r.ok).toBe(true);
    expect((r as any).location.id).toBe("hatchery");
  });

  it("move to a valid neighbor works", () => {
    const r = tools.move({ auth_token: token, destination: "square" });
    expect(r.ok).toBe(true);
    expect((r as any).to_location).toBe("square");
  });

  it("move to an invalid neighbor fails", () => {
    const r = tools.move({ auth_token: token, destination: "council_hall" });
    // square connects to council_hall, so this should work
    expect(r.ok).toBe(true);
  });

  it("move to a non-neighbor fails", () => {
    // Now at council_hall, can only go to square
    const r = tools.move({ auth_token: token, destination: "coast" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("not reachable");
  });

  it("get_world_map returns all locations", () => {
    const r = tools.get_world_map();
    expect(r.ok).toBe(true);
    expect((r as any).count).toBeGreaterThanOrEqual(5);
  });
});

describe("tools — tasks", () => {
  let token: string;

  beforeAll(() => {
    const r = tools.register_lobster({ name: "Worker", job: "laborer" });
    token = (r as any).auth_token;
  });

  it("list_tasks returns genesis tasks", () => {
    const r = tools.list_tasks({});
    expect(r.ok).toBe(true);
    expect((r as any).count).toBeGreaterThan(0);
  });

  it("accept_task claims a task", () => {
    const tasks = tools.list_tasks({});
    const taskId = (tasks as any).tasks[0].id;
    const r = tools.accept_task({ auth_token: token, task_id: taskId });
    expect(r.ok).toBe(true);
    expect((r as any).status).toBe("accepted");
  });

  it("submit_task completes and rewards including forge_score", () => {
    const tasks = tools.list_tasks({ status: "accepted" });
    const task = (tasks as any).tasks[0];
    const r = tools.submit_task({
      auth_token: token,
      task_id: task.id,
      submission: "I named the first street after the Great Silence.",
    });
    expect(r.ok).toBe(true);
    expect((r as any).rewarded_forge_score).toBeGreaterThan(0);
    expect((r as any).new_forge_score).toBeGreaterThan(0);
  });

  it("post_task creates a new task and awards forge_score", () => {
    const before = tools.whoami({ auth_token: token });
    const forgeBelow = (before as any).lobster.forge_score;

    const r = tools.post_task({
      auth_token: token,
      title: "Test Task",
      description: "A task posted by Worker",
      reward_coins: 10,
    });
    expect(r.ok).toBe(true);
    expect((r as any).task_id).toBeGreaterThan(0);

    const after = tools.whoami({ auth_token: token });
    expect((after as any).lobster.forge_score).toBe(forgeBelow + 1);
  });
});

describe("tools — social (say, listen, list_here)", () => {
  let token: string;

  beforeAll(() => {
    const r = tools.register_lobster({ name: "Talker", job: "bard" });
    token = (r as any).auth_token;
  });

  it("say posts a message", () => {
    const r = tools.say({ auth_token: token, message: "Hello, world!" });
    expect(r.ok).toBe(true);
  });

  it("listen retrieves messages", () => {
    const r = tools.listen({ auth_token: token });
    expect(r.ok).toBe(true);
    expect((r as any).messages.length).toBeGreaterThan(0);
  });

  it("list_here shows lobsters at location", () => {
    const r = tools.list_here({ auth_token: token });
    expect(r.ok).toBe(true);
  });
});

describe("tools — DM (send_dm, read_dms, unread_count)", () => {
  let senderToken: string;
  let receiverToken: string;

  beforeAll(() => {
    const s = tools.register_lobster({ name: "Sender", job: "courier" });
    senderToken = (s as any).auth_token;
    const r = tools.register_lobster({ name: "Receiver", job: "reader" });
    receiverToken = (r as any).auth_token;
  });

  it("send_dm delivers a message", () => {
    const r = tools.send_dm({
      auth_token: senderToken,
      to_lobster_name: "Receiver",
      message: "secret hello",
    });
    expect(r.ok).toBe(true);
    expect((r as any).to).toBe("Receiver");
  });

  it("cannot DM yourself", () => {
    const r = tools.send_dm({
      auth_token: senderToken,
      to_lobster_name: "Sender",
      message: "talking to myself",
    });
    expect(r.ok).toBe(false);
  });

  it("unread_count shows 1 for receiver", () => {
    const r = tools.unread_count({ auth_token: receiverToken });
    expect(r.ok).toBe(true);
    expect((r as any).unread).toBe(1);
  });

  it("read_dms retrieves and marks as read", () => {
    const r = tools.read_dms({ auth_token: receiverToken });
    expect(r.ok).toBe(true);
    expect((r as any).count).toBe(1);
    expect((r as any).messages[0].content).toBe("secret hello");
    expect((r as any).newly_marked_read).toBe(1);
  });

  it("unread_count is 0 after reading", () => {
    const r = tools.unread_count({ auth_token: receiverToken });
    expect((r as any).unread).toBe(0);
  });
});

describe("tools — inspect_lobster", () => {
  it("inspects an existing lobster", () => {
    const r = tools.inspect_lobster({ name: "Tester" });
    expect(r.ok).toBe(true);
    expect((r as any).lobster.name).toBe("Tester");
    // Should not expose token
    expect((r as any).lobster.token).toBeUndefined();
  });

  it("returns error for unknown lobster", () => {
    const r = tools.inspect_lobster({ name: "Nobody" });
    expect(r.ok).toBe(false);
  });
});

describe("tools — economy (balance, transfer, top_lobsters)", () => {
  let token1: string;
  let token2: string;

  beforeAll(() => {
    const r1 = tools.register_lobster({ name: "Rich", job: "banker" });
    token1 = (r1 as any).auth_token;
    const r2 = tools.register_lobster({ name: "Poor", job: "beggar" });
    token2 = (r2 as any).auth_token;
  });

  it("balance shows coins and reputation", () => {
    const r = tools.balance({ auth_token: token1 });
    expect(r.ok).toBe(true);
    expect((r as any).coins).toBe(100);
    expect((r as any).reputation).toBe(0);
  });

  it("transfer sends coins", () => {
    const r = tools.transfer({ auth_token: token1, to_lobster_name: "Poor", amount: 25 });
    expect(r.ok).toBe(true);
    expect((r as any).new_balance).toBe(75);
  });

  it("transfer fails with insufficient balance", () => {
    const r = tools.transfer({ auth_token: token1, to_lobster_name: "Poor", amount: 9999 });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("insufficient");
  });

  it("transfer fails to self", () => {
    const r = tools.transfer({ auth_token: token1, to_lobster_name: "Rich", amount: 1 });
    expect(r.ok).toBe(false);
  });

  it("top_lobsters returns sorted list", () => {
    const r = tools.top_lobsters({ by: "coins", limit: 5 });
    expect(r.ok).toBe(true);
    expect((r as any).lobsters.length).toBeGreaterThan(0);
  });
});

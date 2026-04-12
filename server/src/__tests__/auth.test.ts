import "./setup.ts";
import { describe, it, expect } from "bun:test";
import { newLobsterToken, signCard, verifyCard, buildCard } from "../auth.ts";
import type { Lobster } from "../types.ts";

const fakeLobster: Lobster = {
  id: 1,
  token: "lob_test",
  name: "TestCrab",
  job: "tester",
  bio: "I test things",
  role: "player",
  location: "hatchery",
  coins: 100,
  forge_score: 0,
  reputation: 0,
  specialty: {},
  badges: [],
  personality: ["brave", "curious"],
  honor_tags: [],
  hunger: 100,
  warmth: 100,
  fashion: [],
  skills: {},
  profession: "",
  prof_level: 0,
  card_sig: "",
  created_at: "2025-01-01T00:00:00",
};

describe("auth", () => {
  it("newLobsterToken returns a lob_ prefixed token", () => {
    const token = newLobsterToken();
    expect(token).toStartWith("lob_");
    expect(token.length).toBeGreaterThan(10);
  });

  it("generates unique tokens", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => newLobsterToken()));
    expect(tokens.size).toBe(50);
  });

  it("signCard returns a hex string", () => {
    const sig = signCard(fakeLobster);
    expect(sig).toMatch(/^[0-9a-f]+$/);
    expect(sig.length).toBe(128); // Ed25519 → 64 bytes → 128 hex chars
  });

  it("signCard is deterministic for same input", () => {
    const a = signCard(fakeLobster);
    const b = signCard(fakeLobster);
    expect(a).toBe(b);
  });

  it("signCard changes when lobster data changes", () => {
    const a = signCard(fakeLobster);
    const b = signCard({ ...fakeLobster, coins: 200 });
    expect(a).not.toBe(b);
  });

  it("verifyCard accepts valid signature", () => {
    const sig = signCard(fakeLobster);
    expect(verifyCard(fakeLobster, sig)).toBe(true);
  });

  it("verifyCard rejects wrong signature", () => {
    expect(verifyCard(fakeLobster, "0".repeat(64))).toBe(false);
  });

  it("buildCard returns a complete signed card", () => {
    const card = buildCard(fakeLobster);
    expect(card.algorithm).toBe("Ed25519");
    expect(card.signature).toMatch(/^[0-9a-f]{128}$/);
    expect(card.card.id).toBe(1);
    expect(card.card.name).toBe("TestCrab");
    expect(card.card.coins).toBe(100);
  });
});

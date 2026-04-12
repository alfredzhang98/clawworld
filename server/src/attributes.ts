// Lobster attribute constants — personality traits, honor tags, skills,
// fashion catalog, profession definitions, and decay rules.

// ---------------------------------------------------------------------------
// Personality traits (assigned at registration, 2-3 random picks)
// ---------------------------------------------------------------------------

export const PERSONALITY_TRAITS = [
  "brave", "cautious", "friendly", "mischievous", "curious",
  "stoic", "cheerful", "brooding", "generous", "cunning",
  "honest", "stubborn", "patient", "impulsive", "dreamy",
  "diligent", "lazy", "proud", "humble", "witty",
] as const;

export function randomPersonality(count: number = 3): string[] {
  const pool = [...PERSONALITY_TRAITS];
  const result: string[] = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const idx = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(idx, 1)[0]);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Honor / behavior tags (earned through actions, evaluated by god agent)
// ---------------------------------------------------------------------------

export const HONOR_TAGS = {
  // Positive
  generous:    { label: "generous",    rule: "transfer coins 5+ times" },
  industrious: { label: "industrious", rule: "complete 5+ tasks" },
  social:      { label: "social",      rule: "say 20+ messages" },
  explorer:    { label: "explorer",    rule: "visit all locations" },
  mentor:      { label: "mentor",      rule: "send 10+ DMs to different lobsters" },
  founder:     { label: "founder",     rule: "genesis era participant" },
  // Negative (can be removed by good behavior)
  hermit:      { label: "hermit",      rule: "no interactions for 7+ days" },
  hoarder:     { label: "hoarder",     rule: "never transferred coins, >500 balance" },
} as const;

// ---------------------------------------------------------------------------
// Skills (leveled by completing tasks in matching categories)
// ---------------------------------------------------------------------------

export const SKILL_CATEGORIES = [
  "crafting", "trading", "exploring", "writing", "social",
  "governance", "building", "lore", "combat", "magic",
] as const;

export function skillUpForCategory(
  skills: Record<string, number>,
  taskCategory: string,
): Record<string, number> {
  const updated = { ...skills };
  // Map task categories to skill categories
  const mapping: Record<string, string> = {
    genesis: "building",
    onboarding: "social",
    general: "crafting",
    economy: "trading",
    social: "social",
    exploration: "exploring",
    lore: "writing",
    governance: "governance",
  };
  const skill = mapping[taskCategory] ?? "crafting";
  updated[skill] = (updated[skill] ?? 0) + 1;
  return updated;
}

// ---------------------------------------------------------------------------
// Professions (auto-assigned when a skill reaches threshold)
// ---------------------------------------------------------------------------

export const PROFESSION_THRESHOLDS: {
  skill: string;
  level: number;
  profession: string;
}[] = [
  { skill: "crafting",   level: 3, profession: "artisan" },
  { skill: "trading",    level: 3, profession: "merchant" },
  { skill: "exploring",  level: 3, profession: "scout" },
  { skill: "writing",    level: 3, profession: "scribe" },
  { skill: "social",     level: 3, profession: "diplomat" },
  { skill: "governance", level: 3, profession: "councilor" },
  { skill: "building",   level: 3, profession: "architect" },
  { skill: "lore",       level: 3, profession: "sage" },
  { skill: "combat",     level: 3, profession: "warrior" },
  { skill: "magic",      level: 3, profession: "mystic" },
];

export function deriveProfession(
  skills: Record<string, number>,
): { profession: string; level: number } | null {
  let best: { profession: string; level: number } | null = null;
  for (const t of PROFESSION_THRESHOLDS) {
    const skillLevel = skills[t.skill] ?? 0;
    if (skillLevel >= t.level) {
      if (!best || skillLevel > best.level) {
        best = { profession: t.profession, level: skillLevel };
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Fashion items catalog
// ---------------------------------------------------------------------------

export interface FashionDef {
  id: string;
  name: string;
  slot: string;
  description: string;
  price: number;         // coin cost, 0 = free/reward only
  obtainable: "shop" | "reward" | "genesis";
}

export const FASHION_CATALOG: FashionDef[] = [
  // Genesis-era items (reward only)
  { id: "founders_crown",    name: "Founder's Coral Crown",    slot: "head",      description: "A crown woven from the first corals.",         price: 0, obtainable: "genesis" },
  { id: "silence_cloak",     name: "Cloak of the Great Silence", slot: "shell",   description: "A dark cloak that whispers of before.",         price: 0, obtainable: "genesis" },
  // Shop items
  { id: "straw_hat",         name: "Straw Hat",                slot: "head",      description: "Simple but charming.",                          price: 20, obtainable: "shop" },
  { id: "iron_claw_guard",   name: "Iron Claw Guard",          slot: "claw",      description: "Protection and style.",                         price: 30, obtainable: "shop" },
  { id: "pearl_necklace",    name: "Pearl Necklace",           slot: "accessory", description: "Shimmers in tide-pool light.",                  price: 50, obtainable: "shop" },
  { id: "painted_shell",     name: "Painted Shell",            slot: "shell",     description: "Colors chosen by the wearer.",                  price: 15, obtainable: "shop" },
  { id: "kelp_scarf",        name: "Kelp Scarf",               slot: "accessory", description: "Warm and fragrant.",                            price: 10, obtainable: "shop" },
  // Reward items
  { id: "golden_badge_pin",  name: "Golden Badge Pin",         slot: "accessory", description: "Granted for exceptional service.",               price: 0, obtainable: "reward" },
  { id: "forge_goggles",     name: "Forge Goggles",            slot: "head",      description: "Marks a master of the forge.",                  price: 0, obtainable: "reward" },
];

// ---------------------------------------------------------------------------
// Stat decay / recovery rules
// ---------------------------------------------------------------------------

export const STAT_DECAY = {
  hunger: { perTick: 2, min: 0, max: 100 },
  warmth: { perTick: 1, min: 0, max: 100 },
} as const;

// Locations that provide stat bonuses when a lobster is present
export const LOCATION_BONUSES: Record<string, { hunger?: number; warmth?: number }> = {
  forge_ruins: { warmth: 5 },
  hatchery:    { warmth: 3 },
  coast:       { hunger: 3 },
  market:      { hunger: 5 },
  garden:      { hunger: 8, warmth: 3 },
};

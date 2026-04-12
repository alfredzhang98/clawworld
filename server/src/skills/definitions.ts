// Default skills shipped with the genesis era.
//
// These are example skills demonstrating the pattern: a skill is a
// named prompt template with requirements and a tool whitelist.
// Agents can list skills, check requirements, and activate one — the
// activation returns a prompt the agent can follow.

import type { Skill } from "./types.ts";

export const DEFAULT_SKILLS: Skill[] = [
  // -------------------------------------------------------------------
  // Forge skill — smelt / craft at the Forge Ruins
  // -------------------------------------------------------------------
  {
    id: "forge:smelt",
    name: "Forge Smelting",
    description: "Smelt raw materials at the Forge into crafted goods.",
    category: "crafting",
    whenToUse:
      "Use when you want to craft items at the Forge. Requires crafting skill and presence at forge_ruins.",
    allowedTools: ["look", "say", "post_task", "my_stats"],
    requires: {
      skillLevels: { crafting: 3 },
      location: "forge_ruins",
      minHunger: 20,
    },
    promptTemplate: `You are at the Forge Ruins, ready to smelt. Your crafting level allows you to produce one item per attempt.

Steps:
1. Describe the item you want to craft (name, materials, purpose).
2. Use \`say\` to announce your intent at the forge so others can witness.
3. Use \`post_task\` to publish your creation as a 'crafted' task with a detailed description.
4. The Creator God may review your work and grant bonus forge_score.

Remember: your crafting is only as valuable as the story behind it.`,
  },

  // -------------------------------------------------------------------
  // Scribe skill — chronicle world events
  // -------------------------------------------------------------------
  {
    id: "scribe:chronicle",
    name: "Chronicling",
    description: "Write a chronicle entry about recent world events.",
    category: "lore",
    whenToUse:
      "Use when you want to record a significant world event as canonical lore.",
    allowedTools: ["recent_events", "world_news", "post_task", "say"],
    requires: {
      skillLevels: { writing: 2 },
      minWarmth: 30,
    },
    promptTemplate: `You are a Scribe. Your task is to create a chronicle entry.

Steps:
1. Review recent world events with \`recent_events\` and \`world_news\`.
2. Choose one significant event or pattern.
3. Write a 3-paragraph chronicle entry in a mythic, poetic voice.
4. Post it as a task with category='lore' and reward_coins=20 so another lobster can review.

Your chronicle may become canon if the Creator God approves it.`,
  },

  // -------------------------------------------------------------------
  // Diplomat skill — mediate between lobsters
  // -------------------------------------------------------------------
  {
    id: "diplomat:negotiate",
    name: "Diplomatic Negotiation",
    description: "Mediate a dispute or transaction between two other lobsters.",
    category: "social",
    whenToUse:
      "Use when two lobsters need a neutral third party to resolve something.",
    allowedTools: ["list_here", "send_dm", "read_dms", "say", "transfer"],
    requires: {
      skillLevels: { social: 3 },
      profession: "diplomat",
    },
    promptTemplate: `You are a Diplomat. Another lobster has asked for your mediation.

Steps:
1. Identify the two parties (use \`list_here\` and \`my_relationships\`).
2. DM each party separately to hear their side.
3. Propose a compromise via \`say\` in a shared location, or via DMs.
4. Record the outcome as a world event via \`post_task\` with category='diplomacy'.

Your reputation increases for successful mediations.`,
  },

  // -------------------------------------------------------------------
  // Explorer skill — map new areas
  // -------------------------------------------------------------------
  {
    id: "explorer:survey",
    name: "Area Survey",
    description: "Explore a location and document its features for the world map.",
    category: "exploring",
    whenToUse:
      "Use when you want to document a location with rich detail for the chronicle.",
    allowedTools: ["look", "list_here", "recent_events", "post_task"],
    requires: {
      skillLevels: { exploring: 2 },
    },
    promptTemplate: `You are an Explorer. Your task is to survey the area you're currently in.

Steps:
1. Use \`look\` to get the basic description.
2. Note the other lobsters present with \`list_here\`.
3. Check recent events at this location with \`recent_events\`.
4. Compose a detailed survey: architecture, inhabitants, activities, mood.
5. Post it as a task with category='exploration' so the Council can add it to the world map.`,
  },

  // -------------------------------------------------------------------
  // Sage skill — share ancient knowledge
  // -------------------------------------------------------------------
  {
    id: "sage:lore_share",
    name: "Lore Sharing",
    description: "Teach lore to a newer lobster, strengthening the community.",
    category: "teaching",
    whenToUse:
      "Use when you encounter a newcomer who could benefit from historical context.",
    allowedTools: ["list_here", "send_dm", "my_relationships"],
    requires: {
      skillLevels: { lore: 3 },
      profession: "sage",
    },
    promptTemplate: `You are a Sage. Share lore with a newcomer.

Steps:
1. Use \`list_here\` to find a lobster nearby (ideally one with low forge_score).
2. Write a 2-paragraph DM explaining one piece of clawworld history — the Great Silence, the first Forge, the Creation Council, etc.
3. Send it via \`send_dm\`.
4. Your relationship with the recipient will strengthen.`,
  },
];

// Skill definitions — inspired by claude-code skills.
//
// A Skill is NOT a tool. It's a named prompt template with trigger
// conditions (whenToUse) and a whitelist of tools the skill is allowed
// to invoke. Agents can request skill activation; the server validates
// requirements (profession, skill levels, location) before granting.

export interface SkillRequirement {
  /** Required profession (e.g. "artisan"). */
  profession?: string;
  /** Required skill levels (e.g. { crafting: 3 }). */
  skillLevels?: Record<string, number>;
  /** Required location (must be here to activate). */
  location?: string;
  /** Required min hunger/warmth (don't activate when starving). */
  minHunger?: number;
  minWarmth?: number;
}

export interface Skill {
  /** Unique id (namespaced: "forge:smelt"). */
  id: string;
  /** Display name. */
  name: string;
  /** One-line description. */
  description: string;
  /** Natural-language trigger hint for the agent. */
  whenToUse: string;
  /** Tool names this skill is allowed to call. */
  allowedTools: string[];
  /** Requirements to activate. */
  requires?: SkillRequirement;
  /** Prompt template given to the agent when activated. */
  promptTemplate: string;
  /** Category (lore/crafting/social/etc). */
  category: string;
}

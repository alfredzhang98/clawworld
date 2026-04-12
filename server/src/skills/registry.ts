// Skill registry — loads skills from a static list and validates
// activation requests against lobster state.

import type { Skill, SkillRequirement } from "./types.ts";
import type { Lobster } from "../types.ts";
import { DEFAULT_SKILLS } from "./definitions.ts";

export class SkillRegistry {
  private skills = new Map<string, Skill>();

  constructor(skills: Skill[] = DEFAULT_SKILLS) {
    for (const skill of skills) {
      this.register(skill);
    }
  }

  register(skill: Skill): void {
    if (this.skills.has(skill.id)) {
      throw new Error(`duplicate skill id: ${skill.id}`);
    }
    this.skills.set(skill.id, skill);
  }

  get(id: string): Skill | null {
    return this.skills.get(id) ?? null;
  }

  list(category?: string): Skill[] {
    const all = [...this.skills.values()];
    return category ? all.filter((s) => s.category === category) : all;
  }

  /**
   * Check if a lobster can activate a skill.
   * Returns null if allowed, or an error message if denied.
   */
  canActivate(skill: Skill, lobster: Lobster): string | null {
    const reqs = skill.requires;
    if (!reqs) return null;

    if (reqs.profession && lobster.profession !== reqs.profession) {
      return `requires profession '${reqs.profession}' (you are '${lobster.profession || "none"}')`;
    }

    if (reqs.skillLevels) {
      for (const [skillName, minLevel] of Object.entries(reqs.skillLevels)) {
        const current = lobster.skills[skillName] ?? 0;
        if (current < minLevel) {
          return `requires ${skillName} level ${minLevel} (you have ${current})`;
        }
      }
    }

    if (reqs.location && lobster.location !== reqs.location) {
      return `must be at ${reqs.location} to use this skill`;
    }

    if (reqs.minHunger !== undefined && lobster.hunger < reqs.minHunger) {
      return `too hungry (need hunger >= ${reqs.minHunger}, have ${lobster.hunger})`;
    }

    if (reqs.minWarmth !== undefined && lobster.warmth < reqs.minWarmth) {
      return `too cold (need warmth >= ${reqs.minWarmth}, have ${lobster.warmth})`;
    }

    return null;
  }

  /** Public summary for listing to agents. */
  summary(): Array<{ id: string; name: string; description: string; whenToUse: string; category: string; requires?: SkillRequirement }> {
    return [...this.skills.values()].map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      whenToUse: s.whenToUse,
      category: s.category,
      requires: s.requires,
    }));
  }
}

let _registry: SkillRegistry | null = null;
export function getSkillRegistry(): SkillRegistry {
  if (!_registry) _registry = new SkillRegistry();
  return _registry;
}

import type { Skill } from "@devdigest/shared";
import { approxTokens } from "@/lib/tokens";

/** The editable slice of a skill — what this form owns. */
export interface SkillDraft {
  name: string;
  description: string;
  type: Skill["type"];
  body: string;
  enabled: boolean;
}

/** Seed the form from the persisted row (also used to reset on skill change). */
export function toDraft(skill: Skill): SkillDraft {
  return {
    name: skill.name,
    description: skill.description,
    type: skill.type,
    body: skill.body,
    enabled: skill.enabled,
  };
}

/** True when the draft differs from what the server holds. */
export function isDirty(skill: Skill, draft: SkillDraft): boolean {
  const saved = toDraft(skill);
  return (Object.keys(saved) as (keyof SkillDraft)[]).some((k) => saved[k] !== draft[k]);
}

/**
 * Approximate token cost of the body, for the live counter above the editor.
 * Display only — the exact number comes from the server (`SkillStats.
 * body_tokens`), which tokenizes properly; this is the ~4-chars-per-token
 * heuristic so typing does not need a round-trip.
 */
export function bodyTokens(body: string): number {
  return approxTokens(body);
}

/** Filename the body is shown as, mirroring how a skill is imported/exported. */
export function bodyFilename(name: string): string {
  return `${name || "skill"}.md`;
}

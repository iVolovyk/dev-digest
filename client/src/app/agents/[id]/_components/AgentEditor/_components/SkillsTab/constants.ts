import type { SkillType } from "@devdigest/shared";

/**
 * Badge colour per skill type. Kept here rather than in the UI kit's `CAT` map:
 * these are skill types, not finding categories, and the two vocabularies are
 * unrelated even where a word happens to repeat.
 */
export const TYPE_COLORS: Record<SkillType, string> = {
  rubric: "var(--accent)",
  convention: "var(--ok, #22c55e)",
  security: "var(--danger, #ef4444)",
  custom: "var(--text-muted)",
};

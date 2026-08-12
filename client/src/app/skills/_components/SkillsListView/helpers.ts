import type { Skill } from "@devdigest/shared";
import { DEFAULT_TAB, VALID_TABS } from "../../constants";

/** Case-insensitive filter over a skill's name + description + type. */
export function filterSkills(skills: Skill[], search: string): Skill[] {
  const q = search.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((sk) =>
    `${sk.name} ${sk.description} ${sk.type}`.toLowerCase().includes(q),
  );
}

/** Coerce `?tab=` to a tab the detail panel actually renders. */
export function resolveTab(raw: string | null): string {
  return (VALID_TABS as readonly string[]).includes(raw ?? "") ? raw! : DEFAULT_TAB;
}

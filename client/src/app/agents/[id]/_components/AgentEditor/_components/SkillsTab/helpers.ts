/* Pure joins/derivations for the Skills tab. The link rows are the source of
   truth for order and per-agent enabled; the skill catalog only supplies the
   name/type/body. Kept free of React so the ordering rules are unit-testable. */
import type { AgentSkillLink, Skill } from "@devdigest/shared";
import { approxTokensOf } from "@/lib/tokens";

/**
 * One row of the tab: every skill in the workspace appears, checked or not.
 *
 * `link` is null for a skill this agent has never been given. It still gets a
 * position in the list — the tab is one ordered list of everything, and a
 * checkbox decides which entries reach the prompt.
 */
export interface SkillRow {
  skill: Skill;
  link: AgentSkillLink | null;
  /** Checked AND not switched off globally in the Skills Lab. */
  active: boolean;
}

/**
 * Every skill: linked ones first in `link.order`, then the rest by name.
 *
 * A link whose skill is missing from the catalog (deleted, or not yet fetched)
 * contributes no row — the link is dead weight the server cascades away, and a
 * half-row would be unactionable.
 */
export function buildSkillRows(
  links: readonly AgentSkillLink[] | undefined,
  skills: readonly Skill[] | undefined,
): SkillRow[] {
  const byId = new Map((links ?? []).map((l) => [l.skill_id, l]));
  const rows = (skills ?? []).map((skill) => {
    const link = byId.get(skill.id) ?? null;
    return { skill, link, active: !!link && link.enabled && skill.enabled };
  });
  return rows.sort((a, b) => {
    if (a.link && b.link) return a.link.order - b.link.order;
    if (a.link) return -1;
    if (b.link) return 1;
    return a.skill.name.localeCompare(b.skill.name);
  });
}

/**
 * Approximate tokens these skills add to every run — summed over the bodies
 * that actually reach the prompt (`active`), which is what the agent pays for.
 */
export function attachedTokens(rows: readonly SkillRow[]): number {
  return approxTokensOf(rows.filter((r) => r.active).map((r) => r.skill.body));
}

/**
 * The write payload for the whole list: ordered ids, each with the state it
 * should keep. A globally-disabled skill is sent as its link says, not as
 * `active` — the Skills Lab switch is not this agent's to flip.
 */
export function toLinkState(
  rows: readonly SkillRow[],
): { skill_id: string; enabled: boolean }[] {
  return rows.map((r) => ({ skill_id: r.skill.id, enabled: r.link?.enabled ?? false }));
}

/** Case-insensitive filter over name, description and type. */
export function filterRows(rows: readonly SkillRow[], query: string): SkillRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter(({ skill }) =>
    `${skill.name} ${skill.description} ${skill.type}`.toLowerCase().includes(q),
  );
}

/**
 * Rows with the one at `index` moved one slot in `dir`. Returns the input
 * unchanged at the ends, so a keyboard press at the top or bottom is a no-op
 * rather than a wrap-around.
 */
export function moveRow(
  rows: readonly SkillRow[],
  index: number,
  dir: -1 | 1,
): SkillRow[] {
  const target = index + dir;
  if (index < 0 || index >= rows.length || target < 0 || target >= rows.length) return [...rows];
  const next = [...rows];
  const moved = next[index] as SkillRow;
  next[index] = next[target] as SkillRow;
  next[target] = moved;
  return next;
}

/**
 * Rows with `draggedId` removed and re-inserted at `targetId`'s slot.
 *
 * Insert-at-target, not swap-with-target: dragging row 4 onto row 1 must push
 * 1–3 down, which is what a drag reads as. A swap would leave the dragged row
 * where the target used to be and silently move an unrelated skill.
 * Unknown ids or a drop on itself return the input unchanged.
 */
export function reorderRows(
  rows: readonly SkillRow[],
  draggedId: string,
  targetId: string,
): SkillRow[] {
  const from = rows.findIndex((r) => r.skill.id === draggedId);
  const to = rows.findIndex((r) => r.skill.id === targetId);
  if (from === -1 || to === -1 || from === to) return [...rows];
  const next = [...rows];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as SkillRow);
  return next;
}

/** True when the two lists name the same skills in the same order. */
export function sameOrder(a: readonly SkillRow[], b: readonly SkillRow[]): boolean {
  return (
    a.length === b.length && a.every((row, i) => row.skill.id === (b[i] as SkillRow).skill.id)
  );
}

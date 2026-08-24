import type { DonutSegment } from "@devdigest/ui";
import type { SkillStats } from "@devdigest/shared";
import { CATEGORY_COLORS, NO_VALUE } from "./constants";

/**
 * Accept rate as a percentage — or a dash when nothing has been triaged yet.
 * `null` is "we don't know", which is NOT the same claim as "0%": rendering a
 * zero would read as "every finding was dismissed".
 */
export function formatAcceptRate(rate: number | null): string {
  return rate == null ? NO_VALUE : `${Math.round(rate * 100)}%`;
}

/** Mean tokens per run — dashed out while the skill has never been injected. */
export function formatAvgTokens(avg: number | null): string {
  return avg == null ? NO_VALUE : Math.round(avg).toLocaleString();
}

/**
 * Findings-by-category as donut segments. `value` is a COUNT of findings, not
 * money — the Donut's currency prefix is switched off by its caller.
 */
export function toCategorySegments(by: SkillStats["by_category"]): DonutSegment[] {
  return by.map((row, i) => ({
    label: row.category,
    value: row.count,
    color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] ?? "var(--accent)",
  }));
}

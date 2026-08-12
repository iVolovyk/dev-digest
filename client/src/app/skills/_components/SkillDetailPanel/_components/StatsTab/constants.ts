/** Donut palette for finding categories — CSS vars so it follows the theme. */
export const CATEGORY_COLORS = [
  "var(--accent)",
  "var(--warn)",
  "var(--crit)",
  "var(--ok)",
  "var(--info)",
  "var(--text-muted)",
] as const;

/** Rendered when a nullable metric has no value yet (never "0"). */
export const NO_VALUE = "—";

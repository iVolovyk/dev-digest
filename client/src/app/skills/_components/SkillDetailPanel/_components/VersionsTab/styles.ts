import type { CSSProperties } from "react";
import type { DiffKind } from "./helpers";

const DIFF_COLORS: Record<DiffKind, { color: string; background: string }> = {
  add: { color: "var(--ok)", background: "var(--ok-bg, transparent)" },
  del: { color: "var(--crit)", background: "var(--crit-bg)" },
  same: { color: "var(--text-muted)", background: "transparent" },
};

/** Co-located styles for the skill VersionsTab. */
export const s = {
  wrap: { maxWidth: 820 } satisfies CSSProperties,
  subtitle: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    lineHeight: 1.5,
    margin: "-6px 0 18px",
    maxWidth: 640,
  } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "11px 0",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  version: { fontSize: 13, fontWeight: 600, minWidth: 46 } satisfies CSSProperties,
  when: { fontSize: 12.5, color: "var(--text-muted)", flex: 1 } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  diff: {
    margin: 0,
    padding: "14px 18px",
    maxHeight: "60vh",
    overflow: "auto",
    fontSize: 12.5,
    lineHeight: 1.6,
  } satisfies CSSProperties,
  diffLine: (kind: DiffKind): CSSProperties => ({
    ...DIFF_COLORS[kind],
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    padding: "0 6px",
    borderRadius: 3,
  }),
} as const;

import type { CSSProperties } from "react";

/** Co-located styles for SmartDiffViewer (project convention: CSSProperties,
    not Tailwind — client/INSIGHTS.md 2026-08-09). */
export const s = {
  root: { display: "flex", flexDirection: "column", gap: 22 } satisfies CSSProperties,
  group: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  groupHeader: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    paddingBottom: 2,
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  groupTitle: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.02em",
    textTransform: "uppercase",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  groupSubtitle: { fontSize: 12, color: "var(--text-muted)", flex: 1 } satisfies CSSProperties,
  groupCount: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  files: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
} as const;

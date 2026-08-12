import type { CSSProperties } from "react";

/** Co-located styles for the SkillDetailPanel shell. */
export const s = {
  wrap: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "16px 28px 0",
    flexShrink: 0,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  icon: { color: "var(--accent)", flexShrink: 0 } satisfies CSSProperties,
  name: { fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" } satisfies CSSProperties,
  tabsBar: { marginTop: 14, flexShrink: 0 } satisfies CSSProperties,
  body: { flex: 1, minHeight: 0, overflow: "auto", padding: 28 } satisfies CSSProperties,
} as const;

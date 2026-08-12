import type { CSSProperties } from "react";

/** Co-located styles for SkillCard. */
export const s = {
  card: (active: boolean, enabled: boolean): CSSProperties => ({
    padding: 13,
    borderRadius: 8,
    cursor: "pointer",
    border: "1px solid " + (active ? "var(--border-strong)" : "var(--border)"),
    background: active ? "var(--bg-hover)" : "var(--bg-elevated)",
    opacity: enabled ? 1 : 0.6,
    marginBottom: 9,
  }),
  headerRow: { display: "flex", alignItems: "center", gap: 9 } satisfies CSSProperties,
  iconBox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    background: "var(--accent-bg)",
    color: "var(--accent)",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  } satisfies CSSProperties,
  name: {
    fontSize: 13,
    fontWeight: 600,
    flex: 1,
    minWidth: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  description: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    margin: "8px 0",
    lineHeight: 1.45,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } satisfies CSSProperties,
  metaRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  source: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  vetting: { display: "inline-flex" } satisfies CSSProperties,
} as const;

import type { CSSProperties } from "react";

/** Co-located styles for the skill PreviewTab. */
export const s = {
  wrap: { maxWidth: 820 } satisfies CSSProperties,
  h2: { fontSize: 15, fontWeight: 700 } satisfies CSSProperties,
  subtitle: {
    fontSize: 13,
    color: "var(--text-secondary)",
    margin: "4px 0 18px",
  } satisfies CSSProperties,
  notice: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    fontSize: 12.5,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    background: "var(--warn-bg)",
    border: "1px solid var(--warn)",
    borderRadius: 8,
    padding: "10px 12px",
    marginBottom: 18,
  } satisfies CSSProperties,
  noticeIcon: { color: "var(--warn)", flexShrink: 0, marginTop: 1 } satisfies CSSProperties,
} as const;

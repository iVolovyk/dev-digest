import type { CSSProperties } from "react";

/** Co-located styles for the skill ConfigTab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    marginBottom: 18,
  } satisfies CSSProperties,
  h2: { fontSize: 15, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  enabledLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-secondary)",
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
    marginBottom: 20,
  } satisfies CSSProperties,
  noticeIcon: { color: "var(--warn)", flexShrink: 0, marginTop: 1 } satisfies CSSProperties,
  bodyMeta: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  filename: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  tokens: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  actions: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginTop: 4,
    paddingTop: 18,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
} as const;

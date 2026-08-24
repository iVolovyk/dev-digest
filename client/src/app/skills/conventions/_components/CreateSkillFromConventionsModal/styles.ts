import type { CSSProperties } from "react";

/** Co-located styles for CreateSkillFromConventionsModal. */
export const s = {
  body: { padding: "18px 24px" } satisfies CSSProperties,
  note: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    fontSize: 13,
    color: "var(--text-secondary)",
    background: "var(--accent-bg)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 14px",
    marginBottom: 18,
  } satisfies CSSProperties,
  enabledRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
} as const;

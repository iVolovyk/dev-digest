import type { CSSProperties } from "react";

/** Co-located styles for CreateSkillTab. */
export const s = {
  h2: { fontSize: 15, fontWeight: 700, marginBottom: 16 } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
} as const;

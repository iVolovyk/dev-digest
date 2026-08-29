import type { CSSProperties } from "react";

export const s = {
  /* Intent + Blast Radius sit side by side on a wide viewport and stack below
     ~2×460px — CSS-only responsive (no media query; matches the inline-style
     convention in this package). `align-items: start` keeps the shorter panel
     from stretching to the taller one's height. */
  panelGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(460px, 1fr))",
    gap: 24,
    alignItems: "start",
  } satisfies CSSProperties,
  descriptionBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.55,
  } satisfies CSSProperties,
} as const;

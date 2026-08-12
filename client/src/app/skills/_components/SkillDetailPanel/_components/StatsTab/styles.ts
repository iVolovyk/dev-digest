import type { CSSProperties } from "react";

/** Co-located styles for the skill StatsTab. */
export const s = {
  wrap: { maxWidth: 900, display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  metrics: { display: "flex", gap: 14, flexWrap: "wrap" } satisfies CSSProperties,
  metricCell: {
    flex: "1 1 170px",
    minWidth: 170,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  metricHint: {
    fontSize: 11.5,
    color: "var(--text-muted)",
    lineHeight: 1.45,
    padding: "0 2px",
  } satisfies CSSProperties,
  attribution: {
    fontSize: 11.5,
    color: "var(--text-muted)",
    lineHeight: 1.5,
    maxWidth: 700,
  } satisfies CSSProperties,
  note: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    background: "var(--bg-hover)",
    border: "1px solid var(--border)",
    borderRadius: 7,
    padding: "9px 12px",
  } satisfies CSSProperties,
  agentRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 0",
    borderBottom: "1px solid var(--border)",
    fontSize: 13,
  } satisfies CSSProperties,
  agentLink: {
    color: "var(--text-primary)",
    textDecoration: "none",
    fontWeight: 500,
  } satisfies CSSProperties,
  agentSpacer: { flex: 1 } satisfies CSSProperties,
  openLink: { fontSize: 12.5, color: "var(--accent-text)", textDecoration: "none" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  skeletons: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
} as const;

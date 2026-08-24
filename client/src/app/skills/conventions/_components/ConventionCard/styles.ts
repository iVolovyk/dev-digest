import type { CSSProperties } from "react";

/** Co-located styles for ConventionCard. */
export const s = {
  card: (accepted: boolean): CSSProperties => ({
    padding: 16,
    borderRadius: 8,
    border: "1px solid " + (accepted ? "var(--ok)" : "var(--border)"),
    background: "var(--bg-elevated)",
    marginBottom: 12,
  }),
  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  } satisfies CSSProperties,
  ruleCol: { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 } satisfies CSSProperties,
  rule: { fontSize: 14, fontWeight: 600, fontStyle: "italic" } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, flexShrink: 0 } satisfies CSSProperties,
  evidencePath: {
    display: "block",
    fontSize: 11.5,
    color: "var(--text-muted)",
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "6px 10px",
    marginBottom: 10,
  } satisfies CSSProperties,
  snippet: {
    margin: 0,
    fontSize: 12,
    lineHeight: 1.5,
    background: "var(--bg-canvas, var(--bg-surface))",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "10px 12px",
    overflowX: "auto",
    whiteSpace: "pre",
  } satisfies CSSProperties,
  footerRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  } satisfies CSSProperties,
  confidenceLabel: { fontSize: 12, color: "var(--text-muted)", width: 78 } satisfies CSSProperties,
  confidenceBar: { flex: 1, maxWidth: 220 } satisfies CSSProperties,
  confidencePct: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;

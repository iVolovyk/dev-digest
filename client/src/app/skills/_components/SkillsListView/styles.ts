import type { CSSProperties } from "react";
import { LIST_WIDTH } from "./constants";

/** Co-located styles for the /skills master-detail shell. */
export const s = {
  split: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  list: {
    width: LIST_WIDTH,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
    minHeight: 0,
  } satisfies CSSProperties,
  listHeader: { padding: "16px 16px 12px", flexShrink: 0 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 12 } satisfies CSSProperties,
  h1: { fontSize: 18, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  search: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  searchIcon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  listBody: { flex: 1, overflow: "auto", padding: "0 12px 16px", minHeight: 0 } satisfies CSSProperties,
  skeletons: { display: "flex", flexDirection: "column", gap: 10, paddingTop: 4 } satisfies CSSProperties,
  detail: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  } satisfies CSSProperties,
  detailEmpty: { flex: 1, display: "grid", placeItems: "center" } satisfies CSSProperties,
} as const;

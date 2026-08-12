import type { SkillVersion } from "@devdigest/shared";
import { MAX_DIFF_LINES } from "./constants";

/** Newest version first — the API's order is not guaranteed. */
export function sortNewestFirst(versions: SkillVersion[]): SkillVersion[] {
  return [...versions].sort((a, b) => b.version - a.version);
}

export type DiffKind = "same" | "add" | "del";
export interface DiffLine {
  kind: DiffKind;
  text: string;
}

/**
 * Line-level diff of two skill bodies (LCS backtrack — no diff library, the
 * bodies are a few hundred lines at most). `add`/`del` are relative to
 * `before`: what the current body gained/lost against that version.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");

  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) {
    return [
      ...a.map((text): DiffLine => ({ kind: "del", text })),
      ...b.map((text): DiffLine => ({ kind: "add", text })),
    ];
  }

  const n = a.length;
  const m = b.length;
  // lcs[i][j] = length of the longest common subsequence of a[i..] and b[j..].
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] =
        a[i] === b[j]
          ? lcs[i + 1]![j + 1]! + 1
          : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ kind: "del", text: a[i]! });
      i++;
    } else {
      out.push({ kind: "add", text: b[j]! });
      j++;
    }
  }
  while (i < n) out.push({ kind: "del", text: a[i++]! });
  while (j < m) out.push({ kind: "add", text: b[j++]! });
  return out;
}

/** Human-readable snapshot timestamp; falls back to the raw ISO string. */
export function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

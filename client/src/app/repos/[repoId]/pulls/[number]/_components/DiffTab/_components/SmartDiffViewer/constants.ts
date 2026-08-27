/* SmartDiffViewer constants — the per-role default-open policy, extracted from
   scattered conditionals so the acceptance criteria read as one table
   (smart-diff-plan.md §6c). */
import type { SmartDiffFile, SmartDiffRole } from "@devdigest/shared";
import { AUTO_EXPAND_MAX_LINES } from "@/components/diff-viewer";

/**
 * | Role        | Open by default?                                             |
 * |-------------|--------------------------------------------------------------|
 * | core        | has a finding, OR changed lines ≤ AUTO_EXPAND_MAX_LINES       |
 * | wiring      | has a finding — collapsed otherwise                          |
 * | boilerplate | false, unconditionally — regardless of size or findings      |
 */
export function roleDefaultOpen(role: SmartDiffRole, file: SmartDiffFile): boolean {
  if (role === "boilerplate") return false;
  if (file.finding_lines.length > 0) return true;
  if (role === "wiring") return false;
  return file.additions + file.deletions <= AUTO_EXPAND_MAX_LINES;
}

/** Group render order is fixed by the server; the client renders as received. */
export const ROLE_ICON: Record<SmartDiffRole, "Zap" | "GitBranch" | "Boxes"> = {
  core: "Zap",
  wiring: "GitBranch",
  boilerplate: "Boxes",
};

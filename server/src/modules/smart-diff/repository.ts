import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * `SmartDiffRepository` — the handful of small reads Smart Diff is derived from.
 *
 * Reads `pull_requests` / `pr_files` / `reviews` / `findings` directly through
 * `db/**` rather than depending on `modules/pulls` or `modules/reviews` —
 * siblings don't import each other (R5); a repository is free to read any table
 * (precedent: `modules/intent/repository.ts`, `modules/conventions/repository.ts`).
 *
 * `patch` is deliberately never selected: the classifier is path-only (§3), and
 * not fetching it keeps a 4 000-line lock file's diff out of the response path.
 */

export interface SmartDiffPull {
  id: string;
}

export interface SmartDiffFileRow {
  path: string;
  additions: number;
  deletions: number;
}

export class SmartDiffRepository {
  constructor(private db: Db) {}

  /** Resolve a PR by (workspace, id). Joined on `workspace_id` — the A01/IDOR
   *  control; a PR is never looked up by id alone. */
  async getPull(workspaceId: string, prId: string): Promise<SmartDiffPull | undefined> {
    const [row] = await this.db
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)))
      .limit(1);
    return row;
  }

  /** Changed files for a PR — `{ path, additions, deletions }` only, no `patch`. */
  async filesForPull(prId: string): Promise<SmartDiffFileRow[]> {
    return this.db
      .select({
        path: t.prFiles.path,
        additions: t.prFiles.additions,
        deletions: t.prFiles.deletions,
      })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
  }

  /**
   * Distinct `findings.start_line` values per file path for the PR's latest
   * review of kind `'review'` (by `created_at desc`, `id desc` as a stable
   * tiebreak when two rows share a timestamp) — the same "latest review"
   * semantics the PR list uses for its score ring and severity badges. Empty
   * map when the PR has never been reviewed (the normal case).
   */
  async findingLinesForLatestReview(prId: string): Promise<Map<string, number[]>> {
    const [latest] = await this.db
      .select({ id: t.reviews.id })
      .from(t.reviews)
      .where(and(eq(t.reviews.prId, prId), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt), desc(t.reviews.id))
      .limit(1);

    const out = new Map<string, number[]>();
    if (!latest) return out;

    const rows = await this.db
      .select({ file: t.findings.file, startLine: t.findings.startLine })
      .from(t.findings)
      .where(eq(t.findings.reviewId, latest.id));

    const sets = new Map<string, Set<number>>();
    for (const row of rows) {
      const set = sets.get(row.file) ?? new Set<number>();
      set.add(row.startLine);
      sets.set(row.file, set);
    }
    for (const [file, set] of sets) {
      out.set(file, [...set].sort((a, b) => a - b));
    }
    return out;
  }
}

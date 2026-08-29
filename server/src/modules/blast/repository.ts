import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * `BlastRepository` — the two small reads Blast Radius is derived from.
 *
 * Reads `pull_requests` / `pr_files` directly through `db/**` rather than
 * depending on `modules/pulls` — siblings don't import each other (R5); a
 * repository is free to read any table (precedent: `modules/smart-diff/
 * repository.ts`, `modules/conventions/repository.ts`).
 *
 * It reads EXACTLY these two tables. `symbols` / `references` / `file_rank` /
 * `file_edges` / `file_facts` are repo-intel's read model and are reached only
 * through the facade — querying them here would fork the graph semantics
 * (blast-radius-plan §1).
 *
 * `patch` is never selected: blast is path-only, and not fetching it keeps a
 * 4 000-line lock file's diff out of the response path.
 */

export interface BlastPull {
  id: string;
  repoId: string;
  headSha: string;
}

export class BlastRepository {
  constructor(private db: Db) {}

  /** Resolve a PR by (workspace, id). Joined on `workspace_id` — the A01/IDOR
   *  control; a PR is never looked up by id alone. */
  async getPull(workspaceId: string, prId: string): Promise<BlastPull | undefined> {
    const [row] = await this.db
      .select({
        id: t.pullRequests.id,
        repoId: t.pullRequests.repoId,
        headSha: t.pullRequests.headSha,
      })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)))
      .limit(1);
    return row;
  }

  /** Changed file paths for a PR — no `patch`, no additions/deletions. */
  async changedPaths(prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
    return rows.map((r) => r.path);
  }
}

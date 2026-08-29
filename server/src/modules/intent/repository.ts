import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { MAX_COMMIT_MESSAGES, MAX_DIFF_PATHS } from './constants.js';

/**
 * `IntentContextRepository` — the genuinely-new supporting queries the intent
 * classifier needs that don't already exist anywhere else (user decision
 * 2026-08-25, Risk #9; `pr_intent` itself stays owned by `ReviewRepository`,
 * reached through the local `IntentStore` port in `service.ts`).
 *
 * Reads `pull_requests` / `repos` / `pr_commits` / `pr_files` directly through
 * `db/**` rather than depending on `modules/pulls` or `modules/reviews` —
 * siblings don't import each other (R5); a repository is free to read any
 * table (precedent: `conventions/repository.ts`).
 */

export interface IntentPullContext {
  pr: {
    id: string;
    number: number;
    title: string;
    body: string | null;
    branch: string;
    headSha: string;
  };
  repo: {
    owner: string;
    name: string;
  };
}

export class IntentContextRepository {
  constructor(private db: Db) {}

  async getPullWithRepo(workspaceId: string, prId: string): Promise<IntentPullContext | undefined> {
    const [row] = await this.db
      .select({
        prId: t.pullRequests.id,
        number: t.pullRequests.number,
        title: t.pullRequests.title,
        body: t.pullRequests.body,
        branch: t.pullRequests.branch,
        headSha: t.pullRequests.headSha,
        repoOwner: t.repos.owner,
        repoName: t.repos.name,
      })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!row) return undefined;
    return {
      pr: {
        id: row.prId,
        number: row.number,
        title: row.title,
        body: row.body,
        branch: row.branch,
        headSha: row.headSha,
      },
      repo: { owner: row.repoOwner, name: row.repoName },
    };
  }

  /** Commit messages for a PR, newest first, capped at MAX_COMMIT_MESSAGES. */
  async commitMessages(prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ message: t.prCommits.message })
      .from(t.prCommits)
      .where(eq(t.prCommits.prId, prId))
      .limit(MAX_COMMIT_MESSAGES);
    return rows.map((r) => r.message);
  }

  /** Changed file paths for a PR, capped at MAX_DIFF_PATHS. */
  async prFilePaths(prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId))
      .limit(MAX_DIFF_PATHS);
    return rows.map((r) => r.path);
  }
}

import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionCandidate } from '@devdigest/shared';
import { toConventionDto } from './helpers.js';

/**
 * Conventions data-access. Owns the `conventions` table and, for the one
 * lookup the extraction pipeline needs, reads `repos` directly rather than
 * depending on `modules/repos` (siblings don't import each other — a
 * repository is free to read any table via `db/**`).
 */

export interface RepoRef {
  owner: string;
  name: string;
}

export interface InsertConvention {
  rule: string;
  category: string;
  evidencePath: string | null;
  evidenceSnippet: string | null;
  evidenceStartLine: number | null;
  evidenceEndLine: number | null;
  confidence: number | null;
  accepted: boolean;
}

export interface UpdateConvention {
  rule?: string;
  accepted?: boolean;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  /** `{owner, name}` for the git adapter, scoped to the workspace. */
  async getRepoRef(workspaceId: string, repoId: string): Promise<RepoRef | undefined> {
    const [row] = await this.db
      .select({ owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const rows = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(asc(t.conventions.category), asc(t.conventions.rule));
    return rows.map(toConventionDto);
  }

  /**
   * A re-scan replaces the candidate list rather than accumulating duplicates
   * across runs: one transaction deletes the repo's existing rows, then
   * inserts the freshly-verified set.
   */
  async replaceCandidates(
    workspaceId: string,
    repoId: string,
    values: InsertConvention[],
  ): Promise<ConventionCandidate[]> {
    const rows = await this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)));
      if (values.length === 0) return [];
      return tx
        .insert(t.conventions)
        .values(values.map((v) => ({ ...v, workspaceId, repoId })))
        .returning();
    });
    return rows.map(toConventionDto);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateConvention,
  ): Promise<ConventionCandidate | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
        ...(patch.accepted !== undefined ? { accepted: patch.accepted } : {}),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row ? toConventionDto(row) : undefined;
  }
}

import { and, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { PrIntentRecord } from '@devdigest/shared';
import type { PullRow } from '../../../db/rows.js';

// ---- PR lookup (workspace-scoped) -----------------------------------------

export async function getPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row;
}

export async function getRepo(
  db: Db,
  repoId: string,
): Promise<typeof t.repos.$inferSelect | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

export async function getPrFiles(
  db: Db,
  prId: string,
): Promise<(typeof t.prFiles.$inferSelect)[]> {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
}

/**
 * Record the commit a review just ran against, so the PR list can derive
 * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
 */
export async function markReviewed(db: Db, prId: string, sha: string): Promise<void> {
  await db
    .update(t.pullRequests)
    .set({ lastReviewedSha: sha })
    .where(eq(t.pullRequests.id, prId));
}

// ---- intent -----------------------------------------------------------
//
// `ReviewRepository` remains the sole owner/writer of `pr_intent` (user
// decision 2026-08-25, Risk #9): rather than a second writer in
// `modules/intent/`, these functions were extended in place to the full
// 7-field shape (`confidence`, `risk_areas`, `sources`, `input_hash`,
// `head_sha`, `model`, `computed_at`). `modules/intent/service.ts` reaches
// them through a narrow local `IntentStore` port satisfied structurally by
// `container.reviewRepo` — no sibling-module import (R5).

type PrIntentTableRow = typeof t.prIntent.$inferSelect;

/**
 * The public `PrIntentRecord` contract plus `input_hash` — the staleness
 * cache key is an internal implementation detail, not part of the API
 * response shape, so it is NOT added to the shared Zod contract. Response
 * serialization (`fastify-type-provider-zod`) strips it automatically since
 * `IntentResponse` only declares `PrIntentRecord`'s fields.
 */
export type PrIntentRecordWithHash = PrIntentRecord & { input_hash: string };

function toIntentRecord(row: PrIntentTableRow): PrIntentRecordWithHash {
  return {
    pr_id: row.prId,
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    risk_areas: row.riskAreas,
    confidence: row.confidence as PrIntentRecord['confidence'],
    sources: row.sources as PrIntentRecord['sources'],
    head_sha: row.headSha,
    model: row.model,
    computed_at: row.computedAt.toISOString(),
    input_hash: row.inputHash,
  };
}

/** Values needed to write a `pr_intent` row — everything except `pr_id`/`computed_at`. */
export type UpsertIntentValues = Pick<
  PrIntentRecord,
  'intent' | 'in_scope' | 'out_of_scope' | 'risk_areas' | 'confidence' | 'sources' | 'head_sha' | 'model'
> & {
  /** SHA-256 of every classifier input + prompt version + model; '' ⇒ always stale. */
  input_hash: string;
};

export async function upsertIntent(
  db: Db,
  prId: string,
  values: UpsertIntentValues,
): Promise<PrIntentRecordWithHash> {
  const set = {
    intent: values.intent,
    inScope: values.in_scope,
    outOfScope: values.out_of_scope,
    riskAreas: values.risk_areas,
    confidence: values.confidence,
    sources: values.sources,
    inputHash: values.input_hash,
    headSha: values.head_sha,
    model: values.model,
    computedAt: new Date(),
  };
  const [row] = await db
    .insert(t.prIntent)
    .values({ prId, ...set })
    .onConflictDoUpdate({ target: t.prIntent.prId, set })
    .returning();
  if (!row) throw new Error(`upsertIntent: insert/update for pr ${prId} returned no row`);
  return toIntentRecord(row);
}

export async function getIntent(db: Db, prId: string): Promise<PrIntentRecordWithHash | undefined> {
  const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  return row ? toIntentRecord(row) : undefined;
}

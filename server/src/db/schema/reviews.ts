import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, jsonb, timestamp, doublePrecision, index } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';

// ============================================================ Review & findings

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    prId: uuid('pr_id')
      .notNull()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id'),
    /** The agent_run that produced this review (links the timeline run ↔ review). */
    runId: uuid('run_id'),
    kind: text('kind', { enum: ['summary', 'review'] }).notNull(),
    verdict: text('verdict'),
    summary: text('summary'),
    score: integer('score'),
    model: text('model'),
    createdAt: now(),
  },
  (t) => [index('reviews_pr_idx').on(t.prId)],
);

export const findings = pgTable(
  'findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    file: text('file').notNull(),
    startLine: integer('start_line').notNull(),
    endLine: integer('end_line').notNull(),
    severity: text('severity').notNull(),
    category: text('category').notNull(),
    title: text('title').notNull(),
    rationale: text('rationale').notNull(),
    suggestion: text('suggestion'),
    confidence: doublePrecision('confidence').notNull(),
    kind: text('kind').notNull().default('finding'),
    trifectaComponents: jsonb('trifecta_components').$type<string[]>(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  },
  (t) => [index('findings_review_idx').on(t.reviewId)],
);

export const prIntent = pgTable('pr_intent', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  intent: text('intent').notNull(),
  inScope: jsonb('in_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  outOfScope: jsonb('out_of_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),

  // ---- NEW ----
  /** Short free-text tags, e.g. "Auth surface touched". NOT the heavy `Risk` type. */
  riskAreas: jsonb('risk_areas').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  /** Derived in code from signal presence — never the model's self-report. */
  confidence: text('confidence', { enum: ['high', 'medium', 'low'] })
    .notNull()
    .default('low'),
  /** Which signals actually contributed — the evidence behind `confidence`. */
  sources: jsonb('sources').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  /** SHA-256 of every classifier input + prompt version + model. '' ⇒ always stale. */
  inputHash: text('input_hash').notNull().default(''),
  /** Head commit intent was computed against — display/debug + the client's cheap staleness hint. */
  headSha: text('head_sha'),
  /** Which model produced it (shown in the UI; part of the hash). */
  model: text('model'),
  /**
   * Not `now()` (`_shared.ts`) — that helper hardcodes the column name
   * `created_at`, which would misname this column. Same semantics
   * (timestamptz, defaultNow, notNull), correct column name.
   */
  computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
});

export const prBrief = pgTable('pr_brief', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  json: jsonb('json').notNull(),
});

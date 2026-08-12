import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { Skill, SkillSource, SkillStats, SkillType, SkillVersion } from '@devdigest/shared';
import { DEFAULT_SKILL_DESCRIPTION, INITIAL_SKILL_VERSION, STATS_WINDOW_DAYS } from './constants.js';
import { isBodyChange, toSkillDto, toSkillVersionDto } from './helpers.js';

/**
 * Skills data-access. Owns `skills` + `skill_versions`, and READS `agent_skills`
 * / `run_skills` / `findings` for the stats tab. Workspace-scoped throughout.
 *
 * Returns contract DTOs, never Drizzle rows: `SkillRow` and friends stop here.
 */

import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
export type { SkillRow, SkillVersionRow };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description?: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled?: boolean;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

/** Everything on `SkillStats` that can be answered with SQL alone. */
export type SkillUsageStats = Omit<SkillStats, 'body_tokens'>;

export class SkillsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.name));
    return rows.map(toSkillDto);
  }

  async getById(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.rowById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  /** Delete a skill. Its versions and agent links cascade. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /** Insert a skill AND record version 1 in `skill_versions`. */
  async insert(values: InsertSkill): Promise<Skill> {
    const row = await this.db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(t.skills)
        .values({
          workspaceId: values.workspaceId,
          name: values.name,
          description: values.description ?? DEFAULT_SKILL_DESCRIPTION,
          type: values.type,
          source: values.source,
          body: values.body,
          enabled: values.enabled ?? true,
          version: INITIAL_SKILL_VERSION,
        })
        .returning();
      await this.snapshotBody(tx, inserted!, INITIAL_SKILL_VERSION);
      return inserted!;
    });
    return toSkillDto(row);
  }

  /**
   * Update a skill. ONLY a body change bumps the version and appends a snapshot
   * (see `isBodyChange`); renames and toggles leave the history alone. The
   * update and its snapshot are one transaction — a version row that never
   * arrived would silently break an eval replay.
   */
  async update(workspaceId: string, id: string, patch: UpdateSkill): Promise<Skill | undefined> {
    const existing = await this.rowById(workspaceId, id);
    if (!existing) return undefined;

    const bodyChanged = isBodyChange(existing, patch);
    const nextVersion = bodyChanged ? existing.version + 1 : existing.version;

    const row = await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(t.skills)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.type !== undefined ? { type: patch.type } : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(bodyChanged ? { version: nextVersion } : {}),
        })
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .returning();
      if (bodyChanged && updated) await this.snapshotBody(tx, updated, nextVersion);
      return updated;
    });
    return row ? toSkillDto(row) : undefined;
  }

  private async rowById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /** `tx` keeps the snapshot in the same transaction as the row it describes. */
  private async snapshotBody(tx: DbLike, row: SkillRow, version: number): Promise<void> {
    await tx
      .insert(t.skillVersions)
      .values({ skillId: row.id, version, body: row.body })
      .onConflictDoNothing();
  }

  // ---- skill_versions (immutable body snapshots) --------------------------

  /** Every recorded body of a skill, newest version first. */
  async listVersions(skillId: string): Promise<SkillVersion[]> {
    const rows = await this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
    return rows.map(toSkillVersionDto);
  }

  /** One body snapshot, or undefined when that version was never recorded. */
  async getVersion(skillId: string, version: number): Promise<SkillVersion | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row ? toSkillVersionDto(row) : undefined;
  }

  // ---- stats --------------------------------------------------------------

  /**
   * Usage for one skill over the last 30 days.
   *
   * The run-side numbers come from `run_skills` (what was ACTUALLY injected at
   * run time) rather than from today's `agent_skills` links, because links get
   * re-ordered, toggled and unlinked while history must not move.
   *
   * `body_tokens` is not here: counting tokens needs a tokenizer, which is a
   * port the service holds — the repository only writes SQL.
   */
  async stats(
    workspaceId: string,
    skill: Pick<Skill, 'id' | 'enabled'>,
  ): Promise<SkillUsageStats> {
    const cutoff = new Date(Date.now() - STATS_WINDOW_DAYS * MS_PER_DAY);

    const links = await this.db
      .select({
        id: t.agents.id,
        name: t.agents.name,
        enabled: t.agentSkills.enabled,
      })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(and(eq(t.agentSkills.skillId, skill.id), eq(t.agents.workspaceId, workspaceId)))
      .orderBy(asc(t.agents.name));

    // A skill reaches a prompt only when BOTH switches are on — the skill's own
    // kill switch and the per-agent link.
    const enabledFor = skill.enabled ? links.filter((l) => l.enabled).length : 0;

    const injected = and(
      eq(t.runSkills.skillId, skill.id),
      eq(t.agentRuns.workspaceId, workspaceId),
      gte(t.agentRuns.ranAt, cutoff),
    );

    const [usage] = await this.db
      .select({
        runs: sql<number>`count(*)::int`,
        avgTokens: sql<number | null>`round(avg(${t.runSkills.tokens}))::int`,
      })
      .from(t.runSkills)
      .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.runSkills.runId))
      .where(injected);

    // Findings of the runs this skill was injected into. Correlation, NOT
    // attribution: the model never says which instruction caused which finding.
    const [triage] = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        accepted: sql<number>`(count(*) filter (where ${t.findings.acceptedAt} is not null))::int`,
        dismissed: sql<number>`(count(*) filter (where ${t.findings.dismissedAt} is not null))::int`,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .innerJoin(t.runSkills, eq(t.runSkills.runId, t.reviews.runId))
      .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.runSkills.runId))
      .where(injected);

    const byCategory = await this.db
      .select({
        category: t.findings.category,
        count: sql<number>`count(*)::int`,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .innerJoin(t.runSkills, eq(t.runSkills.runId, t.reviews.runId))
      .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.runSkills.runId))
      .where(injected)
      .groupBy(t.findings.category)
      .orderBy(desc(sql`count(*)`), asc(t.findings.category));

    const triaged = (triage?.accepted ?? 0) + (triage?.dismissed ?? 0);

    return {
      used_by: links.length,
      enabled_for: enabledFor,
      injected_runs_30d: usage?.runs ?? 0,
      avg_tokens: usage?.avgTokens ?? null,
      findings_30d: triage?.total ?? 0,
      accept_rate: triaged > 0 ? (triage?.accepted ?? 0) / triaged : null,
      agents: links.map((l) => ({ id: l.id, name: l.name, enabled: l.enabled })),
      by_category: byCategory.map((r) => ({ category: r.category, count: r.count })),
    };
  }
}

/**
 * The write surface a repository method needs, so a transaction handle can be
 * passed around without leaking `PgTransaction<…>` generics.
 */
type DbLike = Pick<Db, 'insert'>;

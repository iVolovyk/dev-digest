import type { Skill, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';

/**
 * Pure helpers for the skills module — persisted record ⇄ DTO mapping and the
 * version-bump rule. No I/O.
 *
 * The parameter types are declared STRUCTURALLY rather than imported from
 * `db/rows.ts`: a Drizzle row satisfies them, but this file (application ring)
 * never names `$inferSelect`, so the row type stops at `repository.ts`.
 */

/** The persisted `skills` columns the DTO is built from. */
export interface SkillRecord {
  id: string;
  name: string;
  description: string;
  type: string;
  source: string;
  body: string;
  enabled: boolean;
  version: number;
  evidenceFiles: string[] | null;
}

/** The persisted `skill_versions` columns the DTO is built from. */
export interface SkillVersionRecord {
  skillId: string;
  version: number;
  body: string;
  createdAt: Date;
}

/**
 * Map a persisted skill to the public `Skill` DTO.
 *
 * `type`/`source` are cast, not parsed: they are plain `text` columns, and a
 * value written by an older build must still be listable rather than making
 * `GET /skills` throw for the whole workspace. The response schema is the
 * backstop for anything genuinely malformed.
 */
export function toSkillDto(row: SkillRecord): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles,
  };
}

/** Map a persisted body snapshot to the public `SkillVersion` DTO. */
export function toSkillVersionDto(row: SkillVersionRecord): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    created_at: row.createdAt.toISOString(),
  };
}

/** The subset of an update that could bump the version. */
export interface BodyChangePatch {
  body?: string;
}

/**
 * True when a patch actually changes the body.
 *
 * ONLY the body is versioned. `skill_versions` stores bodies, and the reason it
 * exists is eval reproducibility — replaying a past run needs the exact text
 * that was injected, not the label it was filed under. Renaming a skill,
 * retyping it or toggling `enabled` therefore leaves the version alone; a
 * body edit mints a new one. Re-submitting the same body is a no-op, so an
 * autosaving editor cannot inflate the history.
 */
export function isBodyChange(existing: Pick<SkillRecord, 'body'>, patch: BodyChangePatch): boolean {
  return patch.body !== undefined && patch.body !== existing.body;
}

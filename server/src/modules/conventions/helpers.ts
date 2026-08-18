import type { ConventionCandidate } from '@devdigest/shared';

/**
 * Pure helpers for the conventions module — persisted record ⇄ DTO mapping.
 * No I/O. Declared structurally (not imported from `db/rows.ts`) so the
 * application ring never names `$inferSelect`.
 */
export interface ConventionRecord {
  id: string;
  rule: string;
  category: string;
  evidencePath: string | null;
  evidenceSnippet: string | null;
  evidenceStartLine: number | null;
  evidenceEndLine: number | null;
  confidence: number | null;
  accepted: boolean;
}

export function toConventionDto(row: ConventionRecord): ConventionCandidate {
  return {
    id: row.id,
    rule: row.rule,
    category: row.category,
    evidence_path: row.evidencePath,
    evidence_snippet: row.evidenceSnippet,
    evidence_start_line: row.evidenceStartLine,
    evidence_end_line: row.evidenceEndLine,
    confidence: row.confidence,
    accepted: row.accepted,
  };
}

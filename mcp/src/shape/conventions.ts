/**
 * PURE. Convention candidate contract row → compact rule row.
 *
 * Collapses `evidence_path` + `evidence_start_line` + `evidence_end_line` into
 * one `"path:start-end"` string; drops `evidence_snippet` (raw file content,
 * the single largest field) and `id` (nothing here updates a candidate).
 * Sorts accepted first, then by confidence descending.
 */

export interface RawConvention {
  rule: string;
  category: string;
  evidence_path: string | null;
  evidence_start_line: number | null;
  evidence_end_line: number | null;
  confidence: number | null;
  accepted: boolean;
}

export interface CompactConvention {
  rule: string;
  category: string;
  evidence: string | null;
  confidence: number | null;
  accepted: boolean;
}

function joinEvidence(c: RawConvention): string | null {
  if (!c.evidence_path) return null;
  if (c.evidence_start_line == null) return c.evidence_path;
  const end =
    c.evidence_end_line != null && c.evidence_end_line !== c.evidence_start_line
      ? `-${c.evidence_end_line}`
      : '';
  return `${c.evidence_path}:${c.evidence_start_line}${end}`;
}

export function compactConvention(c: RawConvention): CompactConvention {
  return {
    rule: c.rule,
    category: c.category,
    evidence: joinEvidence(c),
    confidence: c.confidence,
    accepted: c.accepted,
  };
}

export function compactConventions(list: RawConvention[]): CompactConvention[] {
  return [...list]
    .sort((a, b) => {
      if (a.accepted !== b.accepted) return a.accepted ? -1 : 1;
      return (b.confidence ?? 0) - (a.confidence ?? 0);
    })
    .map(compactConvention);
}

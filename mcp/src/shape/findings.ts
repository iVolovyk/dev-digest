/**
 * PURE. No fetch, no SDK, no `node:*`. Testable with no network — the property
 * that lets `shape/`'s tests import nothing else.
 *
 * Compacts a review + its findings (principle 3: compact structured response).
 * A 40-finding review goes from tens of thousands of tokens to roughly 3-5k.
 */

export const MAX_FINDINGS = 50;
export const MAX_RATIONALE_CHARS = 600;
export const MAX_SUGGESTION_CHARS = 600;
export const MAX_SUMMARY_CHARS = 1000;

/** critical → warning → suggestion; unknown severities sort last. */
const SEVERITY_RANK: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
};

export interface RawFinding {
  severity: string;
  category: string;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  rationale: string;
  suggestion?: string | null | undefined;
}

export interface CompactFinding {
  severity: string;
  category: string;
  title: string;
  file: string;
  line: number;
  /** Only present when the finding spans more than one line. */
  end_line?: number;
  rationale: string;
  suggestion: string | null;
}

export interface CompactReview {
  verdict: string | null;
  score: number | null;
  summary: string | null;
  findings_count: number;
  findings: CompactFinding[];
  truncated: boolean;
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

function severityRank(severity: string): number {
  return SEVERITY_RANK[severity.toUpperCase()] ?? 3;
}

export function compactFinding(f: RawFinding): CompactFinding {
  const out: CompactFinding = {
    severity: f.severity,
    category: f.category,
    title: f.title,
    file: f.file,
    line: f.start_line,
    rationale: clip(f.rationale, MAX_RATIONALE_CHARS),
    suggestion: f.suggestion != null ? clip(f.suggestion, MAX_SUGGESTION_CHARS) : null,
  };
  if (f.end_line !== f.start_line) out.end_line = f.end_line;
  return out;
}

export interface ReviewLike {
  verdict: string | null;
  score: number | null;
  summary: string | null;
  findings: RawFinding[];
}

export function compactReview(review: ReviewLike): CompactReview {
  const sorted = [...review.findings].sort((a, b) => {
    const bySeverity = severityRank(a.severity) - severityRank(b.severity);
    if (bySeverity !== 0) return bySeverity;
    return a.file.localeCompare(b.file);
  });
  const kept = sorted.slice(0, MAX_FINDINGS);
  return {
    verdict: review.verdict,
    score: review.score,
    summary: review.summary != null ? clip(review.summary, MAX_SUMMARY_CHARS) : null,
    findings_count: review.findings.length,
    findings: kept.map(compactFinding),
    truncated: kept.length < sorted.length,
  };
}

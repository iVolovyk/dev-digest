import type { FindingRecord, Severity } from "@devdigest/shared";

export const SEVERITIES: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

/** Tally a run's findings by severity, for the Timeline's clickable icons. */
export function countBySeverity(findings: FindingRecord[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  return counts;
}

import type { IntentConfidence, IntentSource } from '@devdigest/shared';
import { SUBSTANTIVE_BODY_CHARS } from './constants.js';

/**
 * Deterministic confidence mapping (§1). Confidence is NEVER requested from or
 * returned by the model — the LLM-facing schema has no confidence field at
 * all. It is computed here, in code, from which signals were actually
 * available, mirroring `groundFindings`/`scoreFromFindings`
 * (`reviewer-core/src/review/run.ts`): the headline number is recomputed
 * deterministically, never trusted from a self-report.
 */
export interface ConfidenceSignals {
  /** Trimmed PR description length (0 when absent). */
  bodyLength: number;
  /** A linked issue was fetched and had a non-empty body. */
  linkedIssueResolved: boolean;
  /** At least one linked spec was read and had non-empty content. */
  linkedSpecResolved: boolean;
  /** Any reference (issue / spec / external URL) was detected in the body but
   *  could not be resolved (unresolved fetch, empty file, cross-repo, external). */
  anyReferenceUnresolved: boolean;
  /** The PR's branch name is available (fallback signal). */
  branchAvailable: boolean;
  /** At least one commit message is available (fallback signal). */
  commitsAvailable: boolean;
  /** At least one changed file path is available (fallback signal). */
  diffPathsAvailable: boolean;
}

export interface ConfidenceResult {
  confidence: IntentConfidence;
  sources: IntentSource[];
}

export function computeConfidence(signals: ConfidenceSignals): ConfidenceResult {
  const sources: IntentSource[] = [];
  let points = 0;

  if (signals.bodyLength > 0) {
    points += signals.bodyLength >= SUBSTANTIVE_BODY_CHARS ? 2 : 1;
    sources.push('description');
  }
  if (signals.linkedIssueResolved) {
    points += 2;
    sources.push('linked_issue');
  }
  if (signals.linkedSpecResolved) {
    points += 2;
    sources.push('linked_spec');
  }
  if (signals.anyReferenceUnresolved) {
    points -= 1;
  }
  points = Math.max(points, 0);

  // Indirect fallback signals are recorded in `sources` (the "why" for the
  // UI's confidence-reason line) even though they don't score points — a
  // detected-but-unresolved reference matters more than "we also had commits".
  if (signals.branchAvailable) sources.push('branch');
  if (signals.commitsAvailable) sources.push('commits');
  if (signals.diffPathsAvailable) sources.push('diff_paths');

  const confidence: IntentConfidence = points >= 4 ? 'high' : points >= 2 ? 'medium' : 'low';
  return { confidence, sources };
}

import type { BlastIndexState } from '@devdigest/shared';
import { BLAST_REVERSE_DEPTH, SUMMARY_MAX_CHARS } from './constants.js';

/**
 * PURE. The deterministic `BlastRadius.summary` for the main path — no model
 * call, no `Date.now()`, no randomness. Same inputs → byte-identical output.
 *
 * Always states counts, the index tier, and the depth bound. The second
 * sentence is the CodeRabbit-style disclaimer and is NOT optional: it is how
 * the artifact carries its own uncertainty. The cannot-compute variant names
 * the failing status and the fix, and NEVER contains the substring "no impact".
 */

export interface SummaryInput {
  indexState: BlastIndexState;
  reason?: string | null;
  changedSymbolCount: number;
  changedFileCount: number;
  callerCount: number;
  callerFileCount: number;
  endpointCount: number;
  cronCount: number;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function clamp(text: string): string {
  if (text.length <= SUMMARY_MAX_CHARS) return text;
  return `${text.slice(0, SUMMARY_MAX_CHARS - 1).trimEnd()}…`;
}

export function deterministicSummary(input: SummaryInput): string {
  const { indexState } = input;

  if (indexState === 'degraded' || indexState === 'failed') {
    const why = input.reason ? ` (${input.reason})` : '';
    return clamp(
      `Impact could not be computed — this repository is not fully indexed ` +
        `(status: ${indexState}${why}). Re-index it from the repo's Context page, then reload.`,
    );
  }

  const counts =
    `${plural(input.changedSymbolCount, 'changed symbol')} in ` +
    `${plural(input.changedFileCount, 'file')} · ` +
    `${plural(input.callerCount, 'caller')} across ` +
    `${plural(input.callerFileCount, 'file')} · ` +
    `${plural(input.endpointCount, 'HTTP endpoint')}, ` +
    `${plural(input.cronCount, 'scheduled job')}.`;

  const caveat =
    indexState === 'partial'
      ? `Computed from a partial index and bounded to ${BLAST_REVERSE_DEPTH} import hops — ` +
        `treat an absent dependency as unproven, not disproven.`
      : `Bounded to ${BLAST_REVERSE_DEPTH} import hops — ` +
        `treat an absent dependency as unproven, not disproven.`;

  return clamp(`${counts} ${caveat}`);
}

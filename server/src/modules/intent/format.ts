import type { PrIntentRecord } from '@devdigest/shared';

/**
 * Format a persisted intent record into the plain string `reviewer-core`
 * receives as `ReviewInput.intent` (R6 — the engine never sees the `Intent`
 * object, a DB row, or a fetcher, only a pre-formatted string).
 *
 * Includes an explicit low-confidence caveat line so the reviewer model does
 * not over-trust a weak intent derived from thin documentation.
 */
export function formatIntentForPrompt(record: PrIntentRecord): string {
  const lines: string[] = [`Intent: ${record.intent}`];

  if (record.in_scope.length > 0) {
    lines.push('In scope:');
    lines.push(...record.in_scope.map((s) => `- ${s}`));
  }
  if (record.out_of_scope.length > 0) {
    lines.push('Out of scope:');
    lines.push(...record.out_of_scope.map((s) => `- ${s}`));
  }
  if (record.risk_areas.length > 0) {
    lines.push(`Risk areas: ${record.risk_areas.join(', ')}`);
  }

  if (record.confidence === 'low') {
    lines.push(
      'Note: this intent was derived with LOW confidence (thin documentation — ' +
        'few or no primary signals such as a substantive description, a linked ' +
        'ticket, or a linked spec were available). Treat it as a tentative hint, ' +
        'not a ground truth, and do not let it waive or descope a real finding.',
    );
  }

  return lines.join('\n');
}

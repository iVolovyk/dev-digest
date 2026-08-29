import { describe, expect, it } from 'vitest';
import {
  MAX_FINDINGS,
  MAX_RATIONALE_CHARS,
  compactReview,
  type RawFinding,
} from '../src/shape/findings.js';

function finding(over: Partial<RawFinding> = {}): RawFinding {
  return {
    severity: 'WARNING',
    category: 'bug',
    title: 't',
    file: 'src/a.ts',
    start_line: 10,
    end_line: 10,
    rationale: 'because',
    suggestion: null,
    ...over,
  };
}

describe('compactReview', () => {
  it('projects exactly the compact finding fields', () => {
    const out = compactReview({
      verdict: 'comment',
      score: 80,
      summary: 'ok',
      findings: [finding({ start_line: 3, end_line: 9, suggestion: 'do x' })],
    });
    expect(out.findings[0]).toEqual({
      severity: 'WARNING',
      category: 'bug',
      title: 't',
      file: 'src/a.ts',
      line: 3,
      end_line: 9,
      rationale: 'because',
      suggestion: 'do x',
    });
  });

  it('omits end_line when it equals start_line', () => {
    const out = compactReview({ verdict: null, score: null, summary: null, findings: [finding()] });
    expect(out.findings[0]).not.toHaveProperty('end_line');
  });

  it('orders critical → warning → suggestion, then by file', () => {
    const out = compactReview({
      verdict: null,
      score: null,
      summary: null,
      findings: [
        finding({ severity: 'SUGGESTION', file: 'z.ts' }),
        finding({ severity: 'CRITICAL', file: 'm.ts' }),
        finding({ severity: 'WARNING', file: 'a.ts' }),
      ],
    });
    expect(out.findings.map((f) => f.severity)).toEqual(['CRITICAL', 'WARNING', 'SUGGESTION']);
  });

  it('caps at MAX_FINDINGS and sets truncated', () => {
    const many = Array.from({ length: MAX_FINDINGS + 5 }, (_, i) =>
      finding({ file: `src/f${String(i).padStart(3, '0')}.ts` }),
    );
    const out = compactReview({ verdict: null, score: null, summary: null, findings: many });
    expect(out.findings).toHaveLength(MAX_FINDINGS);
    expect(out.findings_count).toBe(MAX_FINDINGS + 5);
    expect(out.truncated).toBe(true);
  });

  it('truncates an over-long rationale with an ellipsis', () => {
    const out = compactReview({
      verdict: null,
      score: null,
      summary: null,
      findings: [finding({ rationale: 'x'.repeat(MAX_RATIONALE_CHARS + 50) })],
    });
    expect(out.findings[0]!.rationale).toHaveLength(MAX_RATIONALE_CHARS + 1);
    expect(out.findings[0]!.rationale.endsWith('…')).toBe(true);
  });

  it('keeps a 40-finding review under a 20 KB serialized budget (principle 3)', () => {
    const findings = Array.from({ length: 40 }, (_, i) =>
      finding({
        severity: ['CRITICAL', 'WARNING', 'SUGGESTION'][i % 3]!,
        file: `src/module/file-${i}.ts`,
        title: `Finding number ${i} about a real problem in the code`,
        rationale:
          'This is a realistic multi-sentence rationale explaining the issue, why it matters, ' +
          'and what the consequences are if left unfixed. '.repeat(3),
        suggestion: 'Refactor the block to guard the nullable value before dereferencing it.',
      }),
    );
    const out = compactReview({
      verdict: 'request_changes',
      score: 42,
      summary: 'The PR has several issues worth addressing before merge. '.repeat(4),
      findings,
    });
    const bytes = Buffer.byteLength(JSON.stringify(out), 'utf8');
    expect(bytes).toBeLessThan(20_000);
  });
});

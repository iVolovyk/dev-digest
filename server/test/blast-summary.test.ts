import { describe, it, expect } from 'vitest';
import { deterministicSummary, type SummaryInput } from '../src/modules/blast/summary.js';
import { SUMMARY_MAX_CHARS } from '../src/modules/blast/constants.js';

const base: SummaryInput = {
  indexState: 'full',
  changedSymbolCount: 3,
  changedFileCount: 2,
  callerCount: 17,
  callerFileCount: 9,
  endpointCount: 3,
  cronCount: 1,
};

describe('deterministicSummary', () => {
  it('states counts, pluralised, plus the always-present hop-bound caveat', () => {
    const s = deterministicSummary(base);
    expect(s).toContain('3 changed symbols in 2 files');
    expect(s).toContain('17 callers across 9 files');
    expect(s).toContain('3 HTTP endpoints, 1 scheduled job');
    expect(s).toContain('2 import hops');
    expect(s).toContain('unproven, not disproven');
  });

  it('singularises 1', () => {
    const s = deterministicSummary({
      ...base,
      changedSymbolCount: 1,
      changedFileCount: 1,
      callerCount: 1,
      callerFileCount: 1,
      endpointCount: 1,
      cronCount: 1,
    });
    expect(s).toContain('1 changed symbol in 1 file');
    expect(s).toContain('1 caller across 1 file');
    expect(s).toContain('1 HTTP endpoint, 1 scheduled job');
  });

  it('the full variant keeps the hop bound but drops "partial index"', () => {
    const s = deterministicSummary({ ...base, indexState: 'full' });
    expect(s).not.toContain('partial index');
    expect(s).toContain('2 import hops');
  });

  it('the partial variant names the partial index', () => {
    const s = deterministicSummary({ ...base, indexState: 'partial' });
    expect(s).toContain('partial index');
    expect(s).toContain('2 import hops');
  });

  it('cannot-compute names the status and the fix, and never says "no impact"', () => {
    for (const indexState of ['degraded', 'failed'] as const) {
      const s = deterministicSummary({ ...base, indexState, reason: 'no_data' });
      expect(s.toLowerCase()).not.toContain('no impact');
      expect(s).toContain(`status: ${indexState}`);
      expect(s).toContain('Re-index');
    }
  });

  it('clamps to SUMMARY_MAX_CHARS', () => {
    const s = deterministicSummary({
      ...base,
      indexState: 'degraded',
      reason: 'x'.repeat(2000),
    });
    expect(s.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS);
  });
});

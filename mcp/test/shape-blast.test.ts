import { describe, expect, it } from 'vitest';
import { compactBlast, type RawBlast } from '../src/shape/blast.js';

const raw: RawBlast = {
  changed_symbols: [{ name: 'parseToken', file: 'src/auth/token.ts', kind: 'function' }],
  downstream: [
    {
      symbol: 'parseToken',
      callers: [{ name: 'requireAuth', file: 'src/auth/middleware.ts', line: 42 }],
      endpoints_affected: ['POST /login'],
      crons_affected: ['session-sweep'],
      callers_total: 137,
    },
  ],
  summary: 'summary text carrying the caveat',
  index_state: 'partial',
  partial: true,
  reason: 'partial_index',
  summary_generated: false,
};

describe('compactBlast (pure)', () => {
  it('folds {file,line} into "name path:line" and {name,file,kind} into "name (kind) path"', () => {
    const out = compactBlast(raw);
    expect(out.changed_symbols).toEqual(['parseToken (function) src/auth/token.ts']);
    expect(out.downstream[0]!.callers).toEqual(['requireAuth src/auth/middleware.ts:42']);
  });

  it('carries index_state / partial / callers_total / reason through verbatim', () => {
    const out = compactBlast(raw);
    expect(out.index_state).toBe('partial');
    expect(out.partial).toBe(true);
    expect(out.reason).toBe('partial_index');
    expect(out.downstream[0]!.callers_shown).toBe(1);
    expect(out.downstream[0]!.callers_total).toBe(137);
    expect(out.summary).toBe(raw.summary);
  });

  it('an empty downstream produces an empty array, not undefined; null reason survives', () => {
    const out = compactBlast({
      ...raw,
      downstream: [],
      changed_symbols: [],
      reason: null,
    });
    expect(out.downstream).toEqual([]);
    expect(out.changed_symbols).toEqual([]);
    expect(out.reason).toBeNull();
  });
});

import { describe, it, expect, vi } from 'vitest';
import type { LLMProvider } from '@devdigest/shared';
import { BlastRadiusResponse } from '@devdigest/shared';
import { BlastService, type BlastIntel } from '../src/modules/blast/service.js';
import type { BlastPull, BlastRepository } from '../src/modules/blast/repository.js';
import { MAX_CALLERS_PER_SYMBOL } from '../src/modules/blast/constants.js';

/**
 * Hermetic — no Docker, no keys. Judge Blast Radius correctness from this suite
 * plus `blast-summary` / `blast-reverse-dependents`.
 */

type IntelState = Awaited<ReturnType<BlastIntel['getIndexState']>>;
type BlastResultLike = Awaited<ReturnType<BlastIntel['getBlastRadius']>>;
type ReverseLike = Awaited<ReturnType<BlastIntel['getReverseDependents']>>;

const PULL: BlastPull = { id: 'pr-1', repoId: 'repo-1', headSha: 'sha-1' };

interface StubOpts {
  pull?: BlastPull;
  paths?: string[];
  state?: IntelState;
  blast?: Partial<BlastResultLike>;
  reverse?: (file: string) => ReverseLike;
}

function build(opts: StubOpts) {
  const getBlastRadius = vi.fn(
    async (): Promise<BlastResultLike> => ({
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
      factsByFile: {},
      ...opts.blast,
    }),
  );
  const getIndexState = vi.fn(
    async (): Promise<IntelState> => opts.state ?? { status: 'full' },
  );
  const getReverseDependents = vi.fn(
    async (_r: string, files: string[]): Promise<ReverseLike> =>
      opts.reverse
        ? opts.reverse(files[0]!)
        : { dependents: files.map((f) => ({ file: f, depth: 0, endpoints: [], crons: [] })), truncated: false },
  );
  const intel: BlastIntel = { getIndexState, getBlastRadius, getReverseDependents };

  const repo = {
    getPull: async () => ('pull' in opts ? opts.pull : PULL),
    changedPaths: async () => opts.paths ?? ['src/auth/token.ts'],
  } as unknown as BlastRepository;

  return { svc: new BlastService(repo, intel), getBlastRadius, getIndexState, getReverseDependents };
}

describe('BlastService.build — no model call (criterion 6)', () => {
  it('constructor takes exactly two args, neither model-shaped', () => {
    expect(BlastService.length).toBe(2);
  });

  it('a full build never touches an injected LLMProvider spy', async () => {
    let touched = false;
    const throwingLlm = new Proxy(
      {},
      {
        get() {
          touched = true;
          throw new Error('Blast must never call an LLMProvider');
        },
      },
    ) as LLMProvider;
    void throwingLlm; // wired into nothing

    const { svc } = build({
      blast: {
        changedSymbols: [{ file: 'a.ts', name: 'foo', kind: 'function' }],
        callers: [{ file: 'b.ts', symbol: 'bar', viaSymbol: 'foo', line: 5, rank: 1 }],
        factsByFile: { 'b.ts': { endpoints: ['GET /x'], crons: [] } },
      },
    });
    const out = await svc.build('ws-1', 'pr-1');
    expect(touched).toBe(false);
    expect(out.summary_generated).toBe(false);
    expect(() => BlastRadiusResponse.parse(out)).not.toThrow();
  });
});

describe('BlastService.build — the index-state gate (criterion 3 & 5)', () => {
  for (const status of ['degraded', 'failed'] as const) {
    it(`${status} index → getBlastRadius never called, state echoed, cannot-compute summary`, async () => {
      const { svc, getBlastRadius, getReverseDependents } = build({
        state: { status, reason: 'no_data' },
      });
      const out = await svc.build('ws-1', 'pr-1');
      expect(getBlastRadius).not.toHaveBeenCalled();
      expect(getReverseDependents).not.toHaveBeenCalled();
      expect(out.index_state).toBe(status);
      expect(out.partial).toBe(true);
      expect(out.changed_symbols).toEqual([]);
      expect(out.downstream).toEqual([]);
      expect(out.summary.toLowerCase()).not.toContain('no impact');
      expect(out.summary).toContain('Re-index');
      expect(() => BlastRadiusResponse.parse(out)).not.toThrow();
    });
  }

  it('a missing index row (synthesised degraded) is gated out too', async () => {
    const { svc, getBlastRadius } = build({
      state: { status: 'degraded', degraded: true, degradedReason: 'no_data' },
    });
    const out = await svc.build('ws-1', 'pr-1');
    expect(getBlastRadius).not.toHaveBeenCalled();
    expect(out.index_state).toBe('degraded');
  });

  it('partial index is allowed through and labelled', async () => {
    const { svc, getBlastRadius } = build({
      state: { status: 'partial' },
      blast: { changedSymbols: [{ file: 'a.ts', name: 'foo', kind: 'function' }], callers: [] },
    });
    const out = await svc.build('ws-1', 'pr-1');
    expect(getBlastRadius).toHaveBeenCalledOnce();
    expect(out.index_state).toBe('partial');
    expect(out.partial).toBe(true);
    expect(out.reason).toBe('partial_index');
  });
});

describe('BlastService.build — flat → grouped reshape (§6a)', () => {
  it('callers land under the right viaSymbol; a no-downstream symbol is omitted from downstream', async () => {
    const { svc } = build({
      blast: {
        changedSymbols: [
          { file: 'a.ts', name: 'used', kind: 'function' },
          { file: 'a.ts', name: 'unused', kind: 'function' },
        ],
        callers: [
          { file: 'x.ts', symbol: 'cx', viaSymbol: 'used', line: 1, rank: 3 },
          { file: 'y.ts', symbol: 'cy', viaSymbol: 'used', line: 2, rank: 1 },
        ],
        factsByFile: {},
      },
    });
    const out = await svc.build('ws-1', 'pr-1');
    expect(out.changed_symbols.map((s) => s.name).sort()).toEqual(['unused', 'used']);
    expect(out.downstream).toHaveLength(1);
    expect(out.downstream[0]!.symbol).toBe('used');
    expect(out.downstream[0]!.callers.map((c) => c.name)).toEqual(['cx', 'cy']);
    expect(out.downstream[0]!.callers_total).toBe(2);
  });

  it('re-caps callers PER symbol at MAX_CALLERS_PER_SYMBOL, reporting the true total', async () => {
    const callers = Array.from({ length: 30 }, (_, i) => ({
      file: `c${i}.ts`,
      symbol: `s${i}`,
      viaSymbol: 'hot',
      line: i,
      rank: 30 - i,
    }));
    const { svc } = build({
      blast: {
        changedSymbols: [{ file: 'a.ts', name: 'hot', kind: 'function' }],
        callers,
        factsByFile: {},
      },
    });
    const out = await svc.build('ws-1', 'pr-1');
    expect(out.downstream[0]!.callers).toHaveLength(MAX_CALLERS_PER_SYMBOL);
    expect(out.downstream[0]!.callers_total).toBe(30);
    expect(out.partial).toBe(true);
    expect(out.reason).toBe('caller_cap');
  });

  it('crons_affected is populated from factsByFile + reverse dependents, and is [] not undefined when empty', async () => {
    const { svc } = build({
      blast: {
        changedSymbols: [{ file: 'a.ts', name: 'foo', kind: 'function' }],
        callers: [{ file: 'b.ts', symbol: 'bar', viaSymbol: 'foo', line: 1, rank: 1 }],
        factsByFile: { 'b.ts': { endpoints: [], crons: ['nightly'] } },
      },
      reverse: (file) => ({
        dependents: [
          { file, depth: 0, endpoints: ['GET /a'], crons: [] },
          { file: 'route.ts', depth: 1, endpoints: ['POST /login'], crons: ['weekly'] },
        ],
        truncated: false,
      }),
    });
    const out = await svc.build('ws-1', 'pr-1');
    const d = out.downstream[0]!;
    expect(d.crons_affected).toEqual(['nightly', 'weekly']);
    expect(d.endpoints_affected).toEqual(['GET /a', 'POST /login']);

    const { svc: svc2 } = build({
      blast: {
        changedSymbols: [{ file: 'a.ts', name: 'foo', kind: 'function' }],
        callers: [{ file: 'b.ts', symbol: 'bar', viaSymbol: 'foo', line: 1, rank: 1 }],
        factsByFile: { 'b.ts': { endpoints: ['GET /x'], crons: [] } },
      },
    });
    const out2 = await svc2.build('ws-1', 'pr-1');
    expect(out2.downstream[0]!.crons_affected).toEqual([]);
  });

  it('endpoint attribution is deduped', async () => {
    const { svc } = build({
      blast: {
        changedSymbols: [{ file: 'a.ts', name: 'foo', kind: 'function' }],
        callers: [
          { file: 'b.ts', symbol: 'b1', viaSymbol: 'foo', line: 1, rank: 2 },
          { file: 'c.ts', symbol: 'c1', viaSymbol: 'foo', line: 1, rank: 1 },
        ],
        factsByFile: {
          'b.ts': { endpoints: ['GET /shared'], crons: [] },
          'c.ts': { endpoints: ['GET /shared'], crons: [] },
        },
      },
    });
    const out = await svc.build('ws-1', 'pr-1');
    expect(out.downstream[0]!.endpoints_affected).toEqual(['GET /shared']);
  });
});

describe('BlastService.build — edge cases', () => {
  it('a PR with zero pr_files → an empty-but-valid BlastRadius, not a throw', async () => {
    const { svc } = build({ paths: [] });
    const out = await svc.build('ws-1', 'pr-1');
    expect(out.changed_symbols).toEqual([]);
    expect(out.downstream).toEqual([]);
    expect(out.index_state).toBe('full');
    expect(() => BlastRadiusResponse.parse(out)).not.toThrow();
  });

  it('a PR not in the workspace → NotFoundError (A01/IDOR)', async () => {
    const { svc } = build({ pull: undefined });
    await expect(svc.build('ws-1', 'pr-x')).rejects.toThrow(/not found/i);
  });

  it('summary_generated is false on every main-path response', async () => {
    const { svc } = build({
      blast: { changedSymbols: [{ file: 'a.ts', name: 'foo', kind: 'function' }], callers: [] },
    });
    const out = await svc.build('ws-1', 'pr-1');
    expect(out.summary_generated).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import type { RepoIntelRepository } from '../src/modules/repo-intel/repository.js';
import { MAX_REVERSE_DEPENDENTS } from '../src/modules/repo-intel/constants.js';

/**
 * Hermetic — no Postgres, no clone. `getReverseDependents` (the §4 walk of
 * `server/specs/blast-radius-plan.md`) exercised against a stubbed repository.
 */

interface StubOpts {
  flag?: boolean;
  /** importer adjacency: to_file → [from_file, …] (reverse graph). */
  importers?: Record<string, string[]>;
  facts?: Record<string, { endpoints: string[]; crons: string[] }>;
}

function buildService(opts: StubOpts): {
  svc: RepoIntelService;
  importerCalls: string[][];
} {
  const importerCalls: string[][] = [];
  const container = { config: { repoIntelEnabled: opts.flag ?? true }, db: {} } as never;
  const svc = new RepoIntelService(container);
  const repo: Partial<RepoIntelRepository> = {
    async getImportersOf(_repoId: string, files: string[]) {
      importerCalls.push(files);
      const out = new Set<string>();
      for (const f of files) for (const imp of opts.importers?.[f] ?? []) out.add(imp);
      return [...out];
    },
    async getFileFacts(_repoId: string, files: string[]) {
      return files
        .filter((f) => opts.facts?.[f])
        .map((f) => ({ filePath: f, ...opts.facts![f]! }));
    },
  };
  (svc as unknown as { repo: Partial<RepoIntelRepository> }).repo = repo;
  return { svc, importerCalls };
}

describe('RepoIntelService.getReverseDependents', () => {
  it('degrades (never throws) when the flag is off', async () => {
    const { svc } = buildService({ flag: false });
    const res = await svc.getReverseDependents('r1', ['a.ts'], 2);
    expect(res).toEqual({ dependents: [], truncated: false, degraded: true, reason: 'flag_off' });
  });

  it('empty input → empty result, no query', async () => {
    const { svc, importerCalls } = buildService({});
    const res = await svc.getReverseDependents('r1', [], 2);
    expect(res).toEqual({ dependents: [], truncated: false });
    expect(importerCalls).toHaveLength(0);
  });

  it('includes depth-0 rows with the changed file\'s own file_facts', async () => {
    const { svc } = buildService({
      importers: {},
      facts: { 'src/routes/login.ts': { endpoints: ['POST /login'], crons: [] } },
    });
    const res = await svc.getReverseDependents('r1', ['src/routes/login.ts'], 2);
    expect(res.dependents).toEqual([
      { file: 'src/routes/login.ts', depth: 0, endpoints: ['POST /login'], crons: [] },
    ]);
  });

  it('reaches depth 1 and 2 but not depth 3, and makes exactly two getImportersOf calls', async () => {
    const { svc, importerCalls } = buildService({
      importers: {
        'src/auth/token.ts': ['src/auth/middleware.ts'], // depth 1
        'src/auth/middleware.ts': ['src/routes/login.ts'], // depth 2
        'src/routes/login.ts': ['src/app.ts'], // depth 3 — must NOT appear
      },
      facts: {
        'src/auth/middleware.ts': { endpoints: [], crons: ['nightly-refresh'] },
        'src/routes/login.ts': { endpoints: ['POST /login'], crons: [] },
      },
    });
    const res = await svc.getReverseDependents('r1', ['src/auth/token.ts'], 2);
    const byDepth = Object.fromEntries(res.dependents.map((d) => [d.file, d.depth]));
    expect(byDepth).toEqual({
      'src/auth/token.ts': 0,
      'src/auth/middleware.ts': 1,
      'src/routes/login.ts': 2,
    });
    expect(res.dependents.find((d) => d.file === 'src/routes/login.ts')?.endpoints).toEqual([
      'POST /login',
    ]);
    expect(importerCalls).toHaveLength(2);
    expect(res.truncated).toBe(false);
  });

  it('terminates on a cycle a → b → a', async () => {
    const { svc } = buildService({
      importers: { 'a.ts': ['b.ts'], 'b.ts': ['a.ts'] },
    });
    const res = await svc.getReverseDependents('r1', ['a.ts'], 2);
    expect(res.dependents.map((d) => d.file).sort()).toEqual(['a.ts', 'b.ts']);
    expect(res.truncated).toBe(false);
  });

  it('clips the frontier at MAX_REVERSE_DEPENDENTS and flags truncated', async () => {
    const many = Array.from({ length: MAX_REVERSE_DEPENDENTS + 50 }, (_, i) => `dep-${i}.ts`);
    const { svc } = buildService({ importers: { 'hub.ts': many } });
    const res = await svc.getReverseDependents('r1', ['hub.ts'], 2);
    expect(res.truncated).toBe(true);
    expect(res.dependents.length).toBe(MAX_REVERSE_DEPENDENTS);
  });

  it('clamps depth above BFS_DEPTH to BFS_DEPTH', async () => {
    const { svc, importerCalls } = buildService({
      importers: { 'a.ts': ['b.ts'], 'b.ts': ['c.ts'], 'c.ts': ['d.ts'] },
    });
    await svc.getReverseDependents('r1', ['a.ts'], 9);
    expect(importerCalls).toHaveLength(2);
  });
});

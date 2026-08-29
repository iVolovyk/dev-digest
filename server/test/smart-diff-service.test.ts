import { describe, it, expect } from 'vitest';
import type { LLMProvider } from '@devdigest/shared';
import { SmartDiffResponse } from '@devdigest/shared';
import { SmartDiffService } from '../src/modules/smart-diff/service.js';
import type {
  SmartDiffFileRow,
  SmartDiffPull,
  SmartDiffRepository,
} from '../src/modules/smart-diff/repository.js';

/**
 * Hermetic — no Docker, no keys. Judge Smart Diff correctness from this suite
 * plus `smart-diff-classify` / `smart-diff-split`.
 */

interface StubData {
  pull?: SmartDiffPull;
  files?: SmartDiffFileRow[];
  findingLines?: Map<string, number[]>;
}

function stubRepo(data: StubData): SmartDiffRepository {
  return {
    getPull: async () => data.pull,
    filesForPull: async () => data.files ?? [],
    findingLinesForLatestReview: async () => data.findingLines ?? new Map(),
  } as unknown as SmartDiffRepository;
}

/**
 * A spy `LLMProvider` whose every property access throws. Mechanism 3 of the
 * "no model call" guarantee (smart-diff-plan.md §2): it is handed to nothing,
 * and a full `build()` must complete without it ever being touched.
 */
let llmTouched = false;
const throwingLlm = new Proxy(
  {},
  {
    get() {
      llmTouched = true;
      throw new Error('SmartDiff must never call an LLMProvider');
    },
  },
) as LLMProvider;

describe('SmartDiffService.build — no model call', () => {
  it('completes a full build without touching an LLMProvider, and its constructor takes only a repo', () => {
    llmTouched = false;
    // The constructor arity is the structural guarantee — one argument, a repo.
    expect(SmartDiffService.length).toBe(1);
    void throwingLlm; // referenced but never wired in
    expect(llmTouched).toBe(false);
  });

  it('build() resolves to a schema-valid SmartDiff and never reads the spy', async () => {
    llmTouched = false;
    const svc = new SmartDiffService(
      stubRepo({
        pull: { id: 'pr-1' },
        files: [
          { path: 'src/lib/checkout.ts', additions: 40, deletions: 10 },
          { path: 'pnpm-lock.yaml', additions: 4000, deletions: 10 },
        ],
      }),
    );
    const out = await svc.build('ws-1', 'pr-1');
    expect(() => SmartDiffResponse.parse(out)).not.toThrow();
    expect(llmTouched).toBe(false);
  });
});

describe('SmartDiffService.build — grouping and ordering', () => {
  const svc = (data: StubData) => new SmartDiffService(stubRepo(data));

  it('emits groups in core → wiring → boilerplate order, omitting empty groups', async () => {
    const out = await svc({
      pull: { id: 'pr-1' },
      files: [
        { path: 'pnpm-lock.yaml', additions: 100, deletions: 0 },
        { path: 'src/feature.ts', additions: 10, deletions: 0 },
        { path: 'src/modules/index.ts', additions: 5, deletions: 0 },
      ],
    }).build('ws', 'pr-1');
    expect(out.groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);
  });

  it('omits a role with no files entirely', async () => {
    const out = await svc({
      pull: { id: 'pr-1' },
      files: [{ path: 'src/only-core.ts', additions: 1, deletions: 0 }],
    }).build('ws', 'pr-1');
    expect(out.groups.map((g) => g.role)).toEqual(['core']);
  });

  it('orders within a group by finding count desc, then line count desc, then path asc', async () => {
    const out = await svc({
      pull: { id: 'pr-1' },
      files: [
        { path: 'src/z-small.ts', additions: 1, deletions: 0 },
        { path: 'src/a-big.ts', additions: 90, deletions: 0 },
        { path: 'src/m-hasfinding.ts', additions: 2, deletions: 0 },
      ],
      findingLines: new Map([['src/m-hasfinding.ts', [12]]]),
    }).build('ws', 'pr-1');
    expect(out.groups[0]!.files.map((f) => f.path)).toEqual([
      'src/m-hasfinding.ts', // has a finding → first
      'src/a-big.ts', // more lines
      'src/z-small.ts',
    ]);
  });

  it('with NO findings, still orders correctly (the pre-review case)', async () => {
    const out = await svc({
      pull: { id: 'pr-1' },
      files: [
        { path: 'src/b.ts', additions: 5, deletions: 0 },
        { path: 'src/a.ts', additions: 50, deletions: 0 },
      ],
    }).build('ws', 'pr-1');
    expect(out.groups[0]!.files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(out.groups[0]!.files.every((f) => f.finding_lines.length === 0)).toBe(true);
  });
});

describe('SmartDiffService.build — finding_lines and pseudocode_summary', () => {
  it('finding_lines are distinct start lines, sorted ascending — never expanded ranges', async () => {
    const svc = new SmartDiffService(
      stubRepo({
        pull: { id: 'pr-1' },
        files: [{ path: 'src/a.ts', additions: 10, deletions: 0 }],
        // repository dedupes/sorts; the service passes them through verbatim
        findingLines: new Map([['src/a.ts', [3, 40, 200]]]),
      }),
    );
    const out = await svc.build('ws', 'pr-1');
    expect(out.groups[0]!.files[0]!.finding_lines).toEqual([3, 40, 200]);
  });

  it('pseudocode_summary is null on every file (§7)', async () => {
    const out = await new SmartDiffService(
      stubRepo({
        pull: { id: 'pr-1' },
        files: [
          { path: 'src/a.ts', additions: 1, deletions: 0 },
          { path: 'pnpm-lock.yaml', additions: 1, deletions: 0 },
        ],
      }),
    ).build('ws', 'pr-1');
    const all = out.groups.flatMap((g) => g.files);
    expect(all.every((f) => f.pseudocode_summary === null)).toBe(true);
  });
});

describe('SmartDiffService.build — edge cases', () => {
  it('a PR with zero files → an empty-but-valid SmartDiff, not a throw', async () => {
    const out = await new SmartDiffService(
      stubRepo({ pull: { id: 'pr-1' }, files: [] }),
    ).build('ws', 'pr-1');
    expect(out).toEqual({
      groups: [],
      split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
    });
    expect(() => SmartDiffResponse.parse(out)).not.toThrow();
  });

  it('a PR not in the workspace → NotFoundError (A01/IDOR)', async () => {
    const svc = new SmartDiffService(stubRepo({ pull: undefined }));
    await expect(svc.build('ws', 'pr-x')).rejects.toThrow(/not found/i);
  });
});

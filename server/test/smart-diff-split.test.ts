import { describe, it, expect } from 'vitest';
import { computeSplitSuggestion, type ClassifiedFile } from '../src/modules/smart-diff/split.js';
import { SPLIT_TOO_BIG_LINES } from '../src/modules/smart-diff/constants.js';

const f = (
  path: string,
  additions: number,
  deletions: number,
  role: ClassifiedFile['role'],
): ClassifiedFile => ({ path, additions, deletions, role });

describe('computeSplitSuggestion — total_lines excludes boilerplate', () => {
  it('a 4 000-line lock file plus 50 core lines → total_lines 50, not too_big', () => {
    const res = computeSplitSuggestion([
      f('pnpm-lock.yaml', 3000, 1000, 'boilerplate'),
      f('src/lib/checkout.ts', 30, 20, 'core'),
    ]);
    expect(res.total_lines).toBe(50);
    expect(res.too_big).toBe(false);
  });

  it('wiring lines DO count toward total_lines', () => {
    const res = computeSplitSuggestion([
      f('src/lib/a.ts', 100, 0, 'core'),
      f('src/modules/index.ts', 50, 0, 'wiring'),
    ]);
    expect(res.total_lines).toBe(150);
  });
});

describe('computeSplitSuggestion — the 400-line boundary', () => {
  it(`exactly ${SPLIT_TOO_BIG_LINES} lines is NOT too_big`, () => {
    expect(
      computeSplitSuggestion([f('src/a.ts', SPLIT_TOO_BIG_LINES, 0, 'core')]).too_big,
    ).toBe(false);
  });

  it(`${SPLIT_TOO_BIG_LINES + 1} lines IS too_big`, () => {
    expect(
      computeSplitSuggestion([f('src/a.ts', SPLIT_TOO_BIG_LINES + 1, 0, 'core')]).too_big,
    ).toBe(true);
  });
});

describe('computeSplitSuggestion — proposed_splits', () => {
  it('buckets counted files by directory prefix at depth 2, largest first', () => {
    const res = computeSplitSuggestion([
      f('server/src/a.ts', 10, 0, 'core'),
      f('server/src/b.ts', 200, 0, 'core'),
      f('client/src/x.tsx', 40, 0, 'core'),
      f('client/src/y.tsx', 40, 0, 'core'),
    ]);
    expect(res.proposed_splits.map((s) => s.name)).toEqual(['server/src', 'client/src']);
    expect(res.proposed_splits[0]!.files).toEqual(['server/src/a.ts', 'server/src/b.ts']);
  });

  it('drops buckets with fewer than 2 files, and returns [] when fewer than 2 buckets survive', () => {
    const res = computeSplitSuggestion([
      f('server/src/a.ts', 500, 0, 'core'),
      f('server/src/b.ts', 300, 0, 'core'),
      f('client/src/only.tsx', 100, 0, 'core'),
    ]);
    expect(res.too_big).toBe(true);
    expect(res.proposed_splits).toEqual([]);
  });

  it('boilerplate files are never bucketed into a split', () => {
    const res = computeSplitSuggestion([
      f('vendor/a.js', 100, 0, 'boilerplate'),
      f('vendor/b.js', 100, 0, 'boilerplate'),
      f('server/src/a.ts', 300, 0, 'core'),
      f('server/src/b.ts', 300, 0, 'core'),
      f('client/src/x.tsx', 200, 0, 'core'),
      f('client/src/y.tsx', 200, 0, 'core'),
    ]);
    const names = res.proposed_splits.map((s) => s.name);
    expect(names).toEqual(['server/src', 'client/src']);
    expect(names).not.toContain('vendor');
  });

  it('caps proposed_splits at MAX_PROPOSED_SPLITS (4)', () => {
    const files: ClassifiedFile[] = [];
    for (const dir of ['a/x', 'b/x', 'c/x', 'd/x', 'e/x', 'f/x']) {
      files.push(f(`${dir}/one.ts`, 50, 0, 'core'), f(`${dir}/two.ts`, 50, 0, 'core'));
    }
    expect(computeSplitSuggestion(files).proposed_splits).toHaveLength(4);
  });
});

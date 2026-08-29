import type { ProposedSplit, SmartDiffRole } from '@devdigest/shared';
import {
  MAX_PROPOSED_SPLITS,
  MIN_SPLIT_BUCKETS,
  MIN_SPLIT_GROUP_FILES,
  SPLIT_COUNTED_ROLES,
  SPLIT_GROUP_PATH_DEPTH,
  SPLIT_TOO_BIG_LINES,
} from './constants.js';

/**
 * `split_suggestion` — pure. `total_lines` counts `core` + `wiring` files only
 * (a 4 000-line lock file makes a PR large on disk and unchanged in review
 * effort — smart-diff-plan.md §5). `proposed_splits` buckets the counted files
 * by directory prefix and degrades to `[]` rather than guessing when a change
 * does not decompose cleanly. Control flow only — thresholds live in
 * `constants.ts`.
 */

export interface ClassifiedFile {
  path: string;
  additions: number;
  deletions: number;
  role: SmartDiffRole;
}

export interface SplitSuggestion {
  too_big: boolean;
  total_lines: number;
  proposed_splits: ProposedSplit[];
}

interface Bucket {
  name: string;
  files: string[];
  lines: number;
}

const linesOf = (file: ClassifiedFile): number => file.additions + file.deletions;

export function computeSplitSuggestion(files: readonly ClassifiedFile[]): SplitSuggestion {
  const counted = files.filter((f) => SPLIT_COUNTED_ROLES.includes(f.role));
  const total_lines = counted.reduce((sum, f) => sum + linesOf(f), 0);
  return {
    too_big: total_lines > SPLIT_TOO_BIG_LINES,
    total_lines,
    proposed_splits: computeProposedSplits(counted),
  };
}

function computeProposedSplits(counted: readonly ClassifiedFile[]): ProposedSplit[] {
  const buckets = new Map<string, Bucket>();
  for (const file of counted) {
    const name = file.path.split('/').slice(0, SPLIT_GROUP_PATH_DEPTH).join('/');
    const bucket = buckets.get(name) ?? { name, files: [], lines: 0 };
    bucket.files.push(file.path);
    bucket.lines += linesOf(file);
    buckets.set(name, bucket);
  }

  const surviving = [...buckets.values()].filter((b) => b.files.length >= MIN_SPLIT_GROUP_FILES);
  if (surviving.length < MIN_SPLIT_BUCKETS) return [];

  return surviving
    .sort((a, b) => b.lines - a.lines || a.name.localeCompare(b.name))
    .slice(0, MAX_PROPOSED_SPLITS)
    .map((b) => ({ name: b.name, files: [...b.files].sort((x, y) => x.localeCompare(y)) }));
}

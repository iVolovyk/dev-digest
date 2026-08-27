import type { SmartDiff, SmartDiffFile, SmartDiffGroup, SmartDiffRole } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { classifyFile } from './classify.js';
import { SMART_DIFF_ROLE_ORDER } from './constants.js';
import type { SmartDiffRepository } from './repository.js';
import { computeSplitSuggestion, type ClassifiedFile } from './split.js';

/**
 * Smart Diff — reorders a PR's changed files by risk (`core` first, `wiring`
 * next, `boilerplate` last) and marks which files carry findings. Computed on
 * read from two indexed queries and a set of pure functions; there is no write
 * path, no job, and no cache.
 *
 * The constructor takes ONLY the repository — no model provider, no `Container`,
 * no model resolver. This IS the enforcement mechanism for the feature's
 * defining constraint, "Smart Diff makes no model call" (smart-diff-plan.md §2):
 * adding one would require changing this signature, a visible reviewable diff.
 * Backed by `test/smart-diff-service.test.ts` (a throwing model-provider spy,
 * asserted untouched after a full `build()`).
 */
export class SmartDiffService {
  constructor(private repo: SmartDiffRepository) {}

  async build(workspaceId: string, prId: string): Promise<SmartDiff> {
    // 1 — resolve + workspace-scope the PR (A01/IDOR: never look up by id alone).
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    // 2 + 3 — read files (no patch) and the latest review's finding lines.
    const [files, findingLines] = await Promise.all([
      this.repo.filesForPull(pull.id),
      this.repo.findingLinesForLatestReview(pull.id),
    ]);

    // 4 — classify each file (pure).
    const classified: ClassifiedFile[] = files.map((f) => ({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      role: classifyFile(f.path),
    }));

    // 5 + 6 — group/sort (pure) and compute the split suggestion (pure).
    return {
      groups: groupAndSort(classified, findingLines),
      split_suggestion: computeSplitSuggestion(classified),
    };
  }
}

/**
 * Group by role in `SMART_DIFF_ROLE_ORDER`, omitting empty groups. Within a
 * group, order by: finding count desc, then changed-line count desc, then path
 * asc (the tiebreak that makes the output stable for snapshot tests).
 */
function groupAndSort(
  files: readonly ClassifiedFile[],
  findingLines: Map<string, number[]>,
): SmartDiffGroup[] {
  const byRole = new Map<SmartDiffRole, SmartDiffFile[]>();
  for (const file of files) {
    const entry: SmartDiffFile = {
      path: file.path,
      // Explicitly null — a per-file "what this does" summary is a language
      // task that needs a model call, which this feature forbids. Wired through
      // so the field is visibly present-and-empty. See smart-diff-plan.md §7.
      pseudocode_summary: null,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines: findingLines.get(file.path) ?? [],
    };
    const list = byRole.get(file.role) ?? [];
    list.push(entry);
    byRole.set(file.role, list);
  }

  const groups: SmartDiffGroup[] = [];
  for (const role of SMART_DIFF_ROLE_ORDER) {
    const list = byRole.get(role);
    if (!list || list.length === 0) continue;
    list.sort(compareFiles);
    groups.push({ role, files: list });
  }
  return groups;
}

function compareFiles(a: SmartDiffFile, b: SmartDiffFile): number {
  return (
    b.finding_lines.length - a.finding_lines.length ||
    b.additions + b.deletions - (a.additions + a.deletions) ||
    a.path.localeCompare(b.path)
  );
}

import type { SmartDiffRole } from '@devdigest/shared';
import { SMART_DIFF_DEFAULT_ROLE, SMART_DIFF_RULES } from './constants.js';

/**
 * Classify one changed file into a Smart Diff role from its path alone — pure,
 * deterministic, no I/O. Same path → same role on every PR, which is what makes
 * the "lock file is ALWAYS boilerplate" criterion provable rather than observed
 * (smart-diff-plan.md §3).
 *
 * Ordered first-match over `SMART_DIFF_RULES`; an unrecognised path falls back
 * to `SMART_DIFF_DEFAULT_ROLE` ('core'). Control flow only — every pattern and
 * threshold lives in `constants.ts`.
 */
export function classifyFile(path: string): SmartDiffRole {
  for (const rule of SMART_DIFF_RULES) {
    if (rule.matches(path)) return rule.role;
  }
  return SMART_DIFF_DEFAULT_ROLE;
}

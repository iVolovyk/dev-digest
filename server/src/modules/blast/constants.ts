/**
 * blast module constants — every cap and threshold lives here; no numeric
 * literal appears in `service.ts` or `summary.ts`.
 *
 * WHY CAP CALLERS AT ALL, AND WHY BY RANK. The persistent facade already sorts
 * callers by `file_rank.rank` descending and this module keeps the top
 * `MAX_CALLERS_PER_SYMBOL`. The rationale is aider's repo-map argument: "a
 * function called by 20 other functions is more valuable context than a private
 * helper called once" — a PageRank over the reference graph, truncated to a
 * budget. DevDigest's `rank` is the churn-free variant (hotness pinned to 0,
 * `db/schema/repo-intel.ts:95-98`). Showing 20 of N is a cap, not a lie, only
 * because every cap that bites reports `callers_total`.
 *
 * The 20 here MIRRORS `modules/repo-intel/constants.ts:30`
 * (`MAX_CALLERS_PER_SYMBOL`) on purpose — the facade caps the FLAT caller list
 * globally, this module re-caps PER SYMBOL after grouping (blast-radius-plan
 * §5). Keep the two values equal, knowingly.
 */

/** Guard: a 4 000-file PR must not fan the walk out over the whole repo. */
export const MAX_CHANGED_FILES = 300;

/** Caller fan-out cap PER changed symbol (after grouping). Mirrors
 *  `repo-intel/constants.ts:30`. */
export const MAX_CALLERS_PER_SYMBOL = 20;

/** `changed_symbols[]` / `downstream[]` length cap. */
export const MAX_SYMBOLS = 40;

/** Endpoints (or crons) listed per downstream entry. */
export const MAX_ENDPOINTS_PER_SYMBOL = 25;

/** Reverse-import walk depth — equals `repo-intel`'s `BFS_DEPTH`. One number. */
export const BLAST_REVERSE_DEPTH = 2;

/** Deterministic summary hard cap (§7a). */
export const SUMMARY_MAX_CHARS = 400;

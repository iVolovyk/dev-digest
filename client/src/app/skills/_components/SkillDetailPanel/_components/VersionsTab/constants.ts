/**
 * Line ceiling for the LCS diff. Above it the O(n·m) table gets expensive for
 * no benefit, so the diff degrades to "all of before removed, all of after
 * added" rather than freezing the tab.
 */
export const MAX_DIFF_LINES = 2000;

/** Width of the diff modal. */
export const DIFF_MODAL_WIDTH = 760;

/* format-cost.ts — shared USD-cost formatting for the PR list, verdict
   panel, and Agent Run sidebar. One rule everywhere: round to 3 decimals,
   but drop the third decimal when it's "0" (0.060 -> "$0.06", 0.014 ->
   "$0.014"). `null` (no run data yet) always renders "—", never "$0.00" —
   a real near-zero cost still renders "$0.00", it's only "—" when there's
   no cost_usd at all. */

export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  const fixed = usd.toFixed(3);
  return `$${fixed.endsWith("0") ? fixed.slice(0, -1) : fixed}`;
}

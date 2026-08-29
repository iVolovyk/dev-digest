/**
 * PURE. No fetch, no SDK, no `node:*`. Testable with no network — the property
 * that lets `shape/`'s tests import nothing else.
 *
 * Compacts a `BlastRadius` (principle 3: compact structured response). Folds
 * `{file, line}` caller objects into `"name path:line"` strings and
 * `{name, file, kind}` changed symbols into `"name (kind) path"` — the same
 * collapsing rule as `shape/conventions.ts`'s `joinEvidence`.
 *
 * `index_state` / `partial` / `callers_total` are carried through verbatim: an
 * agent reading a truncated or degraded map without being told is a
 * false-confidence failure.
 */

export interface RawBlastCaller {
  name: string;
  file: string;
  line: number;
}

export interface RawBlastDownstream {
  symbol: string;
  callers: RawBlastCaller[];
  endpoints_affected: string[];
  crons_affected: string[];
  callers_total: number;
}

export interface RawBlast {
  changed_symbols: { name: string; file: string; kind: string }[];
  downstream: RawBlastDownstream[];
  summary: string;
  index_state: 'full' | 'partial' | 'degraded' | 'failed';
  partial: boolean;
  reason?: string | null | undefined;
  summary_generated: boolean;
}

export interface CompactBlastDownstream {
  symbol: string;
  callers: string[];
  callers_shown: number;
  callers_total: number;
  endpoints: string[];
  crons: string[];
}

export interface CompactBlast {
  summary: string;
  index_state: 'full' | 'partial' | 'degraded' | 'failed';
  partial: boolean;
  reason: string | null;
  summary_generated: boolean;
  changed_symbols: string[];
  downstream: CompactBlastDownstream[];
}

export function compactBlast(blast: RawBlast): CompactBlast {
  return {
    summary: blast.summary,
    index_state: blast.index_state,
    partial: blast.partial,
    reason: blast.reason ?? null,
    summary_generated: blast.summary_generated,
    changed_symbols: blast.changed_symbols.map(
      (s) => `${s.name} (${s.kind}) ${s.file}`,
    ),
    downstream: blast.downstream.map((d) => ({
      symbol: d.symbol,
      callers: d.callers.map((c) => `${c.name} ${c.file}:${c.line}`),
      callers_shown: d.callers.length,
      callers_total: d.callers_total,
      endpoints: d.endpoints_affected,
      crons: d.crons_affected,
    })),
  };
}

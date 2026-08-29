import type { BlastCaller, BlastIndexState, BlastRadius, DownstreamImpact } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import type { BlastRepository } from './repository.js';
import { deterministicSummary } from './summary.js';
import {
  BLAST_REVERSE_DEPTH,
  MAX_CALLERS_PER_SYMBOL,
  MAX_CHANGED_FILES,
  MAX_ENDPOINTS_PER_SYMBOL,
  MAX_SYMBOLS,
} from './constants.js';

/**
 * Narrow local view of the repo-intel facade — declared HERE, never imported
 * from `modules/repo-intel/` (onion R5; `pnpm arch` runs with
 * `tsPreCompilationDeps: true`, so a type-only `import type { BlastResult }`
 * still trips `no-cross-module` — this repo paid that price once already, see
 * `server/INSIGHTS.md`, Codebase Patterns 2026-08-12). `container.repoIntel`
 * satisfies this structurally. Live precedent: `ConventionsService`'s local
 * `RepoIntelSamples` (`modules/conventions/service.ts:42-55`).
 *
 * Its verbosity is the point: a written record of exactly which fields of
 * another module's read model blast depends on. Widening it later is a visible
 * diff.
 */
export interface BlastIntel {
  getIndexState(repoId: string): Promise<{
    status: 'full' | 'partial' | 'degraded' | 'failed';
    degraded?: boolean;
    degradedReason?: string;
    reason?: string;
  }>;
  getBlastRadius(
    repoId: string,
    changedFiles: string[],
  ): Promise<{
    changedSymbols: { file: string; name: string; kind: string }[];
    callers: {
      file: string;
      symbol: string;
      viaSymbol: string;
      line: number;
      rank: number;
    }[];
    impactedEndpoints: string[];
    factsByFile?: Record<string, { endpoints: string[]; crons: string[] }>;
    degraded?: boolean;
  }>;
  getReverseDependents(
    repoId: string,
    files: string[],
    depth: number,
  ): Promise<{
    dependents: { file: string; depth: number; endpoints: string[]; crons: string[] }[];
    truncated: boolean;
  }>;
}

/**
 * Blast Radius — an impact map for a PR, served from the index on read with no
 * model call on the main path.
 *
 * The constructor takes a repository and ONE narrow port — no `Container`, no
 * `llmFor`, no `resolveModel`. That is the structural enforcement of "the main
 * path makes no model call" (blast-radius-plan §2, guarantee 1): adding one
 * requires changing this signature — a visible, reviewable diff. Backed by
 * `test/blast-service.test.ts` (a throwing `LLMProvider` spy, asserted
 * untouched after a full `build()`).
 */
export class BlastService {
  constructor(
    private repo: BlastRepository,
    private intel: BlastIntel,
  ) {}

  async build(workspaceId: string, prId: string): Promise<BlastRadius> {
    // 1 — resolve + workspace-scope the PR (A01/IDOR: never look up by id alone).
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    // 2 — changed paths, guarded against a pathological fan-out. `patch` is
    //     never read.
    const changedPaths = (await this.repo.changedPaths(pull.id)).slice(0, MAX_CHANGED_FILES);

    // 3 — INDEX-STATE GATE (blast-radius-plan §3). This runs BEFORE any facade
    //     read: `repoIntel.getBlastRadius` falls through to a clone-reading
    //     ripgrep path when the index is missing/degraded, which would violate
    //     the acceptance criterion "the server does not rebuild the AST or the
    //     import graph during the request". We only call it when the index is
    //     asserted (`full` | `partial`).
    const state = await this.intel.getIndexState(pull.repoId);
    if (state.status !== 'full' && state.status !== 'partial') {
      return cannotCompute(state.status, state.reason ?? state.degradedReason ?? null);
    }
    const indexState: BlastIndexState = state.status;

    // 4 — read the map. `getBlastRadius` and the per-declaring-file reverse
    //     walks are independent.
    const blast = await this.intel.getBlastRadius(pull.repoId, changedPaths);
    const factsByFile = blast.factsByFile ?? {};

    // Per-declaring-file reverse-import walk. One call per unique declaring
    // file (bounded by the changed-symbol set) rather than one bulk call —
    // needed for the file-granular endpoint attribution of §6a; each call is
    // ≤ 2 indexed reads on `file_edges_repo_to_idx`.
    const declFiles = [...new Set(blast.changedSymbols.map((s) => s.file))];
    const reverseByFile = new Map<
      string,
      { endpoints: string[]; crons: string[]; truncated: boolean }
    >();
    await Promise.all(
      declFiles.map(async (file) => {
        const res = await this.intel.getReverseDependents(
          pull.repoId,
          [file],
          BLAST_REVERSE_DEPTH,
        );
        const endpoints = new Set<string>();
        const crons = new Set<string>();
        for (const dep of res.dependents) {
          for (const e of dep.endpoints) endpoints.add(e);
          for (const c of dep.crons) crons.add(c);
        }
        reverseByFile.set(file, {
          endpoints: [...endpoints],
          crons: [...crons],
          truncated: res.truncated,
        });
      }),
    );
    const anyReverseTruncated = [...reverseByFile.values()].some((r) => r.truncated);

    // 5 + 6 — group flat → per-symbol, cap, and count (all pure below).
    const grouped = groupBySymbol(blast, factsByFile, reverseByFile);

    // 7 — flat global caller cap in the facade (`service.ts:386` slices the
    //     WHOLE list to 20) may have bitten before we could group. Treat a
    //     flat list AT the cap as "globally truncated" (§5 interim mitigation).
    const flatCapSuspected = blast.callers.length >= MAX_CALLERS_PER_SYMBOL;
    const perSymbolCapBit = grouped.downstream.some(
      (d) => d.callers_total > d.callers.length,
    );
    const partial =
      indexState === 'partial' || anyReverseTruncated || flatCapSuspected || perSymbolCapBit;

    const reason = partial
      ? indexState === 'partial'
        ? 'partial_index'
        : flatCapSuspected || perSymbolCapBit
          ? 'caller_cap'
          : 'reverse_walk_truncated'
      : null;

    // 8 — deterministic summary (pure) + assemble.
    const changedFileCount = new Set(grouped.changed_symbols.map((s) => s.file)).size;
    const callerFileCount = new Set(
      grouped.downstream.flatMap((d) => d.callers.map((c) => c.file)),
    ).size;
    const callerCount = grouped.downstream.reduce((n, d) => n + d.callers_total, 0);
    const endpointCount = new Set(
      grouped.downstream.flatMap((d) => d.endpoints_affected),
    ).size;
    const cronCount = new Set(grouped.downstream.flatMap((d) => d.crons_affected)).size;

    return {
      changed_symbols: grouped.changed_symbols,
      downstream: grouped.downstream,
      summary: deterministicSummary({
        indexState,
        reason,
        changedSymbolCount: grouped.changed_symbols.length,
        changedFileCount,
        callerCount,
        callerFileCount,
        endpointCount,
        cronCount,
      }),
      index_state: indexState,
      partial,
      reason,
      summary_generated: false,
    };
  }
}

interface RawBlast {
  changedSymbols: { file: string; name: string; kind: string }[];
  callers: { file: string; symbol: string; viaSymbol: string; line: number; rank: number }[];
}

/**
 * PURE. Flat `BlastResult` → grouped `BlastRadius` shape (blast-radius-plan §6a).
 *
 * Endpoint/cron attribution is at FILE granularity — a deliberate
 * over-approximation. The reverse-import walk knows which FILES depend on a
 * changed file, not which SYMBOL in it. So every symbol declared in changed
 * file F inherits F's reverse-dependent endpoints; a file declaring
 * `parseToken` and an unrelated `formatDate` attributes the same endpoints to
 * both. The caller-derived half IS symbol-precise. An over-approximation is the
 * safe direction here — a missing endpoint is the dangerous error.
 */
function groupBySymbol(
  blast: RawBlast,
  factsByFile: Record<string, { endpoints: string[]; crons: string[] }>,
  reverseByFile: Map<string, { endpoints: string[]; crons: string[]; truncated: boolean }>,
): { changed_symbols: BlastRadius['changed_symbols']; downstream: DownstreamImpact[] } {
  const callersBySymbol = new Map<string, RawBlast['callers']>();
  for (const c of blast.callers) {
    const arr = callersBySymbol.get(c.viaSymbol);
    if (arr) arr.push(c);
    else callersBySymbol.set(c.viaSymbol, [c]);
  }

  // Order changed symbols by caller count desc, then file asc, then name asc.
  const ordered = [...blast.changedSymbols].sort((a, b) => {
    const ca = callersBySymbol.get(a.name)?.length ?? 0;
    const cb = callersBySymbol.get(b.name)?.length ?? 0;
    return cb - ca || a.file.localeCompare(b.file) || a.name.localeCompare(b.name);
  });
  const kept = ordered.slice(0, MAX_SYMBOLS);

  const downstream: DownstreamImpact[] = [];
  for (const sym of kept) {
    // Facade already rank-sorted the flat list; per-symbol slice keeps that order.
    const symCallers = callersBySymbol.get(sym.name) ?? [];
    const callersTotal = symCallers.length;
    const callers: BlastCaller[] = symCallers
      .slice(0, MAX_CALLERS_PER_SYMBOL)
      .map((c) => ({ name: c.symbol, file: c.file, line: c.line }));

    const endpoints = new Set<string>();
    const crons = new Set<string>();
    // (a) symbol-precise: this symbol's caller files.
    for (const c of symCallers) {
      const f = factsByFile[c.file];
      if (!f) continue;
      for (const e of f.endpoints) endpoints.add(e);
      for (const cr of f.crons) crons.add(cr);
    }
    // (b) file-level: reverse-dependents of the symbol's declaring file.
    const rev = reverseByFile.get(sym.file);
    if (rev) {
      for (const e of rev.endpoints) endpoints.add(e);
      for (const cr of rev.crons) crons.add(cr);
    }

    const endpoints_affected = [...endpoints].sort().slice(0, MAX_ENDPOINTS_PER_SYMBOL);
    const crons_affected = [...crons].sort().slice(0, MAX_ENDPOINTS_PER_SYMBOL);

    // A symbol with no downstream at all is in `changed_symbols` but NOT
    // `downstream` — the `blast.noDownstream` i18n key anticipates this.
    if (callersTotal === 0 && endpoints_affected.length === 0 && crons_affected.length === 0) {
      continue;
    }
    downstream.push({
      symbol: sym.name,
      callers,
      endpoints_affected,
      crons_affected,
      callers_total: callersTotal,
    });
  }

  return {
    changed_symbols: kept.map((s) => ({ name: s.name, file: s.file, kind: s.kind })),
    downstream,
  };
}

/**
 * PURE. A complete, valid `BlastRadius` in the explicit cannot-compute state.
 * `changed_symbols: []` + `downstream: []` here means "unknown", never
 * "nothing is impacted" — the UI renders it as a distinct state (§8d).
 */
function cannotCompute(status: BlastIndexState, reason: string | null): BlastRadius {
  return {
    changed_symbols: [],
    downstream: [],
    summary: deterministicSummary({
      indexState: status,
      reason,
      changedSymbolCount: 0,
      changedFileCount: 0,
      callerCount: 0,
      callerFileCount: 0,
      endpointCount: 0,
      cronCount: 0,
    }),
    index_state: status,
    partial: true,
    reason: reason ?? 'index_unavailable',
    summary_generated: false,
  };
}

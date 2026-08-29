import type { ApiClient } from './client.js';
import { AgentsListView, PullsListView, ReposListView } from './schemas.js';

/**
 * `owner/name` + PR number + agent name → the UUIDs the API's paths need.
 *
 * There is no exact-match lookup endpoint (`GET /repos` takes no query params,
 * `GET /repos/:id/pulls` takes only `IdParams`), so this is client-side
 * list-and-filter. `GET /repos/:id/pulls` is expensive — a live GitHub
 * `listPullRequests` + upsert when a token is configured — so results are
 * cached in-process with a short TTL. UUIDs are stable; the only staleness risk
 * is a repo deleted and re-added mid-session, which a caller handles by calling
 * again with `{ force: true }` after a 404.
 *
 * These functions return DATA, never user-facing strings — the tool layer owns
 * every message so `api/` stays free of MCP vocabulary.
 */

const DEFAULT_TTL_MS = 60_000;

export type RepoResolution =
  | { ok: true; repoId: string }
  | { ok: false; reason: 'not_found'; knownFullNames: string[] };

export type PullResolution =
  | { ok: true; pullId: string }
  | { ok: false; reason: 'not_found'; importedNumbers: number[] }
  | { ok: false; reason: 'no_id' };

export type AgentResolution =
  | { ok: true; agentId: string }
  | { ok: false; reason: 'not_found'; available: string[] }
  | { ok: false; reason: 'ambiguous'; name: string; ids: string[] };

export interface Resolver {
  resolveRepo(repo: string, opts?: { force?: boolean }): Promise<RepoResolution>;
  resolvePull(repoId: string, pr: number, opts?: { force?: boolean }): Promise<PullResolution>;
  resolveAgent(agent: string, opts?: { force?: boolean }): Promise<AgentResolution>;
}

interface CacheEntry {
  value: string;
  expiresAt: number;
}

export function createResolver(
  client: ApiClient,
  opts: { ttlMs?: number; now?: () => number } = {},
): Resolver {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const now = opts.now ?? Date.now;
  const cache = new Map<string, CacheEntry>();

  const readCache = (key: string): string | undefined => {
    const hit = cache.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= now()) {
      cache.delete(key);
      return undefined;
    }
    return hit.value;
  };
  const writeCache = (key: string, value: string): void => {
    cache.set(key, { value, expiresAt: now() + ttlMs });
  };

  return {
    async resolveRepo(repo, resolveOpts) {
      const key = `repo:${repo.toLowerCase()}`;
      if (!resolveOpts?.force) {
        const cached = readCache(key);
        if (cached) return { ok: true, repoId: cached };
      }
      const repos = await client.get('/repos', ReposListView);
      const match = repos.find((r) => r.full_name.toLowerCase() === repo.toLowerCase());
      if (!match) {
        return {
          ok: false,
          reason: 'not_found',
          knownFullNames: repos.map((r) => r.full_name),
        };
      }
      writeCache(key, match.id);
      return { ok: true, repoId: match.id };
    },

    async resolvePull(repoId, pr, resolveOpts) {
      const key = `pull:${repoId}:${pr}`;
      if (!resolveOpts?.force) {
        const cached = readCache(key);
        if (cached) return { ok: true, pullId: cached };
      }
      const pulls = await client.get(`/repos/${encodeURIComponent(repoId)}/pulls`, PullsListView);
      const match = pulls.find((p) => p.number === pr);
      if (!match) {
        return {
          ok: false,
          reason: 'not_found',
          importedNumbers: pulls.map((p) => p.number).sort((a, b) => a - b),
        };
      }
      if (match.id == null) return { ok: false, reason: 'no_id' };
      writeCache(key, match.id);
      return { ok: true, pullId: match.id };
    },

    async resolveAgent(agent, resolveOpts) {
      const key = `agent:${agent.toLowerCase()}`;
      if (!resolveOpts?.force) {
        const cached = readCache(key);
        if (cached) return { ok: true, agentId: cached };
      }
      const agents = await client.get('/agents', AgentsListView);
      const byId = agents.find((a) => a.id === agent);
      if (byId) {
        writeCache(key, byId.id);
        return { ok: true, agentId: byId.id };
      }
      const byName = agents.filter((a) => a.name.toLowerCase() === agent.toLowerCase());
      if (byName.length === 1) {
        const only = byName[0]!;
        writeCache(key, only.id);
        return { ok: true, agentId: only.id };
      }
      if (byName.length > 1) {
        // `agents.name` has no unique constraint — never silently pick the first.
        return { ok: false, reason: 'ambiguous', name: byName[0]!.name, ids: byName.map((a) => a.id) };
      }
      return { ok: false, reason: 'not_found', available: agents.map((a) => a.name) };
    },
  };
}

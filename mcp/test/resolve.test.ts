import { describe, expect, it } from 'vitest';
import { createApiClient } from '../src/api/client.js';
import { createResolver } from '../src/api/resolve.js';
import { fakeFetch } from './helpers.js';

function setup(routes: Parameters<typeof fakeFetch>[0], now: () => number = () => 0) {
  const { fetch, calls } = fakeFetch(routes);
  const client = createApiClient({ baseUrl: 'http://localhost:3001', timeoutMs: 1_000, fetch });
  return { resolver: createResolver(client, { now, ttlMs: 60_000 }), calls };
}

const REPOS = [
  { id: 'repo-1', full_name: 'acme/payments-api' },
  { id: 'repo-2', full_name: 'octocat/hello-world' },
];

describe('createResolver', () => {
  it('matches full_name case-insensitively', async () => {
    const { resolver } = setup({ 'GET /repos': { json: REPOS } });
    await expect(resolver.resolveRepo('ACME/Payments-API')).resolves.toEqual({
      ok: true,
      repoId: 'repo-1',
    });
  });

  it('returns known full_names on a miss', async () => {
    const { resolver } = setup({ 'GET /repos': { json: REPOS } });
    const r = await resolver.resolveRepo('acme/paymnts-api');
    expect(r).toEqual({
      ok: false,
      reason: 'not_found',
      knownFullNames: ['acme/payments-api', 'octocat/hello-world'],
    });
  });

  it('matches a PR by number and reports imported numbers on a miss', async () => {
    const { resolver } = setup({
      'GET /repos/repo-1/pulls': {
        json: [
          { id: 'pr-7', number: 7 },
          { id: 'pr-12', number: 12 },
        ],
      },
    });
    await expect(resolver.resolvePull('repo-1', 12)).resolves.toEqual({ ok: true, pullId: 'pr-12' });
    expect(await resolver.resolvePull('repo-1', 999)).toEqual({
      ok: false,
      reason: 'not_found',
      importedNumbers: [7, 12],
    });
  });

  it('resolves an agent by id and by name', async () => {
    const agents = [
      { id: 'a-1', name: 'General Reviewer', provider: 'openai', model: 'gpt', enabled: true },
      { id: 'a-2', name: 'Security Reviewer', provider: 'openai', model: 'gpt', enabled: true },
    ];
    const { resolver } = setup({ 'GET /agents': { json: agents } });
    await expect(resolver.resolveAgent('a-2')).resolves.toEqual({ ok: true, agentId: 'a-2' });
    await expect(resolver.resolveAgent('security reviewer')).resolves.toEqual({
      ok: true,
      agentId: 'a-2',
    });
  });

  it('never first-wins on two agents sharing a name', async () => {
    const agents = [
      { id: 'a-1', name: 'Security Reviewer', provider: 'openai', model: 'gpt', enabled: true },
      { id: 'a-2', name: 'Security Reviewer', provider: 'anthropic', model: 'claude', enabled: false },
    ];
    const { resolver } = setup({ 'GET /agents': { json: agents } });
    expect(await resolver.resolveAgent('Security Reviewer')).toEqual({
      ok: false,
      reason: 'ambiguous',
      name: 'Security Reviewer',
      ids: ['a-1', 'a-2'],
    });
  });

  it('serves a second resolution from cache with no extra HTTP call', async () => {
    const { resolver, calls } = setup({ 'GET /repos': { json: REPOS } });
    await resolver.resolveRepo('acme/payments-api');
    await resolver.resolveRepo('acme/payments-api');
    expect(calls.filter((c) => c.path === '/repos')).toHaveLength(1);
  });

  it('force-refreshes past the cache', async () => {
    const { resolver, calls } = setup({ 'GET /repos': { json: REPOS } });
    await resolver.resolveRepo('acme/payments-api');
    await resolver.resolveRepo('acme/payments-api', { force: true });
    expect(calls.filter((c) => c.path === '/repos')).toHaveLength(2);
  });

  it('expires the cache after the TTL', async () => {
    let clock = 0;
    const { resolver, calls } = setup({ 'GET /repos': { json: REPOS } }, () => clock);
    await resolver.resolveRepo('acme/payments-api');
    clock = 61_000;
    await resolver.resolveRepo('acme/payments-api');
    expect(calls.filter((c) => c.path === '/repos')).toHaveLength(2);
  });
});

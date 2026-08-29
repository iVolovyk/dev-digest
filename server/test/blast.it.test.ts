import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { BlastRadiusResponse } from '@devdigest/shared';
import { INDEXER_VERSION } from '../src/modules/repo-intel/constants.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[blast] Docker not available — skipping integration tests.');
}

const TOKEN_FILE = 'src/auth/token.ts';
const MIDDLEWARE_FILE = 'src/auth/middleware.ts';
const LOGIN_FILE = 'src/routes/login.ts';

d('GET /pulls/:id/blast (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let prId: string;
  let otherWorkspacePrId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const db = pg.handle.db;

    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'blast-probe', fullName: 'acme/blast-probe' })
      .returning();
    repoId = repo!.id;

    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 1,
        title: 'Rework the auth-token parser',
        author: 'dev',
        branch: 'feat/token',
        base: 'main',
        headSha: 'abc123',
      })
      .returning();
    prId = pr!.id;

    await db.insert(t.prFiles).values([{ prId, path: TOKEN_FILE, additions: 30, deletions: 12, patch: null }]);

    // --- Persistent index rows the blast facade reads from ---
    await db.insert(t.repoIndexState).values({
      repoId,
      lastIndexedSha: 'abc123',
      indexerVersion: INDEXER_VERSION,
      status: 'full',
      filesIndexed: 3,
      filesSkipped: 0,
    });

    await db.insert(t.symbols).values([
      { repoId, path: TOKEN_FILE, name: 'parseToken', kind: 'function', line: 10, endLine: 30, exported: true },
      { repoId, path: MIDDLEWARE_FILE, name: 'requireAuth', kind: 'function', line: 20, endLine: 60, exported: true },
      { repoId, path: LOGIN_FILE, name: 'loginHandler', kind: 'function', line: 5, endLine: 40, exported: true },
    ]);

    await db.insert(t.references).values([
      { repoId, fromPath: MIDDLEWARE_FILE, toSymbol: 'parseToken', line: 42, declFile: TOKEN_FILE },
      { repoId, fromPath: LOGIN_FILE, toSymbol: 'parseToken', line: 12, declFile: TOKEN_FILE },
    ]);

    await db.insert(t.fileRank).values([
      { repoId, filePath: TOKEN_FILE, pagerank: 0.4, hotness: 0, rank: 0.4, percentile: 95 },
      { repoId, filePath: MIDDLEWARE_FILE, pagerank: 0.3, hotness: 0, rank: 0.3, percentile: 80 },
      { repoId, filePath: LOGIN_FILE, pagerank: 0.1, hotness: 0, rank: 0.1, percentile: 50 },
    ]);

    // Reverse import graph: middleware imports token; login imports middleware.
    await db.insert(t.fileEdges).values([
      { repoId, fromFile: MIDDLEWARE_FILE, toFile: TOKEN_FILE },
      { repoId, fromFile: LOGIN_FILE, toFile: MIDDLEWARE_FILE },
    ]);

    await db.insert(t.fileFacts).values([
      { repoId, filePath: LOGIN_FILE, endpoints: ['POST /login'], crons: [] },
      { repoId, filePath: MIDDLEWARE_FILE, endpoints: [], crons: ['session-sweep'] },
    ]);

    // A PR in a different workspace — must 404 for the default-workspace caller.
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-ws' }).returning();
    const [otherRepo] = await db
      .insert(t.repos)
      .values({ workspaceId: otherWs!.id, owner: 'x', name: 'y', fullName: 'x/y' })
      .returning();
    const [otherPr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: otherWs!.id,
        repoId: otherRepo!.id,
        number: 1,
        title: 'private',
        author: 'z',
        branch: 'b',
        base: 'main',
        headSha: 'zzz',
      })
      .returning();
    otherWorkspacePrId = otherPr!.id;
  });

  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({ config, db: pg.handle.db });
  }

  async function setStatus(status: 'full' | 'partial' | 'degraded' | 'failed') {
    await pg.handle.db
      .update(t.repoIndexState)
      .set({ status })
      .where(eq(t.repoIndexState.repoId, repoId));
  }

  it('criterion 1 — ≥2 real callers and ≥1 downstream HTTP endpoint from seeded rows', async () => {
    await setStatus('full');
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(() => BlastRadiusResponse.parse(body)).not.toThrow();

    expect(body.index_state).toBe('full');
    const parse = body.downstream.find((x: { symbol: string }) => x.symbol === 'parseToken');
    expect(parse).toBeTruthy();
    expect(parse.callers.length).toBeGreaterThanOrEqual(2);
    expect(parse.callers_total).toBeGreaterThanOrEqual(2);

    const allEndpoints = body.downstream.flatMap(
      (x: { endpoints_affected: string[] }) => x.endpoints_affected,
    );
    expect(allEndpoints).toContain('POST /login');
    const allCrons = body.downstream.flatMap((x: { crons_affected: string[] }) => x.crons_affected);
    expect(allCrons).toContain('session-sweep');
    await app.close();
  });

  it('scopes by workspace — another workspace’s PR id → 404 (A01/IDOR)', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/pulls/${otherWorkspacePrId}/blast` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('full → partial → degraded produce three distinguishable responses', async () => {
    const app = await makeApp();

    await setStatus('full');
    const full = (await app.inject({ method: 'GET', url: `/pulls/${prId}/blast` })).json();
    expect(full.index_state).toBe('full');
    expect(full.downstream.length).toBeGreaterThan(0);

    await setStatus('partial');
    const partial = (await app.inject({ method: 'GET', url: `/pulls/${prId}/blast` })).json();
    expect(partial.index_state).toBe('partial');
    expect(partial.partial).toBe(true);
    expect(partial.reason).toBe('partial_index');

    await setStatus('degraded');
    const degraded = (await app.inject({ method: 'GET', url: `/pulls/${prId}/blast` })).json();
    expect(degraded.index_state).toBe('degraded');
    expect(degraded.downstream).toEqual([]);
    expect(degraded.summary.toLowerCase()).not.toContain('no impact');

    await setStatus('full');
    await app.close();
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { SmartDiffResponse } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[smart-diff] Docker not available — skipping integration tests.');
}

d('GET /pulls/:id/smart-diff (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let prId: string;
  let otherWorkspacePrId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const db = pg.handle.db;

    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'smart-diff-probe', fullName: 'acme/smart-diff-probe' })
      .returning();

    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'Add checkout flow + bump deps',
        author: 'dev',
        branch: 'feat/checkout',
        base: 'main',
        headSha: 'abc123',
      })
      .returning();
    prId = pr!.id;

    await db.insert(t.prFiles).values([
      { prId, path: 'pnpm-lock.yaml', additions: 4000, deletions: 20, patch: null },
      { prId, path: 'src/lib/checkout.ts', additions: 80, deletions: 10, patch: '@@ -1,2 +1,3 @@' },
      { prId, path: 'src/modules/index.ts', additions: 4, deletions: 0, patch: '@@ -1 +1,2 @@' },
    ]);

    // Two reviews — only the LATEST one's findings must drive finding_lines.
    const [oldReview] = await db
      .insert(t.reviews)
      .values({ workspaceId, prId, kind: 'review', createdAt: new Date('2026-01-01T00:00:00Z') })
      .returning();
    await db.insert(t.findings).values({
      reviewId: oldReview!.id,
      file: 'src/lib/checkout.ts',
      startLine: 999,
      endLine: 999,
      severity: 'WARNING',
      category: 'bug',
      title: 'stale finding from the old review',
      rationale: 'should not appear',
      confidence: 0.5,
    });

    const [newReview] = await db
      .insert(t.reviews)
      .values({ workspaceId, prId, kind: 'review', createdAt: new Date('2026-06-01T00:00:00Z') })
      .returning();
    await db.insert(t.findings).values([
      {
        reviewId: newReview!.id,
        file: 'src/lib/checkout.ts',
        startLine: 12,
        endLine: 20,
        severity: 'CRITICAL',
        category: 'security',
        title: 'missing auth check',
        rationale: 'x',
        confidence: 0.9,
      },
      {
        reviewId: newReview!.id,
        file: 'src/lib/checkout.ts',
        startLine: 12,
        endLine: 12,
        severity: 'WARNING',
        category: 'bug',
        title: 'duplicate start line — must dedupe',
        rationale: 'x',
        confidence: 0.8,
      },
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

  it('returns a schema-valid, risk-ordered SmartDiff from seeded rows', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(() => SmartDiffResponse.parse(body)).not.toThrow();

    expect(body.groups.map((g: { role: string }) => g.role)).toEqual([
      'core',
      'wiring',
      'boilerplate',
    ]);

    const core = body.groups.find((g: { role: string }) => g.role === 'core');
    expect(core.files[0].path).toBe('src/lib/checkout.ts');
    // Latest review only, deduped, sorted ascending — not [999], not [12, 12].
    expect(core.files[0].finding_lines).toEqual([12]);
    expect(core.files[0].pseudocode_summary).toBeNull();

    // Lock file lands in boilerplate but does NOT inflate total_lines.
    expect(body.split_suggestion.total_lines).toBe(80 + 10 + 4);
    await app.close();
  });

  it('scopes by workspace — another workspace’s PR id → 404 (A01/IDOR)', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: `/pulls/${otherWorkspacePrId}/smart-diff`,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('a PR with no persisted files → empty-but-valid SmartDiff', async () => {
    const db = pg.handle.db;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'empty-probe', fullName: 'acme/empty-probe' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 2,
        title: 'empty',
        author: 'dev',
        branch: 'b',
        base: 'main',
        headSha: 'sha',
      })
      .returning();

    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr!.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      groups: [],
      split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
    });
    await app.close();
  });
});

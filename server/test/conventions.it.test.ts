import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

const TSCONFIG = ['{', '  "compilerOptions": {', '    "strict": true', '  }', '}'].join('\n');

/**
 * Conventions Extractor, end to end: sample selection is pure code (no repo
 * is indexed here, so `getConventionSamples` degrades to `[]` and only the
 * config-file candidates are sampled), the LLM proposes candidates, and
 * evidence verification keeps only the ones that check out against the real
 * file — the rest, and anything citing a file never sampled, are dropped.
 */
d('/repos/:id/conventions (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'conventions-probe', fullName: 'acme/conventions-probe' })
      .returning();
    repoId = repo!.id;
  });

  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(structured: unknown) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files: { 'tsconfig.json': TSCONFIG } }),
        github: new MockGitHubClient(),
        llm: { openai: new MockLLMProvider('openai', { structured }) },
      },
    });
  }

  it('keeps a candidate whose evidence checks out, drops one that does not', async () => {
    const app = await makeApp({
      candidates: [
        {
          category: 'compiler',
          rule: 'Always enable strict mode in tsconfig.',
          evidence_path: 'tsconfig.json',
          evidence_start_line: 3,
          evidence_end_line: 3,
          confidence: 0.9,
        },
        {
          // Cites a file that was never sampled — must be dropped.
          category: 'naming',
          rule: 'Use camelCase for variables.',
          evidence_path: 'src/never-sampled.ts',
          evidence_start_line: 1,
          evidence_end_line: 1,
          confidence: 0.8,
        },
        {
          // Cites a real file but a line range past its end — must be dropped.
          category: 'formatting',
          rule: 'Two-space indentation.',
          evidence_path: 'tsconfig.json',
          evidence_start_line: 1,
          evidence_end_line: 999,
          confidence: 0.7,
        },
      ],
    });

    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(200);
    const candidates = res.json();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      rule: 'Always enable strict mode in tsconfig.',
      category: 'compiler',
      evidence_path: 'tsconfig.json',
      evidence_start_line: 3,
      evidence_end_line: 3,
      // Re-sliced from the real file, not trusted from the model.
      evidence_snippet: '    "strict": true',
      accepted: true,
    });
    await app.close();

    const persisted = await pg.handle.db
      .select()
      .from(t.conventions)
      .where(eq(t.conventions.repoId, repoId));
    expect(persisted).toHaveLength(1);
  });

  it('re-scanning replaces the previous candidate set rather than accumulating', async () => {
    const app = await makeApp({
      candidates: [
        {
          category: 'compiler',
          rule: 'A different rule this time.',
          evidence_path: 'tsconfig.json',
          evidence_start_line: 2,
          evidence_end_line: 2,
          confidence: 0.6,
        },
      ],
    });

    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(200);
    await app.close();

    const persisted = await pg.handle.db
      .select()
      .from(t.conventions)
      .where(eq(t.conventions.repoId, repoId));
    expect(persisted).toHaveLength(1);
    expect(persisted[0]!.rule).toBe('A different rule this time.');
  });

  it('GET lists persisted candidates; PUT edits the rule and rejects it', async () => {
    const app = await makeApp({ candidates: [] });
    const listed = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(listed.statusCode).toBe(200);
    const [candidate] = listed.json();
    expect(candidate).toBeDefined();

    const updated = await app.inject({
      method: 'PUT',
      url: `/conventions/${candidate.id}`,
      payload: { rule: 'Edited rule text.', accepted: false },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ rule: 'Edited rule text.', accepted: false });
    await app.close();
  });
});

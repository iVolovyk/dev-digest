import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { strToU8, zipSync } from 'fflate';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * Skills module end-to-end over a real Postgres: the body-only versioning rule,
 * restore, workspace scoping, the stats read model, and the promise that
 * `import/preview` writes nothing.
 */
d('/skills', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  const createBody = {
    name: 'Payments Rubric',
    description: 'How we review money-touching code.',
    type: 'rubric' as const,
    body: 'Check every currency conversion.',
  };

  async function countSkills(): Promise<number> {
    const [row] = await pg.handle.db
      .select({ n: sql<number>`count(*)::int` })
      .from(t.skills);
    return row!.n;
  }

  it('creates a skill at version 1 with a first body snapshot', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: createBody });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      name: 'Payments Rubric',
      type: 'rubric',
      // Hand-written bodies are the only trusted ones.
      source: 'manual',
      enabled: true,
      version: 1,
    });

    const id = created.json().id as string;
    const versions = (await app.inject({ method: 'GET', url: `/skills/${id}/versions` })).json();
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      skill_id: id,
      version: 1,
      body: 'Check every currency conversion.',
    });
    await app.close();
  });

  it('a body edit mints version 2 and snapshots it; the list is newest-first', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: createBody })).json()
      .id as string;

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${id}`,
      payload: { body: 'Check conversions AND rounding.' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version).toBe(2);

    const versions = (await app.inject({ method: 'GET', url: `/skills/${id}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[0].body).toBe('Check conversions AND rounding.');
    expect(versions[1].body).toBe('Check every currency conversion.');

    const one = await app.inject({ method: 'GET', url: `/skills/${id}/versions/1` });
    expect(one.statusCode).toBe(200);
    expect(one.json().body).toBe('Check every currency conversion.');
    await app.close();
  });

  it('renaming, retyping or toggling a skill does NOT create a version', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: createBody })).json()
      .id as string;

    const renamed = await app.inject({
      method: 'PUT',
      url: `/skills/${id}`,
      payload: { name: 'Payments Rubric v2', type: 'security', enabled: false },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json()).toMatchObject({
      name: 'Payments Rubric v2',
      type: 'security',
      enabled: false,
      version: 1,
    });

    // Re-submitting the identical body is a no-op too.
    await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { body: createBody.body } });

    const versions = (await app.inject({ method: 'GET', url: `/skills/${id}/versions` })).json();
    expect(versions).toHaveLength(1);
    await app.close();
  });

  it('restore re-applies an old body as a NEW version (history stays append-only)', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: createBody })).json()
      .id as string;
    await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { body: 'v2 body' } });

    const restored = await app.inject({ method: 'POST', url: `/skills/${id}/restore/1` });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({ version: 3, body: createBody.body });

    const versions = (await app.inject({ method: 'GET', url: `/skills/${id}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);
    expect(versions[0].body).toBe(createBody.body);
    expect(
      (await app.inject({ method: 'POST', url: `/skills/${id}/restore/99` })).statusCode,
    ).toBe(404);
    await app.close();
  });

  it('deletes a skill and 404s afterwards', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: createBody })).json()
      .id as string;

    const deleted = await app.inject({ method: 'DELETE', url: `/skills/${id}` });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({ ok: true });
    expect((await app.inject({ method: 'GET', url: `/skills/${id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/skills/${id}` })).statusCode).toBe(404);
    await app.close();
  });

  it('is workspace-scoped: another tenant\'s skill is a 404, not a read', async () => {
    const app = await makeApp();
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-skills' }).returning();
    const foreign = await new SkillsRepository(db).insert({
      workspaceId: otherWs!.id,
      name: 'Foreign Skill',
      description: 'Belongs to someone else.',
      type: 'custom',
      source: 'manual',
      body: 'secret body',
    });

    for (const url of [
      `/skills/${foreign.id}`,
      `/skills/${foreign.id}/versions`,
      `/skills/${foreign.id}/versions/1`,
      `/skills/${foreign.id}/stats`,
    ]) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(404);
    }
    expect(
      (await app.inject({ method: 'PUT', url: `/skills/${foreign.id}`, payload: { name: 'x' } }))
        .statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'POST', url: `/skills/${foreign.id}/restore/1` })).statusCode,
    ).toBe(404);

    const listed = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(listed.map((s: { id: string }) => s.id)).not.toContain(foreign.id);
    await app.close();
  });

  it('stats on a fresh, unlinked skill are zeros with null averages', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: createBody })).json()
      .id as string;

    const res = await app.inject({ method: 'GET', url: `/skills/${id}/stats` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      used_by: 0,
      enabled_for: 0,
      injected_runs_30d: 0,
      avg_tokens: null,
      findings_30d: 0,
      accept_rate: null,
      agents: [],
      by_category: [],
    });
    // The current body is priced even when the skill has never run.
    expect(res.json().body_tokens).toBeGreaterThan(0);
    await app.close();
  });

  it('stats count agent links, honouring both the link and the skill switch', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: createBody })).json()
      .id as string;
    const agentId = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: {
          name: 'Linker',
          provider: 'openai',
          model: 'gpt-4o-mini',
          system_prompt: 'Review.',
        },
      })
    ).json().id as string;
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [id] },
    });

    const linked = (await app.inject({ method: 'GET', url: `/skills/${id}/stats` })).json();
    expect(linked).toMatchObject({ used_by: 1, enabled_for: 1 });
    expect(linked.agents).toEqual([{ id: agentId, name: 'Linker', enabled: true }]);

    // The skill's own kill switch takes the link out of every prompt.
    await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { enabled: false } });
    const disabled = (await app.inject({ method: 'GET', url: `/skills/${id}/stats` })).json();
    expect(disabled).toMatchObject({ used_by: 1, enabled_for: 0 });
    await app.close();
  });

  it('import/preview returns a candidate and persists NOTHING', async () => {
    const app = await makeApp();
    const before = await countSkills();

    const markdown = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: {
        filename: 'rules.md',
        content: '---\nname: Imported Rules\ntype: convention\n---\n\nAlways log the run id.\n',
      },
    });
    expect(markdown.statusCode).toBe(200);
    expect(markdown.json()).toMatchObject({
      name: 'Imported Rules',
      type: 'convention',
      description: 'Always log the run id.',
      skipped: [],
      warnings: [],
    });
    expect(markdown.json().tokens).toBeGreaterThan(0);

    const archive = zipSync({
      'SKILL.md': strToU8('# Zipped Skill\n\nFrom an archive.\n'),
      'setup.sh': strToU8('echo nope'),
    });
    const zipped = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: {
        filename: 'pack.zip',
        content_base64: Buffer.from(archive).toString('base64'),
      },
    });
    expect(zipped.statusCode).toBe(200);
    expect(zipped.json()).toMatchObject({
      name: 'Zipped Skill',
      skipped: [{ path: 'setup.sh', reason: 'executable — not processed' }],
    });

    // The whole point of a preview: nothing reached the database.
    expect(await countSkills()).toBe(before);
    await app.close();
  });

  it('rejects a malformed import payload at the edge (422)', async () => {
    const app = await makeApp();

    // Neither content nor content_base64.
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/skills/import/preview',
          payload: { filename: 'rules.md' },
        })
      ).statusCode,
    ).toBe(422);

    // An archive with no markdown body is a 422, not a 500.
    const noMarkdown = zipSync({ 'run.sh': strToU8('echo hi') });
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: {
        filename: 'pack.zip',
        content_base64: Buffer.from(noMarkdown).toString('base64'),
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toContain('no markdown skill body found');
    await app.close();
  });
});

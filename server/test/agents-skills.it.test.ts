import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import type { AgentSkillLink } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agents-skills] Docker not available — skipping integration tests.');
}

/**
 * The agent ⇄ skill link table as the Skills tab drives it.
 *
 * The tab attaches AND reorders through the same `POST /agents/:id/skills`
 * (it sends the whole ordered id list), while the per-skill switch goes
 * through `PUT .../skills/:skillId`. Those two must not fight each other:
 * the regression this file exists for is a reorder silently re-enabling a
 * skill the user had switched off, which would change what reaches the model
 * without anyone touching a toggle.
 */
d('agent ⇄ skill links', () => {
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

  /** A fresh agent + two fresh skills, so no test depends on seeded rows. */
  async function fixture(app: Awaited<ReturnType<typeof makeApp>>, tag: string) {
    const agent = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `Link Agent ${tag}`,
        provider: 'openai',
        model: 'gpt-4o-mini',
        system_prompt: 'Review the diff.',
      },
    });
    const skillA = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: `link-a-${tag}`, description: 'A', type: 'custom', body: '# A' },
    });
    const skillB = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: `link-b-${tag}`, description: 'B', type: 'custom', body: '# B' },
    });
    return {
      agentId: agent.json().id as string,
      a: skillA.json().id as string,
      b: skillB.json().id as string,
    };
  }

  const byId = (links: AgentSkillLink[]) => new Map(links.map((l) => [l.skill_id, l]));

  it('reordering keeps a disabled link disabled', async () => {
    const app = await makeApp();
    const { agentId, a, b } = await fixture(app, 'reorder');

    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [a, b] },
    });

    const off = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/skills/${b}`,
      payload: { enabled: false },
    });
    expect(byId(off.json()).get(b)!.enabled).toBe(false);

    // The Skills tab's ↑/↓ buttons send the whole reordered list back.
    const reordered = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [b, a] },
    });
    const links = byId(reordered.json());
    expect(links.get(b)!.order).toBe(0);
    expect(links.get(b)!.enabled).toBe(false); // ← the regression
    expect(links.get(a)!.enabled).toBe(true);
  });

  it('attaching a new skill leaves the others untouched and enables only the newcomer', async () => {
    const app = await makeApp();
    const { agentId, a, b } = await fixture(app, 'attach');

    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [a] },
    });
    await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/skills/${a}`,
      payload: { enabled: false },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [a, b] },
    });
    const links = byId(res.json());
    expect(links.get(a)!.enabled).toBe(false);
    expect(links.get(b)!.enabled).toBe(true);
  });

  it('an explicit ordered state sets order AND each flag in one write', async () => {
    const app = await makeApp();
    const { agentId, a, b } = await fixture(app, 'state');

    // What the Skills tab sends when a row is dragged: the whole list, with
    // the switched-off entries carried along so they keep their position.
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: {
        skills: [
          { skill_id: b, enabled: false },
          { skill_id: a, enabled: true },
        ],
      },
    });
    const links = byId(res.json());
    expect(links.get(b)!.order).toBe(0);
    expect(links.get(b)!.enabled).toBe(false);
    expect(links.get(a)!.order).toBe(1);
    expect(links.get(a)!.enabled).toBe(true);

    // A skill left out of the list is unlinked.
    const shrunk = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skills: [{ skill_id: a, enabled: true }] },
    });
    expect((shrunk.json() as AgentSkillLink[]).map((l) => l.skill_id)).toEqual([a]);
  });

  it('unlinking removes only that row and keeps the rest of the set', async () => {
    const app = await makeApp();
    const { agentId, a, b } = await fixture(app, 'unlink');

    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [a, b] },
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/agents/${agentId}/skills/${b}`,
    });
    const links = res.json() as AgentSkillLink[];
    expect(links.map((l) => l.skill_id)).toEqual([a]);

    const rows = await pg.handle.db
      .select()
      .from(t.agentSkills)
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.agentSkills.skillId, b)));
    expect(rows).toHaveLength(0);
  });

  it('rejects an empty patch and 404s an unknown agent', async () => {
    const app = await makeApp();
    const { agentId, a } = await fixture(app, 'guards');
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [a] },
    });

    const empty = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/skills/${a}`,
      payload: {},
    });
    expect(empty.statusCode).toBe(422);

    const missing = await app.inject({
      method: 'PUT',
      url: `/agents/00000000-0000-4000-8000-000000000000/skills/${a}`,
      payload: { enabled: false },
    });
    expect(missing.statusCode).toBe(404);
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { Review, RunTrace } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills-injection] Docker not available — skipping integration tests.');
}

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
  ],
};

/**
 * The review pipeline derives PR intent once per batch before the agent loop
 * (`run-executor.ts`), which defaults to the `openrouter` provider — mock it
 * here so this suite never makes a real network call regardless of which real
 * secrets happen to be configured on the machine running it.
 */
const INTENT_FIXTURE = {
  intent: 'Add rate limiting to protect the public API from abuse.',
  in_scope: ['Rate limiting middleware'],
  out_of_scope: [],
  risk_areas: [],
};

const SKILL_NAME = 'injection-probe-skill';
const SKILL_BODY = 'Always check that secrets are read from the environment.';

/**
 * L02 — the per-agent skill switch, end to end.
 *
 * The three phases run against the SAME PR and the SAME agent, so the only
 * variable between them is the link: no link → one enabled link → the same link
 * disabled. That is exactly the comparison the lesson makes, and it is what the
 * `enabled` column exists for (toggling must not require deleting the link).
 */
d('skills injection (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let prId: string;
  let agentId: string;
  let skillId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));

    const db = pg.handle.db;
    const [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'skills-probe',
        fullName: 'acme/skills-probe',
      })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 7,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    await db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
    prId = pr!.id;

    // A trusted (manual) skill — its body reaches the prompt unwrapped, so the
    // assertions can look for the literal text.
    const [skill] = await db
      .insert(t.skills)
      .values({
        workspaceId,
        name: SKILL_NAME,
        description: 'Probe skill used by the injection test.',
        type: 'rubric',
        source: 'manual',
        body: SKILL_BODY,
        enabled: true,
        version: 1,
      })
      .returning();
    skillId = skill!.id;

    const app = await makeApp();
    // repo_intel off: the prompt then contains nothing but the task, the diff
    // and (once linked) the skills — so `skills: null` is an exact assertion.
    agentId = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: {
          name: 'Skill Probe Agent',
          provider: 'openai',
          model: 'gpt-4.1',
          system_prompt: 'Review the diff.',
          repo_intel: false,
        },
      })
    ).json().id as string;
    await app.close();
  });

  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient(),
        llm: {
          openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }),
          openrouter: new MockLLMProvider('openai', { structured: INTENT_FIXTURE }),
        },
      },
    });
  }

  /** Kick off a run for the probe agent and return its runId once it is fully
   *  persisted (the trace is written LAST, after the run_skills rows). */
  let runsSoFar = 0;
  async function review(): Promise<string> {
    const app = await makeApp();
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId } })
    ).json();
    const runId = body.runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, prId, { expected: ++runsSoFar });
    await waitForTrace(runId);
    await app.close();
    return runId;
  }

  async function waitForTrace(runId: string): Promise<RunTrace> {
    for (let i = 0; i < 200; i++) {
      const [row] = await pg.handle.db
        .select()
        .from(t.runTraces)
        .where(eq(t.runTraces.runId, runId));
      if (row) return row.trace as RunTrace;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`trace for run ${runId} was never persisted`);
  }

  const runSkillsFor = (runId: string) =>
    pg.handle.db.select().from(t.runSkills).where(eq(t.runSkills.runId, runId));

  const traceFor = async (runId: string) => {
    const [row] = await pg.handle.db
      .select()
      .from(t.runTraces)
      .where(eq(t.runTraces.runId, runId));
    return row!.trace as RunTrace;
  };

  it('with no linked skills the prompt has no skills section and no run_skills rows', async () => {
    const runId = await review();

    const trace = await traceFor(runId);
    expect(trace.prompt_assembly.skills).toBeNull();
    expect(trace.prompt_assembly.user).not.toContain('## Skills / rules');
    expect(await runSkillsFor(runId)).toHaveLength(0);
  });

  it('an enabled link injects the block and records ONE run_skills row', async () => {
    await pg.handle.db
      .insert(t.agentSkills)
      .values({ agentId, skillId, order: 0, enabled: true });

    const runId = await review();

    const trace = await traceFor(runId);
    expect(trace.prompt_assembly.skills).not.toBeNull();
    expect(trace.prompt_assembly.skills).toContain(SKILL_NAME);
    expect(trace.prompt_assembly.skills).toContain(SKILL_BODY);
    // manual source ⇒ trusted ⇒ not delimiter-wrapped
    expect(trace.prompt_assembly.skills).not.toContain('<untrusted');
    expect(trace.prompt_assembly.user).toContain('## Skills / rules');

    const rows = await runSkillsFor(runId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ skillId, skillVersion: 1, order: 0 });
    expect(rows[0]!.tokens).toBeGreaterThan(0);
  });

  it('disabling the link removes the block again — WITHOUT deleting the link', async () => {
    await pg.handle.db
      .update(t.agentSkills)
      .set({ enabled: false })
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.agentSkills.skillId, skillId)));

    const runId = await review();

    const trace = await traceFor(runId);
    expect(trace.prompt_assembly.skills).toBeNull();
    expect(await runSkillsFor(runId)).toHaveLength(0);

    // the association (and its order) survives the toggle
    const links = await pg.handle.db
      .select()
      .from(t.agentSkills)
      .where(eq(t.agentSkills.agentId, agentId));
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ skillId, enabled: false, order: 0 });
  });
});

import 'dotenv/config';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
} from './seed-prompts.js';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * L02 — system prompts for the two skills-lesson agents and the bodies of the
 * three starter skills. Mirrors of `docs/agent-prompts/test-quality-reviewer.md`
 * and `api-contract-reviewer.md`; keep the two in sync by hand — seeding must
 * stay filesystem-free (it runs against a container in tests).
 */

const TEST_QUALITY_REVIEWER_PROMPT = `# Role
You are a senior engineer reviewing the TESTS in a pull-request diff for a Node.js
(TypeScript, ESM) service. Production code is in scope only as the thing the tests
are supposed to pin down. Your question is never "does this code work" but "if this
code broke tomorrow, would this test suite say so?"

# Stack context (assume this unless the diff shows otherwise)
- Runner: vitest. DB-backed suites use testcontainers and are named \`*.it.test.ts\`;
  everything else is hermetic and mocked.
- Adapters (LLM, GitHub, git, secrets) sit behind interfaces and are swapped for
  mocks via a DI container — mocking an adapter is normal here; mocking the unit
  under test is not.

# What to look for (priority order)

## 1. Uncovered behaviour introduced by this diff
- A new branch, guard, early return, \`catch\`, or default value with no test that
  exercises it. **Name the specific uncovered branch** — file, condition, and the
  input that would reach it. "Coverage could be better" is not a finding.
- A new error path that is never asserted: the test only proves the happy path
  still passes.
- A changed behaviour whose old test still passes unchanged — that means the test
  was not testing the behaviour that changed.

## 2. Assertions that cannot fail
- A test with no assertion, or one that only asserts the mock was called.
- Asserting a value the test itself just constructed, or re-deriving the expected
  value with the same code the implementation uses.
- \`expect(result).toBeDefined()\` / \`toBeTruthy()\` where the actual contract is a
  specific shape, value, or count.
- An async test that never awaits the assertion, so it passes while the promise
  rejects after the test ends.

## 3. Over-mocking
- Mocking the module under test, or stubbing so much that the test only verifies
  the stub graph. If every collaborator is stubbed, the test proves wiring, not
  behaviour — say what it would fail to catch.
- Asserting on call counts / argument order where the observable outcome (returned
  value, persisted row, emitted event) is what callers actually depend on.
- A mock that drifts from the real adapter's contract (returns a shape the real
  one never returns), which makes the test green against an impossible world.

## 4. Corner cases the test set skips
- Empty collection, single element, boundary index, \`null\`/\`undefined\`, zero,
  duplicate input, unicode/long strings where length matters.
- Concurrency: two runs of the same operation, cancellation mid-flight, retry after
  a failure.
- Tenancy/scoping: an entity from another workspace must not be readable — a test
  that only ever uses one workspace cannot catch a missing scope filter.

## 5. Flaky patterns
- Dependence on wall-clock time, \`Date.now()\`, timezones, or a real \`setTimeout\`
  race instead of a deterministic clock or an explicit wait-for-condition.
- Dependence on iteration/array order that the source does not guarantee (DB rows
  without \`ORDER BY\`, \`Object.keys\`, \`Promise.all\` completion order).
- Shared mutable fixtures or a seeded DB row that a sibling test also writes, so
  the suite passes alone and fails in a full run.
- Fixed ports, real network calls, or reliance on files left behind by another test.

# How to analyze
- For each changed behaviour, find the test that would fail if you inverted the
  condition or deleted the line. If you cannot name it, that is the finding.
- Read the assertions before the setup: state what the test would still pass with,
  if the implementation were wrong.
- Only flag tests introduced or changed by THIS diff, or production changes that
  invalidate an existing test.

# Quality bar
- Precision over volume. No "add more tests" without naming the case, no style nits
  about test naming, no demands for coverage percentages.
- A well-tested diff is a real outcome: return an EMPTY findings list and approve.

# Severity — use exactly these three levels
- **CRITICAL** — the diff ships behaviour that no test can fail on, and the
  behaviour is one whose breakage causes a security, data, or correctness incident;
  or a test asserts something false and thereby locks in a bug. This is the ONLY
  level that blocks merge.
- **WARNING** — a real gap that will let a regression through: an untested error
  path, an over-mocked test that proves nothing, a flaky pattern that will make the
  suite unreliable.
- **SUGGESTION** — a corner case worth adding, a clearer assertion, a fixture
  simplification.

Assign the severity you would defend to the author's face. Do NOT inflate: a
missing edge-case test is a WARNING, not a CRITICAL. If you would dismiss your own
finding as a likely false positive, do not report it at all.

# Verdict — set \`verdict\` consistently with your findings
- **request_changes** — you reported at least one CRITICAL finding.
- **comment** — you reported only WARNING / SUGGESTION findings.
- **approve** — you found nothing worth reporting: return an EMPTY findings list
  and use \`summary\` to say which behaviours you confirmed are pinned down.

The verdict is a pure function of your findings. NEVER request_changes with an
empty findings list; NEVER approve while reporting a CRITICAL. No findings ⇒ approve.

# Findings discipline
- Report only DISTINCT issues. Never list the same gap twice, and never pad toward
  a number — there is no minimum, target, or maximum count.
- Every finding must cite an exact file and line range that exists in the diff, and
  name the concrete input or branch that goes unverified.
- Set \`kind\` to "finding" and leave \`trifecta_components\` / \`evidence\` null.`;

const API_CONTRACT_REVIEWER_PROMPT = `# Role
You are a senior API engineer reviewing a pull-request diff for changes to the
service's PUBLIC SURFACE: HTTP routes, request and response shapes, status codes,
validation schemas, and the exported types clients compile against. Your single
question is: **would an existing caller that worked before this merge still work
after it?** A caller you cannot see is still a caller.

# Stack context (assume this unless the diff shows otherwise)
- HTTP: Fastify 5. Routes declare Zod schemas via \`fastify-type-provider-zod\`, so
  ONE schema drives both request validation and response serialization — tightening
  a request schema rejects payloads that used to be accepted, and narrowing a
  response schema silently strips fields from the wire.
- Contracts: Zod objects shared between server and client. A field removed there
  disappears from every consumer's types at once.
- Errors: a typed error → status mapping. Changing which error a path throws
  changes the status a client sees.

# What to look for (priority order)

## 1. Removed or renamed things
- A route, method, or path segment deleted or renamed with no alias kept.
- A response field removed or renamed. Clients read fields by name; a rename is a
  removal plus an addition, not a rename.
- An exported type, enum member, or constant removed from the shared contracts.

## 2. Narrowed types and tightened validation
- A response field that was optional/nullable becoming required, or vice versa —
  both directions break somebody: producers on one side, consumers on the other.
- A widened-to-narrowed type: \`string\` → an enum, \`number\` → a bounded range, an
  array → a single value, a nullable → non-nullable.
- A request schema gaining \`.strict()\`, a stricter format (\`uuid\`, \`email\`, \`min\`,
  \`max\`, \`regex\`), or a new enum that drops a previously accepted value.

## 3. New required inputs
- A new required body field, query param, path segment, or header. Existing callers
  do not send it and will start failing validation immediately.
- A default removed, so a previously optional field is now effectively mandatory.
- An auth/scoping requirement added to a route that did not have one — correct to
  add, but it IS a breaking change and must be called out as such.

## 4. Status codes and error semantics
- A path that used to return 200 now returning 201/204, or an empty-result case
  flipping between 200 with an empty list and 404.
- A validation failure changing status (422 ⇄ 400), or a not-found becoming a
  403/500. Clients branch on these.
- A previously idempotent call becoming non-idempotent, or a retry-safe call
  gaining a side effect on the retry path.

## 5. Semantic breakage behind an unchanged signature
- The same field changing meaning, unit, timezone, or encoding (seconds → ms, local
  → UTC, id → slug) while its type stays identical. This is the most damaging
  category because nothing fails to compile.
- Pagination defaults, ordering, or limits changing so a caller silently gets
  different data.

# How to analyze
- For each changed route or contract, reconstruct the OLD shape from the diff's
  removed lines and diff it against the new one field by field, then ask what a
  caller written against the old shape sends and expects.
- Distinguish additive from breaking: a new OPTIONAL response field or a new
  OPTIONAL request field is backwards compatible — do not report it. A new required
  one is not.
- When a break is intentional and necessary, still report it, and say what would
  make it safe: keep the old field for one release, accept both shapes, add the
  route alias, or version the endpoint.
- Only flag changes introduced by THIS diff.

# Quality bar
- Precision over volume. No naming preferences, no REST-purity opinions, no
  speculation about hypothetical future clients.
- A purely additive diff is a real outcome: return an EMPTY findings list and approve.

# Severity — use exactly these three levels
- **CRITICAL** — an existing caller breaks with no migration path: a removed or
  renamed field or route, a new required input, a narrowed type, a changed status
  code, or a silently changed meaning/unit. This is the ONLY level that blocks merge.
- **WARNING** — compatible today but sets a trap: an inconsistent shape across
  sibling endpoints, an undocumented behaviour change, a deprecation with no notice,
  a validation change that is stricter only for inputs nobody should be sending.
- **SUGGESTION** — a naming or shape improvement worth making while the surface is
  already being touched.

Assign the severity you would defend to the author's face. Do NOT inflate: an
additive optional field is not a break, and an internal-only helper is not API
surface. If you would dismiss your own finding as a likely false positive, do not
report it at all.

# Verdict — set \`verdict\` consistently with your findings
- **request_changes** — you reported at least one CRITICAL finding.
- **comment** — you reported only WARNING / SUGGESTION findings.
- **approve** — you found no breaking change: return an EMPTY findings list and use
  \`summary\` to name the endpoints and contracts you checked.

The verdict is a pure function of your findings. NEVER request_changes with an
empty findings list; NEVER approve while reporting a CRITICAL. No findings ⇒ approve.

# Findings discipline
- Report only DISTINCT issues. Never list the same break twice, and never pad toward
  a number — there is no minimum, target, or maximum count.
- Every finding must cite an exact file and line range that exists in the diff, name
  the old shape and the new one, and state the caller behaviour that breaks.
- Set \`kind\` to "finding" and leave \`trifecta_components\` / \`evidence\` null.`;

const TEST_COVERAGE_NUDGE_BODY = `Apply this rubric to every branch the diff introduces or changes.

**A branch is** any point where execution can go two ways: \`if\` / \`else\`, \`?:\`,
\`??\` and \`||\` fallbacks, \`switch\` cases, optional chaining that can short-circuit,
early \`return\`s and guard clauses, \`catch\` blocks, loop bodies that may run zero
times, and a default parameter value.

**The rule.** Each such branch needs at least one test whose assertion FAILS if
that branch is deleted or inverted. Not a test that merely executes the line — a
test that observes the difference: a returned value, a persisted row, a thrown
error, an emitted event.

**When a branch is unverified, report it and NAME it.** A finding must state:
1. the file and line of the branch,
2. the condition, in the code's own terms (e.g. \`rows.length === 0\`),
3. the concrete input that reaches it (e.g. "a PR whose diff has no files"),
4. what would silently pass today if that branch were wrong.

Findings that say "coverage is insufficient", "consider adding tests", or "this
needs more test cases" without those four parts are noise — do not report them.

**Weight the branches, do not list them all.** Prioritise error paths, fallbacks
that hide failures (\`?? []\`, \`catch { return undefined }\`), and any branch whose
wrong outcome is silent rather than loud. A missing test for a logging-only branch
is not worth a finding.

**Do not demand a coverage percentage** and do not ask for a test per line. One
test that pins the behaviour is better than three that pin the implementation.`;

const API_CONTRACT_GATE_BODY = `Treat every change to the public surface as a change an existing caller has to
survive. The caller is not in this diff and cannot be updated in the same commit —
assume it is deployed, running, and written against the OLD shape.

**Flag as a break (CRITICAL) any of these:**
- A response field REMOVED or RENAMED. A rename is a removal plus an addition.
- A route, method, or path segment removed or renamed without an alias.
- A type NARROWED: \`string\` → enum, nullable → non-nullable, wider number range →
  bounded, array → scalar, or a request schema gaining \`.strict()\` / a stricter
  format that rejects previously accepted payloads.
- A NEW REQUIRED request field, query param, path segment, or header — including a
  field that became required because its default was dropped.
- A STATUS CODE change on an existing path: 200 → 201/204, 422 ⇄ 400, not-found
  flipping between 404 and an empty 200.
- A field whose TYPE is unchanged but whose MEANING, unit, timezone, or encoding
  changed (seconds → milliseconds, local → UTC, id → slug). This is the worst
  category: nothing fails to compile and every caller silently misreads it.

**Do NOT flag as a break:**
- A new OPTIONAL response field, or a new OPTIONAL request field with a default.
- Internal helpers, private types, and anything not reachable by a caller.
- A widening: non-nullable → nullable on a REQUEST field, enum → string on input.

**For every break, state the migration in the suggestion**: keep the old field for
one release alongside the new one, accept both request shapes, add a route alias,
or version the endpoint. "This is breaking" without a path forward is half a review.

An intentional, agreed break is still a break. Report it; the author decides.`;

const NO_THEN_CHAINS_BODY = `House rule: asynchronous control flow is written with \`async\` / \`await\`, not with
\`.then()\` / \`.catch()\` chains.

**Flag** any NEW or MODIFIED code in the diff that chains \`.then(...)\`,
\`.catch(...)\`, or \`.finally(...)\` to sequence work, and give the \`await\` rewrite in
the suggestion. Severity is SUGGESTION when the chain is correct and merely
inconsistent with the codebase; WARNING when the chain also hurts correctness or
readability, which it usually does:

- A \`.then()\` whose callback returns a promise that is not returned, so the outer
  promise resolves before the inner work finishes.
- A chain mixed with \`await\` in the same function — half the errors land in the
  chain's \`.catch()\`, half in the surrounding \`try\`.
- A \`.catch()\` that swallows and returns \`undefined\`, turning a failure into a
  successful-looking empty result.
- Nested \`.then()\` blocks more than one level deep.

**Two accepted exceptions — do not flag these:**
1. A deliberate fire-and-forget tail on a statement that must not be awaited, e.g.
   \`void doWork().catch(() => undefined)\` — best-effort work whose failure must not
   fail the caller. The codebase uses this on purpose for stats-only writes.
2. Promise combinators: \`Promise.all\` / \`allSettled\` / \`race\`, which are the
   correct tool for concurrency and are not a \`.then()\` chain.

Do not rewrite untouched surrounding code into \`await\`; this rule applies to what
the diff adds or changes.`;

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, the built-in agents (General + Security + Performance +
 * Test Quality + API Contract), all on the default openrouter/deepseek-v4-flash
 * provider+model, and the three starter skills with their agent links (L02).
 *
 * Course lessons populate the remaining tables (conventions, memory, eval, …)
 * once their features are built — they start empty here.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

export async function seed(db: Db): Promise<{ workspaceId: string; userId: string }> {
  // ---- workspace + user (no-auth defaults) ----
  let [ws] = await db
    .select()
    .from(t.workspaces)
    .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  if (!ws) {
    [ws] = await db
      .insert(t.workspaces)
      .values({ name: DEFAULT_WORKSPACE_NAME })
      .returning();
  }
  const workspaceId = ws!.id;

  let [user] = await db.select().from(t.users).where(eq(t.users.email, SYSTEM_USER_EMAIL));
  if (!user) {
    [user] = await db
      .insert(t.users)
      .values({ email: SYSTEM_USER_EMAIL, name: 'You' })
      .returning();
  }
  const userId = user!.id;

  await db
    .insert(t.workspaceMembers)
    .values({ workspaceId, userId, role: 'owner' })
    .onConflictDoNothing();

  // ---- default settings ----
  const defaultSettings: Record<string, unknown> = {
    polling_interval_min: 5,
    theme: 'dark',
    density: 'regular',
    sync_to_folder: true,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoNothing();
  }

  // ---- demo repo (acme/payments-api) ----
  let [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
  if (!repo) {
    [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
        defaultBranch: 'main',
        clonePath: null,
        createdBy: userId,
      })
      .returning();
  }
  const repoId = repo!.id;

  // ---- PR #482 (rate limiting) ----
  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit-public',
        base: 'main',
        headSha: 'a1b2c3d4e5f6',
        additions: 247,
        deletions: 38,
        filesCount: 9,
        status: 'needs_review',
        body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      })
      .returning();

    // pr_files (subset)
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
      { prId: pr!.id, path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
      { prId: pr!.id, path: 'src/config.ts', additions: 4, deletions: 0 },
      { prId: pr!.id, path: 'src/api/users.ts', additions: 7, deletions: 2 },
    ]);

    // pr_commits
    await db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: 'a1b2c3d4e5f6',
      message: 'Add token-bucket rate limiter',
      author: 'marisa.koch',
    });

    // a sample review + findings so the PR shows results before the first run
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary:
          'Solid middleware approach, but a Stripe secret key is committed in plaintext and the user-list endpoint introduces an N+1 query under the new limiter.',
        score: 61,
        model: 'seed',
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key in commit',
        rationale: 'Line 12 contains a literal `sk_live_` Stripe secret key.',
        suggestion: 'Move to env var and rotate the key immediately.',
        confidence: 0.98,
      },
      {
        reviewId: review!.id,
        file: 'src/api/users.ts',
        startLine: 45,
        endLine: 52,
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query in user list endpoint',
        rationale: 'Loop issues one query per user → N+1.',
        suggestion: 'Use a single IN query and group in memory.',
        confidence: 0.86,
      },
    ]);
  }

  // ---- built-in agents (the three starter presets) ----
  // Prompt bodies live in ./seed-prompts.ts (mirrored in docs/agent-prompts/*.md).
  const seedAgents: Array<typeof t.agents.$inferInsert> = [
    {
      workspaceId,
      name: 'General Reviewer',
      description: 'Reviews a PR diff for bugs, correctness, and clarity.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Security Reviewer',
      description: 'Flags secrets, injection, SSRF and the lethal trifecta before merge.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: SECURITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Performance Reviewer',
      description: 'Catches N+1 queries, missing indexes, and hot-path allocations.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: PERFORMANCE_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Test Quality Reviewer',
      description:
        'Judges the tests: uncovered branches, missing corner cases, over-mocking, flaky patterns.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'API Contract Reviewer',
      description:
        'Guards the public surface: route signatures, request/response shapes, status codes, backwards compatibility.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: API_CONTRACT_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
  ];
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (!existing) await db.insert(t.agents).values(a);
  }

  // ---- starter skills (L02) ----
  // A skill's `description` is its INTERFACE: it is what the agent editor shows
  // and what a human decides "attach / don't attach" on. Write it as a directive,
  // not as a label. `source: 'manual'` means the body is trusted and reaches the
  // prompt unwrapped (anything imported/extracted is delimiter-wrapped instead).
  const seedSkills: Array<typeof t.skills.$inferInsert> = [
    {
      workspaceId,
      name: 'test-coverage-nudge',
      description:
        'Require an assertion on every branch the diff introduces, and name the uncovered one.',
      type: 'rubric',
      source: 'manual',
      body: TEST_COVERAGE_NUDGE_BODY,
      enabled: true,
      version: 1,
    },
    {
      workspaceId,
      name: 'api-contract-gate',
      description:
        'Flag any change that breaks an existing caller: removed/renamed fields, narrowed types, changed status codes, new required params.',
      type: 'security',
      source: 'manual',
      body: API_CONTRACT_GATE_BODY,
      enabled: true,
      version: 1,
    },
    {
      workspaceId,
      name: 'no-then-chains',
      description: 'House rule: use async/await instead of .then() chains.',
      type: 'convention',
      source: 'manual',
      body: NO_THEN_CHAINS_BODY,
      enabled: true,
      version: 1,
    },
  ];
  for (const s of seedSkills) {
    const [existing] = await db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, s.name)));
    if (!existing) await db.insert(t.skills).values(s);
  }

  // ---- agent ⇄ skill links ----
  // Each specialist gets exactly the one skill that sharpens it. `no-then-chains`
  // is deliberately left UNLINKED: it is the skill attached live in the lesson, so
  // the before/after prompt comparison starts from a run without it.
  const seedLinks: Array<{ agent: string; skill: string }> = [
    { agent: 'Test Quality Reviewer', skill: 'test-coverage-nudge' },
    { agent: 'API Contract Reviewer', skill: 'api-contract-gate' },
  ];
  for (const link of seedLinks) {
    const [agent] = await db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, link.agent)));
    const [skill] = await db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, link.skill)));
    if (!agent || !skill) continue;
    await db
      .insert(t.agentSkills)
      .values({ agentId: agent.id, skillId: skill.id, order: 0, enabled: true })
      .onConflictDoNothing();
  }

  return { workspaceId, userId };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seed(handle.db)
    .then(async (r) => {
      console.log('✓ seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}

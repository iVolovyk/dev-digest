import { createHash } from 'node:crypto';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import type {
  FeatureModelChoice,
  GitClient,
  GitHubClient,
  IntentConfidence,
  IntentSource,
  LLMProvider,
  PrIntentRecord,
  Provider,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import {
  INTENT_MAX_RETRIES,
  INTENT_PROMPT_VERSION,
  INTENT_SCHEMA_NAME,
  INTENT_SYSTEM_PROMPT,
  MAX_BODY_CHARS,
  MAX_DIFF_PATHS,
  MAX_ISSUE_BODY_CHARS,
  MAX_SPEC_CHARS,
  MAX_TITLE_CHARS,
} from './constants.js';
import { computeConfidence } from './confidence.js';
import { formatIntentForPrompt } from './format.js';
import { IntentExtractionResult, type IntentExtraction } from './llm-schema.js';
import { normaliseIntentExtraction } from './normalise.js';
import { scanReferences } from './references.js';
import { IntentContextRepository } from './repository.js';

/**
 * PR intent classifier — derives a one-line intent statement plus in-scope /
 * out-of-scope / risk-area lists from a PR's own documentation, and computes
 * a deterministic confidence bucket from which signals were actually
 * available. Confidence is NEVER requested from the model (`confidence.ts`).
 *
 * Fetched/author-supplied content (PR body, linked issue, linked spec) is the
 * same class of untrusted content a review prompt handles, so every fragment
 * goes through `wrapUntrusted` and the system prompt tells the model that
 * content is data to analyze, never instructions to follow — the same shared
 * rule as `reviewer-core`'s `INJECTION_GUARD`, not a second guard.
 */

// ---- Narrow local shapes for what this service needs from the PR/repo -----
// (R3 — a service works with contract-shaped types, not `*Row` DB types; R5 —
// no sibling-module import. `PullRow`/`RepoRow` from run-executor.ts and
// `IntentPullContext` from this module's own repository both satisfy these
// structurally.)

export interface IntentPull {
  id: string;
  number: number;
  title: string;
  body: string | null;
  branch: string;
  headSha: string;
}

export interface IntentRepoRef {
  owner: string;
  name: string;
}

// ---- `IntentStore` port (user decision 2026-08-25, Risk #9) ----------------
//
// `pr_intent` stays owned by `ReviewRepository` (the single writer); this
// service reaches it through a narrow local port that `container.reviewRepo`
// satisfies structurally — mirrors `RepoIntelSamples`
// (`conventions/service.ts`). `input_hash` is an internal staleness field, not
// part of the public `PrIntentRecord` API contract, so it is declared here
// rather than imported from `modules/reviews` (R5).

export interface IntentStoreRecord extends PrIntentRecord {
  input_hash: string;
}

export interface IntentUpsertValues {
  intent: string;
  in_scope: string[];
  out_of_scope: string[];
  risk_areas: string[];
  confidence: IntentConfidence;
  sources: IntentSource[];
  head_sha: string | null;
  model: string | null;
  input_hash: string;
}

export interface IntentStore {
  getIntent(prId: string): Promise<IntentStoreRecord | undefined>;
  upsertIntent(prId: string, values: IntentUpsertValues): Promise<IntentStoreRecord>;
}

interface ResolvedSpec {
  path: string;
  content?: string;
}

export class IntentService {
  constructor(
    private intentStore: IntentStore,
    private contextRepo: IntentContextRepository,
    private git: GitClient,
    private githubFor: () => Promise<GitHubClient>,
    private llmFor: (provider: Provider) => Promise<LLMProvider>,
    private resolveModel: (workspaceId: string) => Promise<FeatureModelChoice>,
  ) {}

  /**
   * Format a persisted record into the plain string `reviewer-core` receives
   * (R6). Exposed as a service method — not a free function imported
   * directly — so `run-executor.ts` (modules/reviews) never imports
   * `modules/intent/format.ts` (R5); it reaches everything through this
   * service, which it gets from the container (Risk #9 / C11).
   */
  formatForPrompt(record: PrIntentRecord): string {
    return formatIntentForPrompt(record);
  }

  /** Read-only: whatever is persisted, or undefined. Never computes (§4 — a
   *  GET must stay safe and free). Throws NotFoundError for a PR outside the
   *  caller's workspace (never leaks another workspace's intent). */
  async get(workspaceId: string, prId: string): Promise<PrIntentRecord | undefined> {
    const ctx = await this.contextRepo.getPullWithRepo(workspaceId, prId);
    if (!ctx) throw new NotFoundError('Pull request not found');
    return this.intentStore.getIntent(prId);
  }

  /**
   * Primary trigger — called once per review batch, after the diff load
   * (`run-executor.ts`). Best-effort by design: any failure (missing GitHub
   * token, LLM error, …) propagates to the caller, which degrades to "no
   * intent" and continues the review rather than failing it (§2, unlike the
   * diff's `failAll`). The one exception is a normalised-to-empty model
   * output, which is not a thrown error — it returns `undefined` directly.
   */
  async ensureIntent(
    workspaceId: string,
    pull: IntentPull,
    repo: IntentRepoRef,
    diffPaths: string[],
  ): Promise<PrIntentRecord | undefined> {
    return this.compute(workspaceId, pull, repo, diffPaths, { bypassCache: false });
  }

  /** Secondary trigger — `POST /pulls/:id/intent/refresh`. Always recomputes
   *  (bypasses the input-hash cache) and always returns a record: an empty
   *  model result is a user-visible failure here, not a silent degrade. */
  async refresh(workspaceId: string, prId: string): Promise<PrIntentRecord> {
    const ctx = await this.contextRepo.getPullWithRepo(workspaceId, prId);
    if (!ctx) throw new NotFoundError('Pull request not found');
    const diffPaths = await this.contextRepo.prFilePaths(prId);
    const record = await this.compute(workspaceId, ctx.pr, ctx.repo, diffPaths, { bypassCache: true });
    if (!record) {
      throw new AppError(
        'intent_empty',
        'The model did not produce a usable intent for this pull request',
        502,
      );
    }
    return record;
  }

  private async compute(
    workspaceId: string,
    pull: IntentPull,
    repo: IntentRepoRef,
    diffPaths: string[],
    opts: { bypassCache: boolean },
  ): Promise<PrIntentRecord | undefined> {
    const cappedDiffPaths = diffPaths.slice(0, MAX_DIFF_PATHS);
    const commitMessages = await this.contextRepo.commitMessages(pull.id);

    const title = pull.title.trim().slice(0, MAX_TITLE_CHARS);
    const body = (pull.body ?? '').trim().slice(0, MAX_BODY_CHARS);

    // Scan the RAW body (not yet truncated) so a reference near the cutoff
    // is never missed.
    const scanned = scanReferences(pull.body, repo);

    // ---- Resolve the linked ticket (best-effort) ----
    let issueBody: string | undefined;
    let issueUnresolved = false;
    if (scanned.issueNumber !== undefined) {
      try {
        const github = await this.githubFor();
        const issue = await github.getIssue(repo, scanned.issueNumber);
        const trimmed = (issue.body ?? '').trim();
        if (trimmed.length > 0) {
          issueBody = trimmed.slice(0, MAX_ISSUE_BODY_CHARS);
        } else {
          issueUnresolved = true;
        }
      } catch {
        // No token configured, or the issue fetch failed — same degrade path
        // as `modules/pulls/routes.ts`.
        issueUnresolved = true;
      }
    }

    // ---- Resolve linked spec(s) ----
    const specs: ResolvedSpec[] = [];
    for (const path of scanned.specPaths) {
      try {
        const content = await this.git.readFile(repo, path);
        // `MockGitClient.readFile` returns '' for a missing path while
        // `SimpleGitClient` throws ENOENT — treat an empty read the same as a
        // caught exception so both adapters degrade identically
        // (server/INSIGHTS.md 2026-08-18).
        if (content.trim().length === 0) {
          specs.push({ path });
        } else {
          specs.push({ path, content: content.trim().slice(0, MAX_SPEC_CHARS) });
        }
      } catch {
        specs.push({ path });
      }
    }
    const linkedSpecResolved = specs.some((s) => s.content !== undefined);
    const specUnresolvedCount = specs.filter((s) => s.content === undefined).length;

    // A broken pointer is worse than no pointer (§1) — any detected reference
    // that couldn't be resolved lowers confidence, including an external URL
    // that was deliberately never fetched (Risk #2, SSRF).
    const anyReferenceUnresolved =
      issueUnresolved || specUnresolvedCount > 0 || scanned.externalUrls.length > 0;

    // ---- Resolve the feature model (cheap — a Settings row, no network) ----
    const { provider, model } = await this.resolveModel(workspaceId);

    // ---- Deterministic input hash: every resolved signal + prompt version + model ----
    const hashPayload = JSON.stringify({
      version: INTENT_PROMPT_VERSION,
      model,
      title,
      body,
      issueNumber: scanned.issueNumber ?? null,
      issueBody: issueBody ?? null,
      specs: specs.map((s) => ({ path: s.path, content: s.content ?? null })),
      externalUrls: scanned.externalUrls,
      branch: pull.branch,
      commitMessages,
      diffPaths: cappedDiffPaths,
    });
    const inputHash = createHash('sha256').update(hashPayload).digest('hex');

    if (!opts.bypassCache) {
      const existing = await this.intentStore.getIntent(pull.id);
      if (existing && existing.input_hash === inputHash) {
        return existing;
      }
    }

    // ---- Call the cheap classifier LLM ----
    const llm = await this.llmFor(provider);
    const userMessage = this.buildUserMessage({
      title,
      body,
      issueNumber: scanned.issueNumber,
      issueBody,
      specs,
      externalUrls: scanned.externalUrls,
      branch: pull.branch,
      commitMessages,
      diffPaths: cappedDiffPaths,
    });

    const result = await llm.completeStructured<IntentExtraction>({
      model,
      schema: IntentExtractionResult,
      schemaName: INTENT_SCHEMA_NAME,
      maxRetries: INTENT_MAX_RETRIES,
      messages: [
        { role: 'system', content: INTENT_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    });

    const normalised = normaliseIntentExtraction(result.data);
    if (!normalised) return undefined;

    const { confidence, sources } = computeConfidence({
      bodyLength: body.length,
      linkedIssueResolved: issueBody !== undefined,
      linkedSpecResolved,
      anyReferenceUnresolved,
      branchAvailable: pull.branch.trim().length > 0,
      commitsAvailable: commitMessages.length > 0,
      diffPathsAvailable: cappedDiffPaths.length > 0,
    });

    return this.intentStore.upsertIntent(pull.id, {
      intent: normalised.intent,
      in_scope: normalised.in_scope,
      out_of_scope: normalised.out_of_scope,
      risk_areas: normalised.risk_areas,
      confidence,
      sources,
      head_sha: pull.headSha,
      model,
      input_hash: inputHash,
    });
  }

  /**
   * Build the classifier's user message. Every fetched/author-supplied
   * fragment is `wrapUntrusted`-wrapped (one block per source); explicit
   * negative signals are plain (trusted, unwrapped) `NOTE:` lines — the
   * anti-hallucination mechanism (§5b, Risk #5). A silent omission reads to a
   * model as an invitation to fill the gap.
   */
  private buildUserMessage(input: {
    title: string;
    body: string;
    issueNumber?: number;
    issueBody?: string;
    specs: ResolvedSpec[];
    externalUrls: string[];
    branch: string;
    commitMessages: string[];
    diffPaths: string[];
  }): string {
    const notes: string[] = [];
    const blocks: string[] = [wrapUntrusted('pr-title', input.title || '(no title)')];

    if (input.body.length > 0) {
      blocks.push(wrapUntrusted('pr-description', input.body));
    } else {
      notes.push(
        'NOTE: the description is empty. Infer only from the branch name, commit ' +
          'messages, and changed file paths below, and stay tentative.',
      );
    }

    if (input.issueNumber === undefined) {
      notes.push('NOTE: no linked ticket or issue was referenced in this pull request.');
    } else if (input.issueBody) {
      blocks.push(wrapUntrusted(`linked-issue:#${input.issueNumber}`, input.issueBody));
    } else {
      notes.push(
        `NOTE: the description references issue #${input.issueNumber}, but it could ` +
          'not be fetched. Do NOT guess its contents.',
      );
    }

    for (const spec of input.specs) {
      if (spec.content) {
        blocks.push(wrapUntrusted(`linked-spec:${spec.path}`, spec.content));
      } else {
        notes.push(
          `NOTE: the description references "${spec.path}", but that file could not ` +
            'be read. Do NOT guess its contents.',
        );
      }
    }

    for (const url of input.externalUrls) {
      notes.push(
        `NOTE: the description references an external link (${url}). External ` +
          'links are not fetched. Do NOT guess its contents.',
      );
    }

    blocks.push(wrapUntrusted('branch', input.branch));
    if (input.commitMessages.length > 0) {
      blocks.push(wrapUntrusted('commit-messages', input.commitMessages.join('\n')));
    }
    if (input.diffPaths.length > 0) {
      blocks.push(wrapUntrusted('changed-paths', input.diffPaths.join('\n')));
    }

    return [...notes, ...blocks].join('\n\n');
  }
}

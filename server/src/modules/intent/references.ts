import { MAX_LINKED_SPECS } from './constants.js';

/**
 * Pure PR-body reference scanner (§1). No I/O — resolving what a scanned
 * reference points to (fetching the issue / reading the spec file) is the
 * service's job; this module only recognises the reference shape and rejects
 * anything that looks like a traversal or a cross-repo/external fetch target.
 */

export interface RepoRef {
  owner: string;
  name: string;
}

export interface ScannedReferences {
  /** Issue number referenced in this repo (via `#123` or a same-repo issue URL). */
  issueNumber?: number;
  /** Repo-relative spec/plan paths, already validated + capped at MAX_LINKED_SPECS. */
  specPaths: string[];
  /** URLs detected in the body that are NEVER fetched (Jira/Linear/cross-repo/etc). */
  externalUrls: string[];
}

// Reuses the adapter's own regex semantics (`octokit.ts` `resolveLinkedIssue`).
const ISSUE_REF_RE = /(?:closes|fixes|resolves)?\s*#(\d+)/i;
const GITHUB_ISSUE_URL_RE = /https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)/gi;
const SPEC_DIR_PATH_RE = /(?:^|[\s(`"'])((?:docs|specs|spec|plans|rfcs)\/[\w.\-/]+\.(?:md|mdx))/gi;
const PLAN_SPEC_SUFFIX_RE = /(?:^|[\s(`"'])([\w.\-/]*-(?:plan|spec)\.md)/gi;
const URL_RE = /https?:\/\/[^\s)>\]"']+/gi;

/**
 * A description that cites a spec we could not read is a worse signal than no
 * pointer at all (§1) — so the read must be scoped to the clone. Reject any
 * candidate that could escape it: `..`, a leading `/` (absolute path), or a
 * scheme (`://`, which the char-class already can't match, but kept explicit
 * as defense-in-depth against a future regex change).
 */
function isSafeSpecPath(path: string): boolean {
  if (path.includes('..')) return false;
  if (path.startsWith('/')) return false;
  if (path.includes('://')) return false;
  return true;
}

export function scanReferences(body: string | null | undefined, repo: RepoRef): ScannedReferences {
  const text = body ?? '';

  let issueNumber: number | undefined;
  const hashMatch = text.match(ISSUE_REF_RE);
  if (hashMatch?.[1]) issueNumber = Number(hashMatch[1]);
  if (issueNumber === undefined) {
    for (const m of text.matchAll(GITHUB_ISSUE_URL_RE)) {
      const [, owner, name, n] = m;
      if (owner?.toLowerCase() === repo.owner.toLowerCase() && name?.toLowerCase() === repo.name.toLowerCase()) {
        issueNumber = Number(n);
        break;
      }
    }
  }

  const specCandidates = new Set<string>();
  for (const m of text.matchAll(SPEC_DIR_PATH_RE)) {
    if (m[1]) specCandidates.add(m[1]);
  }
  for (const m of text.matchAll(PLAN_SPEC_SUFFIX_RE)) {
    if (m[1]) specCandidates.add(m[1]);
  }
  const specPaths = [...specCandidates].filter(isSafeSpecPath).slice(0, MAX_LINKED_SPECS);

  // Anything that isn't a same-repo GitHub issue URL is "external" — detected,
  // named to the model, never fetched (Risk #2, SSRF).
  const sameRepoIssueRe = new RegExp(
    `github\\.com/${repo.owner}/${repo.name}/issues/\\d+`,
    'i',
  );
  const externalUrls: string[] = [];
  for (const m of text.matchAll(URL_RE)) {
    if (!sameRepoIssueRe.test(m[0])) externalUrls.push(m[0]);
  }

  return { issueNumber, specPaths, externalUrls };
}

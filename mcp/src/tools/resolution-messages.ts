import type { AgentResolution, PullResolution, RepoResolution } from '../api/resolve.js';
import { formatList } from './shared.js';

/**
 * Turn a resolution miss into a forward-guiding message (principle 4). The
 * `api/` layer returns data; message text lives here so `api/` stays free of
 * MCP vocabulary.
 */

export function repoMissMessage(repo: string, r: Extract<RepoResolution, { ok: false }>): string {
  if (r.knownFullNames.length === 0) {
    return `Repo "${repo}" is not in DevDigest, and no repos are imported yet. Add one in the studio (Add repository).`;
  }
  return (
    `Repo "${repo}" is not in DevDigest. Known repos: ${formatList(r.knownFullNames)}. ` +
    `Add one in the studio (Add repository) if it is missing.`
  );
}

export function pullMissMessage(
  repo: string,
  pr: number,
  r: Extract<PullResolution, { ok: false }>,
): string {
  if (r.reason === 'no_id') {
    return `Pull request #${pr} in ${repo} has no stable id yet — reopen the repo in the studio to re-import it, then try again.`;
  }
  if (r.importedNumbers.length === 0) {
    return `Pull request #${pr} was not found in ${repo}, which has no imported PRs. PRs are imported from GitHub — open the repo in the studio to import them.`;
  }
  return (
    `Pull request #${pr} was not found in ${repo}. Imported PR numbers: ${formatList(r.importedNumbers.map(String))}. ` +
    `PRs are imported from GitHub — open the repo in the studio to import more.`
  );
}

export function agentMissMessage(
  agent: string,
  r: Extract<AgentResolution, { ok: false }>,
): string {
  if (r.reason === 'ambiguous') {
    return (
      `Agent name "${r.name}" matches ${r.ids.length} agents. ` +
      `Call run_agent_on_pr again with one of these ids: ${r.ids.join(', ')}.`
    );
  }
  if (r.available.length === 0) {
    return `Agent "${agent}" not found, and no agents are configured. Create one in the DevDigest studio (Agents).`;
  }
  return (
    `Agent "${agent}" not found. Call list_agents to see valid agents. ` +
    `Available: ${formatList(r.available)}.`
  );
}

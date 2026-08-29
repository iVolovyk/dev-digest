import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/tools/registry.js';
import { fakeFetch, makeDeps } from './helpers.js';

// Independent copy of the plan §6.-1 verbatim descriptions — this is the drift
// guard. If a tool's description is paraphrased, this test fails.
const DESCRIPTIONS: Record<string, string> = {
  list_agents:
    'List the review agents configured in DevDigest. Use this to get a valid agent value for run_agent_on_pr.',
  run_agent_on_pr:
    'Run a DevDigest review agent on a pull request and return its findings. Creates the run, waits for it to finish, and returns the result — one call, no polling needed. Takes up to several minutes.',
  get_findings:
    'Get the findings from the most recent completed review of a pull request. Use run_agent_on_pr first if the PR has not been reviewed.',
  get_conventions:
    'Get the coding conventions DevDigest has already extracted for a repo. Read-only — this never triggers extraction.',
  get_blast_radius:
    'Get the blast radius of a pull request: which symbols changed, who calls them, ' +
    'and which HTTP endpoints and cron jobs sit downstream. Read-only; served from ' +
    'the repository index.',
};

const ORDER = ['list_agents', 'run_agent_on_pr', 'get_findings', 'get_conventions', 'get_blast_radius'];

function registry() {
  const { fetch } = fakeFetch({});
  return buildRegistry(makeDeps(fetch));
}

describe('tool registry', () => {
  it('registers all five tools in a deterministic order', () => {
    expect(registry().map((t) => t.name)).toEqual(ORDER);
  });

  it('names are snake_case and ≤64 chars', () => {
    for (const tool of registry()) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(tool.name.length).toBeLessThanOrEqual(64);
    }
  });

  it('every description matches plan §6.-1 byte-for-byte', () => {
    for (const tool of registry()) {
      expect(tool.description).toBe(DESCRIPTIONS[tool.name]);
    }
  });

  it('annotations match the design', () => {
    const byName = Object.fromEntries(registry().map((t) => [t.name, t.annotations]));
    for (const read of ['list_agents', 'get_findings', 'get_conventions', 'get_blast_radius']) {
      expect(byName[read]!.readOnlyHint).toBe(true);
      expect(byName[read]!.openWorldHint).toBe(false);
    }
    expect(byName.run_agent_on_pr!.readOnlyHint).toBe(false);
    expect(byName.run_agent_on_pr!.idempotentHint).toBe(false);
    expect(byName.run_agent_on_pr!.openWorldHint).toBe(true);
    expect(byName.run_agent_on_pr!.destructiveHint).toBe(false);
  });

  it('every tool has an explicit z.object input and output schema', () => {
    for (const tool of registry()) {
      expect(tool.inputSchema.constructor.name).toContain('Zod');
      expect(tool.outputSchema.constructor.name).toContain('Zod');
    }
  });
});

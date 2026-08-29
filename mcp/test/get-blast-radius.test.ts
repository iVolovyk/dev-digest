import { describe, expect, it } from 'vitest';
import { getBlastRadiusTool } from '../src/tools/get-blast-radius.js';
import { fakeFetch, makeDeps, structured } from './helpers.js';

describe('get_blast_radius', () => {
  it('returns the exact not_implemented payload and makes zero HTTP calls', async () => {
    const { fetch, calls } = fakeFetch({});
    const result = await getBlastRadiusTool(makeDeps(fetch)).handler({
      repo: 'acme/payments-api',
      pr: 7,
    });
    expect(result.isError).toBe(false);
    expect(calls).toHaveLength(0);
    expect(structured(result)).toEqual({
      status: 'not_implemented',
      feature: 'blast_radius',
      message:
        'get_blast_radius is not implemented yet. It is registered so the tool surface stays stable, and will return impacted symbols and callers in a later DevDigest release. For risk signals on this PR today, use get_findings (or run_agent_on_pr if it has not been reviewed).',
    });
  });
});

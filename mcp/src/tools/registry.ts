import type { ToolDef, ToolDeps } from './shared.js';
import { listAgentsTool } from './list-agents.js';
import { runAgentOnPrTool } from './run-agent-on-pr.js';
import { getFindingsTool } from './get-findings.js';
import { getConventionsTool } from './get-conventions.js';
import { getBlastRadiusTool } from './get-blast-radius.js';

/**
 * The five tool definitions, in one array, in a DETERMINISTIC order — the spec
 * asks servers to return tools in a stable order so clients can cache
 * `tools/list`. `registry.test.ts` asserts each `description` matches plan
 * §6.-1 byte-for-byte.
 */
export function buildRegistry(deps: ToolDeps): ToolDef[] {
  return [
    listAgentsTool(deps),
    runAgentOnPrTool(deps),
    getFindingsTool(deps),
    getConventionsTool(deps),
    getBlastRadiusTool(deps),
  ];
}

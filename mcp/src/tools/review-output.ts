import { z } from 'zod';

/**
 * The compact review projection shared by `get_findings` and `run_agent_on_pr`
 * (principle 3). Declared as a raw shape so each tool can spread it into its
 * own `z.object({...})` alongside its tool-specific fields.
 */

export const compactFindingShape = {
  severity: z.string(),
  category: z.string(),
  title: z.string(),
  file: z.string(),
  line: z.number().int(),
  end_line: z.number().int().optional(),
  rationale: z.string(),
  suggestion: z.string().nullable(),
} as const;

export const findingsOutputShape = {
  repo: z.string(),
  pr: z.number().int(),
  agent: z.string(),
  verdict: z.string().nullable(),
  score: z.number().int().nullable(),
  summary: z.string().nullable(),
  findings_count: z.number().int(),
  findings: z.array(z.object(compactFindingShape)),
  truncated: z.boolean(),
} as const;

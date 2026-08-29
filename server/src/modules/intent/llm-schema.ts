import { z } from 'zod';

/**
 * LLM-facing extraction schema — deliberately NOT the persisted `Intent`
 * contract, mirroring the rationale in `conventions/llm-schema.ts`. There is
 * no `confidence` field, by design: confidence is computed in code from
 * signal presence (`confidence.ts`), and strict `json_schema` structured
 * output means the model cannot volunteer one even if it wanted to.
 */
export const IntentExtraction = z.object({
  /** One sentence, present tense, ≤ 200 chars. */
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  /** Short tags, ≤ 60 chars each, e.g. "Auth surface touched". */
  risk_areas: z.array(z.string()),
});
export type IntentExtraction = z.infer<typeof IntentExtraction>;

export const IntentExtractionResult = IntentExtraction;
export type IntentExtractionResult = z.infer<typeof IntentExtractionResult>;

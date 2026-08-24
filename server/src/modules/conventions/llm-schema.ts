import { z } from 'zod';

/**
 * LLM-facing extraction schema — deliberately NOT the persisted
 * `ConventionCandidate` contract. The model is never asked for `id`/`accepted`
 * (persisted-row concepts), and its `evidence_snippet` is never trusted: the
 * service re-slices the snippet from the real file after verifying the line
 * range, so a candidate is only as good as the file it cites.
 */
export const ConventionExtraction = z.object({
  category: z.string(),
  rule: z.string(),
  evidence_path: z.string(),
  /** 1-based, inclusive. */
  evidence_start_line: z.number().int().positive(),
  evidence_end_line: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
});
export type ConventionExtraction = z.infer<typeof ConventionExtraction>;

export const ConventionExtractionResult = z.object({
  candidates: z.array(ConventionExtraction),
});
export type ConventionExtractionResult = z.infer<typeof ConventionExtractionResult>;

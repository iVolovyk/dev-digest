import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BlastRadiusResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * Blast module — an impact map for a PR (changed symbols → callers → downstream
 * HTTP endpoints and cron jobs), computed on read from the repository index.
 *   GET /pulls/:id/blast → the BlastRadius (safe, free, idempotent)
 *
 * A dedicated module rather than a route on `modules/repo-intel` — this is a
 * PR-shaped, workspace-scoped, contract-serialising read; `repo-intel` is
 * repo-scoped and tenant-agnostic by design. See `specs/blast-radius-plan.md` §1.
 *
 * No per-route rate-limit override: this is a cheap indexed read (three indexed
 * queries plus a bounded graph walk, no model call — §2), so the global
 * 120/min applies. Contrast `modules/intent`'s `POST .../intent/refresh`, capped
 * 10/min because each call is a paid LLM round-trip; blast's main path makes no
 * such call, and the optional LLM summary (§7b) would ship on its own `POST`
 * endpoint with its own cap.
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  // Container resolved here (the composition root, per R2/R4); `blastService`
  // is a lazy container getter mirroring `smartDiffService`.
  const service = app.container.blastService;

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams, response: { 200: BlastRadiusResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.build(workspaceId, req.params.id);
    },
  );
}

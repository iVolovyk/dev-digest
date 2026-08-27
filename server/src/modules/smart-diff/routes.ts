import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SmartDiffResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * Smart Diff module — risk-ordered file review for a PR, computed on read from
 * data already persisted (`pr_files`, `findings`). Makes no model call.
 *   GET /pulls/:id/smart-diff → the SmartDiff (safe, free, idempotent)
 *
 * A dedicated module rather than a route on `modules/pulls` — it joins data
 * owned by both `modules/pulls` (`pr_files`) and `modules/reviews` (`findings`),
 * so it belongs to neither; see `specs/smart-diff-plan.md` §1.
 *
 * No per-route rate-limit override — this is a cheap read; the global 120/min
 * applies. (Contrast `POST /pulls/:id/intent/refresh`, capped because it costs
 * money.)
 */
export default async function smartDiffRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  // Container resolved here (the composition root, per R2/R4); the lazy
  // `smartDiffService` getter mirrors `intentService`.
  const service = app.container.smartDiffService;

  app.get(
    '/pulls/:id/smart-diff',
    { schema: { params: IdParams, response: { 200: SmartDiffResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.build(workspaceId, req.params.id);
    },
  );
}

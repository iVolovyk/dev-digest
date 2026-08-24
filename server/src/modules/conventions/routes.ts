import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ConventionCandidate } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../_shared/feature-models.js';
import { CONVENTIONS_FEATURE_ID } from './constants.js';
import { ConventionsRepository } from './repository.js';
import { ConventionsService } from './service.js';

/**
 * Conventions module — the Conventions Extractor (Skills Lab).
 *   POST /repos/:id/conventions/extract → sample + LLM-extract + verify, replaces the repo's candidates
 *   GET  /repos/:id/conventions         → list persisted candidates
 *   PUT  /conventions/:id               → edit a candidate's rule text and/or accept/reject it
 */

const UpdateConventionBody = z.object({
  rule: z.string().min(1).optional(),
  accepted: z.boolean().optional(),
});

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  // Module composition root: the container is resolved here and stops here.
  const service = new ConventionsService(
    new ConventionsRepository(app.container.db),
    app.container.repoIntel,
    app.container.git,
    (provider) => app.container.llm(provider),
    (workspaceId) => resolveFeatureModel(app.container, workspaceId, CONVENTIONS_FEATURE_ID),
  );

  app.post(
    '/repos/:id/conventions/extract',
    {
      schema: { params: IdParams, response: { 200: z.array(ConventionCandidate) } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.extract(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/conventions',
    { schema: { params: IdParams, response: { 200: z.array(ConventionCandidate) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.list(workspaceId, req.params.id);
    },
  );

  app.put(
    '/conventions/:id',
    {
      schema: {
        params: IdParams,
        body: UpdateConventionBody,
        response: { 200: ConventionCandidate },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const convention = await service.update(workspaceId, req.params.id, req.body);
      if (!convention) throw new NotFoundError('Convention not found');
      return convention;
    },
  );
}

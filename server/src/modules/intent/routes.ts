import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PrIntentRecord } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * Intent module — derives a PR's motivation (one-line intent + in-scope /
 * out-of-scope / risk-area tags) from its own documentation.
 *   GET  /pulls/:id/intent          → whatever is persisted (safe, free, never computes)
 *   POST /pulls/:id/intent/refresh  → force (re)compute, bypassing the input-hash cache
 *
 * A dedicated module rather than folded into `PrDetail` — intent has an
 * independent lifecycle (written by review runs, refreshable on demand) and
 * its own React Query key; see `specs/intent-layer-plan.md` §4.
 */

const IntentResponse = z.object({ intent: PrIntentRecord.nullable() });

export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  // Container resolved here (the composition root, per R2/R4). `intentService`
  // is a lazy container getter (mirrors `agentsRepo`/`reviewRepo`) so the SAME
  // instance is reachable from `run-executor.ts` (modules/reviews) via
  // `container.intentService` without a sibling-module import (R5).
  const service = app.container.intentService;

  app.get(
    '/pulls/:id/intent',
    { schema: { params: IdParams, response: { 200: IntentResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return { intent: (await service.get(workspaceId, req.params.id)) ?? null };
    },
  );

  app.post(
    '/pulls/:id/intent/refresh',
    {
      schema: { params: IdParams, response: { 200: IntentResponse } },
      // Each call is a paid LLM round-trip — same cap as conventions/extract.
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return { intent: await service.refresh(workspaceId, req.params.id) };
    },
  );
}

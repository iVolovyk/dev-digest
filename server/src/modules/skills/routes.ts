import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Skill, SkillImportCandidate, SkillSource, SkillStats, SkillType, SkillVersion } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { IMPORT_BODY_LIMIT_BYTES } from './constants.js';
import { SkillsRepository } from './repository.js';
import { SkillsService } from './service.js';

/**
 * Skills module — the Skills Lab.
 *   GET    /skills                       → list (workspace-scoped)
 *   GET    /skills/:id                   → one skill
 *   POST   /skills                       → create (v1 + first body snapshot)
 *   PUT    /skills/:id                   → update (a body edit mints a version)
 *   DELETE /skills/:id                   → delete (versions + links cascade)
 *   GET    /skills/:id/versions          → body history (newest first)
 *   GET    /skills/:id/versions/:version → one body snapshot
 *   POST   /skills/:id/restore/:version  → re-apply an old body as a NEW version
 *   GET    /skills/:id/stats             → usage / cost / triage over 30 days
 *   POST   /skills/import/preview        → parse an upload, persist NOTHING
 */

/** `/skills/:id/versions/:version` — id is a uuid, version a positive integer. */
const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

const CreateSkillBody = z.object({
  name: z.string().min(1),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  source: SkillSource.optional(),
  enabled: z.boolean().optional(),
});

const UpdateSkillBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  type: SkillType.optional(),
  body: z.string().optional(),
  enabled: z.boolean().optional(),
});

/** One uploaded file: text for markdown, base64 for a .zip — exactly one. */
const ImportPreviewBody = z
  .object({
    filename: z.string().min(1),
    content: z.string().optional(),
    content_base64: z.string().optional(),
  })
  .refine((b) => (b.content === undefined) !== (b.content_base64 === undefined), {
    message: 'Provide exactly one of content (text) or content_base64 (binary)',
  });

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  // Module composition root: the container is resolved here and stops here.
  const service = new SkillsService(
    new SkillsRepository(app.container.db),
    app.container.tokenizer,
  );

  app.get('/skills', { schema: { response: { 200: z.array(Skill) } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get(
    '/skills/:id',
    { schema: { params: IdParams, response: { 200: Skill } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.get(workspaceId, req.params.id);
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.post(
    '/skills',
    { schema: { body: CreateSkillBody, response: { 201: Skill } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.create(workspaceId, req.body);
      reply.status(201);
      return skill;
    },
  );

  app.put(
    '/skills/:id',
    { schema: { params: IdParams, body: UpdateSkillBody, response: { 200: Skill } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.update(workspaceId, req.params.id, req.body);
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.delete(
    '/skills/:id',
    { schema: { params: IdParams, response: { 200: z.object({ ok: z.boolean() }) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const ok = await service.delete(workspaceId, req.params.id);
      if (!ok) throw new NotFoundError('Skill not found');
      return { ok: true };
    },
  );

  app.get(
    '/skills/:id/versions',
    { schema: { params: IdParams, response: { 200: z.array(SkillVersion) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const versions = await service.listVersions(workspaceId, req.params.id);
      if (!versions) throw new NotFoundError('Skill not found');
      return versions;
    },
  );

  app.get(
    '/skills/:id/versions/:version',
    { schema: { params: VersionParams, response: { 200: SkillVersion } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const version = await service.getVersion(workspaceId, req.params.id, req.params.version);
      if (!version) throw new NotFoundError('Skill version not found');
      return version;
    },
  );

  app.post(
    '/skills/:id/restore/:version',
    { schema: { params: VersionParams, response: { 200: Skill } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.restore(workspaceId, req.params.id, req.params.version);
      if (!skill) throw new NotFoundError('Skill version not found');
      return skill;
    },
  );

  app.get(
    '/skills/:id/stats',
    { schema: { params: IdParams, response: { 200: SkillStats } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const stats = await service.stats(workspaceId, req.params.id);
      if (!stats) throw new NotFoundError('Skill not found');
      return stats;
    },
  );

  app.post(
    '/skills/import/preview',
    {
      // A base64 .zip is ~4/3 of the archive; the app-wide 1 MB cap is too
      // tight for an upload, so raise it for THIS route only.
      bodyLimit: IMPORT_BODY_LIMIT_BYTES,
      schema: { body: ImportPreviewBody, response: { 200: SkillImportCandidate } },
    },
    async (req) => {
      await getContext(app.container, req);
      const { filename, content, content_base64: contentBase64 } = req.body;
      return service.importPreview({ filename, content, contentBase64 });
    },
  );
}

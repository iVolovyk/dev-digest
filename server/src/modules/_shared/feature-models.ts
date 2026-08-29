import { eq } from 'drizzle-orm';
import {
  FEATURE_MODELS,
  FeatureModelChoice,
  type FeatureModelId,
} from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Narrow structural shape instead of `import type { Container }`: this file
 * only ever reads `container.db`, and `Container` itself now constructs an
 * `IntentService` (`platform/container.ts`) that resolves ITS feature model
 * through this file — importing the full `Container` type here would close a
 * type-only cycle back through `container.ts` and add a new `pnpm arch`
 * warning (baseline is a fixed 41). Any object with a `db` satisfies this,
 * `Container` included.
 */
interface FeatureModelsContainer {
  db: Db;
}

/**
 * Per-feature model configuration.
 *
 * System LLM features (onboarding, intent, risk brief, conformance, conventions)
 * read their provider/model from the workspace's Settings instead of a hardcoded
 * module constant. When the workspace hasn't chosen one, we fall back to the
 * registry default in `FEATURE_MODELS` — which mirrors each module's old
 * constant, so behaviour is unchanged until a model is explicitly picked.
 */

const DEFAULTS = Object.fromEntries(
  FEATURE_MODELS.map((f) => [f.id, { provider: f.defaultProvider, model: f.defaultModel }]),
) as Record<FeatureModelId, FeatureModelChoice>;

/** The registry default (provider+model) for a feature — no DB read. */
export function defaultFeatureModel(id: FeatureModelId): FeatureModelChoice {
  return DEFAULTS[id];
}

/**
 * The workspace's override for `id`, or `undefined` when unset/invalid. Callers
 * that keep their own dynamic default (e.g. conventions) use this directly so
 * that default is preserved; callers with a static default use
 * `resolveFeatureModel` instead.
 */
export async function getFeatureModelOverride(
  container: FeatureModelsContainer,
  workspaceId: string,
  id: FeatureModelId,
): Promise<FeatureModelChoice | undefined> {
  const rows = await container.db
    .select({ key: t.settings.key, value: t.settings.value })
    .from(t.settings)
    .where(eq(t.settings.workspaceId, workspaceId));
  const settings: Record<string, unknown> = {};
  for (const r of rows) settings[r.key] = r.value;
  const fm = (settings as { feature_models?: Record<string, unknown> }).feature_models;
  const parsed = FeatureModelChoice.safeParse(fm?.[id]);
  return parsed.success ? parsed.data : undefined;
}

/** Resolve `id` to a concrete provider+model: workspace override, else registry default. */
export async function resolveFeatureModel(
  container: FeatureModelsContainer,
  workspaceId: string,
  id: FeatureModelId,
): Promise<FeatureModelChoice> {
  return (await getFeatureModelOverride(container, workspaceId, id)) ?? DEFAULTS[id];
}

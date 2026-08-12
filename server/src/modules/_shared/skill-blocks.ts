import { type SkillSource, isUntrustedSkillSource } from '@devdigest/shared';
import { wrapUntrusted } from '../../platform/prompt.js';

/**
 * Rendering of linked skills into the prompt's `## Skills / rules` slot.
 *
 * Lives in `_shared/` rather than in `modules/skills/`: the run executor
 * (`modules/reviews/`) is the caller, and a feature module may not import
 * another feature module. Pure — no DB, no container, no I/O — so the ordering
 * and the trust rules are unit-testable without Postgres.
 */

/** One `agent_skills` row joined to its skill, as the prompt builder needs it. */
export interface LinkedSkillForPrompt {
  id: string;
  name: string;
  source: SkillSource;
  body: string;
  /** The skill's config version at injection time. */
  version: number;
  /** Skill-level kill switch (`skills.enabled`) — off means off everywhere. */
  skillEnabled: boolean;
  /** Per-agent switch (`agent_skills.enabled`) — off means off for this agent. */
  linkEnabled: boolean;
  /** Position in the prompt (`agent_skills.order`). */
  order: number;
}

/** A rendered block plus what it took, for `run_skills` and the Live Log. */
export interface RenderedSkillBlock {
  skillId: string;
  name: string;
  version: number;
  order: number;
  text: string;
}

/**
 * Order, filter and render the skills linked to one agent.
 *
 * - A skill reaches the prompt only when BOTH switches are on. Either one off
 *   drops it entirely — the section is omitted, not emitted empty, so a
 *   without-skills run's prompt is byte-identical to the pre-skills shape.
 * - Only `manual` bodies are trusted. Anything imported, extracted or pulled
 *   from the community is somebody else's text landing in our agent's prompt,
 *   so it is delimiter-wrapped as data. The heading stays outside the wrapper:
 *   the model must be able to see WHICH skill it is looking at without that
 *   name itself being untrusted content it might obey.
 */
export function renderSkillBlocks(
  links: readonly LinkedSkillForPrompt[],
): RenderedSkillBlock[] {
  return links
    .filter((l) => l.skillEnabled && l.linkEnabled && l.body.trim().length > 0)
    .slice()
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map((l) => ({
      skillId: l.id,
      name: l.name,
      version: l.version,
      order: l.order,
      text: `### ${l.name}\n${renderSkillBody(l)}`,
    }));
}

function renderSkillBody(link: LinkedSkillForPrompt): string {
  const body = link.body.trim();
  return isUntrustedSkillSource(link.source)
    ? wrapUntrusted(`skill-${slug(link.name)}`, body)
    : body;
}

/** Keep the delimiter label attribute-safe (it is interpolated into `source="…"`). */
function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unnamed';
}

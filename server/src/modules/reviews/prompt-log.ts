import type { PromptAssembly } from '@devdigest/shared';

/** Whether a section's content is author/repo-controlled or ours. */
export type PromptSectionSource = 'trusted' | 'untrusted';

export interface PromptSectionLogEntry {
  section: string;
  source: PromptSectionSource;
  chars: number;
  tokens: number;
}

interface PromptSectionSpec {
  name: string;
  source: PromptSectionSource;
  text: string | null | undefined;
}

/**
 * Build a SAFE structured log of a finished prompt assembly: section name,
 * trust classification, and size (chars + tokens) — never the section's
 * actual content. Trust classification mirrors the doc comments on
 * `reviewer-core`'s `PromptParts` (skills/memory are ours; specs/repo-map/
 * callers/pr-description/intent/diff are author- or repo-derived, hence
 * untrusted and wrapped by `wrapUntrusted` before the model sees them).
 *
 * Callers must log the RETURN VALUE only, never `assembly`/`diffRaw`
 * themselves — that is how "no secrets, no full diff, no private spec
 * content" is enforced: this function never returns text, only counts.
 */
export function buildPromptSectionLog(
  assembly: PromptAssembly,
  diffRaw: string,
  tokenizer: { count(text: string): number },
): PromptSectionLogEntry[] {
  const specs: PromptSectionSpec[] = [
    { name: 'system', source: 'trusted', text: assembly.system },
    { name: 'skills', source: 'trusted', text: assembly.skills },
    { name: 'memory', source: 'trusted', text: assembly.memory },
    { name: 'specs', source: 'untrusted', text: assembly.specs },
    { name: 'repo-map', source: 'untrusted', text: assembly.repo_map },
    { name: 'callers', source: 'untrusted', text: assembly.callers },
    { name: 'pr-description', source: 'untrusted', text: assembly.pr_description },
    { name: 'pr-intent', source: 'untrusted', text: assembly.intent },
    { name: 'diff', source: 'untrusted', text: diffRaw },
  ];

  return specs
    .filter((s): s is PromptSectionSpec & { text: string } => !!s.text && s.text.length > 0)
    .map((s) => ({
      section: s.name,
      source: s.source,
      chars: s.text.length,
      tokens: tokenizer.count(s.text),
    }));
}

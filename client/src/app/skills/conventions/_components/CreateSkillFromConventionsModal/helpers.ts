import type { ConventionCandidate } from "@devdigest/shared";

/** Pure draft-building for the batch "Create skill" modal. No I/O. */

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "rule"
  );
}

function evidenceRange(c: ConventionCandidate): string | null {
  if (!c.evidence_path || c.evidence_start_line == null) return null;
  const end = c.evidence_end_line ?? c.evidence_start_line;
  return end !== c.evidence_start_line
    ? `${c.evidence_path}:${c.evidence_start_line}-${end}`
    : `${c.evidence_path}:${c.evidence_start_line}`;
}

export interface SkillDraft {
  name: string;
  description: string;
  body: string;
}

/** Merge N accepted conventions into one editable skill draft. */
export function buildSkillDraft(
  conventions: ConventionCandidate[],
  repoName: string,
  repoFullName: string,
): SkillDraft {
  const name = `${slugify(repoName)}-conventions`;
  const description = `${conventions.length} house conventions extracted from ${repoName}`;

  const sections = conventions.map((c) => {
    const range = evidenceRange(c);
    const evidence = range
      ? `Detected in \`${range}\`:\n\n\`\`\`\n${c.evidence_snippet ?? ""}\n\`\`\``
      : "";
    return `## ${slugify(c.rule)}\n${c.rule}\n\n${evidence}`.trim();
  });

  const body =
    `# ${name}\n\n` +
    `House conventions for \`${repoFullName}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.\n\n` +
    sections.join("\n\n");

  return { name, description, body };
}

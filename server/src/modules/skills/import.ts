import { strFromU8, unzipSync, type UnzipFileInfo } from 'fflate';
import { SkillType, type SkillImportSkipped } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import {
  ARCHIVE_MAX_ENTRIES,
  ARCHIVE_MAX_ENTRY_BYTES,
  ARCHIVE_MAX_TOTAL_BYTES,
  BODY_FILENAME_PRIORITY,
  DEFAULT_SKILL_TYPE,
  DESCRIPTION_MAX_CHARS,
  EXECUTABLE_EXTENSIONS,
  MARKDOWN_EXTENSIONS,
  NESTED_ARCHIVE_EXTENSIONS,
} from './constants.js';

/**
 * File → skill-candidate parsing. PURE: no DB, no container, no filesystem —
 * the service adds `tokens` and the route decides nothing. That keeps the
 * interesting part (what an archive is allowed to contain) unit-testable
 * without Postgres.
 *
 * A skill is TEXT. Nothing here executes anything, and nothing is written to
 * disk: exactly ONE markdown entry of an archive is ever decompressed, and
 * every other entry is reported back as `skipped` so the human confirming the
 * import can see what was ignored.
 */

/** A candidate before the service prices it (`tokens` is added there). */
export type ParsedSkill = {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  skipped: SkillImportSkipped[];
  warnings: string[];
};

/** Matches a leading `---\n…\n---` YAML frontmatter block (BOM tolerated). */
const FRONTMATTER_RE = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** An ATX heading line (`# Title`, `## Title`, …). */
const HEADING_RE = /^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/;

// ---------------------------------------------------------------- markdown

/**
 * Parse a markdown file into a skill candidate.
 *
 * `name`   — frontmatter `name:` → first `#` heading → filename without extension.
 * `description` — frontmatter `description:` → first non-heading paragraph
 *                 (capped at ~200 chars) → empty.
 * `type`   — frontmatter `type:` when it is a valid `SkillType`, else `custom`.
 * `body`   — the text with the frontmatter block removed.
 */
export function parseMarkdownSkill(filename: string, text: string): ParsedSkill {
  const { frontmatter, body } = splitFrontmatter(text);
  const parsedType = SkillType.safeParse(frontmatter.type);

  return {
    name: frontmatter.name || firstHeading(body) || basenameWithoutExtension(filename),
    description: frontmatter.description || firstParagraph(body),
    type: parsedType.success ? parsedType.data : DEFAULT_SKILL_TYPE,
    body,
    skipped: [],
    warnings: [],
  };
}

/** Split a leading YAML frontmatter block off the text. */
function splitFrontmatter(text: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const match = FRONTMATTER_RE.exec(text);
  if (!match) return { frontmatter: {}, body: text };
  return { frontmatter: parseFrontmatter(match[1] ?? ''), body: text.slice(match[0].length) };
}

/**
 * Minimal `key: value` scanner — deliberately NOT a YAML parser. Only the three
 * scalar keys we read are meaningful, and pulling in a YAML engine to read an
 * untrusted uploaded file would add an attack surface for no benefit.
 */
function parseFrontmatter(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const match = /^([A-Za-z_][\w-]*)[ \t]*:[ \t]*(.*)$/.exec(line);
    if (!match) continue;
    out[match[1]!] = unquote((match[2] ?? '').trim());
  }
  return out;
}

function unquote(value: string): string {
  const quoted = /^(["'])([\s\S]*)\1$/.exec(value);
  return quoted ? quoted[2]! : value;
}

function firstHeading(body: string): string {
  for (const line of body.split(/\r?\n/)) {
    const match = HEADING_RE.exec(line);
    if (match) return match[1]!.trim();
  }
  return '';
}

/** First blank-line-delimited block that is not a heading, whitespace-collapsed. */
function firstParagraph(body: string): string {
  for (const block of body.split(/\r?\n[ \t]*\r?\n/)) {
    const text = block.trim();
    if (!text || HEADING_RE.test(text.split(/\r?\n/)[0] ?? '')) continue;
    const collapsed = text.replace(/\s+/g, ' ');
    return collapsed.length > DESCRIPTION_MAX_CHARS
      ? collapsed.slice(0, DESCRIPTION_MAX_CHARS).trimEnd()
      : collapsed;
  }
  return '';
}

// ----------------------------------------------------------------- archive

/**
 * Parse a .zip into a skill candidate.
 *
 * Picks ONE entry as the body — `SKILL.md`, then `README.md`, then the first
 * markdown file alphabetically (basenames compared case-insensitively) — and
 * reports every other entry in `skipped` with the reason it was ignored.
 * Entries with an absolute or `..`-containing path are skipped as unsafe
 * (zip-slip); directory entries are ignored silently.
 *
 * `filename` (the archive's own name) is the last-resort source of the skill
 * name: the chosen entry is conventionally called `SKILL.md`/`README.md`, which
 * names nothing, whereas `payments-rubric.zip` does.
 */
export function parseArchiveSkill(filename: string, bytes: Uint8Array): ParsedSkill {
  const entries = listEntries(bytes);
  if (entries.length > ARCHIVE_MAX_ENTRIES) {
    throw new ValidationError(
      `archive has ${entries.length} entries, more than the ${ARCHIVE_MAX_ENTRIES} allowed`,
    );
  }

  // Directory entries carry no content and are not worth reporting.
  const files = entries.filter((entry) => !entry.name.endsWith('/'));
  assertWithinSizeLimits(files);

  const skipped: SkillImportSkipped[] = [];
  const markdown: UnzipFileInfo[] = [];
  for (const entry of files) {
    if (isUnsafePath(entry.name)) {
      skipped.push({ path: entry.name, reason: 'unsafe path — not processed' });
    } else if (hasExtension(entry.name, MARKDOWN_EXTENSIONS)) {
      markdown.push(entry);
    } else {
      skipped.push({ path: entry.name, reason: skipReason(entry.name) });
    }
  }

  if (markdown.length === 0) {
    throw new ValidationError('no markdown skill body found in archive');
  }

  const chosen = pickBody(markdown);
  const warnings: string[] = [];
  if (markdown.length > 1) {
    warnings.push(
      `archive contained ${markdown.length} markdown files; used "${chosen.name}"`,
    );
    for (const entry of markdown) {
      if (entry !== chosen) {
        skipped.push({ path: entry.name, reason: 'another markdown file — not processed' });
      }
    }
  }

  const parsed = parseMarkdownSkill(filename, readEntry(bytes, chosen.name));
  return { ...parsed, skipped, warnings };
}

/**
 * Enumerate the archive WITHOUT decompressing anything: the filter callback is
 * invoked per entry and returning false keeps the payload compressed, so the
 * size limits below are checked against declared sizes before any inflation.
 */
function listEntries(bytes: Uint8Array): UnzipFileInfo[] {
  const entries: UnzipFileInfo[] = [];
  try {
    unzipSync(bytes, {
      filter: (entry) => {
        entries.push(entry);
        return false;
      },
    });
  } catch {
    throw new ValidationError('could not read the archive — is it a valid .zip?');
  }
  return entries;
}

function assertWithinSizeLimits(files: UnzipFileInfo[]): void {
  let total = 0;
  for (const entry of files) {
    if (entry.originalSize > ARCHIVE_MAX_ENTRY_BYTES) {
      throw new ValidationError(
        `archive entry "${entry.name}" is larger than ${ARCHIVE_MAX_ENTRY_BYTES} bytes`,
      );
    }
    total += entry.originalSize;
  }
  if (total > ARCHIVE_MAX_TOTAL_BYTES) {
    throw new ValidationError(
      `archive inflates to more than ${ARCHIVE_MAX_TOTAL_BYTES} bytes`,
    );
  }
}

/** Decompress exactly one entry. */
function readEntry(bytes: Uint8Array, name: string): string {
  const unzipped = unzipSync(bytes, { filter: (entry) => entry.name === name });
  const data = unzipped[name];
  if (!data) throw new ValidationError(`could not read "${name}" from the archive`);
  return strFromU8(data);
}

/**
 * `SKILL.md` wins, then `README.md`, then the alphabetically first markdown
 * file. Ties (the same basename in two folders) break on the full path so the
 * choice is deterministic for a given archive.
 */
function pickBody(markdown: UnzipFileInfo[]): UnzipFileInfo {
  const byPath = [...markdown].sort((a, b) => a.name.localeCompare(b.name));
  for (const preferred of BODY_FILENAME_PRIORITY) {
    const hit = byPath.find((entry) => basename(entry.name).toLowerCase() === preferred);
    if (hit) return hit;
  }
  return [...byPath].sort((a, b) =>
    basename(a.name).toLowerCase().localeCompare(basename(b.name).toLowerCase()),
  )[0]!;
}

/** Zip-slip guard: an entry may not be absolute or climb out of the archive. */
function isUnsafePath(path: string): boolean {
  if (path.startsWith('/') || path.startsWith('\\')) return true;
  if (/^[A-Za-z]:[\\/]/.test(path)) return true;
  return path.split(/[\\/]/).some((segment) => segment === '..');
}

function skipReason(path: string): string {
  if (hasExtension(path, EXECUTABLE_EXTENSIONS)) return 'executable — not processed';
  if (hasExtension(path, NESTED_ARCHIVE_EXTENSIONS)) return 'nested archive — not processed';
  return 'not a markdown file';
}

function hasExtension(path: string, extensions: readonly string[]): boolean {
  const lower = basename(path).toLowerCase();
  return extensions.some((ext) => lower.endsWith(ext));
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function basenameWithoutExtension(path: string): string {
  return basename(path).replace(/\.[^.]+$/, '');
}

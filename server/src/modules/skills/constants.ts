/** Constants for the skills module. */

/** Version recorded for a freshly-created skill (mirrors agents). */
export const INITIAL_SKILL_VERSION = 1;

/** Default description when an import/insert supplies none. */
export const DEFAULT_SKILL_DESCRIPTION = '';

/** Fallback type when a frontmatter `type:` is missing or unrecognised. */
export const DEFAULT_SKILL_TYPE = 'custom';

/** Longest auto-derived description (frontmatter descriptions are kept whole). */
export const DESCRIPTION_MAX_CHARS = 200;

/** Rolling window for `GET /skills/:id/stats`. */
export const STATS_WINDOW_DAYS = 30;

// ---- import limits ---------------------------------------------------------
// An uploaded archive is attacker-controlled input: it is only ever READ (one
// markdown entry), never written to disk and never executed, but it still gets
// inflated in memory — so the entry count and the inflated size are capped
// before anything is decompressed.

/** Max entries in an uploaded archive (directories included). */
export const ARCHIVE_MAX_ENTRIES = 200;

/** Max inflated size of a single archive entry (256 KB). */
export const ARCHIVE_MAX_ENTRY_BYTES = 256 * 1024;

/** Max inflated size of the whole archive (1 MB). */
export const ARCHIVE_MAX_TOTAL_BYTES = 1024 * 1024;

/**
 * Body cap for `POST /skills/import/preview` only (the app-wide default is
 * 1 MB). A .zip arrives base64-encoded, which costs ~4/3 of its bytes, so the
 * request may legitimately be a few times larger than the archive itself.
 */
export const IMPORT_BODY_LIMIT_BYTES = 3 * 1024 * 1024;

/** Extensions treated as the skill body. */
export const MARKDOWN_EXTENSIONS = ['.md', '.markdown'] as const;

/** Anything that could be run. Listed in `skipped`, never read, never executed. */
export const EXECUTABLE_EXTENSIONS = [
  '.sh',
  '.bash',
  '.zsh',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.py',
  '.rb',
  '.pl',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.command',
] as const;

/** Archives inside the archive — we do not recurse. */
export const NESTED_ARCHIVE_EXTENSIONS = [
  '.zip',
  '.tar',
  '.gz',
  '.tgz',
  '.rar',
  '.7z',
] as const;

/** Basenames preferred as the skill body, best first (matched case-insensitively). */
export const BODY_FILENAME_PRIORITY = ['skill.md', 'readme.md'] as const;

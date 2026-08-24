import { describe, it, expect } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { parseArchiveSkill, parseMarkdownSkill } from '../src/modules/skills/import.js';
import { ValidationError } from '../src/platform/errors.js';

/**
 * Hermetic (no `.it.` suffix → no Docker, no DB): the import parsers are pure,
 * so everything interesting about an uploaded file — what becomes the name,
 * which archive entry becomes the body, and what is refused to be read — is
 * testable without Postgres.
 */

/** Build a .zip in memory from `path → text`. */
function zip(files: Record<string, string>): Uint8Array {
  return zipSync(
    Object.fromEntries(Object.entries(files).map(([path, text]) => [path, strToU8(text)])),
  );
}

describe('parseMarkdownSkill', () => {
  it('takes name, description and type from YAML frontmatter', () => {
    const text = [
      '---',
      'name: Payments Rubric',
      'description: How we review money-touching code.',
      'type: rubric',
      '---',
      '',
      '# Ignore this heading',
      '',
      'Check every currency conversion.',
    ].join('\n');

    const parsed = parseMarkdownSkill('whatever.md', text);

    expect(parsed).toMatchObject({
      name: 'Payments Rubric',
      description: 'How we review money-touching code.',
      type: 'rubric',
    });
    // The frontmatter block itself is stripped from the body.
    expect(parsed.body).not.toContain('name: Payments Rubric');
    expect(parsed.body).toContain('Check every currency conversion.');
    expect(parsed.skipped).toEqual([]);
    expect(parsed.warnings).toEqual([]);
  });

  it('falls back to the first heading, the first paragraph and type custom', () => {
    const text = '# Security Checklist\n\nNever log a bearer token.\n\nMore prose here.\n';

    const parsed = parseMarkdownSkill('some-file.md', text);

    expect(parsed.name).toBe('Security Checklist');
    expect(parsed.description).toBe('Never log a bearer token.');
    expect(parsed.type).toBe('custom');
    expect(parsed.body).toBe(text);
  });

  it('falls back to the filename when there is no frontmatter and no heading', () => {
    const parsed = parseMarkdownSkill('team-conventions.md', 'Prefer named exports.\n');

    expect(parsed.name).toBe('team-conventions');
    expect(parsed.description).toBe('Prefer named exports.');
  });

  it('ignores a frontmatter type that is not a SkillType', () => {
    const parsed = parseMarkdownSkill('x.md', '---\ntype: nonsense\n---\nbody\n');

    expect(parsed.type).toBe('custom');
  });

  it('caps a derived description at ~200 characters', () => {
    const long = 'w'.repeat(500);
    const parsed = parseMarkdownSkill('x.md', long);

    expect(parsed.description).toHaveLength(200);
  });
});

describe('parseArchiveSkill', () => {
  it('prefers SKILL.md over README.md and reports the runners-up', () => {
    const bytes = zip({
      'pack/README.md': '# Readme\n\nInstall instructions.\n',
      'pack/SKILL.md': '# The Skill\n\nThe actual rules.\n',
    });

    const parsed = parseArchiveSkill('pack.zip', bytes);

    expect(parsed.name).toBe('The Skill');
    expect(parsed.body).toContain('The actual rules.');
    expect(parsed.warnings[0]).toContain('pack/SKILL.md');
    expect(parsed.skipped).toContainEqual({
      path: 'pack/README.md',
      reason: 'another markdown file — not processed',
    });
  });

  it('falls back to README.md, then to the first markdown alphabetically', () => {
    expect(
      parseArchiveSkill('p.zip', zip({ 'README.md': '# R\n', 'zebra.md': '# Z\n' })).name,
    ).toBe('R');
    expect(
      parseArchiveSkill('p.zip', zip({ 'beta.md': '# B\n', 'alpha.md': '# A\n' })).name,
    ).toBe('A');
  });

  it('lists executables, nested archives and other files as skipped — never reads them', () => {
    const bytes = zip({
      'SKILL.md': '# Rules\n\nBe careful.\n',
      'install.sh': 'rm -rf /',
      'tool.exe': 'MZ',
      'bundle.zip': 'PK',
      'logo.png': 'not-really-a-png',
    });

    const parsed = parseArchiveSkill('pack.zip', bytes);

    expect(parsed.body).toContain('Be careful.');
    expect(parsed.skipped).toEqual(
      expect.arrayContaining([
        { path: 'install.sh', reason: 'executable — not processed' },
        { path: 'tool.exe', reason: 'executable — not processed' },
        { path: 'bundle.zip', reason: 'nested archive — not processed' },
        { path: 'logo.png', reason: 'not a markdown file' },
      ]),
    );
    // Nothing an entry contains leaks into the candidate.
    expect(parsed.body).not.toContain('rm -rf /');
  });

  it('skips zip-slip paths instead of reading them', () => {
    const bytes = zip({
      'SKILL.md': '# Rules\n\nBody.\n',
      '../escape.md': '# Escaped\n\nShould never be used.\n',
      '/etc/passwd': 'root:x:0:0',
    });

    const parsed = parseArchiveSkill('pack.zip', bytes);

    expect(parsed.name).toBe('Rules');
    expect(parsed.skipped).toContainEqual({
      path: '../escape.md',
      reason: 'unsafe path — not processed',
    });
    expect(parsed.skipped).toContainEqual({
      path: '/etc/passwd',
      reason: 'unsafe path — not processed',
    });
    // An escaping markdown file is not eligible as the body, even alphabetically.
    expect(parsed.body).not.toContain('Should never be used.');
  });

  it('ignores directory entries silently', () => {
    const parsed = parseArchiveSkill('p.zip', zip({ 'pack/': '', 'pack/SKILL.md': '# S\n' }));

    expect(parsed.skipped).toEqual([]);
  });

  it('throws a 422 validation error when the archive has no markdown', () => {
    const bytes = zip({ 'run.sh': 'echo hi', 'data.json': '{}' });

    expect(() => parseArchiveSkill('pack.zip', bytes)).toThrow(ValidationError);
    expect(() => parseArchiveSkill('pack.zip', bytes)).toThrow(
      'no markdown skill body found in archive',
    );
  });

  it('rejects an archive whose entries inflate past the limits', () => {
    const tooBig = zip({ 'SKILL.md': 'x'.repeat(300 * 1024) });

    expect(() => parseArchiveSkill('pack.zip', tooBig)).toThrow(ValidationError);
    expect(() => parseArchiveSkill('pack.zip', tooBig)).toThrow(/larger than/);
  });

  it('rejects something that is not a zip at all', () => {
    expect(() => parseArchiveSkill('pack.zip', strToU8('just text'))).toThrow(ValidationError);
  });

  it('uses the archive name when the chosen entry carries no name of its own', () => {
    const parsed = parseArchiveSkill('payments-rubric.zip', zip({ 'SKILL.md': 'Just prose.\n' }));

    expect(parsed.name).toBe('payments-rubric');
  });
});

import type {
  Skill,
  SkillImportCandidate,
  SkillSource,
  SkillStats,
  SkillType,
  SkillVersion,
} from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { parseArchiveSkill, parseMarkdownSkill, type ParsedSkill } from './import.js';
import { SkillsRepository } from './repository.js';

/**
 * Skills service — the Skills Lab (list/editor/versions/stats) and file import.
 *
 * A skill is a reusable markdown instruction block that gets injected into an
 * agent's review prompt. It is TEXT: nothing here is ever executed, and an
 * imported body is marked with a non-`manual` source so the prompt builder
 * delimiter-wraps it as data.
 */

/**
 * Token counter port, declared here rather than imported from
 * `adapters/tokenizer`: the application ring depends on the capability, not on
 * js-tiktoken. `container.tokenizer` satisfies it structurally.
 */
export interface Tokenizer {
  count(text: string): number;
}

export interface CreateSkillInput {
  name: string;
  description?: string;
  type: SkillType;
  body: string;
  source?: SkillSource;
  enabled?: boolean;
  /** Provenance paths for an extracted/imported skill (e.g. conventions evidence). */
  evidence_files?: string[];
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

/** One uploaded file, as `POST /skills/import/preview` receives it. */
export interface ImportPreviewInput {
  filename: string;
  /** Text payload (.md/.markdown/.txt). */
  content?: string;
  /** Base64 payload, no `data:` prefix (.zip). */
  contentBase64?: string;
}

export class SkillsService {
  constructor(private repo: SkillsRepository, private tokenizer: Tokenizer) {}

  async list(workspaceId: string): Promise<Skill[]> {
    return this.repo.list(workspaceId);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    return this.repo.getById(workspaceId, id);
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    return this.repo.insert({
      workspaceId,
      name: input.name,
      type: input.type,
      // Default 'manual': only a hand-written body is trusted as instructions.
      source: input.source ?? 'manual',
      body: input.body,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.evidence_files !== undefined ? { evidenceFiles: input.evidence_files } : {}),
    });
  }

  async update(workspaceId: string, id: string, patch: UpdateSkillInput): Promise<Skill | undefined> {
    return this.repo.update(workspaceId, id, patch);
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  /**
   * Body history, newest first. Workspace-scoped: undefined when the skill is
   * not in this workspace (the route maps that to 404), so another tenant's
   * bodies are not readable through the versions endpoint.
   */
  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    return this.repo.listVersions(id);
  }

  async getVersion(
    workspaceId: string,
    id: string,
    version: number,
  ): Promise<SkillVersion | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    return this.repo.getVersion(id, version);
  }

  /**
   * Restore an old body. This is an ordinary edit, not a rewind: it goes
   * through `update`, so the restored text becomes the NEXT version and the
   * history stays append-only — you can always see that a restore happened.
   * Returns undefined when the skill or that version does not exist.
   */
  async restore(workspaceId: string, id: string, version: number): Promise<Skill | undefined> {
    const snapshot = await this.getVersion(workspaceId, id, version);
    if (!snapshot) return undefined;
    return this.repo.update(workspaceId, id, { body: snapshot.body });
  }

  /**
   * Usage stats for one skill. The SQL half comes from the repository;
   * `body_tokens` is what the NEXT run would pay for the CURRENT body, so it is
   * counted here — the repository has no tokenizer.
   */
  async stats(workspaceId: string, id: string): Promise<SkillStats | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const usage = await this.repo.stats(workspaceId, skill);
    return { ...usage, body_tokens: this.tokenizer.count(skill.body) };
  }

  /**
   * Parse an uploaded file into a skill candidate. Writes NOTHING: the user
   * sees what was parsed (and what was skipped) and confirms with a separate
   * `POST /skills`, so an archive can never persist itself.
   */
  async importPreview(input: ImportPreviewInput): Promise<SkillImportCandidate> {
    const parsed = this.parseUpload(input);
    return { ...parsed, tokens: this.tokenizer.count(parsed.body) };
  }

  private parseUpload(input: ImportPreviewInput): ParsedSkill {
    const isArchive = input.filename.toLowerCase().endsWith('.zip');
    if (isArchive) {
      if (input.contentBase64 === undefined) {
        throw new ValidationError('a .zip import must be sent as content_base64');
      }
      return parseArchiveSkill(input.filename, decodeBytes(input.contentBase64));
    }
    const text =
      input.content ?? Buffer.from(input.contentBase64 ?? '', 'base64').toString('utf8');
    return parseMarkdownSkill(input.filename, text);
  }
}

function decodeBytes(base64: string): Uint8Array {
  const buf = Buffer.from(base64, 'base64');
  if (buf.length === 0) throw new ValidationError('content_base64 decoded to an empty file');
  return new Uint8Array(buf);
}

/* hooks/skills.ts — React Query hooks for the Skills Lab: the /skills page,
   the skill detail panel (config / preview / stats / versions), file import,
   and the Skills tab of the agent editor.

   Query keys: ["skills"] | ["skill", id] | ["skill-versions", id] |
   ["skill-stats", id] | ["agent-skills", agentId]. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AgentSkillLink,
  Skill,
  SkillImportCandidate,
  SkillStats,
  SkillType,
  SkillVersion,
} from "@devdigest/shared";

// ---------------------------------------------------------------- skills CRUD

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => api.get<Skill[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  /** Omitted for hand-written skills (defaults to "manual" server-side). */
  source?: Skill["source"];
  enabled?: boolean;
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled">>;
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skill", data.id], data);
      // A body edit mints a new version and changes the token cost.
      qc.invalidateQueries({ queryKey: ["skill-versions", data.id] });
      qc.invalidateQueries({ queryKey: ["skill-stats", data.id] });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.removeQueries({ queryKey: ["skill", id] });
      // Deleting a skill cascades its agent links.
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
    },
  });
}

// ------------------------------------------------------------------- versions

export function useSkillVersions(id: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["skill-versions", id],
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id && enabled,
  });
}

export function useRestoreSkillVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      api.post<Skill>(`/skills/${id}/restore/${version}`),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skill", data.id], data);
      qc.invalidateQueries({ queryKey: ["skill-versions", data.id] });
    },
  });
}

// ---------------------------------------------------------------------- stats

export function useSkillStats(id: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["skill-stats", id],
    queryFn: () => api.get<SkillStats>(`/skills/${id}/stats`),
    enabled: !!id && enabled,
  });
}

// --------------------------------------------------------------------- import

export interface ImportPreviewInput {
  filename: string;
  /** Text payload for .md/.markdown/.txt. */
  content?: string;
  /** Base64 payload for .zip (no data: prefix). */
  content_base64?: string;
}

/**
 * Parse an uploaded file into a skill candidate WITHOUT persisting anything.
 * Saving is a separate `useCreateSkill` call, so nothing reaches the database
 * until the user has seen the preview and confirmed it.
 */
export function useImportPreview() {
  return useMutation({
    mutationFn: (input: ImportPreviewInput) =>
      api.post<SkillImportCandidate>("/skills/import/preview", input),
  });
}

/** Read a File into the shape `useImportPreview` expects (text vs base64). */
export async function fileToImportInput(file: File): Promise<ImportPreviewInput> {
  const isArchive = file.name.toLowerCase().endsWith(".zip");
  if (!isArchive) return { filename: file.name, content: await file.text() };
  const buf = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  // Chunked so a large archive can't blow the argument limit of String.fromCharCode.
  for (let i = 0; i < buf.length; i += 0x8000) {
    binary += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return { filename: file.name, content_base64: btoa(binary) };
}

// --------------------------------------------------------- agent ⇄ skill links

export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

/** Replace the whole ordered set of links (used by attach and by reorder). */
export function useSetAgentSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, skillIds }: { agentId: string; skillIds: string[] }) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skill_ids: skillIds }),
    onSuccess: (data, { agentId }) => {
      qc.setQueryData(["agent-skills", agentId], data);
      qc.invalidateQueries({ queryKey: ["skill-stats"] });
    },
  });
}

/**
 * Replace the agent's skill list with an explicit ordered state.
 *
 * The Skills tab lists every skill in the workspace and lets any row be
 * dragged, so a reorder is a statement about the whole list — switched-off
 * rows included. Sending their `enabled` along is what keeps an off skill's
 * position instead of letting it drift to the end.
 */
export function useSetAgentSkillsState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      agentId,
      skills,
    }: {
      agentId: string;
      skills: { skill_id: string; enabled: boolean }[];
    }) => api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skills }),
    onSuccess: (data, { agentId }) => {
      qc.setQueryData(["agent-skills", agentId], data);
      qc.invalidateQueries({ queryKey: ["skill-stats"] });
    },
  });
}

/**
 * Attach ONE skill, appended after the existing links (additive — the server
 * resolves the order). Used by the Skills tab's per-skill toggle, which must
 * not disturb the order of everything already attached.
 */
export function useLinkAgentSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, skillId }: { agentId: string; skillId: string }) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skill_id: skillId }),
    onSuccess: (data, { agentId }) => {
      qc.setQueryData(["agent-skills", agentId], data);
      qc.invalidateQueries({ queryKey: ["skill-stats"] });
    },
  });
}

/** Toggle or re-position ONE link without touching the rest. */
export function useUpdateAgentSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      agentId,
      skillId,
      patch,
    }: {
      agentId: string;
      skillId: string;
      patch: { enabled?: boolean; order?: number };
    }) => api.put<AgentSkillLink[]>(`/agents/${agentId}/skills/${skillId}`, patch),
    onSuccess: (data, { agentId }) => {
      qc.setQueryData(["agent-skills", agentId], data);
      qc.invalidateQueries({ queryKey: ["skill-stats"] });
    },
  });
}

export function useUnlinkAgentSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, skillId }: { agentId: string; skillId: string }) =>
      api.del<AgentSkillLink[]>(`/agents/${agentId}/skills/${skillId}`),
    onSuccess: (data, { agentId }) => {
      qc.setQueryData(["agent-skills", agentId], data);
      qc.invalidateQueries({ queryKey: ["skill-stats"] });
    },
  });
}

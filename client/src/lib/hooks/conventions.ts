/* hooks/conventions.ts — React Query hooks for the Conventions Extractor
   (/skills/conventions): list/extract per repo, and edit/accept-reject one
   candidate. Query key: ["conventions", repoId]. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ConventionCandidate } from "@devdigest/shared";

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionCandidate[]>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/** Runs the extraction pipeline; replaces the repo's candidate list. */
export function useExtractConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionCandidate[]>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (data) => qc.setQueryData(["conventions", repoId], data),
  });
}

export interface UpdateConventionInput {
  id: string;
  repoId: string;
  patch: { rule?: string; accepted?: boolean };
}

export function useUpdateConvention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateConventionInput) =>
      api.put<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: (updated, { repoId }) => {
      qc.setQueryData<ConventionCandidate[]>(["conventions", repoId], (prev) =>
        prev?.map((c) => (c.id === updated.id ? updated : c)),
      );
    },
  });
}

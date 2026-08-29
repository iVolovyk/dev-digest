/* hooks/blast.ts — React Query hook for the Blast Radius impact map.
   Read-only; the server computes it on every call from the repository index and
   makes no model call. Query key: ["blast", prId].

   NOT invalidated in `onRunDone` — a review run does not change the index, and
   blast does not depend on findings. A resync should invalidate it; that lives
   in `useResyncRepoIntel`'s `onSuccess` (hooks/repo-intel.ts). */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastRadius } from "@devdigest/shared";

export function useBlastRadius(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["blast", prId],
    queryFn: () => api.get<BlastRadius>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}

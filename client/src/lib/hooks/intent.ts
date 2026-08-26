/* hooks/intent.ts — React Query hooks for the derived PR Intent panel
   (Overview tab): read the persisted intent for a PR, and force a refresh.
   Query key: ["intent", prId]. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrIntentRecord } from "@devdigest/shared";

export function useIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["intent", prId],
    queryFn: () => api.get<{ intent: PrIntentRecord | null }>(`/pulls/${prId}/intent`),
    enabled: !!prId,
  });
}

/** Forces recomputation, bypassing the input-hash cache. Rate-limited server-side. */
export function useRefreshIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ intent: PrIntentRecord }>(`/pulls/${prId}/intent/refresh`),
    onSuccess: (data) => qc.setQueryData(["intent", prId], data),
  });
}

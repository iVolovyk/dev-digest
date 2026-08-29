/* hooks/smart-diff.ts — React Query hook for the risk-ordered "Files changed"
   view. Read-only; the server computes it on every call from persisted rows and
   makes no model call. Query key: ["smart-diff", prId]. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { SmartDiff } from "@devdigest/shared";

export function useSmartDiff(
  prId: string | null | undefined,
  opts?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ["smart-diff", prId],
    queryFn: () => api.get<SmartDiff>(`/pulls/${prId}/smart-diff`),
    enabled: (opts?.enabled ?? true) && !!prId,
  });
}

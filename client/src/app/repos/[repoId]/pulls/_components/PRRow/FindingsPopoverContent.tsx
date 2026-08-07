/* Content rendered inside a Popover opened from a PRRow severity badge.
   Mounted only while the popover is open (Popover only renders children when
   open), so this is the lazy-fetch trigger — no extra `enabled` plumbing
   needed beyond the existing `usePrReviews(prId)` gate on `prId`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { usePrReviews } from "@/lib/hooks/reviews";
import { FindingsSeverityList } from "../../[number]/_components/FindingsSeverityList/FindingsSeverityList";

export function FindingsPopoverContent({
  prId,
  severity,
}: {
  prId: string | null;
  severity: Severity;
}) {
  const t = useTranslations("prReview");
  const { data: reviews, isLoading } = usePrReviews(prId);
  const findings = React.useMemo(
    () => (reviews ?? []).flatMap((r) => r.findings).filter((f) => f.severity === severity),
    [reviews, severity],
  );

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Skeleton height={14} width={120} />
        <Skeleton height={36} />
      </div>
    );
  }

  return <FindingsSeverityList findings={findings} emptyLabel={t("list.findingsPopover.empty")} />;
}

/* ConventionCard — one extracted convention candidate: rule + category,
   file:line evidence with the real snippet, a confidence readout, and the
   accept/reject toggle. "Accepted" doubles as the batch modal's selection —
   Create Skill merges whatever is currently accepted, matching the mockup
   (no separate checkbox layer). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ProgressBar } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { s } from "./styles";

export function ConventionCard({
  convention,
  onAcceptedChange,
  pending,
}: {
  convention: ConventionCandidate;
  onAcceptedChange: (accepted: boolean) => void;
  pending?: boolean;
}) {
  const t = useTranslations("conventions");
  const evidenceLabel =
    convention.evidence_path && convention.evidence_start_line != null
      ? convention.evidence_end_line != null && convention.evidence_end_line !== convention.evidence_start_line
        ? `${convention.evidence_path}:${convention.evidence_start_line}-${convention.evidence_end_line}`
        : `${convention.evidence_path}:${convention.evidence_start_line}`
      : convention.evidence_path;

  return (
    <div style={s.card(convention.accepted)}>
      <div style={s.headerRow}>
        <div style={s.ruleCol}>
          <Badge color="var(--text-secondary)">{convention.category}</Badge>
          <span style={s.rule}>{convention.rule}</span>
        </div>
        <div style={s.actions}>
          <Button
            kind={convention.accepted ? "primary" : "secondary"}
            size="sm"
            icon="Check"
            disabled={pending}
            onClick={() => onAcceptedChange(true)}
          >
            {t("card.accepted")}
          </Button>
          <Button
            kind={convention.accepted ? "ghost" : "secondary"}
            size="sm"
            icon="X"
            disabled={pending}
            onClick={() => onAcceptedChange(false)}
          >
            {t("card.reject")}
          </Button>
        </div>
      </div>

      {evidenceLabel && <span className="mono" style={s.evidencePath}>{evidenceLabel}</span>}
      {convention.evidence_snippet && <pre style={s.snippet}>{convention.evidence_snippet}</pre>}

      {convention.confidence != null && (
        <div style={s.footerRow}>
          <span style={s.confidenceLabel}>{t("card.confidence")}</span>
          <div style={s.confidenceBar}>
            <ProgressBar value={convention.confidence * 100} />
          </div>
          <span className="mono tnum" style={s.confidencePct}>
            {Math.round(convention.confidence * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}

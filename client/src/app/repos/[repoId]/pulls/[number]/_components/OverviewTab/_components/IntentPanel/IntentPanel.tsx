/* IntentPanel — Overview tab's INTENT section: the derived one-line intent,
   in/out-of-scope lists, risk-area tags, and a deterministic confidence
   badge. Renders an empty state with a "Derive intent" action when nothing
   has been computed yet; a review run (or this action) computes it. */
"use client";

import React from "react";
import { Badge, Button, EmptyState, Icon, SectionLabel, Skeleton, type IconName } from "@devdigest/ui";
import { useIntent, useRefreshIntent } from "@/lib/hooks";
import type { IntentConfidence, IntentSource } from "@devdigest/shared";
import { s } from "./styles";

const CONFIDENCE_COLOR: Record<IntentConfidence, string> = {
  high: "var(--ok)",
  medium: "var(--warn)",
  low: "var(--crit)",
};

const CONFIDENCE_LABEL: Record<IntentConfidence, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "LOW CONFIDENCE",
};

const SOURCE_LABEL: Record<IntentSource, string> = {
  description: "the PR description",
  linked_issue: "a linked issue",
  linked_spec: "a linked spec",
  branch: "the branch name",
  commits: "commit messages",
  diff_paths: "changed files",
};

/** "a, b and c" — no Oxford comma, matches the reference copy. */
function joinWithAnd(items: string[]): string {
  if (items.length === 0) return "no available signals";
  const [last, ...rest] = [...items].reverse();
  if (!last) return "no available signals";
  return rest.length === 0 ? last : `${rest.reverse().join(", ")} and ${last}`;
}

/**
 * Pure — the "why this confidence" line shown under a LOW CONFIDENCE badge,
 * derived from which signals actually contributed. A business rule, not
 * component state: no React, testable without a renderer.
 */
export function intentConfidenceReason(sources: IntentSource[]): string {
  if (sources.length === 0) {
    return "No signals were available to ground this intent — treat it as a guess.";
  }
  const hasDocs = sources.some(
    (src) => src === "description" || src === "linked_issue" || src === "linked_spec",
  );
  const joined = joinWithAnd(sources.map((src) => SOURCE_LABEL[src]));
  return hasDocs
    ? `Inferred from ${joined} — some documentation was thin or could not be read.`
    : `Inferred from ${joined} — no linked ticket or spec was found.`;
}

/**
 * Category → icon/color rules for a risk-area tag, matching the fixed
 * category list the classifier prompt is steered toward (`modules/intent/constants.ts`).
 * First match wins; order = most-specific first.
 */
const RISK_CATEGORY_RULES: { match: RegExp; icon: IconName; color: string }[] = [
  { match: /auth(entication|orization)?\b/i, icon: "Shield", color: "var(--crit)" },
  { match: /secret|credential|config/i, icon: "Lock", color: "var(--crit)" },
  { match: /migration|database|schema/i, icon: "Database", color: "var(--warn)" },
  { match: /depend|package|library|\bnpm\b/i, icon: "Boxes", color: "var(--warn)" },
  { match: /performance|latency/i, icon: "Gauge", color: "var(--accent)" },
  { match: /round-trip|network|external call|api call|http/i, icon: "Zap", color: "var(--accent)" },
  { match: /public api|contract/i, icon: "Code", color: "var(--accent)" },
];

/**
 * Pure — infer a display icon/color for a risk-area tag from its text.
 * Cosmetic grouping only: `risk_areas` is a plain `string[]` with no file
 * reference in the data model (`server/specs/intent-layer-plan.md` §3b, a
 * deliberate decision to keep it separate from the heavier `Risk` type) — this
 * never implies, and must never render, a real code link.
 */
export function classifyRiskArea(tag: string): { icon: IconName; color: string } {
  const rule = RISK_CATEGORY_RULES.find((r) => r.match.test(tag));
  return rule ? { icon: rule.icon, color: rule.color } : { icon: "AlertTriangle", color: "var(--info)" };
}

interface IntentPanelProps {
  prId: string | null | undefined;
  prHeadSha: string | null | undefined;
}

export function IntentPanel({ prId, prHeadSha }: IntentPanelProps) {
  const { data, isLoading } = useIntent(prId);
  const refresh = useRefreshIntent(prId);
  const record = data?.intent ?? null;

  // Cheap client-side staleness hint — the authoritative check is server-side
  // (the input hash), this only flags "computed against an earlier commit".
  const isStale = !!record?.head_sha && !!prHeadSha && record.head_sha !== prHeadSha;
  const reason =
    record && record.confidence === "low" ? intentConfidenceReason(record.sources) : null;

  return (
    <section style={s.card}>
      <SectionLabel
        icon="Target"
        right={
          record && (
            <Button
              kind="tertiary"
              size="sm"
              icon="RefreshCw"
              loading={refresh.isPending}
              onClick={() => refresh.mutate()}
            >
              Refresh
            </Button>
          )
        }
      >
        Intent
      </SectionLabel>

      {isLoading && (
        <div style={s.skeletonStack}>
          <Skeleton height={18} width="70%" />
          <Skeleton height={14} width="90%" />
          <Skeleton height={14} width="60%" />
        </div>
      )}

      {!isLoading && !record && (
        <EmptyState
          icon="Target"
          title="No intent derived yet"
          body="Derive a one-line intent, in/out-of-scope lists, and risk tags from this PR's title, description, and linked docs."
          cta="Derive intent"
          onCta={() => refresh.mutate()}
          ctaLoading={refresh.isPending}
        />
      )}

      {!isLoading && record && (
        <div style={s.body}>
          <p style={s.statement}>&ldquo;{record.intent}&rdquo;</p>

          <div style={s.scopeGrid}>
            <div>
              <div style={s.scopeHeadingRow}>
                <Icon.Check size={13} style={{ color: "var(--ok)" }} />
                <span style={s.scopeHeadingIn}>In scope</span>
              </div>
              {record.in_scope.length === 0 ? (
                <span style={s.emptyList}>—</span>
              ) : (
                <ul style={s.list}>
                  {record.in_scope.map((item) => (
                    <li key={item} style={s.listItem}>
                      <span style={s.bullet}>&middot;</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div style={s.scopeHeadingRow}>
                <Icon.X size={13} style={{ color: "var(--text-muted)" }} />
                <span style={s.scopeHeadingOut}>Out of scope</span>
              </div>
              {record.out_of_scope.length === 0 ? (
                <span style={s.emptyList}>—</span>
              ) : (
                <ul style={s.listMuted}>
                  {record.out_of_scope.map((item) => (
                    <li key={item} style={s.listItem}>
                      <span style={s.bullet}>&middot;</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {record.risk_areas.length > 0 && (
            <div>
              <div style={s.scopeHeadingRow}>
                <Icon.AlertTriangle size={13} style={{ color: "var(--text-muted)" }} />
                <span style={s.scopeHeading}>Risk areas</span>
              </div>
              <div style={s.riskList}>
                {record.risk_areas.map((tag) => {
                  const { icon, color } = classifyRiskArea(tag);
                  const RiskIcon = Icon[icon];
                  return (
                    <div key={tag} style={s.riskRow}>
                      <span style={{ ...s.riskIconWrap, color }}>
                        <RiskIcon size={16} />
                      </span>
                      <span style={s.riskLabel}>{tag}</span>
                      <Icon.ChevronDown size={16} style={s.riskChevron} aria-hidden />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={s.confidenceRow}>
            <Badge color={CONFIDENCE_COLOR[record.confidence]} dot>
              {CONFIDENCE_LABEL[record.confidence]}
            </Badge>
            {isStale && <span style={s.staleHint}>Computed against an earlier commit</span>}
          </div>

          {reason && <p style={s.reasonLine}>{reason}</p>}
        </div>
      )}
    </section>
  );
}

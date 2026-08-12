/* StatsTab — what this skill costs and what it correlates with.

   Attribution caveat (see SkillStats in the contracts): a finding is produced
   by an AGENT, never by a single skill — the model doesn't tell us which
   instruction caused which finding. Every number below describes runs in which
   this skill happened to be injected, so `stats.attribution` is rendered as
   visible small print, not a tooltip. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Card, Donut, ErrorState, MetricCard, SectionLabel, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillStats } from "@/lib/hooks/skills";
import { formatAcceptRate, formatAvgTokens, toCategorySegments } from "./helpers";
import { s } from "./styles";

export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data: stats, isLoading, isError, refetch } = useSkillStats(skill.id);

  if (isLoading) {
    return (
      <div style={s.skeletons}>
        <Skeleton height={96} />
        <Skeleton height={180} />
      </div>
    );
  }
  if (isError || !stats) {
    return <ErrorState body={t("stats.loadError")} onRetry={() => refetch()} />;
  }

  const segments = toCategorySegments(stats.by_category);

  return (
    <div style={s.wrap}>
      <div style={s.metrics}>
        <div style={s.metricCell}>
          <MetricCard
            label={t("stats.usedBy")}
            value={stats.used_by}
            suffix={` ${t("stats.usedByUnit")}`}
          />
          <span style={s.metricHint}>{t("stats.enabledFor", { n: stats.enabled_for })}</span>
        </div>
        <div style={s.metricCell}>
          <MetricCard
            label={t("stats.injected")}
            value={stats.injected_runs_30d}
            suffix={` ${t("stats.injectedUnit")}`}
          />
          <span style={s.metricHint}>{t("stats.injectedHint")}</span>
        </div>
        <div style={s.metricCell}>
          <MetricCard label={t("stats.avgTokens")} value={formatAvgTokens(stats.avg_tokens)} />
          <span style={s.metricHint}>
            {t("stats.avgTokensHint", { body: stats.body_tokens })}
          </span>
        </div>
        <div style={s.metricCell}>
          {/* null accept_rate renders "—": "nothing triaged yet" is not "0%". */}
          <MetricCard label={t("stats.acceptRate")} value={formatAcceptRate(stats.accept_rate)} />
        </div>
        <div style={s.metricCell}>
          <MetricCard label={t("stats.findings")} value={stats.findings_30d} />
        </div>
      </div>

      {stats.injected_runs_30d === 0 && <div style={s.note}>{t("stats.neverInjected")}</div>}

      <p style={s.attribution}>{t("stats.attribution")}</p>

      <Card>
        <SectionLabel icon="Cpu">{t("stats.agentsUsing")}</SectionLabel>
        {stats.agents.length === 0 ? (
          <div style={s.empty}>{t("stats.neverInjected")}</div>
        ) : (
          stats.agents.map((a) => (
            <div key={a.id} style={s.agentRow}>
              <Link href={`/agents/${a.id}?tab=skills`} style={s.agentLink}>
                {a.name}
              </Link>
              {!a.enabled && <Badge color="var(--text-muted)">{t("stats.agentDisabled")}</Badge>}
              <span style={s.agentSpacer} />
              <Link href={`/agents/${a.id}?tab=skills`} style={s.openLink}>
                {t("stats.open")}
              </Link>
            </div>
          ))
        )}
      </Card>

      <Card>
        <SectionLabel icon="BarChart">{t("stats.byCategory")}</SectionLabel>
        {segments.length === 0 ? (
          <div style={s.empty}>{t("stats.noFindings")}</div>
        ) : (
          // valuePrefix="" — these are finding COUNTS, not dollars.
          <Donut segments={segments} valuePrefix="" />
        )}
      </Card>
    </div>
  );
}

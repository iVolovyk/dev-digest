/* BlastRadiusPanel — Overview tab's BLAST RADIUS section: an impact map for the
   PR (changed symbols → callers → downstream HTTP endpoints / cron jobs),
   served from the repository index with no model call.

   Four states, all DERIVED DURING RENDER from the query response (no useState
   mirroring of fetched data): a map, "no downstream impact" (full index only),
   "cannot compute" (degraded/failed index — never reads as "nothing touched"),
   and loading. See `server/specs/blast-radius-plan.md` §8d. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, Icon, MonoLink, SectionLabel, Skeleton, type IconName } from "@devdigest/ui";
import type { BlastRadius, DownstreamImpact } from "@devdigest/shared";
import { useBlastRadius } from "@/lib/hooks";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

interface BlastRadiusPanelProps {
  prId: string | null | undefined;
  repoId: string;
  repoFullName: string | null;
  prHeadSha: string | null | undefined;
}

/** PURE — unique, order-preserving. */
function uniq(items: string[]): string[] {
  return [...new Set(items)];
}

const HTTP_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

/** PURE — split "POST /login" into method + path. `method` is null when the
    string is not `VERB path` (a bare route, a GraphQL op name, etc.). */
function splitEndpoint(raw: string): { method: string | null; path: string } {
  const sp = raw.indexOf(" ");
  if (sp > 0) {
    const head = raw.slice(0, sp).toUpperCase();
    if (HTTP_METHODS.has(head)) {
      return { method: head, path: raw.slice(sp + 1).trim() };
    }
  }
  return { method: null, path: raw };
}

export function BlastRadiusPanel({
  prId,
  repoId,
  repoFullName,
  prHeadSha,
}: BlastRadiusPanelProps) {
  const t = useTranslations("blast");
  const router = useRouter();
  const { data, isLoading } = useBlastRadius(prId);

  return (
    <section style={s.card}>
      <SectionLabel icon="Workflow">{t("sectionLabel")}</SectionLabel>

      {isLoading && (
        <div style={s.skeletonStack}>
          <Skeleton height={16} width="80%" />
          <Skeleton height={48} width="100%" />
          <Skeleton height={14} width="60%" />
        </div>
      )}

      {!isLoading && data && (
        <BlastBody
          data={data}
          repoId={repoId}
          repoFullName={repoFullName}
          prHeadSha={prHeadSha ?? null}
          t={t}
          onOpenContext={() => router.push(`/repos/${repoId}/context`)}
        />
      )}
    </section>
  );
}

function BlastBody({
  data,
  repoFullName,
  prHeadSha,
  t,
  onOpenContext,
}: {
  data: BlastRadius;
  repoId: string;
  repoFullName: string | null;
  prHeadSha: string | null;
  t: ReturnType<typeof useTranslations>;
  onOpenContext: () => void;
}) {
  const cannotCompute =
    data.index_state === "degraded" || data.index_state === "failed";

  // --- State: cannot compute (never "no impact") ---
  if (cannotCompute) {
    return (
      <EmptyState
        icon="AlertTriangle"
        title={t("cannotCompute.title")}
        body={t("cannotCompute.body", { state: data.index_state })}
        cta={t("cannotCompute.cta")}
        onCta={onOpenContext}
      />
    );
  }

  // --- Derived counts (during render — never stored) ---
  const callerCount = data.downstream.reduce((n, d) => n + d.callers_total, 0);
  const endpointCount = uniq(
    data.downstream.flatMap((d) => d.endpoints_affected),
  ).length;
  const cronCount = uniq(data.downstream.flatMap((d) => d.crons_affected)).length;

  const hasMap = data.downstream.length > 0;

  return (
    <>
      {/* `data.summary` (the deterministic sentence) is intentionally NOT
          rendered here — its counts duplicate the stat row and its disclaimer
          duplicates `partialCaveat` / `depthCaveat`. It still ships in the
          contract for the MCP consumer and the future generated summary. */}
      {data.partial && (
        <div style={s.caveat} role="status">
          <Icon.AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            {t("partialCaveat", {
              reason: t(`reason.${normaliseReason(data.reason)}`),
            })}
          </span>
        </div>
      )}

      {!hasMap && data.changed_symbols.length === 0 && (
        <p style={s.summary}>{t("empty.body", { count: 0 })}</p>
      )}

      {!hasMap && data.changed_symbols.length > 0 && (
        <EmptyState
          icon="Check"
          title={
            data.index_state === "full"
              ? t("empty.title")
              : t("noDownstream", { count: data.changed_symbols.length })
          }
          body={
            data.index_state === "full"
              ? t("empty.body", { count: data.changed_symbols.length })
              : undefined
          }
        />
      )}

      {hasMap && (
        <>
          <div style={s.statRow}>
            <Stat icon="Code" value={data.changed_symbols.length} label={t("stat.symbols")} />
            <Stat icon="CornerDownRight" value={callerCount} label={t("stat.callers")} />
            <Stat icon="Globe" value={endpointCount} label={t("stat.endpoints")} />
            <Stat icon="Clock" value={cronCount} label={t("stat.crons")} />
          </div>

          <div style={s.tree}>
            {data.downstream.map((d, i) => (
              <SymbolRow
                key={d.symbol}
                impact={d}
                repoFullName={repoFullName}
                prHeadSha={prHeadSha}
                defaultOpen={i === 0}
                t={t}
              />
            ))}
          </div>

          <p style={s.depthCaveat}>{t("depthCaveat")}</p>
        </>
      )}
    </>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: IconName;
  value: number;
  label: string;
}) {
  const I = Icon[icon];
  return (
    <div style={s.stat} role="group" aria-label={`${value} ${label}`}>
      <I size={14} style={s.statIcon} aria-hidden />
      <span style={s.statValue}>{value}</span>
      <span style={s.statLabel}>{label}</span>
    </div>
  );
}

function SymbolRow({
  impact,
  repoFullName,
  prHeadSha,
  defaultOpen,
  t,
}: {
  impact: DownstreamImpact;
  repoFullName: string | null;
  prHeadSha: string | null;
  defaultOpen: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const truncated = impact.callers_total > impact.callers.length;
  const hasTags =
    impact.endpoints_affected.length > 0 || impact.crons_affected.length > 0;

  return (
    <div style={s.symbolRow}>
      <button
        type="button"
        style={s.symbolHeader}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? <Icon.ChevronDown size={14} /> : <Icon.ChevronRight size={14} />}
        <Icon.Code size={13} style={s.symbolIcon} aria-hidden />
        <span style={s.symbolName}>{impact.symbol}</span>
        <span style={s.symbolCounts}>
          {t("callerCount", { count: impact.callers_total })}
        </span>
      </button>

      {open && (
        <div style={s.symbolBody}>
          {impact.callers.length > 0 && (
            <div style={s.callerList}>
              {impact.callers.map((c) => (
                <div key={`${c.file}:${c.line}:${c.name}`} style={s.callerRow}>
                  <Icon.CornerDownRight
                    size={13}
                    style={s.callerArrow}
                    aria-hidden
                  />
                  <CallerRef
                    file={c.file}
                    line={c.line}
                    repoFullName={repoFullName}
                    prHeadSha={prHeadSha}
                  />
                </div>
              ))}
            </div>
          )}

          {truncated && (
            <span style={s.truncationNote}>
              {t("truncation", {
                shown: impact.callers.length,
                total: impact.callers_total,
              })}
            </span>
          )}

          {hasTags && (
            <div style={s.impactTags}>
              {impact.endpoints_affected.map((e) => (
                <EndpointTag key={e} raw={e} />
              ))}
              {impact.crons_affected.map((c) => (
                <CronTag key={c} raw={c} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** An affected HTTP endpoint — globe glyph, method (accent, bold) + path. */
function EndpointTag({ raw }: { raw: string }) {
  const { method, path } = splitEndpoint(raw);
  return (
    <span style={s.endpointTag}>
      <Icon.Globe size={12} style={{ flexShrink: 0 }} aria-hidden />
      {method && <span style={s.endpointMethod}>{method}</span>}
      <span>{path}</span>
    </span>
  );
}

/** An affected scheduled job — clock glyph, amber. */
function CronTag({ raw }: { raw: string }) {
  return (
    <span style={s.cronTag}>
      <Icon.Clock size={12} style={{ flexShrink: 0 }} aria-hidden />
      <span>{raw}</span>
    </span>
  );
}

/** A caller lives in a file the PR usually did NOT change — deep-link to GitHub
    at the head SHA (which pins the line), not a diff scroll. Plain mono text
    when the repo full name is not yet resolved. */
function CallerRef({
  file,
  line,
  repoFullName,
  prHeadSha,
}: {
  file: string;
  line: number;
  repoFullName: string | null;
  prHeadSha: string | null;
}) {
  const label = `${file}:${line}`;
  if (!repoFullName || !prHeadSha) {
    return <span style={s.plainRef}>{label}</span>;
  }
  return (
    <MonoLink href={githubBlobUrl(repoFullName, prHeadSha, file, line)}>
      {label}
    </MonoLink>
  );
}

/** PURE — map a server `reason` token to an i18n key, defaulting safely. */
function normaliseReason(reason: string | null | undefined): string {
  switch (reason) {
    case "partial_index":
    case "caller_cap":
    case "reverse_walk_truncated":
    case "index_unavailable":
      return reason;
    default:
      return "index_unavailable";
  }
}

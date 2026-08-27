/* SmartDiffViewer — risk-ordered "Files changed" view. Owns grouping, the
   per-role collapse policy, and the per-line severity badges; delegates ALL
   file rendering to the shared <FileCard> so inline commenting keeps working in
   one place (smart-diff-plan.md §6a).

   Two data sources, each authoritative for what it reports:
   - `groups` (from GET /pulls/:id/smart-diff): role, order, finding_lines,
     the auto-expand decision. Correct even before reviews load.
   - `reviews` (from the already-cached usePrReviews query): the SEVERITY of
     each finding, joined client-side by `${file}:${start_line}`. This avoids
     widening the SmartDiffFile contract — which would mean editing BOTH
     vendored copies, the silent-failure trap in client/INSIGHTS.md. Do not
     "simplify" this by adding `severity` to the contract. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SeverityBadge } from "@devdigest/ui";
import { FileCard, type DiffCommentApi } from "@/components/diff-viewer";
import type { PrFile } from "@/lib/types";
import type { ReviewRecord, Severity, SmartDiff, SmartDiffGroup } from "@devdigest/shared";
import { ROLE_ICON, roleDefaultOpen } from "./constants";
import { s } from "./styles";

interface SmartDiffViewerProps {
  groups: SmartDiffGroup[];
  splitSuggestion: SmartDiff["split_suggestion"];
  /** Every PR file by path — FileCard needs the patch text, which SmartDiffFile
   *  deliberately does not carry. */
  filesByPath: Map<string, PrFile>;
  reviews: ReviewRecord[];
  commenting?: DiffCommentApi;
}

const SEVERITY_ORDER: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

/** `${file}:${start_line}` → the distinct severities at that line, from the
 *  latest review of kind 'review' (matches the server's finding_lines source). */
function severityByLine(reviews: ReviewRecord[]): Map<string, Set<Severity>> {
  const latest = reviews.find((r) => r.kind === "review");
  const map = new Map<string, Set<Severity>>();
  if (!latest) return map;
  for (const f of latest.findings) {
    const key = `${f.file}:${f.start_line}`;
    const set = map.get(key) ?? new Set<Severity>();
    set.add(f.severity);
    map.set(key, set);
  }
  return map;
}

function annotationsForFile(
  path: string,
  findingLines: number[],
  sevMap: Map<string, Set<Severity>>,
): Record<number, React.ReactNode> {
  const out: Record<number, React.ReactNode> = {};
  for (const line of findingLines) {
    const severities = sevMap.get(`${path}:${line}`);
    if (!severities || severities.size === 0) continue;
    out[line] = SEVERITY_ORDER.filter((sev) => severities.has(sev)).map((sev) => (
      <SeverityBadge key={sev} severity={sev} />
    ));
  }
  return out;
}

export function SmartDiffViewer({
  groups,
  filesByPath,
  reviews,
  commenting,
}: SmartDiffViewerProps) {
  const t = useTranslations("prReview");
  const sevMap = React.useMemo(() => severityByLine(reviews), [reviews]);

  return (
    <div style={s.root}>
      {groups.map((group) => {
        const RoleIcon = Icon[ROLE_ICON[group.role]];
        return (
          <section key={group.role} style={s.group} aria-label={t(`smartDiff.roles.${group.role}.title`)}>
            <div style={s.groupHeader}>
              <span style={s.groupTitle}>
                <RoleIcon size={14} />
                {t(`smartDiff.roles.${group.role}.title`)}
              </span>
              <span style={s.groupSubtitle}>{t(`smartDiff.roles.${group.role}.subtitle`)}</span>
              <span style={s.groupCount}>
                {t("smartDiff.filesCount", { count: group.files.length })}
              </span>
            </div>
            <div style={s.files}>
              {group.files.map((file) => {
                const prFile: PrFile =
                  filesByPath.get(file.path) ??
                  { path: file.path, additions: file.additions, deletions: file.deletions, patch: null };
                return (
                  <FileCard
                    key={file.path}
                    file={prFile}
                    commenting={commenting}
                    defaultOpen={roleDefaultOpen(group.role, file)}
                    findingLines={file.finding_lines}
                    lineAnnotations={annotationsForFile(file.path, file.finding_lines, sevMap)}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

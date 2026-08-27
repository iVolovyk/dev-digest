/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES, FINDING_FLASH_MS } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard({
  file,
  commenting,
  defaultOpen,
  findingLines,
  lineAnnotations,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  /** Overrides the size-based auto-expand. `undefined` → today's behaviour. */
  defaultOpen?: boolean;
  /** New-file line numbers carrying a review finding (Smart Diff). Drives the
   *  header "N findings" badge, per-line markers, and jump-to-line. */
  findingLines?: number[];
  /** New-file line number → node rendered inline on that line (severity
   *  badges). Domain-free; the caller builds the nodes. */
  lineAnnotations?: Record<number, React.ReactNode>;
}) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(
    defaultOpen ?? (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const [flashLine, setFlashLine] = React.useState<number | null>(null);
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  const findingLineSet = React.useMemo(() => new Set(findingLines ?? []), [findingLines]);
  const findingCount = findingLines?.length ?? 0;
  const annotate = findingLines !== undefined;

  const jumpToFirstFinding = () => {
    setOpen(true);
    const line = findingLines?.[0];
    if (line == null) return;
    setFlashLine(line);
    requestAnimationFrame(() => {
      document
        .getElementById(`d-${file.path}-${line}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    window.setTimeout(() => setFlashLine(null), FINDING_FLASH_MS);
  };

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div style={s.fileCard}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {findingCount > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              jumpToFirstFinding();
            }}
            style={s.findingsBadge}
            aria-label={t("diffViewer.findingsCount", { count: findingCount })}
          >
            <Icon.AlertTriangle size={12} />
            {t("diffViewer.findingsCount", { count: findingCount })}
          </button>
        )}
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => {
              const isFinding = annotate && ln.newNo != null && findingLineSet.has(ln.newNo);
              return (
                <CodeLine
                  key={i}
                  ln={ln}
                  path={file.path}
                  threads={threadsForLine(ln, matched)}
                  commenting={commenting}
                  anchorId={
                    annotate && ln.newNo != null ? `d-${file.path}-${ln.newNo}` : undefined
                  }
                  annotation={isFinding ? lineAnnotations?.[ln.newNo!] : undefined}
                  flash={flashLine != null && ln.newNo === flashLine}
                />
              );
            })
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
        </div>
      )}
    </div>
  );
}

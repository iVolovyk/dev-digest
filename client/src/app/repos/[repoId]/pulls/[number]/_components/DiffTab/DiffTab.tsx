"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, usePrReviews } from "@/lib/hooks/reviews";
import { useSmartDiff } from "@/lib/hooks/smart-diff";
import { notify } from "@/lib/toast";
import type { PrFile, ReviewRecord } from "@devdigest/shared";
import { SmartDiffViewer } from "./_components/SmartDiffViewer";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
}

type Order = "smart" | "original";

// `usePrReviews` is `undefined` while loading; a shared empty array keeps the
// `reviews` prop identity stable so SmartDiffViewer's severity memo isn't busted
// on every parent re-render (DiffTab re-renders on comment/review polling).
const NO_REVIEWS: ReviewRecord[] = [];

// The pressed segment of the order toggle — the `ghost` Button kind doesn't
// react to `active`, so style the pressed state here (matches `aria-pressed`).
const ACTIVE_SEGMENT: React.CSSProperties = {
  background: "var(--bg-hover)",
  color: "var(--text-primary)",
  borderColor: "var(--border-strong)",
};

export function DiffTab({ prId, filesCount, files, canComment }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);
  // View preference is local state, not a URL param — DiffTab has no access to
  // the page's setParam and threading it down for a preference is out of scope
  // (smart-diff-plan.md §6e). Noted as future work.
  const [order, setOrder] = React.useState<Order>("smart");

  // `pr_files` is populated by GET /pulls/:id (the detail query), not by PR
  // import — gate on files being in hand so we never read an empty table.
  const smart = useSmartDiff(prId, { enabled: !!prId && files.length > 0 });
  const { data: reviews } = usePrReviews(prId);

  const commentCount = comments?.length ?? 0;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  const filesByPath = React.useMemo(() => {
    const map = new Map<string, PrFile>();
    for (const f of files) map.set(f.path, f);
    return map;
  }, [files]);

  // Smart order is available only when the enrichment actually produced groups.
  // Any failure (query error, empty groups) falls back to the flat viewer and
  // hides the toggle — the Files-changed tab must never break on an enrichment.
  const smartAvailable = !smart.isError && (smart.data?.groups.length ?? 0) > 0;
  const useSmart = order === "smart" && smartAvailable;

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          !smartAvailable && commentCount === 0 ? undefined : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {smartAvailable && (
              <span style={{ display: "inline-flex", gap: 2 }}>
                <Button
                  kind="ghost"
                  size="sm"
                  aria-pressed={order === "smart"}
                  style={order === "smart" ? ACTIVE_SEGMENT : undefined}
                  onClick={() => setOrder("smart")}
                >
                  {t("smartDiff.smartOrder")}
                </Button>
                <Button
                  kind="ghost"
                  size="sm"
                  aria-pressed={order === "original"}
                  style={order === "original" ? ACTIVE_SEGMENT : undefined}
                  onClick={() => setOrder("original")}
                >
                  {t("smartDiff.originalOrder")}
                </Button>
              </span>
            )}
            {commentCount > 0 && (
              <Button
                kind="ghost"
                size="sm"
                icon={showComments ? "EyeOff" : "Eye"}
                onClick={() => setShowComments((v) => !v)}
              >
                {showComments ? "Hide comments" : "Show comments"} ({commentCount})
              </Button>
            )}
          </span>
          )
        }
      >
        Files changed · {filesCount} files
      </SectionLabel>

      {useSmart && smart.data ? (
        <SmartDiffViewer
          groups={smart.data.groups}
          splitSuggestion={smart.data.split_suggestion}
          filesByPath={filesByPath}
          reviews={reviews ?? NO_REVIEWS}
          commenting={commenting}
        />
      ) : (
        <DiffViewer files={files} commenting={commenting} />
      )}
    </section>
  );
}

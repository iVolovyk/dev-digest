/* VersionsTab — every body change is snapshotted server-side, so a past run
   stays reproducible against the exact wording it used. Newest first; the
   newest row IS the current body, so it offers no diff and no restore.
   Restoring does not rewrite history — it mints a new version. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Modal, SectionLabel, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useRestoreSkillVersion, useSkillVersions } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { DIFF_MODAL_WIDTH } from "./constants";
import { diffLines, formatCreatedAt, sortNewestFirst } from "./helpers";
import { s } from "./styles";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const [diffOf, setDiffOf] = React.useState<number | null>(null);

  if (isLoading) return <Skeleton height={160} />;
  if (isError || !data) return <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />;

  const versions = sortNewestFirst(data);
  const newest = versions[0]?.version;
  const diffTarget = versions.find((v) => v.version === diffOf) ?? null;

  const onRestore = (version: number) => {
    if (!window.confirm(t("versions.restoreConfirm", { version }))) return;
    restore.mutate(
      { id: skill.id, version },
      {
        onSuccess: (updated) =>
          toast.success(t("versions.restoredToast", { version, newVersion: updated.version })),
      },
    );
  };

  return (
    <div style={s.wrap}>
      <SectionLabel
        icon="History"
        right={<Badge color="var(--text-muted)">{t("versions.count", { n: versions.length })}</Badge>}
      >
        {t("versions.title")}
      </SectionLabel>
      <p style={s.subtitle}>{t("versions.subtitle")}</p>

      {versions.length === 0 && <div style={s.empty}>{t("versions.empty")}</div>}

      {versions.map((v) => (
        <div key={v.version} style={s.row}>
          <span className="mono" style={s.version}>
            {t("preview.version", { version: v.version })}
          </span>
          <span style={s.when}>{formatCreatedAt(v.created_at)}</span>
          {v.version === newest ? (
            <Badge color="var(--accent)" bg="var(--accent-bg)">
              {t("versions.current")}
            </Badge>
          ) : (
            <div style={s.actions}>
              <Button size="sm" kind="tertiary" icon="GitCommit" onClick={() => setDiffOf(v.version)}>
                {t("versions.diff")}
              </Button>
              <Button
                size="sm"
                kind="secondary"
                icon="History"
                onClick={() => onRestore(v.version)}
                disabled={restore.isPending}
              >
                {t("versions.restore")}
              </Button>
            </div>
          )}
        </div>
      ))}

      {diffTarget && (
        <Modal
          width={DIFF_MODAL_WIDTH}
          title={t("versions.diffTitle", { version: diffTarget.version })}
          onClose={() => setDiffOf(null)}
        >
          <div className="mono" style={s.diff}>
            {diffLines(diffTarget.body, skill.body).map((line, i) => (
              <div key={i} style={s.diffLine(line.kind)}>
                {line.kind === "add" ? "+ " : line.kind === "del" ? "- " : "  "}
                {line.text}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

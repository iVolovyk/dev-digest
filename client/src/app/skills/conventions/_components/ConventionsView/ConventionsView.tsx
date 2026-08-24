/* /skills/conventions — the Conventions Extractor. Repo-scoped via the
   global active-repo context (not a URL param), matching how the sibling
   Skills/Agents pages under Skills Lab work. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useActiveRepo } from "@/lib/repo-context";
import { useToast } from "@/lib/toast";
import {
  useConventions,
  useExtractConventions,
  useUpdateConvention,
} from "@/lib/hooks/conventions";
import { ConventionCard } from "../ConventionCard";
import { CreateSkillFromConventionsModal } from "../CreateSkillFromConventionsModal";
import { SKELETON_ROWS } from "./constants";
import { s } from "./styles";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const tCommon = useTranslations("common");
  const toast = useToast();
  const { repoId, activeRepo, reposLoaded } = useActiveRepo();

  const { data: conventions, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention();
  const [showCreateSkill, setShowCreateSkill] = React.useState(false);

  const list = conventions ?? [];
  const accepted = list.filter((c) => c.accepted);

  const runExtraction = () =>
    extract.mutate(undefined, {
      onError: () => toast.error(t("page.extractionFailed")),
    });

  const deselectAll = () => {
    for (const c of accepted) {
      update.mutate({ id: c.id, repoId: repoId!, patch: { accepted: false } });
    }
  };

  const onSkillCreated = (skill: Skill) => {
    setShowCreateSkill(false);
    toast.success(t("modal.createdToast", { name: skill.name }));
  };

  if (reposLoaded && !repoId) {
    return (
      <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }]}>
        <div style={s.page}>
          <EmptyState
            icon="ListChecks"
            title={tCommon("repoNotFound.title")}
            body={tCommon("repoNotFound.body")}
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }]}>
      <div style={s.page}>
        <div style={s.headerRow}>
          <div>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              <span style={s.repoName}>{activeRepo?.name ?? t("page.repoFallback")}</span>
            </h1>
            <div style={s.subtitle}>{t("page.subtitle")}</div>
          </div>
          <Button
            kind="secondary"
            icon="RefreshCw"
            loading={extract.isPending}
            disabled={extract.isPending}
            onClick={runExtraction}
          >
            {extract.isPending
              ? t("page.scanning")
              : list.length > 0
                ? t("page.rescan")
                : t("page.runExtraction")}
          </Button>
        </div>

        {isLoading && (
          <div style={s.skeletons}>
            {Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <Skeleton key={i} height={140} />
            ))}
          </div>
        )}

        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}

        {!isLoading && !isError && list.length === 0 && (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={runExtraction}
            ctaLoading={extract.isPending}
          />
        )}

        {list.length > 0 && (
          <>
            <div style={s.toolbar}>
              <div style={s.toolbarLeft}>
                <span style={s.count}>
                  {t("page.acceptedCount", { accepted: accepted.length, total: list.length })}
                </span>
                <Button kind="ghost" size="sm" onClick={deselectAll} disabled={accepted.length === 0}>
                  {t("page.deselectAll")}
                </Button>
              </div>
              <Button
                kind="primary"
                icon="Sparkles"
                onClick={() => setShowCreateSkill(true)}
                disabled={accepted.length === 0}
              >
                {t("page.createSkill")}
              </Button>
            </div>

            {list.map((c) => (
              <ConventionCard
                key={c.id}
                convention={c}
                pending={update.isPending}
                onAcceptedChange={(nextAccepted) =>
                  update.mutate({ id: c.id, repoId: repoId!, patch: { accepted: nextAccepted } })
                }
              />
            ))}
          </>
        )}
      </div>

      {showCreateSkill && activeRepo && (
        <CreateSkillFromConventionsModal
          conventions={accepted}
          repoName={activeRepo.name}
          repoFullName={activeRepo.full_name}
          onClose={() => setShowCreateSkill(false)}
          onCreated={onSkillCreated}
        />
      )}
    </AppShell>
  );
}

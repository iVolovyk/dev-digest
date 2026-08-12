/* /skills — Skills Lab. One route, master-detail: the left column lists every
   skill, the right pane is the detail panel. Selection and the active tab live
   in the URL (?skill=<id>&tab=<tab>) rather than in component state, so a
   selected skill is linkable and survives a reload — that is also why there is
   no /skills/[id] route. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useSkills } from "@/lib/hooks/skills";
import { AddSkillDrawer, type AddSkillTab } from "../AddSkillDrawer";
import { SkillCard } from "../SkillCard";
import { SkillDetailPanel } from "../SkillDetailPanel";
import { SKELETON_ROWS } from "./constants";
import { filterSkills, resolveTab } from "./helpers";
import { s } from "./styles";

export function SkillsListView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const search = useSearchParams();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const [query, setQuery] = React.useState("");
  const [drawer, setDrawer] = React.useState<AddSkillTab | null>(null);

  const tab = resolveTab(search.get("tab"));
  const selectedId = search.get("skill");
  // A stale ?skill= (deleted elsewhere, or a hand-typed id) must fall back to
  // the "select a skill" prompt rather than render an empty panel.
  const selected = (skills ?? []).find((sk) => sk.id === selectedId) ?? null;

  const push = React.useCallback(
    (mutate: (sp: URLSearchParams) => void) => {
      const sp = new URLSearchParams(search.toString());
      mutate(sp);
      const qs = sp.toString();
      router.replace(qs ? `/skills?${qs}` : "/skills");
    },
    [router, search],
  );

  const select = (id: string) =>
    push((sp) => {
      sp.set("skill", id);
      sp.set("tab", resolveTab(sp.get("tab")));
    });
  const setTab = (next: string) => push((sp) => sp.set("tab", next));
  const clearSelection = () =>
    push((sp) => {
      sp.delete("skill");
      sp.delete("tab");
    });

  const onCreated = (skill: Skill) => {
    setDrawer(null);
    select(skill.id);
  };

  const list = filterSkills(skills ?? [], query);

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      {drawer && (
        <AddSkillDrawer initialTab={drawer} onClose={() => setDrawer(null)} onCreated={onCreated} />
      )}
      <div style={s.split}>
        <div style={s.list}>
          <div style={s.listHeader}>
            <div style={s.titleRow}>
              <h1 style={s.h1}>{t("page.heading")}</h1>
              <Dropdown
                width={230}
                align="right"
                trigger={
                  <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                    {t("page.addSkill")}
                  </Button>
                }
                items={[
                  { label: t("create.tabCreate"), icon: "Edit", onClick: () => setDrawer("create") },
                  { divider: true },
                  { label: t("page.menu.fromFile"), icon: "Upload", onClick: () => setDrawer("import") },
                ]}
              />
            </div>
            <div style={s.search}>
              <Icon.Search size={13} style={s.searchIcon} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("page.searchPlaceholder")}
                aria-label={t("page.searchPlaceholder")}
                style={s.searchInput}
              />
            </div>
          </div>

          <div style={s.listBody}>
            {isLoading && (
              <div style={s.skeletons}>
                {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                  <Skeleton key={i} height={92} />
                ))}
              </div>
            )}
            {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
            {!isLoading && !isError && list.length === 0 && (
              <EmptyState
                icon="Sparkles"
                title={t("page.empty.title")}
                body={t("page.empty.body")}
                cta={t("page.empty.cta")}
                onCta={() => setDrawer("import")}
              />
            )}
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                active={sk.id === selected?.id}
                onClick={() => select(sk.id)}
              />
            ))}
          </div>
        </div>

        <div style={s.detail}>
          {selected ? (
            <SkillDetailPanel
              skill={selected}
              tab={tab}
              onTab={setTab}
              onDeleted={clearSelection}
            />
          ) : (
            <div style={s.detailEmpty}>
              <EmptyState
                icon="Sparkles"
                title={t("page.selectPrompt.title")}
                body={t("page.selectPrompt.body")}
              />
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

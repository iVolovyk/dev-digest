/* SkillDetailPanel — right pane of /skills: identity header + the four tabs.
   It owns no selection state; `tab` comes from ?tab= and `onTab` writes it
   back, so every tab is linkable. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Tabs } from "@devdigest/ui";
import { isUntrustedSkillSource, type Skill } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { TABS } from "./constants";
import { s } from "./styles";

export function SkillDetailPanel({
  skill,
  tab,
  onTab,
  onDeleted,
}: {
  skill: Skill;
  tab: string;
  onTab: (tab: string) => void;
  /** Called after the skill is gone, so the page can drop ?skill= */
  onDeleted: () => void;
}) {
  const t = useTranslations("skills");

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <Icon.Sparkles size={18} style={s.icon} />
        <h1 className="mono" style={s.name}>
          {skill.name}
        </h1>
        <Badge color="var(--text-secondary)">{t(`listItem.type.${skill.type}`)}</Badge>
        <Badge color="var(--text-muted)" mono>
          {t("preview.version", { version: skill.version })}
        </Badge>
        {isUntrustedSkillSource(skill.source) && (
          <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
            {t("preview.untrustedBadge")}
          </Badge>
        )}
      </div>

      <div style={s.tabsBar}>
        <Tabs
          tabs={TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }))}
          value={tab}
          onChange={onTab}
          pad="0 24px"
        />
      </div>

      <div style={s.body}>
        {tab === "config" && <ConfigTab skill={skill} onDeleted={onDeleted} />}
        {tab === "preview" && <PreviewTab skill={skill} />}
        {tab === "stats" && <StatsTab skill={skill} />}
        {tab === "versions" && <VersionsTab skill={skill} />}
      </div>
    </div>
  );
}

/* AddSkillDrawer — "Add Skill" surface for /skills. Two ways in: write one by
   hand (Create) or upload a Markdown file / archive (Import). Import is a
   two-step flow on purpose — preview first, save second — so somebody else's
   instructions are read by a human before they can reach an agent's prompt. */
"use client";

import React from "react";
import { Drawer, Tabs } from "@devdigest/ui";
import { useTranslations } from "next-intl";
import type { Skill } from "@devdigest/shared";
import { CreateSkillTab } from "./_components/CreateSkillTab";
import { ImportSkillTab } from "./_components/ImportSkillTab";
import { ADD_SKILL_TABS, DRAWER_WIDTH, type AddSkillTab } from "./constants";
import { s } from "./styles";

export function AddSkillDrawer({
  initialTab = "create",
  onClose,
  onCreated,
}: {
  initialTab?: AddSkillTab;
  onClose: () => void;
  /** Fired once the skill exists server-side, with the persisted row. */
  onCreated: (skill: Skill) => void;
}) {
  const t = useTranslations("skills");
  const [tab, setTab] = React.useState<AddSkillTab>(initialTab);

  return (
    <Drawer width={DRAWER_WIDTH} title={t("drawer.title")} onClose={onClose}>
      <div style={s.tabsBar}>
        <Tabs
          tabs={ADD_SKILL_TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }))}
          value={tab}
          onChange={(k) => setTab(k as AddSkillTab)}
          pad="0 24px"
        />
      </div>
      {tab === "create" ? (
        <CreateSkillTab onCreated={onCreated} />
      ) : (
        <ImportSkillTab onCreated={onCreated} />
      )}
    </Drawer>
  );
}

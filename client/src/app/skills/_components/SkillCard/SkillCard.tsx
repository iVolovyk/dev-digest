/* SkillCard — one row of the /skills left column: name, type, provenance,
   description, and the global enable switch. The toggle writes straight
   through `useUpdateSkill` (it is the skill-wide kill switch, not a per-agent
   link), so the list never has to thread a handler down. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Chip, Icon, Toggle } from "@devdigest/ui";
import { isUntrustedSkillSource, type Skill } from "@devdigest/shared";
import { useUpdateSkill } from "@/lib/hooks/skills";
import { SOURCE_ICON } from "../../constants";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
}) {
  const t = useTranslations("skills");
  const update = useUpdateSkill();
  const SourceIcon = Icon[SOURCE_ICON[skill.source]];
  const untrusted = isUntrustedSkillSource(skill.source);

  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Sparkles size={14} />
        </div>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        <div onClick={(e) => e.stopPropagation()}>
          <Toggle
            on={skill.enabled}
            onChange={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })}
            size={14}
          />
        </div>
      </div>

      <div style={s.description}>{skill.description}</div>

      <div style={s.metaRow}>
        <Badge color="var(--text-secondary)">{t(`listItem.type.${skill.type}`)}</Badge>
        <span style={s.source}>
          <SourceIcon size={12} />
          {t(`listItem.source.${skill.source}`)}
        </span>
        {untrusted && (
          <span style={s.vetting} title={t("listItem.vettingTitle")}>
            <Chip icon="AlertTriangle" color="var(--warn)">
              {t("listItem.needsVetting")}
            </Chip>
          </span>
        )}
      </div>
    </div>
  );
}

/* PreviewTab — the body as prose. Same text the prompt builder injects (an
   untrusted body is delimiter-wrapped there, which is why the warning banner
   from Config is repeated here). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, Icon, Markdown } from "@devdigest/ui";
import { isUntrustedSkillSource, type Skill } from "@devdigest/shared";
import { s } from "./styles";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");

  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("tabs.preview")}</h2>
      <p style={s.subtitle}>{t("preview.subtitle")}</p>

      {isUntrustedSkillSource(skill.source) && (
        <div style={s.notice}>
          <Icon.Shield size={14} style={s.noticeIcon} />
          <span>{t("preview.untrustedNotice")}</span>
        </div>
      )}

      <Card>
        <Markdown>{skill.body}</Markdown>
      </Card>
    </div>
  );
}

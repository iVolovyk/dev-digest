/* ConfigTab — edit one skill. The form is local state seeded from the row (and
   re-seeded when the selection changes), so typing never round-trips; saving a
   changed body mints a new immutable version server-side. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Badge,
  Button,
  FormField,
  Icon,
  SelectInput,
  TextInput,
  Textarea,
  Toggle,
} from "@devdigest/ui";
import { isUntrustedSkillSource, type Skill, type SkillType } from "@devdigest/shared";
import { useDeleteSkill, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { skillTypeOptions } from "@/app/skills/helpers";
import { BODY_ROWS } from "./constants";
import { bodyFilename, bodyTokens, isDirty, toDraft } from "./helpers";
import { s } from "./styles";

export function ConfigTab({ skill, onDeleted }: { skill: Skill; onDeleted: () => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const [draft, setDraft] = React.useState(() => toDraft(skill));

  // Reset the form when a different skill is selected in the left column.
  React.useEffect(() => {
    setDraft(toDraft(skill));
  }, [skill.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const dirty = isDirty(skill, draft);

  const save = () =>
    update.mutate(
      { id: skill.id, patch: draft },
      { onSuccess: (data) => toast.success(t("config.savedToast", { version: data.version })) },
    );

  const remove = () => {
    if (!window.confirm(t("config.deleteConfirm", { name: skill.name }))) return;
    del.mutate(skill.id, {
      onSuccess: () => {
        toast.success(t("config.deletedToast", { name: skill.name }));
        onDeleted();
      },
    });
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle on={draft.enabled} onChange={(v) => set("enabled", v)} size={16} />
        </label>
      </div>

      {isUntrustedSkillSource(skill.source) && (
        <div style={s.notice}>
          <Icon.Shield size={14} style={s.noticeIcon} />
          <span>{t("preview.untrustedNotice")}</span>
        </div>
      )}

      <FormField label={t("config.name")} hint={t("config.nameHint")} required>
        <TextInput value={draft.name} onChange={(v) => set("name", v)} mono />
      </FormField>
      {/* The description is the skill's interface — the line a reader scans in
          the list and the first thing read when a review goes wrong. */}
      <FormField label={t("config.description")} hint={t("config.descriptionHint")} required>
        <TextInput value={draft.description} onChange={(v) => set("description", v)} />
      </FormField>
      <FormField label={t("config.type")} hint={t("config.typeHint")}>
        <SelectInput
          value={draft.type}
          onChange={(v) => set("type", v as SkillType)}
          options={skillTypeOptions((v) => t(`listItem.type.${v}`))}
        />
      </FormField>
      <FormField
        label={t("config.body")}
        hint={t("config.bodyHint")}
        right={
          <span style={s.bodyMeta}>
            <span className="mono" style={s.filename}>
              {bodyFilename(draft.name)}
            </span>
            {dirty && <Badge color="var(--warn)" bg="var(--warn-bg)">{t("config.unsaved")}</Badge>}
            <span className="tnum" style={s.tokens}>
              {t("config.tokens", { n: bodyTokens(draft.body) })}
            </span>
          </span>
        }
      >
        <Textarea
          value={draft.body}
          onChange={(v) => set("body", v)}
          rows={BODY_ROWS}
          mono
          placeholder={t("config.bodyPlaceholder")}
        />
      </FormField>

      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        <span style={s.spacer} />
        <Button kind="danger" icon="Trash" onClick={remove} disabled={del.isPending}>
          {t("config.delete")}
        </Button>
      </div>
    </div>
  );
}

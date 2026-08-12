/* CreateSkillTab — hand-written skill. Source stays the server default
   ("manual"), which is the only source the prompt builder treats as trusted
   instructions rather than delimiter-wrapped data. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, SelectInput, TextInput, Textarea } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useCreateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { skillTypeOptions } from "@/app/skills/helpers";
import { BODY_ROWS } from "./constants";
import { s } from "./styles";

export function CreateSkillTab({ onCreated }: { onCreated: (skill: Skill) => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const create = useCreateSkill();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("rubric");
  const [body, setBody] = React.useState("");

  const submit = () =>
    create.mutate(
      { name: name.trim(), description: description.trim(), type, body },
      {
        onSuccess: (skill) => {
          toast.success(t("create.createdToast", { name: skill.name }));
          onCreated(skill);
        },
      },
    );

  return (
    <div>
      <h2 style={s.h2}>{t("create.title")}</h2>
      <FormField label={t("config.name")} hint={t("config.nameHint")} required>
        <TextInput value={name} onChange={setName} placeholder={t("file.namePlaceholder")} mono />
      </FormField>
      <FormField label={t("config.description")} hint={t("config.descriptionHint")} required>
        <TextInput value={description} onChange={setDescription} />
      </FormField>
      <FormField label={t("config.type")} hint={t("config.typeHint")}>
        <SelectInput
          value={type}
          onChange={(v) => setType(v as SkillType)}
          options={skillTypeOptions((v) => t(`listItem.type.${v}`))}
        />
      </FormField>
      <FormField label={t("config.body")} hint={t("config.bodyHint")} required>
        <Textarea
          value={body}
          onChange={setBody}
          rows={BODY_ROWS}
          mono
          placeholder={t("config.bodyPlaceholder")}
        />
      </FormField>
      <div style={s.actions}>
        <Button
          kind="primary"
          icon="Check"
          onClick={submit}
          disabled={create.isPending || !name.trim() || !body.trim()}
        >
          {create.isPending ? t("create.creating") : t("create.submit")}
        </Button>
      </div>
    </div>
  );
}

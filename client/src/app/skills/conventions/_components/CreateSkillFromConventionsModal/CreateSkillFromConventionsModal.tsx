/* CreateSkillFromConventionsModal — merges the selected accepted conventions
   into ONE editable skill draft (name/description/type/body/enabled) and
   saves it via the existing `POST /skills` (source: "extracted"). Linking to
   an agent is a separate, already-built step (the agent editor's Skills tab)
   — this modal deliberately has no agent picker. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, SelectInput, TextInput, Textarea, Toggle } from "@devdigest/ui";
import type { ConventionCandidate, Skill, SkillType } from "@devdigest/shared";
import { useCreateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { skillTypeOptions } from "@/app/skills/helpers";
import { buildSkillDraft } from "./helpers";
import { s } from "./styles";

export function CreateSkillFromConventionsModal({
  conventions,
  repoName,
  repoFullName,
  onClose,
  onCreated,
}: {
  /** The accepted + selected candidates being merged. */
  conventions: ConventionCandidate[];
  repoName: string;
  repoFullName: string;
  onClose: () => void;
  onCreated: (skill: Skill) => void;
}) {
  const t = useTranslations("conventions");
  const tSkills = useTranslations("skills");
  const tCommon = useTranslations("common");
  const toast = useToast();
  const create = useCreateSkill();

  const draft = React.useMemo(
    () => buildSkillDraft(conventions, repoName, repoFullName),
    // Deliberately built once, from the selection at open time — editing the
    // fields afterward should not get silently overwritten by a re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [name, setName] = React.useState(draft.name);
  const [description, setDescription] = React.useState(draft.description);
  const [type, setType] = React.useState<SkillType>("convention");
  const [enabled, setEnabled] = React.useState(true);
  const [body, setBody] = React.useState(draft.body);

  const submit = () =>
    create.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        type,
        body,
        enabled,
        source: "extracted",
        evidence_files: [
          ...new Set(conventions.map((c) => c.evidence_path).filter((p): p is string => !!p)),
        ],
      },
      {
        onSuccess: (skill) => {
          toast.success(t("modal.createdToast", { name: skill.name }));
          onCreated(skill);
        },
      },
    );

  const footer = (
    <div style={s.footer}>
      <Button kind="secondary" onClick={onClose}>
        {tCommon("actions.cancel")}
      </Button>
      <Button
        kind="primary"
        icon="Sparkles"
        onClick={submit}
        disabled={create.isPending || !name.trim() || !body.trim()}
      >
        {create.isPending ? t("modal.creating") : t("modal.submit")}
      </Button>
    </div>
  );

  return (
    <Modal title={t("modal.title")} subtitle={name} onClose={onClose} width={760} footer={footer}>
      <div style={s.body}>
        <div style={s.note}>
          {t("modal.mergedNote", { count: conventions.length, repo: repoName })}
        </div>

        <FormField label={tSkills("config.name")} required>
          <TextInput value={name} onChange={setName} mono />
        </FormField>
        <FormField label={tSkills("config.description")} required>
          <TextInput value={description} onChange={setDescription} />
        </FormField>
        <FormField label={tSkills("config.type")}>
          <SelectInput
            value={type}
            onChange={(v) => setType(v as SkillType)}
            options={skillTypeOptions((v) => tSkills(`listItem.type.${v}`))}
          />
        </FormField>
        <FormField label={tSkills("config.enabled")} hint={t("modal.linkHint")}>
          <div style={s.enabledRow}>
            <Toggle on={enabled} onChange={setEnabled} />
          </div>
        </FormField>
        <FormField label={tSkills("config.body")} required>
          <Textarea value={body} onChange={setBody} rows={16} mono />
        </FormField>
      </div>
    </Modal>
  );
}

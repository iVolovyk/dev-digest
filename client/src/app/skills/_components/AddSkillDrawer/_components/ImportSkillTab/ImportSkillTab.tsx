/* ImportSkillTab — upload → preview → save. `POST /skills/import/preview`
   parses without persisting, so everything below the file picker is still just
   a candidate: nothing reaches the database until "Save skill" is pressed, and
   what it saves is source="imported_file", enabled=false. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  FormField,
  Icon,
  SectionLabel,
  SelectInput,
  TextInput,
} from "@devdigest/ui";
import type { Skill, SkillImportCandidate, SkillType } from "@devdigest/shared";
import { fileToImportInput, useCreateSkill, useImportPreview } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { skillTypeOptions } from "@/app/skills/helpers";
import { ACCEPT_ATTR, FILE_INPUT_ID } from "./constants";
import { rejectImportFile } from "./helpers";
import { s } from "./styles";

export function ImportSkillTab({ onCreated }: { onCreated: (skill: Skill) => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const preview = useImportPreview();
  const create = useCreateSkill();

  const [candidate, setCandidate] = React.useState<SkillImportCandidate | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("custom");

  const onPick = async (file: File | undefined) => {
    setCandidate(null);
    setError(null);
    if (!file) return;
    // Refuse oversized/unknown files locally — the whole payload is inlined
    // into a JSON body, so this never becomes an upload.
    const rejection = rejectImportFile(file);
    if (rejection) {
      setError(t(`import.${rejection}`));
      return;
    }
    try {
      const parsed = await preview.mutateAsync(await fileToImportInput(file));
      setCandidate(parsed);
      setName(parsed.name);
      setDescription(parsed.description);
      setType(parsed.type);
    } catch {
      // Network/parse failures also raise the global error toast; keep an
      // inline message so the drawer explains why nothing appeared.
      setError(t("import.failed"));
    }
  };

  const save = () => {
    if (!candidate) return;
    create.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        type,
        body: candidate.body,
        source: "imported_file",
        // Untrusted by construction — a human enables it after reading it.
        enabled: false,
      },
      {
        onSuccess: (skill) => {
          toast.success(t("import.savedToast", { name: skill.name }));
          onCreated(skill);
        },
      },
    );
  };

  return (
    <div>
      <FormField label={t("import.choose")} hint={t("import.chooseHint")}>
        <input
          id={FILE_INPUT_ID}
          type="file"
          accept={ACCEPT_ATTR}
          aria-label={t("import.choose")}
          style={s.fileInput}
          onChange={(e) => void onPick(e.target.files?.[0])}
        />
      </FormField>
      {error && (
        <div role="alert" style={s.error}>
          {error}
        </div>
      )}
      {preview.isPending && <div style={s.pending}>{t("import.parsing")}</div>}

      {candidate && (
        <div style={s.preview}>
          <SectionLabel icon="Eye">{t("import.previewTitle")}</SectionLabel>
          <p style={s.previewHint}>{t("import.previewHint")}</p>

          <div style={s.notice}>
            <Icon.Shield size={14} style={s.noticeIcon} />
            <span>{t("import.trustNotice")}</span>
          </div>

          <FormField label={t("config.name")} hint={t("config.nameHint")} required>
            <TextInput value={name} onChange={setName} mono />
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

          {/* Read-only on purpose: the body is what you are vetting, editing it
              here would hide what the file actually contained. */}
          <FormField
            label={t("config.body")}
            right={
              <span className="mono tnum" style={s.rowReason}>
                {t("config.tokens", { n: candidate.tokens })}
              </span>
            }
          >
            <pre className="mono" style={s.body}>
              {candidate.body}
            </pre>
          </FormField>

          {candidate.skipped.length > 0 && (
            <div style={s.block}>
              <SectionLabel icon="Filter">
                {t("import.skippedTitle", { n: candidate.skipped.length })}
              </SectionLabel>
              <p style={s.blockHint}>{t("import.skippedHint")}</p>
              {candidate.skipped.map((sk) => (
                <div key={sk.path} style={s.row}>
                  <span className="mono" style={s.rowPath}>
                    {sk.path}
                  </span>
                  <span style={s.rowReason}>{sk.reason}</span>
                </div>
              ))}
            </div>
          )}

          {candidate.warnings.length > 0 && (
            <div style={s.block}>
              <SectionLabel icon="AlertTriangle">{t("import.warningsTitle")}</SectionLabel>
              {candidate.warnings.map((w) => (
                <div key={w} style={s.warning}>
                  {w}
                </div>
              ))}
            </div>
          )}

          <div style={s.actions}>
            <Button
              kind="primary"
              icon="Check"
              onClick={save}
              disabled={create.isPending || !name.trim()}
            >
              {create.isPending ? t("import.saving") : t("import.save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

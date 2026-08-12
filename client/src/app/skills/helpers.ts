import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPES } from "./constants";

/**
 * Options for the skill-type `SelectInput`, shared by the config form, the
 * create form and the import preview. `label` resolves the i18n string so the
 * helper stays free of the translator's type.
 */
export function skillTypeOptions(
  label: (type: SkillType) => string,
): { value: SkillType; label: string }[] {
  return SKILL_TYPES.map((type) => ({ value: type, label: label(type) }));
}

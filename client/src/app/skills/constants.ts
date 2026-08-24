import type { IconName } from "@devdigest/ui";
import type { SkillSource, SkillType } from "@devdigest/shared";

/** The four `SkillType` values, in the order they appear in every select. */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Icon per provenance — the source label is never color/text alone. */
export const SOURCE_ICON: Record<SkillSource, IconName> = {
  manual: "Edit",
  imported_file: "Upload",
  imported_url: "Link",
  extracted: "Brain",
  community: "Users",
};

/** Default tab of the detail panel when `?tab=` is missing or unknown. */
export const DEFAULT_TAB = "config";

/** Tab keys the detail panel accepts from the URL. */
export const VALID_TABS = ["config", "preview", "stats", "versions"] as const;

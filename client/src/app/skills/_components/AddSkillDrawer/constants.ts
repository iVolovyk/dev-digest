import type { IconName } from "@devdigest/ui";

/** Which half of the drawer is showing. */
export type AddSkillTab = "create" | "import";

/** Drawer tab descriptors; `labelKey` resolves under the `skills` namespace. */
export const ADD_SKILL_TABS: readonly { key: AddSkillTab; labelKey: string; icon: IconName }[] = [
  { key: "create", labelKey: "create.tabCreate", icon: "Edit" },
  { key: "import", labelKey: "create.tabImport", icon: "Upload" },
];

/** Drawer width — wide enough to read a Markdown body without wrapping. */
export const DRAWER_WIDTH = 720;

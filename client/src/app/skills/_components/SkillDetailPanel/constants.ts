import type { IconName } from "@devdigest/ui";

/** Detail-panel tab descriptor; `labelKey` resolves under the `skills` namespace. */
export interface SkillTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

/** The four tabs, in URL (`?tab=`) order. */
export const TABS: readonly SkillTab[] = [
  { key: "config", labelKey: "tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "tabs.preview", icon: "Eye" },
  { key: "stats", labelKey: "tabs.stats", icon: "BarChart" },
  { key: "versions", labelKey: "tabs.versions", icon: "History" },
];

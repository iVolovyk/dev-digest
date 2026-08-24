import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillStats } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";

const h = vi.hoisted(() => ({ stats: null as SkillStats | null }));

vi.mock("@/lib/hooks/skills", () => ({
  useSkillStats: () => ({
    data: h.stats,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

import { StatsTab } from "./StatsTab";

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "Flag PRs that change behaviour without a test.",
  type: "rubric",
  source: "manual",
  body: "# Rule",
  enabled: true,
  version: 2,
};

const STATS: SkillStats = {
  used_by: 2,
  enabled_for: 1,
  injected_runs_30d: 7,
  avg_tokens: 412.4,
  body_tokens: 380,
  findings_30d: 5,
  accept_rate: null,
  agents: [
    { id: "ag1", name: "Security Reviewer", enabled: true },
    { id: "ag2", name: "Style Reviewer", enabled: false },
  ],
  by_category: [],
};

beforeEach(() => {
  h.stats = STATS;
});
afterEach(cleanup);

function renderStats() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <StatsTab skill={SKILL} />
    </NextIntlClientProvider>,
  );
}

describe("StatsTab", () => {
  it("renders a dash, never 0%, when nothing has been triaged", () => {
    renderStats();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("renders a real accept rate when one exists", () => {
    h.stats = { ...STATS, accept_rate: 0.62 };
    renderStats();
    expect(screen.getByText("62%")).toBeInTheDocument();
  });

  it("shows the usage metrics and their sub-lines", () => {
    renderStats();
    expect(screen.getByText("Used by")).toBeInTheDocument();
    expect(screen.getByText("1 with the skill enabled")).toBeInTheDocument();
    expect(screen.getByText(/Current body: 380 tokens/)).toBeInTheDocument();
  });

  it("keeps the correlation caveat visible, not hidden in a tooltip", () => {
    renderStats();
    expect(screen.getByText(/Read them as correlation/)).toBeInTheDocument();
  });

  it("links each agent to its skills tab and marks a disabled link", () => {
    renderStats();
    const link = screen.getByRole("link", { name: "Security Reviewer" });
    expect(link).toHaveAttribute("href", "/agents/ag1?tab=skills");
    expect(screen.getByText("disabled here")).toBeInTheDocument();
  });

  it("falls back to an empty state instead of an empty donut", () => {
    renderStats();
    expect(screen.getByText("No findings in the last 30 days.")).toBeInTheDocument();
  });

  it("charts findings by category as counts, not currency", () => {
    h.stats = {
      ...STATS,
      by_category: [
        { category: "security", count: 3 },
        { category: "test", count: 2 },
      ],
    };
    renderStats();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("prompts to link the skill when it has never been injected", () => {
    h.stats = { ...STATS, injected_runs_30d: 0 };
    renderStats();
    expect(screen.getAllByText(/Never injected yet/).length).toBeGreaterThan(0);
  });
});

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";

const h = vi.hoisted(() => ({
  replace: vi.fn(),
  search: new URLSearchParams(),
  skills: [] as Skill[],
  isLoading: false,
  isError: false,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace, push: vi.fn() }),
  useSearchParams: () => h.search,
}));

// The app frame pulls in nav/shortcuts/repo data none of which this view owns.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({
    data: h.skills,
    isLoading: h.isLoading,
    isError: h.isError,
    refetch: vi.fn(),
  }),
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { SkillsListView } from "./SkillsListView";

const SKILLS: Skill[] = [
  {
    id: "sk1",
    name: "pr-quality-rubric",
    description: "Flag PRs that change behaviour without a test.",
    type: "rubric",
    source: "manual",
    body: "# Rule",
    enabled: true,
    version: 2,
  },
  {
    id: "sk2",
    name: "secrets-checklist",
    description: "Require secrets to stay out of the repo.",
    type: "security",
    source: "imported_file",
    body: "# Secrets",
    enabled: false,
    version: 1,
  },
];

beforeEach(() => {
  h.replace.mockReset();
  h.search = new URLSearchParams();
  h.skills = SKILLS;
  h.isLoading = false;
  h.isError = false;
});
afterEach(cleanup);

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillsListView />
    </NextIntlClientProvider>,
  );
}

describe("SkillsListView", () => {
  it("lists every skill and prompts for a selection", () => {
    renderView();
    expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("secrets-checklist")).toBeInTheDocument();
    expect(screen.getByText("Select a skill")).toBeInTheDocument();
  });

  it("filters the list by the search box", () => {
    renderView();
    fireEvent.change(screen.getByPlaceholderText("Search skills…"), {
      target: { value: "secrets" },
    });
    expect(screen.getByText("secrets-checklist")).toBeInTheDocument();
    expect(screen.queryByText("pr-quality-rubric")).not.toBeInTheDocument();
  });

  it("puts the selection in the URL instead of local state", () => {
    renderView();
    fireEvent.click(screen.getByText("pr-quality-rubric"));
    expect(h.replace).toHaveBeenCalledWith("/skills?skill=sk1&tab=config");
  });

  it("shows the empty state when there are no skills at all", () => {
    h.skills = [];
    renderView();
    expect(screen.getByText("No skills yet")).toBeInTheDocument();
  });

  it("surfaces a load failure instead of an empty list", () => {
    h.isError = true;
    renderView();
    expect(screen.getByText("Could not load skills.")).toBeInTheDocument();
  });
});

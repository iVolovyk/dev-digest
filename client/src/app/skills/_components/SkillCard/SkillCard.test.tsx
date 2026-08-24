import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";

const updateMutate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
}));

import { SkillCard } from "./SkillCard";

afterEach(() => {
  cleanup();
  updateMutate.mockReset();
});

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "Flag PRs that change behaviour without touching a test.",
  type: "rubric",
  source: "manual",
  body: "# Rule",
  enabled: true,
  version: 3,
};

function renderCard(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SkillCard", () => {
  it("renders name, type, source and description", () => {
    renderCard(<SkillCard skill={SKILL} />);
    expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
    expect(
      screen.getByText("Flag PRs that change behaviour without touching a test."),
    ).toBeInTheDocument();
  });

  it("writes the enabled flag straight through useUpdateSkill", () => {
    renderCard(<SkillCard skill={SKILL} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(updateMutate).toHaveBeenCalledWith({ id: "sk1", patch: { enabled: false } });
  });

  it("does not select the skill when the toggle is clicked", () => {
    const onClick = vi.fn();
    renderCard(<SkillCard skill={SKILL} onClick={onClick} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("flags an untrusted source as needing vetting", () => {
    renderCard(<SkillCard skill={{ ...SKILL, source: "imported_file" }} />);
    expect(screen.getByText("needs vetting")).toBeInTheDocument();
    expect(screen.getByTitle("Untrusted source — vet before enabling")).toBeInTheDocument();
  });

  it("shows no vetting chip for a hand-written skill", () => {
    renderCard(<SkillCard skill={SKILL} />);
    expect(screen.queryByText("needs vetting")).not.toBeInTheDocument();
  });
});

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";

// Hook state is per-test so each case can supply its own links/catalog.
const state: {
  links: { data?: AgentSkillLink[]; isLoading: boolean; isError: boolean };
  skills: { data?: Skill[]; isLoading: boolean; isError: boolean };
} = {
  links: { data: [], isLoading: false, isError: false },
  skills: { data: [], isLoading: false, isError: false },
};
const setState = vi.fn();
const updateLink = vi.fn();

vi.mock("@/lib/hooks/skills", () => ({
  useAgentSkills: () => ({ ...state.links, refetch: vi.fn() }),
  useSkills: () => ({ ...state.skills, refetch: vi.fn() }),
  useSetAgentSkillsState: () => ({ mutate: setState, isPending: false }),
  useUpdateAgentSkill: () => ({ mutate: updateLink, isPending: false }),
}));

import { SkillsTab } from "./SkillsTab";

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function skill(over: Partial<Skill> & { id: string; name: string }): Skill {
  return {
    description: "what this skill nudges the reviewer to do",
    type: "rubric",
    source: "manual",
    body: "x".repeat(40), // 40 chars => 10 approx tokens
    enabled: true,
    version: 1,
    ...over,
  } as Skill;
}

function link(skillId: string, order: number, enabled = true): AgentSkillLink {
  return { agent_id: "ag1", skill_id: skillId, order, enabled };
}

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <SkillsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

const row = (name: string) => screen.getByTestId(`skill-row-${name}`);
const boxIn = (name: string) => within(row(name)).getByRole("checkbox");
/** Row names top-to-bottom. */
const renderedOrder = () =>
  screen
    .getAllByTestId(/^skill-row-/)
    .map((el) => el.getAttribute("data-testid")!.replace("skill-row-", ""));

/** Minimal DataTransfer stand-in — jsdom fires drag events without one. */
function dragOnto(fromName: string, toName: string) {
  const dataTransfer = { setData: vi.fn(), getData: vi.fn(), effectAllowed: "", dropEffect: "" };
  fireEvent.dragStart(row(fromName), { dataTransfer });
  fireEvent.dragOver(row(toName), { dataTransfer });
  fireEvent.drop(row(toName), { dataTransfer });
}

beforeEach(() => {
  setState.mockClear();
  updateLink.mockClear();
  state.links = { data: [], isLoading: false, isError: false };
  state.skills = { data: [], isLoading: false, isError: false };
});
afterEach(cleanup);

describe("SkillsTab", () => {
  it("lists the whole catalog as one list: linked first in order, then the rest", () => {
    state.skills.data = [
      skill({ id: "s1", name: "alpha" }),
      skill({ id: "s2", name: "beta" }),
      skill({ id: "s3", name: "gamma" }),
    ];
    // Catalog says alpha first; the links say beta is block 0. gamma is unlinked.
    state.links.data = [link("s1", 1), link("s2", 0)];
    renderTab();

    expect(renderedOrder()).toEqual(["beta", "alpha", "gamma"]);
    // Counted against the whole catalog, not just the linked ones.
    expect(screen.getByText("2 of 3 enabled")).toBeInTheDocument();
    // The order rule must be stated in the UI, not just implied by the grips.
    expect(screen.getByText(/Order matters/)).toBeInTheDocument();
  });

  it("unchecking keeps the link so the skill holds its slot", () => {
    state.skills.data = [skill({ id: "s1", name: "alpha" })];
    state.links.data = [link("s1", 0, true)];
    renderTab();

    expect(boxIn("alpha")).toHaveAttribute("aria-checked", "true");
    fireEvent.click(boxIn("alpha"));
    expect(updateLink).toHaveBeenCalledWith({
      agentId: "ag1",
      skillId: "s1",
      patch: { enabled: false },
    });
    // Never a full rewrite — that would drop the row's position.
    expect(setState).not.toHaveBeenCalled();
  });

  it("an unchecked link stays in place rather than sinking to the bottom", () => {
    state.skills.data = [skill({ id: "s1", name: "alpha" }), skill({ id: "s2", name: "beta" })];
    state.links.data = [link("s1", 1, false), link("s2", 0, true)];
    renderTab();

    expect(renderedOrder()).toEqual(["beta", "alpha"]);
    expect(boxIn("alpha")).toHaveAttribute("aria-checked", "false");

    fireEvent.click(boxIn("alpha"));
    expect(updateLink).toHaveBeenCalledWith({
      agentId: "ag1",
      skillId: "s1",
      patch: { enabled: true },
    });
  });

  it("checking a never-linked skill appends it, keeping the others' state", () => {
    state.skills.data = [skill({ id: "s1", name: "alpha" }), skill({ id: "s2", name: "beta" })];
    state.links.data = [link("s1", 0, false)];
    renderTab();

    fireEvent.click(boxIn("beta"));
    expect(setState).toHaveBeenCalledWith({
      agentId: "ag1",
      skills: [
        { skill_id: "s1", enabled: false }, // untouched, still off
        { skill_id: "s2", enabled: true },
      ],
    });
  });

  it("dragging a row onto an earlier one inserts it there, states preserved", () => {
    state.skills.data = [
      skill({ id: "s1", name: "alpha" }),
      skill({ id: "s2", name: "beta" }),
      skill({ id: "s3", name: "gamma" }),
    ];
    state.links.data = [link("s1", 0, true), link("s2", 1, false), link("s3", 2, true)];
    renderTab();

    dragOnto("gamma", "alpha");
    // Insert-at-target, not swap: alpha and beta shift down, flags ride along.
    expect(setState).toHaveBeenCalledWith({
      agentId: "ag1",
      skills: [
        { skill_id: "s3", enabled: true },
        { skill_id: "s1", enabled: true },
        { skill_id: "s2", enabled: false },
      ],
    });
  });

  it("dropping a row on itself writes nothing", () => {
    state.skills.data = [skill({ id: "s1", name: "alpha" }), skill({ id: "s2", name: "beta" })];
    state.links.data = [link("s1", 0), link("s2", 1)];
    renderTab();

    dragOnto("alpha", "alpha");
    expect(setState).not.toHaveBeenCalled();
  });

  it("reorders from the keyboard and refuses to wrap at the top", () => {
    state.skills.data = [skill({ id: "s1", name: "alpha" }), skill({ id: "s2", name: "beta" })];
    state.links.data = [link("s1", 0), link("s2", 1)];
    renderTab();

    // Dragging is mouse-only; the grip must stay operable without one.
    fireEvent.keyDown(within(row("alpha")).getByRole("button"), { key: "ArrowUp" });
    expect(setState).not.toHaveBeenCalled();

    fireEvent.keyDown(within(row("beta")).getByRole("button"), { key: "ArrowUp" });
    expect(setState).toHaveBeenCalledWith({
      agentId: "ag1",
      skills: [
        { skill_id: "s2", enabled: true },
        { skill_id: "s1", enabled: true },
      ],
    });
  });

  it("marks a globally disabled skill and drops it from the token cost", () => {
    state.skills.data = [
      skill({ id: "s1", name: "alpha" }),
      skill({ id: "s2", name: "beta", enabled: false }),
    ];
    state.links.data = [link("s1", 0), link("s2", 1)];
    renderTab();

    expect(screen.getByText("disabled globally")).toBeInTheDocument();
    // Linked and switched on for this agent, yet off globally ⇒ not active.
    expect(boxIn("beta")).toHaveAttribute("aria-checked", "false");
    // Only the reachable body is paid for: 40 chars / 4 = 10 tokens.
    expect(screen.getByText("~10 tokens added to every run")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 enabled")).toBeInTheDocument();
  });

  it("filters the list and suppresses dragging while filtered", () => {
    state.skills.data = [
      skill({ id: "s1", name: "alpha" }),
      skill({ id: "s2", name: "beta" }),
      skill({ id: "s3", name: "gamma" }),
    ];
    state.links.data = [link("s1", 0), link("s2", 1)];
    renderTab();

    fireEvent.change(screen.getByLabelText("Filter skills…"), { target: { value: "bet" } });
    expect(renderedOrder()).toEqual(["beta"]);
    // Reordering a filtered view would persist an order the user cannot see.
    expect(row("beta")).not.toHaveAttribute("draggable", "true");

    fireEvent.change(screen.getByLabelText("Filter skills…"), { target: { value: "zzz" } });
    expect(screen.getByText(/No skills match/)).toBeInTheDocument();
  });

  it("renders the empty state when the workspace has no skills at all", () => {
    state.skills.data = [];
    state.links.data = [];
    renderTab();

    expect(screen.getByText("No skills yet")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});

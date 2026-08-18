import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../messages/en/conventions.json";

import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);

const CONVENTION: ConventionCandidate = {
  id: "c1",
  rule: "Always use async/await instead of .then() chains",
  category: "async-await-then-chains",
  evidence_path: "src/api/users.ts",
  evidence_snippet: "const user = await db.users.find(id);",
  evidence_start_line: 23,
  evidence_end_line: 31,
  confidence: 0.91,
  accepted: true,
};

function renderCard(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("ConventionCard", () => {
  it("renders the rule, category, evidence location, snippet and confidence", () => {
    renderCard(<ConventionCard convention={CONVENTION} onAcceptedChange={() => {}} />);
    expect(
      screen.getByText("Always use async/await instead of .then() chains"),
    ).toBeInTheDocument();
    expect(screen.getByText("async-await-then-chains")).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:23-31")).toBeInTheDocument();
    expect(
      screen.getByText("const user = await db.users.find(id);"),
    ).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
  });

  it("calls onAcceptedChange(false) when Reject is clicked", () => {
    const onAcceptedChange = vi.fn();
    renderCard(<ConventionCard convention={CONVENTION} onAcceptedChange={onAcceptedChange} />);
    fireEvent.click(screen.getByText("Reject"));
    expect(onAcceptedChange).toHaveBeenCalledWith(false);
  });

  it("calls onAcceptedChange(true) when Accepted is clicked on a rejected candidate", () => {
    const onAcceptedChange = vi.fn();
    renderCard(
      <ConventionCard
        convention={{ ...CONVENTION, accepted: false }}
        onAcceptedChange={onAcceptedChange}
      />,
    );
    fireEvent.click(screen.getByText("Accepted"));
    expect(onAcceptedChange).toHaveBeenCalledWith(true);
  });

  it("renders a single line number when start and end match", () => {
    renderCard(
      <ConventionCard
        convention={{ ...CONVENTION, evidence_start_line: 5, evidence_end_line: 5 }}
        onAcceptedChange={() => {}}
      />,
    );
    expect(screen.getByText("src/api/users.ts:5")).toBeInTheDocument();
  });
});

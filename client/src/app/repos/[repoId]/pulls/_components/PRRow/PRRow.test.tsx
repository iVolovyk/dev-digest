import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@/lib/types";
import type { ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const REVIEWS: ReviewRecord[] = [
  {
    id: "rev1",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run1",
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: null,
    score: 61,
    model: "gpt-4.1",
    grounding: null,
    created_at: "2026-08-06T00:00:00.000Z",
    findings: [
      {
        id: "f1",
        severity: "CRITICAL",
        category: "security",
        title: "Hardcoded Stripe secret key",
        file: "src/config.ts",
        start_line: 12,
        end_line: 12,
        rationale: "A secret is committed.",
        suggestion: null,
        confidence: 0.98,
        kind: "finding",
        trifecta_components: null,
        evidence: null,
        review_id: "rev1",
        accepted_at: null,
        dismissed_at: null,
      },
    ],
  },
];

vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: REVIEWS, isLoading: false }),
}));

import { PRRow } from "./PRRow";

afterEach(cleanup);

const PR: PrMeta = {
  id: "pr1",
  number: 482,
  title: "Add rate limiting to public API endpoints",
  author: "marisa.koch",
  branch: "feat/rate-limit-public",
  base: "main",
  head_sha: "abc123",
  additions: 247,
  deletions: 38,
  files_count: 9,
  status: "needs_review",
  opened_at: null,
  updated_at: null,
  score: 61,
  cost_usd: 0.014,
  findings: { critical: 1, warning: 2, suggestion: 2 },
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("PRRow findings badges", () => {
  it("renders a count badge per severity from pr.findings", () => {
    renderWithIntl(<PRRow pr={PR} repoId="repo1" />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getAllByText("2")).toHaveLength(2);
  });

  it("renders no severity badges when the PR has never been reviewed (findings: null)", () => {
    renderWithIntl(<PRRow pr={{ ...PR, findings: null, score: null }} repoId="repo1" />);
    expect(screen.queryByText("1")).not.toBeInTheDocument();
    expect(screen.queryByText("2")).not.toBeInTheDocument();
  });

  it("shows a dash when reviewed but every severity is zero", () => {
    renderWithIntl(
      <PRRow pr={{ ...PR, findings: { critical: 0, warning: 0, suggestion: 0 } }} repoId="repo1" />,
    );
    const cell = within(screen.getByTestId("pr-findings"));
    expect(cell.queryByText("1")).not.toBeInTheDocument();
    expect(cell.queryByText("2")).not.toBeInTheDocument();
    expect(cell.getByText("—")).toBeInTheDocument();
  });

  it("hides zero-count severities and only shows badges for non-zero ones", () => {
    renderWithIntl(
      <PRRow pr={{ ...PR, findings: { critical: 0, warning: 3, suggestion: 0 } }} repoId="repo1" />,
    );
    const cell = within(screen.getByTestId("pr-findings"));
    expect(cell.getByText("3")).toBeInTheDocument();
    expect(cell.queryByText("—")).not.toBeInTheDocument();
  });

  it("clicking a severity badge opens a popover with the enriched finding (title + category)", () => {
    renderWithIntl(<PRRow pr={PR} repoId="repo1" />);
    fireEvent.click(screen.getByText("1"));
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("closes the popover on outside click", () => {
    renderWithIntl(<PRRow pr={PR} repoId="repo1" />);
    fireEvent.click(screen.getByText("1"));
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("Hardcoded Stripe secret key")).not.toBeInTheDocument();
  });
});

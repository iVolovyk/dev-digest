import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile, ReviewRecord, SmartDiffGroup } from "@devdigest/shared";
import prReview from "../../../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../../../messages/en/shell.json";
import { SmartDiffViewer } from "./SmartDiffViewer";

beforeAll(() => {
  // jsdom has no layout — stub the scroll the jump-to-line effect calls.
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

const CHECKOUT_PATCH = [
  "@@ -1,2 +1,4 @@",
  " const unchanged = 1;",
  "+const CORE_BODY_MARKER = 2;",
  "+const FINDING_TARGET_LINE = 3;",
].join("\n");

const LOCK_PATCH = ["@@ -1 +1,2 @@", "+LOCKFILE_BODY_MARKER: 1.0.0"].join("\n");

const groups: SmartDiffGroup[] = [
  {
    role: "core",
    files: [
      {
        path: "src/lib/checkout.ts",
        pseudocode_summary: null,
        additions: 20,
        deletions: 2,
        finding_lines: [3],
      },
    ],
  },
  {
    role: "wiring",
    files: [
      {
        path: "src/modules/index.ts",
        pseudocode_summary: null,
        additions: 4,
        deletions: 0,
        finding_lines: [],
      },
    ],
  },
  {
    role: "boilerplate",
    files: [
      {
        path: "pnpm-lock.yaml",
        pseudocode_summary: null,
        additions: 4000,
        deletions: 3,
        finding_lines: [],
      },
    ],
  },
];

const filesByPath = new Map<string, PrFile>([
  ["src/lib/checkout.ts", { path: "src/lib/checkout.ts", additions: 20, deletions: 2, patch: CHECKOUT_PATCH }],
  ["src/modules/index.ts", { path: "src/modules/index.ts", additions: 4, deletions: 0, patch: "@@ -1 +1 @@\n+x" }],
  ["pnpm-lock.yaml", { path: "pnpm-lock.yaml", additions: 4000, deletions: 3, patch: LOCK_PATCH }],
]);

function review(findings: ReviewRecord["findings"]): ReviewRecord {
  return {
    id: "r1",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run1",
    agent_name: "Reviewer",
    kind: "review",
    verdict: "comment",
    summary: null,
    score: 70,
    model: "m",
    created_at: "2026-06-01T00:00:00Z",
    findings,
  };
}

function finding(o: Partial<ReviewRecord["findings"][number]>): ReviewRecord["findings"][number] {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Missing auth check",
    file: "src/lib/checkout.ts",
    start_line: 3,
    end_line: 3,
    rationale: "x",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function renderViewer(reviews: ReviewRecord[] = []) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
      <SmartDiffViewer
        groups={groups}
        splitSuggestion={{ too_big: true, total_lines: 26, proposed_splits: [] }}
        filesByPath={filesByPath}
        reviews={reviews}
      />
    </NextIntlClientProvider>,
  );
}

describe("SmartDiffViewer", () => {
  it("renders role groups in order and keeps boilerplate collapsed", () => {
    renderViewer();

    const core = screen.getByText("Core logic");
    const boilerplate = screen.getByText("Boilerplate");
    // Core section appears before the Boilerplate section in the DOM.
    expect(
      core.compareDocumentPosition(boilerplate) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // A core file with a finding auto-expands; its diff body is visible.
    expect(screen.getByText(/CORE_BODY_MARKER/)).toBeInTheDocument();
    // Boilerplate never opens itself, regardless of size.
    expect(screen.queryByText(/LOCKFILE_BODY_MARKER/)).not.toBeInTheDocument();
    // Wiring with no finding stays collapsed too.
    expect(screen.queryByText(/^x$/)).not.toBeInTheDocument();
  });

  it("shows a findings badge, renders a severity badge at the finding line, and jumps to it on click", async () => {
    renderViewer([review([finding({ severity: "CRITICAL", start_line: 3 })])]);

    const badge = screen.getByRole("button", { name: /1 finding/i });
    expect(badge).toBeInTheDocument();

    // The severity badge is joined client-side from the reviews query.
    expect(screen.getByText("Critical")).toBeInTheDocument();

    fireEvent.click(badge);
    // The target line has a stable anchor id and is in the document.
    expect(document.getElementById("d-src/lib/checkout.ts-3")).toBeInTheDocument();
    // The jump-to-line scroll is deferred to the next animation frame.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});

import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile, ReviewRecord, SmartDiff } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../messages/en/shell.json";

const smartDiffMock = vi.fn();
const reviewsMock = vi.fn();

vi.mock("@/lib/hooks/smart-diff", () => ({
  useSmartDiff: () => smartDiffMock(),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ isPending: false, mutateAsync: vi.fn() }),
  usePrReviews: () => reviewsMock(),
}));

import { DiffTab } from "./DiffTab";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const FILES: PrFile[] = [
  { path: "pnpm-lock.yaml", additions: 4000, deletions: 1, patch: "@@ -1 +1 @@\n+lock" },
  { path: "src/lib/checkout.ts", additions: 10, deletions: 0, patch: "@@ -1 +1,2 @@\n+core" },
];

const SMART: SmartDiff = {
  groups: [
    {
      role: "core",
      files: [
        { path: "src/lib/checkout.ts", pseudocode_summary: null, additions: 10, deletions: 0, finding_lines: [] },
      ],
    },
    {
      role: "boilerplate",
      files: [
        { path: "pnpm-lock.yaml", pseudocode_summary: null, additions: 4000, deletions: 1, finding_lines: [] },
      ],
    },
  ],
  split_suggestion: { too_big: true, total_lines: 10, proposed_splits: [] },
};

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
      <DiffTab prId="pr1" filesCount={FILES.length} files={FILES} />
    </NextIntlClientProvider>,
  );
}

describe("DiffTab — Smart Diff integration", () => {
  it("toggles from smart order (grouped) to the flat original order", () => {
    smartDiffMock.mockReturnValue({ data: SMART, isError: false });
    reviewsMock.mockReturnValue({ data: [] as ReviewRecord[] });

    renderTab();

    // Smart order is the default → role headings are shown.
    expect(screen.getByText("Core logic")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /original order/i }));

    // Flat list → no role headings, but the files are still there.
    expect(screen.queryByText("Core logic")).not.toBeInTheDocument();
    expect(screen.getAllByText("src/lib/checkout.ts").length).toBeGreaterThan(0);
  });

  it("falls back to the flat viewer and hides the toggle when smart-diff errors", () => {
    smartDiffMock.mockReturnValue({ data: undefined, isError: true });
    reviewsMock.mockReturnValue({ data: [] as ReviewRecord[] });

    renderTab();

    expect(screen.queryByRole("button", { name: /smart order/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Core logic")).not.toBeInTheDocument();
    expect(screen.getAllByText("src/lib/checkout.ts").length).toBeGreaterThan(0);
  });
});

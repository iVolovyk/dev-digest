import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastRadius } from "@devdigest/shared";
import blast from "../../../../../../../../../../messages/en/blast.json";
import { githubBlobUrl } from "@/lib/github-urls";

let mockData: BlastRadius | undefined;
let mockLoading = false;

vi.mock("@/lib/hooks", () => ({
  useBlastRadius: () => ({ data: mockData, isLoading: mockLoading }),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { BlastRadiusPanel } from "./BlastRadiusPanel";

afterEach(() => {
  cleanup();
  mockData = undefined;
  mockLoading = false;
  push.mockReset();
});

const REPO = "acme/blast-probe";
const SHA = "abc123";

function base(overrides: Partial<BlastRadius> = {}): BlastRadius {
  return {
    changed_symbols: [],
    downstream: [],
    summary: "deterministic summary text",
    index_state: "full",
    partial: false,
    reason: null,
    summary_generated: false,
    ...overrides,
  };
}

function renderPanel(data: BlastRadius) {
  mockData = data;
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast }}>
      <BlastRadiusPanel
        prId="pr-1"
        repoId="repo-1"
        repoFullName={REPO}
        prHeadSha={SHA}
      />
    </NextIntlClientProvider>,
  );
}

describe("BlastRadiusPanel", () => {
  it("renders the map, the stat row, and deep-links a caller to GitHub at the head SHA", () => {
    renderPanel(
      base({
        changed_symbols: [
          { name: "parseToken", file: "src/auth/token.ts", kind: "function" },
          { name: "formatDate", file: "src/util/date.ts", kind: "function" },
        ],
        downstream: [
          {
            symbol: "parseToken",
            callers: [
              { name: "requireAuth", file: "src/auth/middleware.ts", line: 42 },
              { name: "refreshSession", file: "src/auth/middleware.ts", line: 88 },
              { name: "loginHandler", file: "src/routes/login.ts", line: 12 },
            ],
            endpoints_affected: ["POST /login", "POST /refresh"],
            crons_affected: [],
            callers_total: 3,
          },
          {
            symbol: "formatDate",
            callers: [
              { name: "renderRow", file: "src/ui/row.ts", line: 5 },
              { name: "renderCell", file: "src/ui/cell.ts", line: 9 },
            ],
            endpoints_affected: [],
            crons_affected: [],
            callers_total: 2,
          },
        ],
      }),
    );

    // Stat row: 2 symbols, 5 callers (3 + 2), 2 endpoints, 0 crons.
    expect(screen.getByRole("group", { name: "2 symbols" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "5 callers" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "2 endpoints" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "0 cron" })).toBeInTheDocument();

    // The first symbol is expanded by default; each caller is a file:line link.
    const link = screen.getByRole("link", { name: "src/auth/middleware.ts:42" });
    expect(link).toHaveAttribute(
      "href",
      githubBlobUrl(REPO, SHA, "src/auth/middleware.ts", 42),
    );
    expect(
      screen.getByRole("link", { name: "src/auth/middleware.ts:88" }),
    ).toBeInTheDocument();

    // An affected endpoint renders as a tag with its method split out.
    expect(screen.getAllByText("POST").length).toBe(2);
    expect(screen.getByText("/login")).toBeInTheDocument();
    expect(screen.getByText("/refresh")).toBeInTheDocument();

    // The second symbol is collapsed until clicked.
    expect(
      screen.queryByRole("link", { name: "src/ui/row.ts:5" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /formatDate/ }));
    expect(
      screen.getByRole("link", { name: "src/ui/row.ts:5" }),
    ).toBeInTheDocument();
  });

  it("shows the truncation count and the persistent partial caveat together", () => {
    renderPanel(
      base({
        index_state: "partial",
        partial: true,
        reason: "partial_index",
        changed_symbols: [{ name: "hot", file: "src/hot.ts", kind: "function" }],
        downstream: [
          {
            symbol: "hot",
            callers: Array.from({ length: 20 }, (_, i) => ({
              name: `c${i}`,
              file: `src/c${i}.ts`,
              line: i + 1,
            })),
            endpoints_affected: [],
            crons_affected: [],
            callers_total: 137,
          },
        ],
      }),
    );

    // Truncation line ("showing 20 of 137") — depends on `callers_total`
    // surviving the client's own contract copy (step A3).
    expect(screen.getAllByText(/showing 20 of 137/).length).toBeGreaterThan(0);

    // Persistent inline caveat (not a dismissible toast) — depends on `partial`
    // and `index_state` surviving the client copy too.
    expect(screen.getByText(/known to be incomplete/)).toBeInTheDocument();
    expect(screen.getByText(/partial index/)).toBeInTheDocument();
  });

  it("distinguishes cannot-compute from no-downstream-impact", () => {
    // degraded index → the re-index empty state, NOT "no downstream"
    const { unmount } = renderPanel(
      base({
        index_state: "degraded",
        partial: true,
        reason: "index_unavailable",
        summary: "Impact could not be computed — status: degraded. Re-index it.",
      }),
    );
    expect(screen.getByText("Impact can't be computed")).toBeInTheDocument();
    expect(screen.queryByText(/no downstream/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Context page/ }));
    expect(push).toHaveBeenCalledWith("/repos/repo-1/context");
    unmount();

    // full index, nothing downstream → "no downstream impact", NOT the re-index state
    renderPanel(
      base({
        index_state: "full",
        changed_symbols: [{ name: "x", file: "src/x.ts", kind: "function" }],
        downstream: [],
      }),
    );
    expect(screen.getByText("No downstream impact found")).toBeInTheDocument();
    expect(screen.queryByText("Impact can't be computed")).not.toBeInTheDocument();
  });
});
